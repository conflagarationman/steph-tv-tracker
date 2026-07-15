import fs from 'node:fs/promises';

// Matches every show in shows.json to a TMDB id (cached in tmdb-map.json so repeat
// runs only search once per show), and:
//  - writes each show's poster path to posters.json for the page to render as a
//    real thumbnail instead of the letter-monogram fallback
//  - for shows currently 'watching', compares TMDB's latest aired season against
//    what's tracked and writes anything newer to new-releases.json for the banner

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
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

// "Avatar: The Last Airbender (2024)" -> query "Avatar: The Last Airbender", year hint 2024
function parseTitleYear(title) {
  const m = title.match(/^(.*?)\s*\((\d{4})\)$/);
  return m ? { query: m[1].trim(), year: m[2] } : { query: title, year: null };
}

async function findTmdbId(title) {
  const { query, year } = parseTitleYear(title);
  const data = await tmdbGet('/search/tv', { query, first_air_date_year: year });
  const best = data.results && data.results[0];
  return best ? best.id : null;
}

async function main() {
  const shows = JSON.parse(await fs.readFile('shows.json', 'utf8'));
  let map = {};
  try {
    map = JSON.parse(await fs.readFile('tmdb-map.json', 'utf8'));
  } catch {
    // first run, no cache yet
  }
  let posters = {};
  try {
    posters = JSON.parse(await fs.readFile('posters.json', 'utf8'));
  } catch {
    // first run, no cache yet
  }

  const releases = [];
  const today = new Date().toISOString().slice(0, 10);
  let matched = 0;
  let checked = 0;

  for (const g of shows) {
    let entry = map[g.id];
    if (!entry) {
      try {
        const tmdbId = await findTmdbId(g.t);
        entry = { tmdbId, title: g.t };
      } catch (e) {
        console.error(`Search failed for "${g.t}": ${e.message}`);
        entry = { tmdbId: null, title: g.t };
      }
      map[g.id] = entry;
      await sleep(250);
    }
    if (!entry.tmdbId) {
      posters[g.id] = null;
      continue;
    }

    try {
      const details = await tmdbGet(`/tv/${entry.tmdbId}`);
      posters[g.id] = details.poster_path || null;
      matched++;

      if (g.s === 'watching') {
        checked++;
        const airedSeasons = (details.seasons || []).filter(
          (s) => s.season_number > 0 && s.air_date && s.air_date <= today
        );
        if (airedSeasons.length) {
          const latest = airedSeasons.reduce((a, b) => (a.season_number > b.season_number ? a : b));
          if (latest.season_number > (g.season || 0)) {
            releases.push({ id: g.id, title: g.t, season: latest.season_number, airDate: latest.air_date });
          }
        }
      }
    } catch (e) {
      console.error(`Details lookup failed for "${g.t}" (tmdb ${entry.tmdbId}): ${e.message}`);
    }
    await sleep(250);
  }

  await fs.writeFile('tmdb-map.json', JSON.stringify(map, null, 2) + '\n');
  await fs.writeFile('posters.json', JSON.stringify(posters, null, 2) + '\n');
  await fs.writeFile('new-releases.json', JSON.stringify(releases, null, 2) + '\n');
  console.log(`Matched posters for ${matched}/${shows.length} shows. Checked ${checked} watching shows, found ${releases.length} new season(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
