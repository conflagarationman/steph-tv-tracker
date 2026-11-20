# Visual critic loop

Jonny's standing rule for anything visual: hard numeric gates first, then a BLIND critic that sees
only screenshots plus a rubric, repeated until a fresh critic finds nothing above "minor".

- `visual-capture.mjs` takes the screenshots and runs the gates. It is not a test and nothing runs it
  in CI. Output goes to `/tmp/critic-runs/steph-tv-tracker/<stamp>/` (PNGs, `manifest.json` = image to
  plain-English state, `gates.json`). Never commit screenshots.
- `visual-rubric.md` is the only thing the critic reads besides the images and the manifest.

## Running a round

```
npm i --no-save playwright@1.56.1 && npx playwright install chromium
node scripts/visual-capture.mjs            # exits 1 if any gate fails; --only <regex>, --out <dir>
```

1. Fix gate failures until `gates: all pass`.
2. Copy the rubric into the run folder and split `manifest.json` in two (home, banner, filters,
   search and panels / dialogs, undo, Westley, seasonal looks and the fixture states), about 50-60
   images each, one folder per critic holding only `rubric.md`, its `manifest.json` and its PNGs.
3. Spawn one FRESH critic per folder (a Sonnet subagent) that may read only that folder, and tell it:
   "Before reporting anything as missing, undersized or mislabeled, look at that image again to
   confirm it." Fresh every round so it can't anchor.
4. Triage every finding: fix real ones, add intentional choices to the rubric's Calibration, reject
   false alarms (tighten the rubric), and check each one isn't a capture or fixture artifact.
5. Stop when one fresh round has nothing above minor after triage.

## How the capture works

Offline and write-free, the same setup as `westley.browser.mjs`: a local static server over the
committed JSON, the Worker stubbed (its POST answers with the state's fixture progress, nothing is
sent), `korok.js` served from a local copy of game-tracker's (`KOROK_JS`, default
`~/code/game-tracker/korok.js`), Google Fonts let through, everything else aborted. TMDB posters are
answered with a plain stand-in gradient so cards look like they do with art (the rubric says so).
Math.random, the love-banner bag, the theme and `?season=` are pinned so runs are comparable.

No real progress is used. Every state's progress is a fixture in the script: an ordinary week of
taps over the export (a few shows watched in the last days, one started, one added by hand, a diary
to match, all but the three newest new-release lines dismissed). Fixture text is unique and
realistic (invented episode titles and synopses, invented long show titles, nothing numbered).

States (56, 106 images): home top to bottom; a long undismissed banner; light theme; each filter
chip; search with results and with none; each panel opened (Caught up, diary, Archive, Year log,
Viewing stats, light stats); each dialog opened by a real tap (edit, add, episode list, Previously
on, Previously on with the server down); the Undo bar; Westley's mask; Thanksgiving and Christmas in
both themes; and fixture data: EMPTY, ONE show, HUGE (500+ shows, very long titles, plus a search),
no posters, Worker down, stale (only shows.json arrives and sync is down), load failure. Phone
390x844 (isMobile + hasTouch) and laptop 1440x900, scale 1, reduced motion.

## What the gates check (every state, before its screenshots)

JS errors and failed local requests; no sideways scroll at 390px; no text clipped, truncated with an
ellipsis, or spilling out of its own box (an ellipsis is a warning only in HUGE); no NaN / undefined /
null / Infinity in visible text; every control at least 44x44 on the phone (inline links in a
sentence and the hidden Korok exempt); nothing covering a Korok; no closed dialog still drawn on the
page; an open dialog centred with nothing sticking out of it; page weight (own files + web fonts,
default phone state) within main's 463,913 bytes on 2026-11-20 plus 10 percent.

## Round log

