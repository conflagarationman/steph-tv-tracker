# steph-tv-tracker

Steph's TV Log — a tracker built for Jonny's wife. `index.html` is the whole app: no build
step, no dependencies, no framework. Live at
https://conflagarationman.github.io/steph-tv-tracker/, redeployed by GitHub Pages ~30s after
a push to `main`.

**She uses the live site day to day.** Treat pushes to `main` as outward-facing — verified,
low-risk fixes still wait for an explicit "push it," they don't go live just because they're
correct. This file is reference material only; nothing here is secret, but the Worker's
GitHub PAT and Cloudflare account are not documented beyond what's needed to work on the code.

## Layout

| Branch/file | Holds | Notes |
|---|---|---|
| `main` | Code + static JSON (`shows.json`, `show-meta.json`, `posters.json`, `episode-counts.json`, `tmdb-map.json`) | A commit here rebuilds Pages. `shows.json` is a **frozen export** from her original TV Time import, not live data. |
| `data` branch, `progress.json` | Her actual live progress | Deliberately kept off `main` so marking an episode doesn't trigger a Pages rebuild. |
| `worker/` | Cloudflare Worker (`steph-tv-tracker-sync.jonny-wilczynski.workers.dev`) | The only thing holding the GitHub PAT. Read-merge-commit with sha-based optimistic locking, union-biased merge, tombstones for deletes. |
| `scripts/check-new-seasons.mjs` | Daily GitHub Action | Refreshes posters/episode-counts/tmdb-map/new-releases. Shares `tmdb.mjs`. |

## `progress.json` — override semantics, not a replacement record

It's a patch on top of `shows.json`, not a parallel copy:
```jsonc
{ "version": 1, "updatedAt": "...", "overrides": { "<showId>": {...changed fields, updatedAt} },
  "customShows": {...shows she added herself, id = Date.now() timestamp} }
```
- A base record + a live (non-tombstone) override merges as `{...base, ...override}`.
- `__deleted: true` on an override is a **tombstone** (she removed the show), not a real field
  update — check `isLive()` before trusting an override.
- `customShows` entries use the same record shape; their `id` is a timestamp so it can never
  collide with a real `shows.json` id. That's intentional, not a bug if you see a huge id.
- This merge logic exists in exactly one place client-side and is mirrored in the Worker —
  if you change one, change both, or the page and the Worker will disagree about what a
  tombstone means.

## Streaming pills

TMDB returns ~72 distinct provider names across her 339 shows — every plan tier and reseller
counts as its own "provider." `canonicalService()` / `watchServices()` in `index.html` collapse
that to ~31: strip reseller suffixes (`X Amazon Channel`), strip ad-tier suffixes (`with Ads`),
alias plan names, dedupe, then show only the best tier per bucket
(subscription > free > network > live-TV).

- **This lives in the page, not the fetch job, on purpose.** It's a display judgment that
  will want tuning; keeping the raw provider list in `show-meta.json` means retuning never
  requires re-fetching 339 shows.
- **Check aliases against the raw name first.** The reseller-stripping regex turns "The Roku
  Channel" into "The" if alias resolution runs after it instead of before.

## TMDB matching

`nameMatches()` in `tmdb.mjs` accepts a TMDB result only if it **equals** ours, is a **prefix**
of ours (TMDB dropped a qualifier: "Ghosts (US)" -> "Ghosts"), or **every word** of it appears
in ours. It is deliberately **not** `candidate.startsWith(query)` — that accepted "Dark Matter"
for a query of "Dark", and "Citadel: Honey Bunny" for "Citadel". If you're tempted to loosen
this for a stubborn unmatched show, don't — loosen the specific show's title instead.

Cached matches are only re-verified when they produced **no poster AND no seasons** — re-checking
all 335 good matches on every run risks false-rejecting shows that currently work. 5 shows are
legitimately unmatched (`Ink & Paint`, `Cinema Relics`, `Star Wars: Lando`, `Armor Wars`,
`Rangers of the New Republic`) — announced, never produced, no TMDB entry exists. Don't "fix"
these; `tmdb-map.json` already records why via `reason`/`rejected`.

## Undo

Mark/finish/start/edit push onto a per-session `undoStack` (not synced — this is for "I just
tapped wrong," not cross-device history) and show a 12s bottom bar. Undo restores the **whole**
prior override, because `epsWatched` is a lifetime counter carried over from her TV Time export
and can't be derived from season/episode — there's no delta between "S3E37" and "S1E5," so a
partial correction is impossible and a full-override restore is the only correct undo.

History entries are an array, not a keyed object, so they can't carry a tombstone the way
overrides do — a removed history entry goes into a parallel `historyRemoved` set (key
`<id>@<isoTimestamp>`), which the merge subtracts from the union. `pruneTombstones` ages these
out after 90 days.

## Deploy order matters when the merge shape changes

**Deploy the Worker before the page.** The old Worker code silently drops fields it doesn't
recognize — if the page starts sending a new field before the Worker knows about it, that
field is quietly lost on every sync until the Worker catches up.

## Verifying locally

- `fetch()` needs the page served over `http://`, not opened as `file://`.
- `ALLOWED_ORIGIN` locks the Worker to the real `github.io` origin, so the actual sync path is
  only testable against the live site — a local dev server can render the page but can't sync.
- The in-app browser sandbox used for verification can't reach `image.tmdb.org`; poster images
  hang and `computer{screenshot}` will time out waiting on them. Use `javascript_tool` against
  the live DOM instead — it's also better evidence than a screenshot for this kind of check.
- A **brand-new** `workers.dev` subdomain fails TLS (`alert 40`) until Cloudflare's edge cert
  propagates. Wait and retry; this has been wrongly blamed on local security software before.
- Windows blocks `npx` under default PowerShell execution policy — use `npx.cmd`.

## Tests

```
node tmdb.test.mjs        # repo root
cd worker && npm test     # worker/index.test.mjs + worker/merge.test.mjs
```
No token or network needed for any of them.

## Known state as of 2026-07-26

4 real bugs (stale `NOW` module const feeding date math, `esc()` allocating a DOM node per
call across hundreds of shows every render, `pushSync()` unconditionally adopting a server
response even if a newer local edit landed mid-flight, missing poster `width`/`height` causing
layout shift) were found, fixed, and verified locally — but per the "only push when asked"
rule above, confirm they're actually live on `main` before assuming they are.

Queued, not started: an episode browser (browse past episodes per show — titles, synopses —
not just current position). TMDB's `/tv/{id}/season/{n}` has what's needed; nothing here
fetches or stores it today. Natural extension point is the existing `/tmdb-lookup` Worker
route, called on demand rather than pre-fetched for all 339 shows.
