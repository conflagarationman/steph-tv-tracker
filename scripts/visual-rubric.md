# Steph's TV Log rubric (for a blind visual critic)

## Who the critic is

You see ONLY rendered screenshots of a personal TV tracking website, plus `manifest.json`, which gives
each image a one-line label saying which state it shows ("The 'Done' filter chip selected", "A HUGE
log with very long show titles"). No code, no design notes, no intent beyond this file. Judge each
image the way a real person would see it on a real screen.

The show list is a real person's real list. Don't judge whether the shows, numbers or dates are
right; judge how they are shown. Some states use made-up data on purpose (labels say EMPTY, ONE show,
HUGE, very long titles, no posters, server can't be reached, bad connection, data fails to load).
Those exist to see how the design copes, so judge them for looking intentional, not realistic.

## What the site is

**Steph's TV Log**: one person's TV tracker, built for her by her husband. A single page:

- A sticky **header bar**: a TV icon, the title, a sun/moon theme button, a search box, "+ Add show",
  and a row of status filter chips (All, Active, On hold, Up next, Done, Dropped) that scrolls
  sideways on a phone. The bar slides away while scrolling down and comes back on scroll up.
- A small grey line under it saying where the data came from and whether it is backed up.
- **Westley**: a tiny pixel-art farm boy who "hosts" the log with one short line of text beside him.
- A big yellow **banner** with a playful message from her husband (it rotates through private jokes).
- A yellow **"New episodes out"** panel listing new releases; each line jumps to that show.
- **Ready to watch** (show cards with something left to watch), **Up next** (a numbered queue), and
  collapsible rows: Caught up, What you've watched (a diary), Archive, Year log, Viewing stats.
- Stat tiles and a coloured breakdown bar (on a phone they sit lower, below the lists).
- Show **cards**: a small poster, the title, a yellow season/episode badge (S3 · E38), coloured
  streaming-service pills, small grey facts, and buttons ("I watched this", "Previously on…", edit,
  reset). Tapping a title opens the episode list.
- Dialogs: update progress, add a show, the episode list, "Previously on…" (Westley recaps the last
  episode watched), and an Undo bar along the bottom after a tap.

## Audience and distance

- **Steph, every day, phone in one hand.** Most images are a phone (390x844), read in a quick glance
  on the sofa with the TV on. Laptop images (1440x900) are a desk at normal distance.
- `deviceScaleFactor` is 1: what you see is the real size. Text you'd have to zoom in on to read is
  itself the finding.

## The core tests (ask for every image)

1. **What do I watch next, and how do I mark it?** Within a second, is it clear which shows are ready
   and what episode she's on? Is the "I watched this" action obvious on every ready card?
2. **Can I read it?** On the phone, body text and labels need a FONT SIZE of at least about 12 px,
   and anything meant to be read at a glance (show titles, the episode badge, headings) well above
   that. Measure font size as the FULL LINE HEIGHT (top of the tallest letter to the bottom of the
   lowest, like "Hg"), NOT the height of capital letters, which is only about 70 percent of the font
   size (12 px text has capitals about 8.5 px tall). Small captions ("started Jun 27", "watched 2d
   ago") may sit near the floor; below it is a finding only if the text carries meaning. Low contrast
   between text and its background counts too.
3. **Does it mean something without reading?** Status (ready, caught up, on hold, done, dropped) and
   progress should also come through colour, shape, icon or position, not only words.
4. **Is anything broken?** Text cut off mid-word or overlapping, things running off the screen edge,
   a sideways scrollbar, misaligned rows, empty boxes that look like a failed load, "undefined",
   "NaN", "null", a "?" where data should be, broken image icons, tofu boxes for missing emoji. These
   are always findings.

## Target look and beauty (judge beauty, not just function)

The intended look is **warm, friendly and a bit playful**: a dark navy page (or a soft grey-white one
in the light theme) with white cards, sunny yellow as the one accent colour (badges, the main button,
the banner), rounded corners everywhere, Poppins for headings and Nunito Sans for text, pill-shaped
chips and buttons. It should feel like a small, polished phone app made with love, not a spreadsheet.

5. **Does it feel like one designed product?** Same colours, type, corner radii, pill styles and
   spacing across states and themes. Anything that looks like a default web page (browser-default
   form controls that clash, a stray blue link, unstyled text), a debug readout, or a different site
   pasted in is a finding.
6. **Is there a clear hierarchy?** On each screen one thing should lead (the next show to watch, the
   dialog's title). Walls of same-weight pills and labels are a finding.
7. **Would a person say "that looks off" or "that looks cheap"?** If yes, it is a `major` finding even
   if nothing is technically broken. Polish a designer would notice is `minor`.

## Specific checks

- **Cards:** title, episode badge and main button readable at a glance; the main button clearly the
  main one; pills and facts tidy, not a jumble; cards line up in their list or grid.
- **Filters and search:** the selected chip is obvious; results say how many; "no results" says so
  kindly and offers a way back.
- **Panels:** each opened panel is scannable, not a wall; charts have readable labels.
- **Dialogs:** look like part of the same product; fields and buttons line up; the main action is
  obvious; a destructive action (Drop show) looks different from the rest.
- **Light theme:** everything still readable; nothing that only worked on dark.
- **Seasonal looks:** decoration should feel festive but never get in the way of reading or tapping.
- **Empty / one show / huge / no posters / server down / bad connection / load failure:** each should
  look designed. An empty section should say something human or hide cleanly. A huge list should
  still be scannable and long titles should wrap cleanly. Missing posters should show a deliberate
  fallback, not a broken image. A failure should say what happened in plain words.
- **Tap targets (phone):** every control is already MEASURED at least 44x44 px by an automated gate
  before you see it, so don't estimate tap sizes from the picture. Report only crowding: controls so
  close together that a thumb would hit the wrong one.

## Calibration (decisions already made; don't report these)

- **Westley** is a deliberate tiny pixel-art character (about 32x44 px) with one quiet line beside
  him. Small and pixelated on purpose. His line changes ("Inconceivable!" when a new season drops,
  "As you wish…" after a tap); that's intended.
- **The love banner** (big yellow box with "I love you spoose", "boof.", "fat tractor" and other
  private jokes) is a gift from her husband. Its words, size and position at the top are intended.
- **"✓ I watched this, bitch!"** is the button's intended wording (a private joke). Don't report the
  word.
- **The Korok** (a tiny green leaf creature hanging from the very top edge of the page, and another
  near the bottom) is a deliberate hidden easter egg shared with another site. It is meant to be small
  and a little hidden; don't report its size or position.
- **Poster art in these screenshots is a stand-in**: soft two-tone gradients with a pale circle,
  because the capture runs offline. Judge the poster frame, size and placement, not the art. A
  poster-less show shows a large coloured first letter on purpose.
- **Streaming pills use each service's own colours** (Netflix red, Disney+ blue and so on); a service
  without its own colour is grey on purpose.
- **Seasonal looks** (Thanksgiving: a harvest ribbon along the top of the header, a turkey after the
  title, warm glow, a few leaves; Christmas: a strand of coloured bulbs along the top of the header, a
  tree after the title, red and green glow, a few snowflakes) are intended. In these screenshots
  motion is switched off, so leaves and snowflakes stand still in fixed spots; they sit behind the
  page, so one appearing between cards is intended.
- **HUGE-state titles and episode titles are made up.** Judge how long titles are handled, not the
  names.
- **On a phone, the stat tiles and breakdown bar sit below the lists on purpose**, so Ready to watch
  is near the top.
- **Light theme accents:** gold fills (buttons, the banner, the episode badge, the selected chip)
  stay gold in both themes. Where yellow would be text, a dot or a chart bar on a light background
  (section dots, the "Active now" number, the monthly pace bars), the light theme uses a deep amber
  instead so it stays readable. That pairing is intended; report it only if one of them is hard to
  read.
- **The monthly pace chart scrolls sideways** and opens at the newest month, so its left edge fades
  out over older months on purpose.

## Severity

- `blocker`: something she'd act on is hidden, unreadable or wrong-looking; something clipped or
  overlapping that hides meaning; a state that looks crashed.
- `major`: clearly wrong and would bother someone on sight: text too small or low contrast to read at
  a glance, a significant misalignment, an empty or error state that looks like a bug, anything that
  looks cheap or off.
- `minor`: a real rough edge a careful look would catch: uneven spacing, a slightly awkward wrap,
  marginal contrast that still reads.
- `nit`: taste.

Be specific: name the image, the element and what you see. Before reporting anything as missing,
undersized, cut off or mislabeled, look at that image again to confirm it. Don't flag a problem you
can't see in the image. Don't suggest new features; judge what is there. If the same defect appears
in several images, report it once and list the other images in `defect`.

## Output

Return ONLY a JSON array, no prose before or after:

```json
[{"image": "012-home-phone-02.png", "severity": "major", "element": "Ready to watch card 3 title", "defect": "...", "suggested_fix": "..."}]
```

An empty array means nothing to report.
