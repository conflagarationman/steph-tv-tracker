import { merge, pruneTombstones, emptyDoc } from './merge.mjs';

// Sync endpoint for the tracker. The page can't commit to GitHub itself: doing that needs
// a token, and anything the page holds is public because the site is a static public repo.
// So the token lives here as a Worker secret and the browser never sees it.
//
// Progress is committed to a separate `data` branch, NOT main — a commit to main would
// trigger a GitHub Pages rebuild on every episode marked watched.
//
// POST /progress  body: the device's local copy -> merged with the stored copy, committed,
//                 and the merged result returned for the device to adopt.
// GET  /progress  the stored copy, for debugging and for restoring by hand.

const FILE = 'progress.json';
const UA = 'steph-tv-tracker-sync';

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'no-store'
  }
});

async function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': UA,
      ...(init.headers || {})
    }
  });
}

// Returns the stored doc plus the blob sha needed to write over it. A missing file is a
// normal first-run state, not an error.
async function read(env) {
  const res = await gh(env, `contents/${FILE}?ref=${env.BRANCH}`);
  if (res.status === 404) return { doc: emptyDoc(), sha: null };
  if (!res.ok) throw new Error(`read ${res.status}: ${await res.text()}`);
  const meta = await res.json();
  // atob is fine here: the payload is ASCII JSON, and Workers has no Buffer.
  const decoded = decodeURIComponent(escape(atob(meta.content.replace(/\n/g, ''))));
  let doc;
  try { doc = JSON.parse(decoded); } catch { doc = emptyDoc(); }
  return { doc, sha: meta.sha };
}

async function write(env, doc, sha, note) {
  const body = {
    message: `Sync progress${note ? ` (${note})` : ''}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(doc, null, 2) + '\n'))),
    branch: env.BRANCH,
    committer: { name: 'tv-tracker-sync', email: 'actions@users.noreply.github.com' }
  };
  if (sha) body.sha = sha;
  const res = await gh(env, `contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body) });
  return res;
}

// Read-merge-write against a sha. If another device committed in between, GitHub rejects
// the write and we start over from its version — the merge is what makes that safe to
// retry, since replaying our copy against newer data can't lose either side.
async function syncWithRetry(env, incoming, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    const { doc, sha } = await read(env);
    const merged = pruneTombstones(merge(incoming, doc));
    const res = await write(env, merged, sha, `${Object.keys(merged.overrides).length} shows`);
    if (res.ok) return merged;
    last = `${res.status}: ${await res.text()}`;
    // 409 conflict / 422 stale sha -> someone else won the race; re-read and retry.
    if (res.status !== 409 && res.status !== 422) throw new Error(`write ${last}`);
    await new Promise(r => setTimeout(r, 120 * (i + 1)));
  }
  throw new Error(`write failed after ${attempts} attempts — ${last}`);
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const reqOrigin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Only the site may call this from a browser. Not a security boundary — a non-browser
    // client can send any Origin it likes — but it stops other pages using the endpoint.
    if (reqOrigin && env.ALLOWED_ORIGIN && reqOrigin !== env.ALLOWED_ORIGIN) {
      return json({ error: 'origin not allowed' }, 403, origin);
    }

    // The page is public, so this key is public too: it deters drive-by writes, it does not
    // authenticate anyone. The real safety net is that every write is a git commit on the
    // data branch — anything unwanted is recoverable with git revert.
    if (env.SYNC_KEY && request.headers.get('X-Sync-Key') !== env.SYNC_KEY) {
      return json({ error: 'bad key' }, 401, origin);
    }

    const url = new URL(request.url);
    if (!url.pathname.endsWith('/progress')) return json({ error: 'not found' }, 404, origin);

    try {
      if (request.method === 'GET') {
        const { doc } = await read(env);
        return json(doc, 200, origin);
      }
      if (request.method === 'POST') {
        let incoming;
        try { incoming = await request.json(); }
        catch { return json({ error: 'body must be JSON' }, 400, origin); }
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
          return json({ error: 'body must be a progress object' }, 400, origin);
        }
        const merged = await syncWithRetry(env, incoming);
        return json(merged, 200, origin);
      }
      return json({ error: 'method not allowed' }, 405, origin);
    } catch (e) {
      // Never 200 on a failed write: the page must keep its local copy and retry, not
      // assume the data is safely stored.
      return json({ error: String(e.message || e) }, 502, origin);
    }
  }
};
