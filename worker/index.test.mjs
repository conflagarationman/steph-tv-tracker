// Exercises the Worker against a stubbed GitHub contents API, so the read-merge-write
// path and its conflict retry are covered without needing a token or a network.
import worker from './index.mjs';
import assert from 'node:assert/strict';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n        ${e.message}`); }
};

const ORIGIN = 'https://conflagarationman.github.io';
const env = {
  REPO: 'conflagarationman/steph-tv-tracker',
  BRANCH: 'data',
  GITHUB_TOKEN: 'fake',
  ALLOWED_ORIGIN: ORIGIN,
  SYNC_KEY: 'k'
};

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

// Minimal in-memory stand-in for the contents API, including sha-based optimistic locking.
function fakeGitHub({ file = null, failWrites = 0 } = {}) {
  const state = { file, sha: file ? 'sha0' : null, commits: [], writes: 0 };
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    if (method === 'GET') {
      if (!state.file) return new Response('missing', { status: 404 });
      return new Response(JSON.stringify({ content: b64(state.file), sha: state.sha }), { status: 200 });
    }
    if (method === 'PUT') {
      state.writes++;
      const body = JSON.parse(init.body);
      if (state.writes <= failWrites) return new Response('conflict', { status: 409 });
      if (state.sha && body.sha !== state.sha) return new Response('sha mismatch', { status: 409 });
      state.file = decodeURIComponent(escape(atob(body.content)));
      state.sha = 'sha' + state.writes;
      state.commits.push(body.message);
      return new Response('{}', { status: 200 });
    }
    return new Response('nope', { status: 405 });
  };
  return state;
}

const post = (body, headers = {}) => worker.fetch(new Request('https://w.dev/progress', {
  method: 'POST',
  headers: { Origin: ORIGIN, 'X-Sync-Key': 'k', 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body)
}), env);

const T1 = '2026-07-15T11:00:00.000Z';
const T2 = '2026-07-15T12:00:00.000Z';

await test('first ever sync creates the file', async () => {
  const gh = fakeGitHub({ file: null });
  const res = await post({ overrides: { 5: { ep: 3, updatedAt: T1 } } });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.overrides[5].ep, 3);
  assert.ok(gh.file, 'file was committed');
  assert.equal(JSON.parse(gh.file).overrides[5].ep, 3);
});

await test('sync merges with what is already stored', async () => {
  fakeGitHub({ file: JSON.stringify({ overrides: { 9: { ep: 1, updatedAt: T1 } } }) });
  const res = await post({ overrides: { 5: { ep: 3, updatedAt: T1 } } });
  const out = await res.json();
  assert.equal(out.overrides[5].ep, 3, 'incoming kept');
  assert.equal(out.overrides[9].ep, 1, 'stored kept');
});

await test('a browser with wiped storage does not blank the stored copy', async () => {
  const stored = JSON.stringify({ overrides: { 9: { ep: 4, updatedAt: T1 } }, history: [{ id: 9, at: T1 }] });
  fakeGitHub({ file: stored });
  const res = await post({ overrides: {}, history: [], dismissed: [] });
  const out = await res.json();
  assert.equal(out.overrides[9].ep, 4, 'her progress survives an empty POST');
  assert.equal(out.history.length, 1);
});

await test('a losing race is retried and neither side is lost', async () => {
  // First PUT 409s, as if the other device committed in between.
  const gh = fakeGitHub({ file: JSON.stringify({ overrides: { 9: { ep: 1, updatedAt: T1 } } }), failWrites: 1 });
  const res = await post({ overrides: { 5: { ep: 3, updatedAt: T2 } } });
  assert.equal(res.status, 200, 'recovers rather than failing the user');
  const out = await res.json();
  assert.equal(out.overrides[5].ep, 3);
  assert.equal(out.overrides[9].ep, 1);
  assert.equal(gh.writes, 2, 'retried exactly once');
});

await test('persistent conflict gives up with an error, never a false success', async () => {
  fakeGitHub({ file: '{}', failWrites: 99 });
  const res = await post({ overrides: { 5: { ep: 3, updatedAt: T1 } } });
  assert.equal(res.status, 502, 'page must keep its local copy and retry');
});

await test('GitHub outage surfaces as an error, not silent data loss', async () => {
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  const res = await post({ overrides: { 5: { ep: 3, updatedAt: T1 } } });
  assert.equal(res.status, 502);
});

await test('corrupt stored JSON does not throw away the incoming sync', async () => {
  fakeGitHub({ file: 'not json at all{{{' });
  const res = await post({ overrides: { 5: { ep: 3, updatedAt: T1 } } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).overrides[5].ep, 3);
});

await test('progress is written to the data branch, never main', async () => {
  fakeGitHub({ file: null });
  let seen;
  const inner = globalThis.fetch;
  globalThis.fetch = async (u, i = {}) => { if (i.method === 'PUT') seen = JSON.parse(i.body).branch; return inner(u, i); };
  await post({ overrides: { 5: { ep: 1, updatedAt: T1 } } });
  assert.equal(seen, 'data', 'a commit to main would rebuild Pages on every click');
});

await test('rejects a foreign origin', async () => {
  fakeGitHub({ file: null });
  const res = await worker.fetch(new Request('https://w.dev/progress', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'X-Sync-Key': 'k' }, body: '{}'
  }), env);
  assert.equal(res.status, 403);
});

await test('rejects a missing or wrong sync key', async () => {
  fakeGitHub({ file: null });
  const res = await post({}, { 'X-Sync-Key': 'wrong' });
  assert.equal(res.status, 401);
});

await test('rejects a non-object body instead of corrupting the file', async () => {
  const gh = fakeGitHub({ file: JSON.stringify({ overrides: { 9: { ep: 1, updatedAt: T1 } } }) });
  for (const bad of ['["a"]', '"str"', '42', 'null']) {
    const res = await worker.fetch(new Request('https://w.dev/progress', {
      method: 'POST', headers: { Origin: ORIGIN, 'X-Sync-Key': 'k' }, body: bad
    }), env);
    assert.equal(res.status, 400, `body ${bad} must be rejected`);
  }
  assert.equal(JSON.parse(gh.file).overrides[9].ep, 1, 'stored file untouched');
});

await test('CORS preflight is answered', async () => {
  const res = await worker.fetch(new Request('https://w.dev/progress', {
    method: 'OPTIONS', headers: { Origin: ORIGIN }
  }), env);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

await test('GET returns the stored copy for hand-restoring', async () => {
  fakeGitHub({ file: JSON.stringify({ overrides: { 9: { ep: 4, updatedAt: T1 } } }) });
  const res = await worker.fetch(new Request('https://w.dev/progress', {
    method: 'GET', headers: { Origin: ORIGIN, 'X-Sync-Key': 'k' }
  }), env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).overrides[9].ep, 4);
});

console.log(`\n${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
