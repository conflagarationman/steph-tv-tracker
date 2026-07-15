import { merge, pruneTombstones, emptyDoc } from './merge.mjs';
import assert from 'node:assert/strict';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n        ${e.message}`); }
};

const T0 = '2026-07-15T10:00:00.000Z';
const T1 = '2026-07-15T11:00:00.000Z';
const T2 = '2026-07-15T12:00:00.000Z';

// ── the core promise: nothing she did on either device disappears ───────────────
test('progress from each device survives a merge', () => {
  const phone  = { overrides: { 5: { season: 1, ep: 3, updatedAt: T1 } } };
  const laptop = { overrides: { 9: { season: 2, ep: 1, updatedAt: T1 } } };
  const m = merge(phone, laptop);
  assert.deepEqual(m.overrides[5], { season: 1, ep: 3, updatedAt: T1 });
  assert.deepEqual(m.overrides[9], { season: 2, ep: 1, updatedAt: T1 });
});

test('newer edit to the same show wins', () => {
  const older = { overrides: { 5: { season: 1, ep: 3, updatedAt: T0 } } };
  const newer = { overrides: { 5: { season: 1, ep: 7, updatedAt: T2 } } };
  assert.equal(merge(older, newer).overrides[5].ep, 7);
  assert.equal(merge(newer, older).overrides[5].ep, 7, 'merge must not depend on argument order');
});

test('an empty device cannot wipe the server', () => {
  const server = { overrides: { 5: { season: 1, ep: 3, updatedAt: T1 } }, history: [{ id: 5, at: T1 }] };
  const fresh  = emptyDoc();                       // e.g. Safari just evicted localStorage
  const m = merge(fresh, server);
  assert.equal(m.overrides[5].ep, 3, 'a wiped browser must not blank the stored copy');
  assert.equal(m.history.length, 1);
});

// ── deletes: the case a naive union gets wrong ──────────────────────────────────
test('a deleted show stays deleted instead of resurrecting', () => {
  const phone  = { overrides: { 5: { __deleted: true, updatedAt: T2 } } };
  const laptop = { overrides: { 5: { season: 1, ep: 3, updatedAt: T0 } } };
  assert.equal(merge(phone, laptop).overrides[5].__deleted, true);
});

test('an edit newer than the delete wins', () => {
  const phone  = { overrides: { 5: { __deleted: true, updatedAt: T0 } } };
  const laptop = { overrides: { 5: { season: 1, ep: 3, updatedAt: T2 } } };
  const m = merge(phone, laptop);
  assert.equal(m.overrides[5].__deleted, undefined);
  assert.equal(m.overrides[5].ep, 3);
});

test('delete vs edit at the same instant keeps the show', () => {
  const del  = { overrides: { 5: { __deleted: true, updatedAt: T1 } } };
  const edit = { overrides: { 5: { season: 1, ep: 3, updatedAt: T1 } } };
  assert.equal(merge(del, edit).overrides[5].ep, 3, 'ties resolve toward keeping data');
  assert.equal(merge(edit, del).overrides[5].ep, 3);
});

// ── history is an append-only log ───────────────────────────────────────────────
test('history unions without duplicating', () => {
  const shared = { id: 5, at: T0, action: 'watched' };
  const phone  = { history: [shared, { id: 5, at: T1, action: 'watched' }] };
  const laptop = { history: [shared, { id: 9, at: T2, action: 'started' }] };
  const m = merge(phone, laptop);
  assert.equal(m.history.length, 3, 'the shared entry must not double up');
  assert.deepEqual(m.history.map(h => h.at), [T2, T1, T0], 'newest first');
});

test('same show, different times are distinct events', () => {
  const m = merge({ history: [{ id: 5, at: T0 }] }, { history: [{ id: 5, at: T1 }] });
  assert.equal(m.history.length, 2);
});

test('history is capped so the payload cannot grow forever', () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ id: 1, at: new Date(Date.now() - i * 1000).toISOString() }));
  assert.equal(merge({ history: many }, {}).history.length, 500);
});

test('the cap keeps the newest entries, not the oldest', () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ id: i, at: new Date(2026, 0, 1, 0, 0, i).toISOString() }));
  const m = merge({ history: many }, {});
  assert.equal(m.history[0].id, 599, 'newest survives');
  assert.ok(!m.history.some(h => h.id === 0), 'oldest is the one dropped');
});

// ── dismissed banners ───────────────────────────────────────────────────────────
test('dismissed alerts union and dedupe', () => {
  const m = merge({ dismissed: ['162:2'] }, { dismissed: ['162:2', '284:3'] });
  assert.deepEqual(m.dismissed, ['162:2', '284:3']);
});

// ── malformed / hostile input must not throw or destroy anything ────────────────
test('null and undefined inputs are safe', () => {
  assert.deepEqual(merge(null, null).overrides, {});
  assert.deepEqual(merge(undefined, { overrides: { 5: { ep: 1, updatedAt: T0 } } }).overrides[5].ep, 1);
});

test('entries with no timestamp lose to timestamped ones but survive alone', () => {
  const m = merge({ overrides: { 5: { ep: 1 } } }, { overrides: { 5: { ep: 9, updatedAt: T1 } } });
  assert.equal(m.overrides[5].ep, 9, 'a real timestamp beats a missing one');
  assert.equal(merge({ overrides: { 7: { ep: 4 } } }, {}).overrides[7].ep, 4, 'but it is not discarded');
});

test('garbage history entries are skipped, not fatal', () => {
  const m = merge({ history: [null, { id: 5 }, { at: T0 }, { id: 9, at: T1 }] }, {});
  assert.equal(m.history.length, 1);
  assert.equal(m.history[0].id, 9);
});

// ── convergence: the property that actually matters ─────────────────────────────
test('merging is idempotent — syncing twice changes nothing', () => {
  const a = { overrides: { 5: { ep: 3, updatedAt: T1 } }, history: [{ id: 5, at: T1 }], dismissed: ['1:1'] };
  const b = { overrides: { 9: { ep: 1, updatedAt: T2 } }, history: [{ id: 9, at: T2 }], dismissed: ['2:1'] };
  const once = merge(a, b);
  const twice = merge(once, b);
  assert.deepEqual(twice.overrides, once.overrides);
  assert.deepEqual(twice.history, once.history);
  assert.deepEqual(twice.dismissed, once.dismissed);
});

test('three devices converge regardless of sync order', () => {
  const a = { overrides: { 1: { ep: 1, updatedAt: T0 } }, history: [{ id: 1, at: T0 }] };
  const b = { overrides: { 2: { ep: 2, updatedAt: T1 } }, history: [{ id: 2, at: T1 }] };
  const c = { overrides: { 1: { ep: 9, updatedAt: T2 } }, history: [{ id: 3, at: T2 }] };
  const abc = merge(merge(a, b), c);
  const cba = merge(merge(c, b), a);
  assert.deepEqual(abc.overrides, cba.overrides);
  assert.deepEqual(abc.history.map(h => h.at), cba.history.map(h => h.at));
  assert.equal(abc.overrides[1].ep, 9, 'newest edit to show 1 wins either way');
});

// ── aliasing: a shared empty template would let one merge poison the next ───────
test('a fresh empty doc is never shared between callers', () => {
  const a = emptyDoc();
  a.overrides[5] = { ep: 1, updatedAt: T1 };
  a.history.push({ id: 5, at: T1 });
  const b = emptyDoc();
  assert.deepEqual(b.overrides, {}, 'mutating one empty doc must not touch the next');
  assert.deepEqual(b.history, []);
});

test('merging inputs that omit keys does not mutate the template', () => {
  merge({ overrides: { 5: { ep: 1, updatedAt: T1 } } }, {});   // `theirs` has no overrides key
  const fresh = merge({}, {});
  assert.deepEqual(fresh.overrides, {}, 'a later merge must not inherit the earlier one');
  assert.deepEqual(fresh.history, []);
});

test('merge does not mutate either input', () => {
  const mine = { overrides: { 5: { ep: 1, updatedAt: T1 } }, history: [{ id: 5, at: T1 }] };
  const theirs = { overrides: { 9: { ep: 2, updatedAt: T2 } }, history: [{ id: 9, at: T2 }] };
  const snapshot = JSON.stringify([mine, theirs]);
  merge(mine, theirs);
  assert.equal(JSON.stringify([mine, theirs]), snapshot, 'inputs unchanged');
});

// ── tombstone pruning ───────────────────────────────────────────────────────────
test('old tombstones are pruned, live data and fresh tombstones are not', () => {
  const now = Date.parse('2026-07-15T00:00:00.000Z');
  const doc = {
    overrides: {
      1: { __deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },  // ~195d — stale
      2: { __deleted: true, updatedAt: '2026-07-01T00:00:00.000Z' },  // ~14d  — keep
      3: { ep: 5, updatedAt: '2026-01-01T00:00:00.000Z' }             // old but real
    },
    customShows: {}
  };
  const p = pruneTombstones(doc, now);
  assert.equal(p.overrides[1], undefined, 'stale tombstone dropped');
  assert.ok(p.overrides[2], 'recent tombstone kept — other device may still have it');
  assert.ok(p.overrides[3], 'real data is never pruned by age');
});

console.log(`\n${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
