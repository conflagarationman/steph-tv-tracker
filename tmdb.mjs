// Shared TMDB lookup logic — matching a title to a TMDB show and pulling poster/episode
// counts/watch-providers out of it. Used by both scripts/check-new-seasons.mjs (the nightly
// batch job, Node/GitHub Actions) and worker/index.mjs (the on-demand Worker endpoint for
// shows Steph adds herself, Cloudflare's runtime) — one copy so a future fix to the matching
// heuristic can't silently apply to only one of the two callers.
//
// No Node-specific APIs (no `fs`, no `process.env`) so this loads unchanged in both runtimes.
// The API key is always a parameter, never read from the environment in here.

const BASE = 'https://api.themoviedb.org/3';

export async function tmdbGet(path, apiKey, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`TMDB ${path} -> ${res.status}`);
    // 4xx (other than rate limiting) means the request itself was wrong and retrying won't
    // help. 429/5xx are transient — the caller must not cache those as a miss.
    err.transient = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

// "Avatar: The Last Airbender (2024)" -> query "Avatar: The Last Airbender", year hint 2024
export function parseTitleYear(title) {
  const m = title.match(/^(.*?)\s*\((\d{4})\)$/);
  return m ? { query: m[1].trim(), year: m[2] } : { query: title, year: null };
}

const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(normalize(s).split(' ').filter(Boolean));

// Guards against silently accepting whatever TMDB ranked first: "Ink & Paint" matched
// "The Ink and Paint Club", an unrelated 1997 show with no poster and no seasons.
//
// The rule is asymmetric on purpose. TMDB's name may be a *simplification* of ours
// ("SPY x FAMILY" -> "SPY×FAMILY" normalises to "spy family", losing a token) — that's
// fine. But if TMDB's name carries extra meaningful words ours doesn't ("...and...club"),
// it's a different show. Prefix matching alone got SPY x FAMILY wrong.
export function nameMatches(name, query) {
  const c = normalize(name);
  const q = normalize(query);
  if (!c || !q) return false;
  if (c === q) return true;
  // q.startsWith(c) only — TMDB dropping a qualifier we carry is fine ("Ghosts (US)" ->
  // "Ghosts"). The reverse, c.startsWith(q), is what let "Dark" match "Dark Matter" and
  // "Citadel" match "Citadel: Honey Bunny": extra words appended means a different show.
  if (q.startsWith(c)) return true;
  const ct = tokens(c);
  const qt = tokens(q);
  // Every word in TMDB's title also appears in ours — catches punctuation-only differences
  // like "SPY x FAMILY" vs "SPY×FAMILY" that prefix matching misses.
  return ct.size > 0 && [...ct].every((t) => qt.has(t));
}

export function plausible(result, query) {
  return [result.name, result.original_name].filter(Boolean).some((n) => nameMatches(n, query));
}

export async function findTmdbId(title, apiKey) {
  const { query, year } = parseTitleYear(title);

  // A year hint disambiguates remakes ("Avatar: The Last Airbender (2021)" in her export is
  // really the 2024 Netflix series), but it's a hard filter to TMDB, not a soft hint — a
  // wrong year means zero results forever. Try it first, then without.
  const attempts = year ? [{ query, first_air_date_year: year }, { query }] : [{ query }];
  for (const params of attempts) {
    const data = await tmdbGet('/search/tv', apiKey, params);
    const results = data.results || [];
    const match = results.find((r) => plausible(r, query)) || null;
    if (match) return { tmdbId: match.id, matchedName: match.name };
    if (results.length && !params.first_air_date_year) {
      // Results came back but none looked like the show — record that rather than
      // pretending we found it.
      return { tmdbId: null, rejected: results.slice(0, 3).map((r) => r.name) };
    }
  }
  return { tmdbId: null };
}

// Where she can actually stream it, US region, from TMDB's JustWatch data.
//
// Only `flatrate` (included with a subscription) and `ads` (free with ads) are useful here:
// "rent for $3.99" isn't an answer to "what can I put on tonight". `link` goes to TMDB's own
// watch page, which stays correct even as providers change.
export function watchProviders(details) {
  const region = details['watch/providers'] && details['watch/providers'].results && details['watch/providers'].results.US;
  if (!region) return null;
  const names = (list) => (list || []).map((p) => p.provider_name).filter(Boolean);
  // display_priority ordering from TMDB is already sensible; dedupe while preserving it.
  const on = [...new Set([...names(region.flatrate), ...names(region.ads)])];
  if (!on.length) return region.link ? { on: [], link: region.link } : null;
  return { on, link: region.link || null };
}

// Full pipeline for one title: find it, then pull poster/episode-counts/status/watch data —
// the same shape check-new-seasons.mjs writes per-show, but for a single on-demand lookup
// rather than a batch. Returns null-poster/no-match fields rather than throwing when TMDB
// genuinely has nothing (a title that's announced but unproduced, same as the 4 shows in her
// original 339 that TMDB has never heard of) — that's a normal outcome, not an error.
export async function lookupShow(title, apiKey) {
  const found = await findTmdbId(title, apiKey);
  if (!found.tmdbId) {
    return { tmdbId: null, matchedName: null, poster: null, epCounts: null, meta: null };
  }

  const details = await tmdbGet(`/tv/${found.tmdbId}`, apiKey, { append_to_response: 'watch/providers' });

  const epCounts = {};
  for (const s of details.seasons || []) {
    if (s.season_number > 0 && s.episode_count) epCounts[s.season_number] = s.episode_count;
  }

  const ep = (e) => (e ? { season: e.season_number, ep: e.episode_number, airDate: e.air_date } : null);
  const meta = {
    status: details.status || null,
    lastAired: ep(details.last_episode_to_air),
    nextAir: ep(details.next_episode_to_air),
    watch: watchProviders(details)
  };

  return {
    tmdbId: found.tmdbId,
    matchedName: found.matchedName || details.name || null,
    poster: details.poster_path || null,
    epCounts: Object.keys(epCounts).length ? epCounts : null,
    meta
  };
}
