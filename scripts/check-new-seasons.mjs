import fs from 'node:fs/promises';

// Matches every show in shows.json to a TMDB id (cached in tmdb-map.json so repeat runs
// only search once per show), then writes what TMDB knows about each one:
//   posters.json         id -> poster_path, for real thumbnails
//   episode-counts.json  id -> {season: episodeCount}, so "watched next" rolls over
//   show-meta.json       id -> {status, lastAired, nextAir}
//
// show-meta.json is what lets the page tell "this show has ENDED" apart from "she's
// caught up and the next episode hasn't aired yet" — without it we offered to
// "Mark finished" Saturday Night Live.
//
// Note this job deliberately does NOT decide what's new any more. It used to compare
// TMDB against shows.json, but shows.json is a frozen export — her real progress now
// lives in the data branch and changes daily, so anything computed here was stale the
// moment she watched something. The page does the comparison against live progress.

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) {
  console.error('Missing TMDB_API_KEY env var (set it as a repo secret).');
  process.exit(1);
}

const BASE = 'https://api.themoviedb.org/3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbGet(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`TMDB ${path} -> ${res.status}`);
    // 4xx (other than rate limiting) means the request itself was wrong and retrying
    // won't help. 429/5xx are transient — the caller must not cache those as a miss.
    err.transient = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

// "Avatar: The Last Airbender (2024)" -> query "Avatar: The Last Airbender", year hint 2024
function parseTitleYear(title) {
  const m = title.match(/^(.*?)\s*\((\d{4})\)$/);
  return m ? { query: m[1].trim(), year: m[2] } : { query: title, year: null };
}

const normalize = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Guards against silently accepting whatever TMDB ranked first: "Ink & Paint" matched an
// unrelated id that had no poster and no seasons. A result has to actually look like the
// thing we searched for.
function plausible(result, query) {
  const q = normalize(query);
  const candidates = [result.name, result.original_name].map(normalize).filter(Boolean);
  return candidates.some((c) => c === q || c.startsWith(q) || q.startsWith(c));
}

async function findTmdbId(title) {
  const { query, year } = parseTitleYear(title);

  // The year in her export is the year TV Time recorded, which is often the year of a
  // *different* production of the same name — "Avatar: The Last Airbender (2021)" is the
  // 2024 Netflix series. Passing it to TMDB is a hard filter, not a hint, so a wrong year
  // means zero results forever. Try it first (it disambiguates remakes), then without.
  const attempts = year ? [{ query, first_air_date_year: year }, { query }] : [{ query }];
  for (const params of attempts) {
    const data = await tmdbGet('/search/tv', params);
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

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback; // first run, or the file was hand-edited into something invalid
  }
};

async function main() {
  const shows = JSON.parse(await fs.readFile('shows.json', 'utf8'));
  const map = await readJson('tmdb-map.json', {});
  const posters = await readJson('posters.json', {});
  const episodeCounts = await readJson('episode-counts.json', {});
  const meta = await readJson('show-meta.json', {});

  let matched = 0;
  let searched = 0;
  let retried = 0;
  let stillUnmatched = [];

  for (const g of shows) {
    let entry = map[g.id];

    // Re-search when we have no entry, or when the last attempt failed for a reason that
    // might not repeat. Previously ANY failure — a rate limit, a 500, a dropped
    // connection — was cached as {tmdbId: null} forever and never retried, which is
    // indistinguishable from "this show genuinely isn't on TMDB".
    const shouldSearch = !entry || (entry.tmdbId == null && entry.reason !== 'not-found');
    if (shouldSearch) {
      if (entry) retried++;
      searched++;
      try {
        const found = await findTmdbId(g.t);
        entry = found.tmdbId
          ? { tmdbId: found.tmdbId, title: g.t, matchedName: found.matchedName }
          : { tmdbId: null, title: g.t, reason: 'not-found', rejected: found.rejected };
      } catch (e) {
        // Transient: leave it retryable. Permanent: mark it so we stop hammering TMDB.
        entry = { tmdbId: null, title: g.t, reason: e.transient ? 'error' : 'not-found', error: e.message };
        console.error(`Search failed for "${g.t}": ${e.message}${e.transient ? ' (will retry next run)' : ''}`);
      }
      map[g.id] = entry;
      await sleep(250);
    }

    if (!entry.tmdbId) {
      posters[g.id] = null;
      stillUnmatched.push(`${g.t}${entry.rejected ? ` (rejected: ${entry.rejected.join(', ')})` : ''}`);
      continue;
    }

    try {
      const details = await tmdbGet(`/tv/${entry.tmdbId}`);
      posters[g.id] = details.poster_path || null;
      matched++;

      const counts = {};
      for (const s of details.seasons || []) {
        if (s.season_number > 0 && s.episode_count) counts[s.season_number] = s.episode_count;
      }
      episodeCounts[g.id] = counts;

      const ep = (e) => (e ? { season: e.season_number, ep: e.episode_number, airDate: e.air_date } : null);
      meta[g.id] = {
        // "Returning Series" | "Ended" | "Canceled" | "In Production" | "Planned"
        status: details.status || null,
        lastAired: ep(details.last_episode_to_air),
        nextAir: ep(details.next_episode_to_air)
      };
    } catch (e) {
      console.error(`Details lookup failed for "${g.t}" (tmdb ${entry.tmdbId}): ${e.message}`);
      // Leave any existing poster/counts/meta in place — a transient failure shouldn't
      // blank data that was good yesterday.
    }
    await sleep(250);
  }

  await fs.writeFile('tmdb-map.json', JSON.stringify(map, null, 2) + '\n');
  await fs.writeFile('posters.json', JSON.stringify(posters, null, 2) + '\n');
  await fs.writeFile('episode-counts.json', JSON.stringify(episodeCounts, null, 2) + '\n');
  await fs.writeFile('show-meta.json', JSON.stringify(meta, null, 2) + '\n');

  const ended = Object.values(meta).filter((m) => m.status === 'Ended' || m.status === 'Canceled').length;
  const returning = Object.values(meta).filter((m) => m.status === 'Returning Series').length;
  const upcoming = Object.values(meta).filter((m) => m.nextAir).length;

  console.log(`Matched ${matched}/${shows.length} shows (${searched} searched, ${retried} retried after an earlier failure).`);
  console.log(`Status: ${ended} ended/canceled, ${returning} returning, ${upcoming} with a next episode dated.`);
  if (stillUnmatched.length) {
    console.log(`Unmatched (${stillUnmatched.length}):`);
    for (const t of stillUnmatched) console.log(`  - ${t}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