| Round | Run folder | Findings above minor (after triage) | What changed |
|---|---|---|---|
| Gates | `baseline` | 8,177 gate failures, 451 distinct | Baseline on main. ~26 kinds of control under 44px, pace labels spilling, one gate artifact. |
| 1 | `2026-11-20T06-50-34` | 1 major real, 1 major real for reduced motion (4 reported) | Closed episode list drawn at the foot of the page; still leaf on the caption. |
| 2 | `2026-11-20T07-06-29` | 3 major real (7 reported) | Dialogs pinned top-left; Episode field out of its dialog; empty bar ticks; light chip. |
| 3 | `2026-11-20T07-17-21` | 2 major real, same page (5 reported) | Designed load-failure page; styled status menu; "1 show". |
| 4 | `2026-11-20T07-27-36` | 2 major real (4 reported, 1 false alarm) | On hold in purple; phone card buttons in two tidy rows. |
| 5 | `2026-11-20T07-37-08` | **none** (1 minor; 1 major rejected after measuring) | Stop rule met. Chart month labels 8px to 10px. |
| Final | `final` | gates only | All gates pass after the round 5 minor; 469,234 bytes (main 463,913). |

### Gates

- Under 44px on a phone: the theme button, search, chips, "+ Add show", every card button, the
  banner's lines and Got it, Clear, the panel rows, legend pills, dialog fields and buttons, Undo.
  Fixed for touch screens only (`@media (pointer:coarse)`): buttons with a background grow to 44px
  and their labels to 12px; text targets (a show's title, the streaming pills link, Westley) grow an
  invisible hit area with padding and an equal negative margin so the card layout doesn't move.
  Fields went to 16px, which also stops iOS zooming the page when one is tapped. Desktop unchanged.
- Pace chart month labels ("23-03") spilled over their neighbours from 14px boxes. Each quarter's
  label now sits in a box as wide as its three bars.
- Gate artifact: "Korok 1 covered by the header". The gate jumped to the top synchronously while the
  header still had its scrolled-away class. The gate now waits for the page to react to the jump.

### Round 1

Real, fixed:
- **Major (live today):** the closed episode-list dialog was drawn at the foot of every page as an
  empty "Episodes" box with a Close button. `#episodes-dialog{display:flex}` beat the browser's own
  `dialog:not([open]){display:none}`. Flex only while open now. New gate: a closed dialog that still
  takes space fails (checked against the old CSS: it fails there).
- **Major (reduced motion):** standing still, the first leaf or snowflake rested on the "Rebuilt
  from..." caption on a laptop. It waits behind the header bar instead. Animated, they still fall.
- Minor fixed: the Season field showed the browser's spinner arrows when focused.

Left as minor: on-hold cards in the mixed grid are marked only by a grey "on hold" pill and lower
opacity (open question below).

### Round 2

Real, fixed:
- **Major (live today):** every dialog opened pinned to the top-left corner; the page's
  `*{margin:0}` reset removed the browser's `margin:auto` centring. Restored.
- **Major (live today, spotted in the same image):** in Update progress the Episode field ran past
  the dialog's right edge at 320px. Fields fill their label now. New gate: an open dialog must be
  centred and nothing inside it, inputs included, may stick out (it failed on the old page).
- **Major:** a brand-new EMPTY log drew a cluster of 2px colour ticks (empty categories keep a
  min-width). Only categories with shows are drawn, and no bar at all with no shows.
- **Major:** light theme's selected filter chip was dark text on burnt orange, a second accent next
  to the gold "+ Add show". It is gold now (dark theme unchanged). The amber used for text, dots and
  chart bars in the light theme is intended for contrast and is now in Calibration.
- **Major "first chart label clipped":** real look, not a bug: the chart opens scrolled to the newest
  month, so the oldest visible label is part-way off the left edge. A soft fade there now says "more
  this way"; Calibration explains the scroller.

Left as minor: the Undo bar covers the buttons under it for 12 seconds (it is fixed to the bottom on
purpose, so it can't slide away from her thumb); the filter chips are missing on the load-failure
page (they need show data to filter); on-hold cards again.

### Round 3

- **Major x2 (one page):** when the show list never arrives, the page showed one grey sentence under
  Ready to watch, a bare Up next heading, (0) rows, and no chips or Westley. Now: one dashed card
  ("Couldn't load your shows", progress is safe on this device, refresh to retry), the empty sections
  hide, the chips stay but disabled, and Westley says the list is lost at sea. The next successful
  render clears it (the stale-tab refresh retries every few minutes).
- Minors fixed: the Add dialog's status menu was the stock control; "1 shows" in the Year log.
- Minor rejected: "laptop grid rows don't bottom-align". Measured in the browser: every card in a row
  is the same height; the content is centred. Calibration added.

### Round 4

- **Major:** on-hold shows in Ready to watch (now flagged in every round, minor three times) were
  marked only by dimming and a grey pill. The pill wears the on-hold purple from the breakdown bar
  and legend now. Whether they should also leave Ready to watch is a question below, not a visual fix.
- **Major:** phone cards with no "Previously on..." (the stale state) split the edit and reset icons
  across two lines. On phones the main button takes its own full row and the small ones share the
  next, in every state.
- **Major rejected:** "Christmas light laptop: the light theme didn't apply". The image is plainly
  light; the critic misread it.

### Round 5 (clean)

- **Major rejected:** "a 4-line HUGE title makes its card taller than its row". In the image all four
  cards in that row share their top and bottom edges (and the grid measures equal heights).
- Minor fixed afterwards: pace chart month labels were 8px; now 10px, still inside their boxes (gates
  rerun: all pass).

Test status after every round: `westley.test.mjs` 27/27, `tmdb.test.mjs` 17/17, `season.test.mjs`
6/6, `tvlogic.test.mjs` 30/30, `scripts/westley.browser.mjs` 6/6, `scripts/season.browser.mjs` 6/6
(also with `KOROK_JS`). No test pinned a decision this loop changed. `worker/` is untouched. One
browser-test run crashed at launch mid-loop and passed unchanged on the rerun.

## Jonny's answers (2026-11-20) and the follow-up

- **On hold gets its own group.** Done: Ready to watch (and its count) now holds only the shows she
  is actively watching; dormant shows with episodes left are an "On hold" group under Up next, with
  the on-hold purple dot. Caught-up shows, dormant or not, stay in Caught up. With the committed
  show list, 13 shows moved and Ready to watch went from 36 to 23. The group isn't drawn when empty.
- **Phone cards can be smaller.** Done without shrinking any target: on phones the poster sits
  beside the title and details and the buttons span the whole card in one row; "Previously on..."
  becomes a rewind icon there (its words stay as the accessible name and tooltip). A ready card is
  about 36px shorter than in round 5. All gates pass on the full capture afterwards; tests unchanged.
- **The Undo bar** and **the "24-12" chart labels** stay as they are.

## Open taste questions for Jonny (before his answers)

- **Card height on phones.** 44px buttons make a ready card about 40px taller (the second row of
  buttons wraps as before, just bigger). Worth it for one-handed tapping, but say if you'd rather
  have "Previously on…" and the icon buttons in a tighter row.
- **On-hold shows in Ready to watch** (flagged every round): they're dimmed and now carry a purple
  "on hold" pill, but still sit in Ready to watch with the yellow "I watched this" button, so the
  heading's count (37) includes them. Moving them into their own group below is a behaviour change,
  so it's yours to call.
- **The Undo bar** covers whatever sits under it for its 12 seconds. It is fixed to the bottom on
  purpose (a per-card undo would slide away when the card re-sorts). Fine as is?
- **Chart month labels read "24-12"** (year-month). "Dec 24" would be friendlier; not changed.
- **The new-episodes banner lines are 44px tall each** on a phone, so a long undismissed banner is
  tall. She dismisses it most days, so usually three lines.
