// Covers the matching heuristic's documented edge cases (each one a real false-positive/
// false-negative caught in production, per tmdb.mjs's own comments) so a future tweak can't
// silently reintroduce them, plus the lookupShow pipeline shape used by both callers.
import { nameMatches, plausible, parseTitleYear, watchProviders, lookupShow, lookupEpisodes } from './tmdb.mjs';
import assert from 'node:assert/strict';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n        ${e.message}`); }
};
const testAsync = async (name, fn) => {
  try { await fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n        ${e.message}`); }
};

// ── nameMatches / plausible ────────────────────────────────────────────────────────────

test('exact match', () => {
  assert.ok(nameMatches('Severance', 'Severance'));
});

test('TMDB dropping a qualifier we carry is fine', () => {
  assert.ok(nameMatches('Ghosts', 'Ghosts (US)'));
});

test('rejects extra trailing words — "Dark" must not match "Dark Matter"', () => {
  assert.ok(!nameMatches('Dark Matter', 'Dark'));
});

test('rejects extra trailing words — "Citadel" must not match "Citadel: Honey Bunny"', () => {
  assert.ok(!nameMatches('Citadel: Honey Bunny', 'Citadel'));
});

test('punctuation-only difference still matches (SPY x FAMILY vs SPY×FAMILY)', () => {
  assert.ok(nameMatches('SPY×FAMILY', 'SPY x FAMILY'));
});

test('rejects an unrelated show with overlapping words ("Ink & Paint" vs "The Ink and Paint Club")', () => {
  assert.ok(!nameMatches('The Ink and Paint Club', 'Ink & Paint'));
});

test('plausible checks both name and original_name', () => {
  assert.ok(plausible({ name: 'Something Else', original_name: 'Severance' }, 'Severance'));
  assert.ok(!plausible({ name: 'Something Else', original_name: 'Also Else' }, 'Severance'));
});

// ── parseTitleYear ──────────────────────────────────────────────────────────────────────

test('extracts a trailing year hint', () => {
  assert.deepEqual(parseTitleYear('Avatar: The Last Airbender (2024)'), { query: 'Avatar: The Last Airbender', year: '2024' });
});

test('no year present leaves the title untouched', () => {
  assert.deepEqual(parseTitleYear('Severance'), { query: 'Severance', year: null });
});

// ── watchProviders ──────────────────────────────────────────────────────────────────────

test('combines flatrate and ads, dedupes, keeps the link', () => {
  const details = { 'watch/providers': { results: { US: {
    flatrate: [{ provider_name: 'Netflix' }, { provider_name: 'Hulu' }],
    ads: [{ provider_name: 'Hulu' }],
    link: 'https://tmdb.example/watch'
  } } } };
  assert.deepEqual(watchProviders(details), { on: ['Netflix', 'Hulu'], link: 'https://tmdb.example/watch' });
});

test('no US region at all returns null', () => {
  assert.equal(watchProviders({ 'watch/providers': { results: {} } }), null);
});

test('US region present but nothing streamable keeps the link with an empty list', () => {
  const details = { 'watch/providers': { results: { US: { link: 'https://tmdb.example/watch' } } } };
  assert.deepEqual(watchProviders(details), { on: [], link: 'https://tmdb.example/watch' });
});

// ── lookupShow (fetch stubbed — no real API key or network) ────────────────────────────

function stubFetch(handler) { globalThis.fetch = handler; }

await testAsync('lookupShow returns full data for a matched show', async () => {
  stubFetch(async (url) => {
    const u = String(url);
    if (u.includes('/search/tv')) {
      return new Response(JSON.stringify({ results: [{ id: 42, name: 'Severance', original_name: 'Severance' }] }), { status: 200 });
    }
    if (u.includes('/tv/42')) {
      return new Response(JSON.stringify({
        name: 'Severance', status: 'Returning Series', poster_path: '/poster.jpg',
        seasons: [{ season_number: 1, episode_count: 9 }, { season_number: 2, episode_count: 10 }, { season_number: 0, episode_count: 3 }],
        last_episode_to_air: { season_number: 2, episode_number: 10, air_date: '2026-03-20' },
        next_episode_to_air: null,
        'watch/providers': { results: { US: { flatrate: [{ provider_name: 'Apple TV+' }] } } }
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  });
  const result = await lookupShow('Severance', 'fake-key');
  assert.equal(result.tmdbId, 42);
  assert.equal(result.matchedName, 'Severance');
  assert.equal(result.poster, '/poster.jpg');
  // Season 0 (specials) must not appear — mirrors check-new-seasons.mjs's own filter.
  assert.deepEqual(result.epCounts, { 1: 9, 2: 10 });
  assert.equal(result.meta.status, 'Returning Series');
  assert.deepEqual(result.meta.lastAired, { season: 2, ep: 10, airDate: '2026-03-20' });
  assert.equal(result.meta.nextAir, null);
  assert.deepEqual(result.meta.watch, { on: ['Apple TV+'], link: null });
});

await testAsync('lookupShow degrades gracefully when nothing matches — same as an unproduced show', async () => {
  stubFetch(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
  const result = await lookupShow('Some Announced But Unproduced Show', 'fake-key');
  assert.equal(result.tmdbId, null);
  assert.equal(result.poster, null);
  assert.equal(result.epCounts, null);
  assert.equal(result.meta, null);
});

await testAsync('lookupShow rejects a plausible-looking wrong result rather than accepting TMDB\'s top hit blindly', async () => {
  stubFetch(async () => new Response(JSON.stringify({
    results: [{ id: 1, name: 'The Ink and Paint Club', original_name: 'The Ink and Paint Club' }]
  }), { status: 200 }));
  const result = await lookupShow('Ink & Paint', 'fake-key');
  assert.equal(result.tmdbId, null, 'must not accept an unrelated show with overlapping words');
});

// ── lookupEpisodes (fetch stubbed — no real API key or network) ────────────────────────

await testAsync('lookupEpisodes fetches multiple seasons in a single upstream call', async () => {
  let calls = 0;
  stubFetch(async (url) => {
    calls++;
    const u = String(url);
    assert.ok(u.includes('/tv/42'), 'hits the show details endpoint, not a search');
    assert.ok(u.includes('season%2F1%2Cseason%2F2'), 'both seasons requested via append_to_response in one call');
    return new Response(JSON.stringify({
      'season/1': { episodes: [{ episode_number: 1, name: 'Good News About Hell', overview: 'Mark starts work.', air_date: '2022-02-18' }] },
      'season/2': { episodes: [{ episode_number: 1, name: 'Hello, Ms. Cobel', overview: null, air_date: '2025-01-17' }] }
    }), { status: 200 });
  });
  const result = await lookupEpisodes(42, ['1', '2'], 'fake-key');
  assert.equal(calls, 1, 'one HTTP call regardless of season count');
  assert.deepEqual(result['1'], [{ ep: 1, name: 'Good News About Hell', overview: 'Mark starts work.', airDate: '2022-02-18' }]);
  assert.deepEqual(result['2'], [{ ep: 1, name: 'Hello, Ms. Cobel', overview: null, airDate: '2025-01-17' }]);
});

await testAsync('lookupEpisodes returns an empty list for a season TMDB has no data for', async () => {
  stubFetch(async () => new Response(JSON.stringify({ 'season/1': null }), { status: 200 }));
  const result = await lookupEpisodes(42, ['1'], 'fake-key');
  assert.deepEqual(result['1'], []);
});

console.log(`\n${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
