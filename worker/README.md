# Progress sync

Backs Steph's progress with durable storage so a Safari data-eviction can't lose it.

Until this is deployed, `SYNC` in `index.html` is empty and the page behaves exactly as
before — local only. Nothing breaks by leaving it unconfigured.

## Why a Worker at all

The page can't commit to GitHub itself. Committing needs a token, and anything the page
holds is public (the site is a public static repo), so a token in the page means anyone
can push to it. The Worker holds the token as a server-side secret; the browser never
sees it.

## How it works

- Every change is written to `localStorage` **first**. Sync is a background copy — she
  never waits on the network, and being offline costs nothing.
- The page POSTs its whole progress doc; the Worker merges it with the stored copy and
  returns the merged truth, which the page adopts. Merge logic lives in exactly one
  place (`merge.mjs`).
- The merge is **union-biased** — where two devices disagree unresolvably, data survives.
  Deletes leave a `{__deleted:true}` tombstone so they don't get resurrected by a merge.
- Progress is committed to the **`data` branch, not `main`**. A commit to `main` would
  trigger a GitHub Pages rebuild every time she marks an episode watched.
- Every write is a commit, so the restore path for anything — bug, bad write, vandalism —
  is `git checkout` at any point in history.

## Setup

**1. Create the `data` branch** (once). The Worker writes here; it must exist first:

```bash
git checkout --orphan data
git rm -rf .
echo '{"version":1,"overrides":{},"customShows":{},"history":[],"dismissed":[]}' > progress.json
git add progress.json && git commit -m "Start progress data branch"
git push -u origin data
git checkout main
```

**2. Create a GitHub token.** github.com → Settings → Developer settings → Personal access
tokens → **Fine-grained tokens** → Generate new:
- Repository access: **Only select repositories** → `steph-tv-tracker`
- Permissions → Repository permissions → **Contents: Read and write**
- Nothing else. This token can only touch this one repo's files.

**3. Deploy the Worker:**

```bash
cd worker
npx wrangler login
npx wrangler secret put GITHUB_TOKEN     # paste the token from step 2
npx wrangler secret put SYNC_KEY         # any random string, e.g. `openssl rand -hex 16`
npx wrangler deploy
```

Note the deployed URL, e.g. `https://steph-tv-tracker-sync.<subdomain>.workers.dev`.

**4. Point the page at it.** In `index.html`, fill in `SYNC`:

```js
const SYNC={ url:'https://steph-tv-tracker-sync.<subdomain>.workers.dev/progress', key:'<the SYNC_KEY>' };
```

Commit and push. Sync is live on her next visit; her existing localStorage is migrated
and uploaded automatically on first load.

**5. Have her Add to Home Screen** (Safari → Share → Add to Home Screen). Standalone web
apps get their own storage container that isn't subject to the 7-day eviction rule. Free,
and it means the local copy is durable too.

## About the sync key

It's in a public page, so it's public. It deters drive-by writes; it does not
authenticate anyone. That's a deliberate trade: real auth would mean a login for a
non-technical user, to protect a list of TV episodes. The safety net is the git history —
anything unwanted is one `git revert` away.

## Tests

```bash
npm test        # merge.test.mjs + index.test.mjs, no network or token needed
```

`index.test.mjs` stubs the GitHub contents API, so the read-merge-write path and its
conflict retry are covered offline.

## Restoring by hand

```bash
git show data:progress.json                  # current
git log --oneline data                       # every sync, in order
git show <sha>:progress.json > progress.json # any past state
```

Or `GET <worker-url>/progress` with the `X-Sync-Key` header.
