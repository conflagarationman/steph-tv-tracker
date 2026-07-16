# Progress data branch

Steph's TV tracker progress, committed here by the sync Worker (see `worker/` on `main`).

This branch is **data, not code** — deliberately separate from `main` so a sync doesn't
trigger a GitHub Pages rebuild every time she marks an episode watched.

`progress.json` is the current state. Every sync is a commit, so the full history is here:

    git log --oneline data                        # every sync
    git show data:progress.json                   # current state
    git show <sha>:progress.json                  # any past state

To restore a past state, write it back with the Worker's endpoint or commit it here directly.
