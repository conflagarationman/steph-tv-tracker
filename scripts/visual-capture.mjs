// Visual critic capture + hard gates for Steph's TV Log. NOT a test: nothing runs it in CI. It opens
// index.html in many states (every filter, every panel and dialog, both themes, the seasonal looks,
// and made-up data: empty, one show, a huge list with very long titles, no posters, Worker down,
// stale data, load failure) at phone 390x844 and laptop 1440x900, runs numeric gates on each state
// BEFORE its screenshots, and writes PNGs + manifest.json + gates.json to
// /tmp/critic-runs/steph-tv-tracker/<stamp>/. The blind critic then reads only those PNGs, its slice
// of manifest.json and scripts/visual-rubric.md. See scripts/visual-critic-README.md for the loop
// and the round log. Never commit the screenshots.
//
//   npm i --no-save playwright@1.56.1 && npx playwright install chromium
//   node scripts/visual-capture.mjs                 # everything (exits 1 if a gate fails)
//   node scripts/visual-capture.mjs --only filter   # states whose name matches
//
// Fully offline and write-free, like westley.browser.mjs: the page is served from a local static
// server over the committed JSON, the Worker is stubbed (POSTs answered from a fixture, never sent),
// korok.js is served from a local copy of game-tracker's (KOROK_JS, default ~/code/game-tracker),
// and every other off-site request is aborted except Google Fonts. TMDB poster images are answered
// with a plain local stand-in (a soft two-tone gradient, no text) so the cards look like they do with
// art; the "noposters" state aborts them to show the letter fallback. Alternate data is built in
// memory and served in place of a file; tracked files are never edited. No real progress is used:
// every state's progress.json is a fixture below.
//
// PLAYWRIGHT_MODULE and CHROMIUM_PATH override the import and the browser, as in the browser tests.
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const ONLY = val("--only") ? new RegExp(val("--only")) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = val("--out") || `/tmp/critic-runs/steph-tv-tracker/${stamp}`;
await mkdir(OUT, { recursive: true });
const KOROK = await readFile(process.env.KOROK_JS || join(homedir(), "code/game-tracker/korok.js"), "utf8").catch(() => null);
if (!KOROK) console.warn("korok.js not found: set KOROK_JS; the Korok gate will be skipped");

const TYPES = { ".webmanifest": "application/manifest+json", ".png": "image/png", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript" };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try {
    const body = await readFile(join(ROOT, path || "index.html"));
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ─── Fixtures ──────────────────────────────────────────────────────────────────────────────
const readJson = async (f) => JSON.parse(await readFile(join(ROOT, f), "utf8"));
const SHOWS = await readJson("shows.json");
const COUNTS = await readJson("episode-counts.json");
const META = await readJson("show-meta.json");
const TMDB = await readJson("tmdb-map.json");
const byTmdb = Object.fromEntries(Object.entries(TMDB).filter(([, v]) => v && v.tmdbId).map(([id, v]) => [v.tmdbId, id]));
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const at = (offset, h, m) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(h, m, 0, 0); return d.toISOString(); };

// Shows the page would put in Ready to watch with no progress at all: watching, a TMDB match, and
// the most recently aired episode ahead of the export's position.
const readyish = SHOWS.filter(g => g.s === "watching" && g.season != null && META[g.id] && META[g.id].lastAired && (META[g.id].lastAired.season > g.season || (META[g.id].lastAired.season === g.season && META[g.id].lastAired.ep > g.ep)));
const pick = (n, from = readyish) => from.slice(0, n);

// A believable week of taps on top of the export: a few shows watched in the last days (they sort to
// the top and read "watched today"), one started, one finished, history to match, one show she added
// herself. Invented, not her real progress.
function sampleProgress() {
  const [a, b, c, d] = pick(4);
  const queued = SHOWS.find(g => g.s === "queue" && TMDB[g.id] && TMDB[g.id].tmdbId);
  const stamp0 = at(0, 9, 0);
  const ov = (g, o) => ({ ...o, updatedAt: stamp0 });
  const history = [];
  const watch = (g, n, offset) => { for (let i = 0; i < n; i++) history.push({ id: g.id, title: g.t, action: "watched", season: g.season, ep: g.ep + i + 1, at: at(offset, 20 + i, 10 + i * 7) }); };
  watch(a, 2, 0); watch(b, 1, -1); watch(c, 3, -3); watch(d, 1, -6);
  if (queued) history.push({ id: queued.id, title: queued.t, action: "started", season: 1, ep: 1, at: at(-2, 19, 45) });
  history.sort((x, y) => y.at.localeCompare(x.at));
  const custom = { id: 1763400000000, t: "The Lantern Keepers of Alder Bay", s: "watching", season: 1, ep: 3, epsWatched: 3, lastWatched: day(-1), start: day(-9), queued: null, cy: null, cm: null, dormant: false, custom: true, updatedAt: stamp0, tmdb: { tmdbId: null, poster: null, epCounts: null, meta: null } };
  return {
    version: 1, updatedAt: stamp0,
    overrides: {
      [a.id]: ov(a, { season: a.season, ep: a.ep + 2, epsWatched: (a.epsWatched || 0) + 2, lastWatched: day(0), dormant: false }),
      [b.id]: ov(b, { season: b.season, ep: b.ep + 1, epsWatched: (b.epsWatched || 0) + 1, lastWatched: day(-1), dormant: false }),
      [c.id]: ov(c, { season: c.season, ep: c.ep + 3, epsWatched: (c.epsWatched || 0) + 3, lastWatched: day(-3), dormant: false }),
      [d.id]: ov(d, { season: d.season, ep: d.ep + 1, epsWatched: (d.epsWatched || 0) + 1, lastWatched: day(-6), dormant: false }),
      ...(queued ? { [queued.id]: ov(queued, { s: "watching", season: 1, ep: 1, epsWatched: 1, lastWatched: day(-2), start: day(-2), dormant: false }) } : {}),
    },
    customShows: { [custom.id]: custom },
    // She taps "Got it" most days, so on an ordinary day the banner holds the three newest drops,
    // not every release since the export. (The "banner-long" state shows the undismissed pile.)
    history, dismissed: releaseKeys(new Set()).slice(3), historyRemoved: [],
  };
}
// Keys of the new-releases banner entries, newest first, as unwatchedReleases() in the page builds
// them (the key is the latest aired episode, so moving a show forward a few episodes keeps it).
function releaseKeys(skip) {
  return readyish.filter(g => !skip.has(g.id)).map(g => ({ g, la: META[g.id].lastAired }))
    .sort((x, y) => String(y.la.airDate || "").localeCompare(String(x.la.airDate || "")))
    .map(({ g, la }) => `${g.id}:${la.season}:${la.ep}`);
}
const emptyProgress = () => ({ version: 1, updatedAt: null, overrides: {}, customShows: {}, history: [], dismissed: [], historyRemoved: [] });

// Episode titles and overviews for the /tmdb-episodes stub. Built from parts so every title in a show
// is unique and none carries a number (a numbered title reads as an id leaking into the page).
const EP_A = ["The Quiet", "A Borrowed", "The Last", "Northern", "Small", "The Long", "Hidden", "Burning", "Paper", "The Lost", "Salt", "Midnight", "Glass", "The Second", "Winter", "Open", "Silver", "The Wrong", "Golden", "Crooked", "Honest", "Low", "Brave", "The Empty"];
const EP_B = ["Harbor", "Supper", "Lantern", "Promise", "Orchard", "Detour", "Window", "Letter", "Bridge", "Garden", "Signal", "Weekend", "Ferry", "Wedding", "Inventory", "Station", "Recipe", "Alibi", "Lighthouse", "Rehearsal", "Shift", "Crossing", "Audition", "Homecoming"];
const WHO = ["Maggie", "Theo", "Rosa", "Desmond", "June", "Hollis", "Priya", "Walt", "Nadia", "Quinn", "Ellis", "Marisol"];
const DID = ["finally confronts", "tries to win back", "covers for", "uncovers a secret about", "plans a surprise for", "is stuck babysitting", "makes a risky deal with", "gets an unexpected visit from"];
const MEANWHILE = ["the bakery's big order goes sideways", "an old rival turns up in town", "a storm knocks the power out", "the family dinner turns into a reckoning", "a misplaced letter changes everything", "the night shift gets very strange"];
function episodesFor(tmdbId, seasons) {
  const id = byTmdb[tmdbId], counts = (id && COUNTS[id]) || {};
  let seed = Number(tmdbId) % 97, k = 0;
  const out = {};
  for (const s of seasons) {
    const n = counts[s] || 8;
    out[s] = Array.from({ length: n }, (_, i) => {
      const j = (seed + (k++) * 25) % (EP_A.length * EP_B.length);
      const name = `${EP_A[j % EP_A.length]} ${EP_B[Math.floor(j / EP_A.length) % EP_B.length]}`;
      const w = (seed + i + Number(s)) % WHO.length;
      const overview = `${WHO[w]} ${DID[(w + i) % DID.length]} ${WHO[(w + 5) % WHO.length]}, while ${MEANWHILE[(i + Number(s)) % MEANWHILE.length]}.`;
      return { ep: i + 1, name, overview, airDate: null };
    });
  }
  return out;
}

// HUGE: very long (but realistic) titles on the shows that lead each list, and a couple of hundred
// invented extra shows, every title unique and none numbered.
const LONG = [
  "My Next Guest Needs No Introduction With David Letterman",
  "The Extraordinarily Unlikely Adventures of the Riverside Neighborhood Watch",
  "Real Housewives of the Pacific Northwest: Reunion Specials and Extended Cuts",
  "Supercalifragilisticexpialidocious: A Musical Retrospective",
  "Everybody Still Hates Chris: The Animated Continuation",
  "The Unbelievably Long-Running Saturday Morning Detective Club",
];
const T_A = ["Chronicles", "Secrets", "Tales", "Legends", "Mysteries", "Diaries", "Ghosts", "Letters", "Kings", "Saints", "Wolves", "Lanterns"];
const T_B = ["the Riverside Bakery", "the Northern Lighthouse", "Willow Creek Hospital", "the Copper Mountain Lodge", "the Seaside Motel", "the Old Observatory", "Maple Street", "the Midnight Diner", "the Harbor Ferry", "the Clockmaker's Shop", "Cedar Falls High", "the Last Drive-In", "the Glass Conservatory", "the Sunken Garden", "Hollow Pines", "the Marigold Hotel", "the Lighthouse Choir"];
const fakeTitle = (i) => `${T_A[i % T_A.length]} of ${T_B[Math.floor(i / T_A.length) % T_B.length]}`;
function hugeShows() {
  const sh = SHOWS.map(g => ({ ...g }));
  const ids = new Set(readyish.slice(0, 4).map(g => g.id));
  sh.filter(g => g.s === "queue").slice(0, 2).forEach(g => ids.add(g.id));
  let li = 0;
  for (const g of sh) if (ids.has(g.id)) g.t = LONG[li++ % LONG.length];
  let id = Math.max(...SHOWS.map(g => g.id)) + 1;
  const st = ["queue", "watching", "done", "dropped"];
  for (let i = 0; i < T_A.length * T_B.length && i < 200; i++) {
    const s = st[i % st.length];
    sh.push({ id: id++, t: fakeTitle(i), s, season: s === "queue" ? null : 1 + (i % 4), ep: s === "queue" ? null : 1 + (i % 9), epsWatched: s === "queue" ? 0 : 3 + (i % 40), lastWatched: s === "queue" ? null : day(-(30 + i)), start: null, queued: null, cy: ["done", "dropped"].includes(s) ? 2024 + (i % 3) : null, cm: ["done", "dropped"].includes(s) ? i % 12 : null, dormant: s === "watching" && i % 3 === 0 });
  }
  return sh;
}

// ONE: a single show she's in the middle of, and nothing else.
function oneShow() {
  const g = readyish[0];
  return [{ ...g, dormant: false, lastWatched: day(-1) }];
}

// Each variant: files served in place of the real ones, progress the Worker answers with, and
// switches. __fail aborts a local file; __worker: "down" aborts every Worker request.
const variants = {
  sample: { progress: sampleProgress() },
  undismissed: { progress: { ...sampleProgress(), dismissed: [] } },
  export: { progress: emptyProgress() },
  empty: { files: { "shows.json": [] }, progress: emptyProgress() },
  one: { files: { "shows.json": oneShow() }, progress: emptyProgress() },
  huge: { files: { "shows.json": hugeShows() }, progress: emptyProgress() },
  noposters: { files: { "posters.json": {} }, progress: sampleProgress(), blockImages: true },
  workerdown: { progress: sampleProgress(), worker: "down" },
  // Stale: only shows.json arrives (posters, episode counts, show status and the TMDB map all fail),
  // with the Worker down too: what a phone sees on a bad connection.
  stale: { progress: sampleProgress(), worker: "down", fail: ["posters.json", "episode-counts.json", "show-meta.json", "tmdb-map.json"] },
  loaderror: { fail: ["shows.json"], progress: emptyProgress(), expectErrors: /Failed to load show data/ },
};

// A plain stand-in for a TMDB poster: a soft vertical gradient in a colour picked from the path.
const posterSvg = (path) => {
  let h = 0; for (const ch of path) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="185" height="278" viewBox="0 0 185 278"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,58%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,22%)"/></linearGradient></defs><rect width="185" height="278" fill="url(#g)"/><circle cx="${40 + h % 100}" cy="${90 + h % 80}" r="${30 + h % 30}" fill="hsla(${(hue + 180) % 360},60%,80%,0.35)"/></svg>`;
};

// ─── Browser plumbing ──────────────────────────────────────────────────────────────────────
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const VIEWPORTS = { phone: { width: 390, height: 844, mobile: true }, laptop: { width: 1440, height: 900, mobile: false } };

async function open(vpName, { variant = "sample", theme = "dark", season = "off", storage = {} } = {}) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const v = variants[variant];
  const errors = [], failed = [], posts = [];
  let localBytes = 0;
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text()) && !(v.expectErrors && v.expectErrors.test(m.text()))) errors.push(`console: ${m.text()}`); });
  page.on("dialog", d => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });
  page.on("requestfailed", r => { const u = r.url(); if (u.startsWith(BASE) && !(v.fail || []).some(f => u.endsWith("/" + f))) failed.push(`${new URL(u).pathname} ${r.failure()?.errorText}`); });
  page.on("response", async r => {
    const u = r.url();
    if (u.startsWith(BASE) && r.status() >= 400) failed.push(`${new URL(u).pathname} HTTP ${r.status()}`);
    try { const n = (await r.body()).length; if (u.startsWith(BASE) || /fonts\.g/.test(u)) localBytes += n; } catch {}
  });
  await page.route("**/*", route => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE)) {
      const file = new URL(url).pathname.replace(/^\//, "");
      if ((v.fail || []).includes(file)) return route.abort("internetdisconnected");
      if (v.files && file in v.files) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v.files[file]) });
      return route.continue();
    }
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    if (/\/game-tracker\/korok\.js$/.test(url)) return KOROK ? route.fulfill({ status: 200, contentType: "text/javascript", body: KOROK }) : route.abort();
    if (/^https:\/\/image\.tmdb\.org\//.test(url)) return v.blockImages ? route.abort() : route.fulfill({ status: 200, contentType: "image/svg+xml", body: posterSvg(new URL(url).pathname) });
    if (/workers\.dev/.test(url)) {
      if (v.worker === "down") return route.abort("internetdisconnected");
      const u = new URL(url), h = { "Access-Control-Allow-Origin": "*" };
      if (u.pathname.endsWith("/tmdb-episodes")) return route.fulfill({ status: 200, contentType: "application/json", headers: h, body: JSON.stringify(episodesFor(u.searchParams.get("tmdbId"), (u.searchParams.get("seasons") || "").split(",").filter(Boolean))) });
      if (u.pathname.endsWith("/tmdb-lookup")) return route.fulfill({ status: 200, contentType: "application/json", headers: h, body: JSON.stringify({ tmdbId: null, poster: null, epCounts: null, meta: null }) });
      if (req.method() === "POST") posts.push(u.pathname);
      return route.fulfill({ status: 200, contentType: "application/json", headers: h, body: JSON.stringify(v.progress) });
    }
    return route.abort();
  });
  // Pin everything that would otherwise change between runs: Westley's idle line and the love
  // banner are random, the theme follows localStorage, and progress starts as the fixture.
  const init = { "tvtracker-theme": theme, stv_love_bag_v1: JSON.stringify([0, 1, 2, 3]), "tvtracker-progress": JSON.stringify(v.progress), ...storage };
  await page.addInitScript((s) => {
    let x = 42; Math.random = () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
    try { for (const [k, val] of Object.entries(s)) localStorage.setItem(k, val); } catch (e) {}
  }, init);
  await page.goto(`${BASE}/index.html?season=${season}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2200); // the load-time sync answers after its 1.5 s debounce
  return { page, ctx, errors, failed, posts, bytes: () => localBytes };
}

// Waits until every <img> has finished (loaded or failed). Listeners, never onerror=: assigning it
// would replace the page's own fallback and fake a broken poster (a game-tracker round 1 lesson).
const settleImages = (page) => page.evaluate(async () => {
  for (const i of document.images) if (i.loading === "lazy" && i.getClientRects().length) i.loading = "eager";
  const imgs = [...document.images].filter(i => !i.complete);
  await Promise.race([Promise.all(imgs.map(i => new Promise(r => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))), new Promise(r => setTimeout(r, 6000))]);
});

// ─── Gates ─────────────────────────────────────────────────────────────────────────────────
// Runs inside the page. `scope` limits text/target checks to a subtree (an open dialog).
async function measure({ phone, scope }) {
  const root = scope ? document.querySelector(scope) : document.body;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
      if (e.hidden || e.closest("[hidden],dialog:not([open])")) return false;
    }
    // Behind an open modal dialog nothing else can be seen or tapped.
    const modal = document.querySelector("dialog[open]");
    if (modal && !modal.contains(el)) return false;
    return true;
  };
  const label = (el) => {
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.classList.length ? "." + [...el.classList].join(".") : ""} "${t}"`;
  };
  const out = { overflowX: null, clipped: [], truncated: [], badText: [], smallTargets: [], offscreen: [], korokCovered: [] };
  const de = document.documentElement;
  if (phone) out.overflowX = de.scrollWidth > innerWidth + 1 ? `page is ${de.scrollWidth}px wide on a ${innerWidth}px screen` : null;
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (["SCRIPT", "STYLE", "SVG", "CANVAS", "OPTION", "INPUT", "SELECT", "TEXTAREA", "NOSCRIPT"].includes(el.tagName) || el.closest("svg")) continue;
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!ownText || !vis(el)) continue;
    const cs = getComputedStyle(el);
    const hx = cs.overflowX !== "visible" || cs.textOverflow === "ellipsis";
    const hy = cs.overflowY !== "visible" || cs.webkitLineClamp !== "none";
    const trunc = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none";
    const bucket = trunc ? out.truncated : out.clipped;
    if (hx && el.scrollWidth > el.clientWidth + 1) bucket.push(`${label(el)} cut off sideways (${el.scrollWidth}px of text in ${el.clientWidth}px)`);
    else if (hy && el.scrollHeight > el.clientHeight + 2 && cs.overflowY !== "auto" && cs.overflowY !== "scroll") bucket.push(`${label(el)} cut off at the bottom (${el.scrollHeight}px in ${el.clientHeight}px)`);
    // Wider than its own box with nothing clipping it: it runs over its neighbour or off the screen.
    if (!hx && cs.display !== "inline" && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) out.clipped.push(`${label(el)} overflows its box sideways (${el.scrollWidth}px of text in ${el.clientWidth}px)`);
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX === "hidden" || acs.overflowX === "clip") {
        const ar = a.getBoundingClientRect();
        if (r.right > ar.right + 2 || r.left < ar.left - 2) out.clipped.push(`${label(el)} spills past the edge of ${label(a).split(" ")[0]}`);
        break;
      }
      if (acs.overflowX === "auto" || acs.overflowX === "scroll") break; // a scroller: sliding is the point
    }
    const inScroller = (() => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll") return true; } return false; })();
    if (phone && !inScroller && (r.right > innerWidth + 1 || r.left < -1) && cs.position !== "fixed") out.offscreen.push(`${label(el)} off the side of the screen (x ${Math.round(r.left)}..${Math.round(r.right)})`);
  }
  // A closed dialog must take no space (round 1: CSS display:flex left the closed episode list
  // showing as an empty box at the foot of the page).
  if (!scope) for (const d of document.querySelectorAll("dialog:not([open])")) if (d.getClientRects().length) out.clipped.push(`closed ${label(d).slice(0, 40)} is still drawn on the page`);
  const text = root.innerText || "";
  for (const m of text.matchAll(/(^|[^\w])(NaN|undefined|null|Infinity|\[object Object\])(?![\w])/g)) {
    const i = m.index; out.badText.push(`"${m[2]}" in: …${text.slice(Math.max(0, i - 30), i + 30).replace(/\s+/g, " ")}…`);
  }
  if (phone) {
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[onclick],[tabindex="0"]';
    for (const el of root.querySelectorAll(sel)) {
      if (!vis(el) || el.disabled) continue;
      if (el.parentElement && el.parentElement.closest(sel)) continue; // the bigger target counts
      if (el.closest(".korok-btn,.korok-spot")) continue; // the hidden Korok is small on purpose (rubric Calibration)
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && [...el.parentElement.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.smallTargets.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  // Nothing may be drawn over a Korok. Scroll each into view and hit-test its visible part with every
  // element made hit-testable, so decorations that ignore taps still count. Restores the scroll.
  if (!scope) {
    const force = document.createElement("style");
    force.textContent = "*{pointer-events:auto !important}";
    document.head.appendChild(force);
    const sx = scrollX, sy = scrollY;
    for (const [i, b] of [...document.querySelectorAll(".korok-btn")].entries()) {
      if (!b.getClientRects().length) continue;
      const spot = b.closest(".korok-spot") || b.parentElement;
      b.scrollIntoView({ block: "center" });
      // Let the page react to the jump the way it does to a real scroll (the header bar slides back
      // in near the top, over 0.2 s); a synchronous hit-test would see it still hidden over Korok 1.
      await new Promise(r => setTimeout(r, 350));
      const r = b.getBoundingClientRect(), sp = spot.getBoundingClientRect();
      const L = Math.max(r.left, sp.left), R = Math.min(r.right, sp.right), T = Math.max(r.top, sp.top), B = Math.min(r.bottom, sp.bottom);
      if (R - L < 4 || B - T < 4) { out.korokCovered.push(`Korok ${i + 1} has no visible area`); continue; }
      for (const fx of [0.25, 0.5, 0.75]) {
        const hit = document.elementFromPoint(L + (R - L) * fx, T + (B - T) / 2);
        if (!hit || !b.contains(hit)) { out.korokCovered.push(`Korok ${i + 1} is covered by ${hit ? label(hit) : "nothing visible"}`); break; }
      }
    }
    force.remove();
    scrollTo(sx, sy);
    await new Promise(r => setTimeout(r, 350));
  }
  return out;
}

// Weight budget: own files + web fonts in the default phone state. Measured on main (f31f82b) on
// 2026-11-20 at 463,913 bytes; the budget is that plus 10 percent. The bot-written JSON grows a
// little every day, so expect to raise this now and then; a jump far past the growth is the finding.
const WEIGHT_TODAY = 463913;
const WEIGHT_BUDGET = Math.round(WEIGHT_TODAY * 1.1);

// ─── States ────────────────────────────────────────────────────────────────────────────────
// name, label (what the critic is told), vps, variant, theme, season, storage, setup(page),
// slices (screen-by-screen from the top or from where setup scrolled), dialog (selector: the gates
// look inside it and the shot is the viewport with it open).
const BOTH = ["phone", "laptop"], PHONE = ["phone"];
const chip = (key) => async p => { await p.click(`[data-fkey="chip-${key}"]`); await p.waitForTimeout(250); };
const panel = (k) => async p => { await p.click(`[aria-controls="${k}-panel"]`); await p.waitForTimeout(300); await p.evaluate(k => { const b = document.querySelector(`[aria-controls="${k}-panel"]`); scrollTo(0, b.getBoundingClientRect().top + scrollY - 180); }, k); await p.waitForTimeout(250); };

const states = [
  { name: "home", label: "Home screen as it opens on an ordinary day, scrolled screen by screen from the top", vps: BOTH, slices: true, maxSlices: 8, weight: true },
  { name: "banner-long", label: "Home screen when she hasn't dismissed the 'New episodes' banner in a long while (dozens of new releases), first screens", vps: BOTH, variant: "undismissed", slices: true, maxSlices: 2 },
  { name: "home-light", label: "Home screen in the LIGHT theme, scrolled screen by screen from the top", vps: BOTH, theme: "light", slices: true, maxSlices: 3 },
  { name: "filter-active", label: "The 'Active' filter chip selected (results list of shows being watched)", vps: BOTH, setup: chip("active"), slices: true, maxSlices: 2 },
  { name: "filter-onhold", label: "The 'On hold' filter chip selected", vps: PHONE, setup: chip("onhold"), slices: true, maxSlices: 2 },
  { name: "filter-queue", label: "The 'Up next' filter chip selected", vps: PHONE, setup: chip("queue"), slices: true, maxSlices: 2 },
  { name: "filter-done", label: "The 'Done' filter chip selected (finished shows)", vps: PHONE, setup: chip("done"), slices: true, maxSlices: 2 },
  { name: "filter-dropped", label: "The 'Dropped' filter chip selected", vps: BOTH, theme: "light", setup: chip("dropped"), slices: true, maxSlices: 2 },
  { name: "search-results", label: "Searching for 'the' (results across every status)", vps: PHONE, setup: async p => { await p.fill("#search", "the"); await p.waitForTimeout(400); }, slices: true, maxSlices: 2 },
  { name: "search-none", label: "A search that matches nothing", vps: PHONE, setup: async p => { await p.fill("#search", "zzqx"); await p.waitForTimeout(400); } },
  { name: "panel-caughtup", label: "The 'Caught up' list opened (shows with nothing left to watch yet)", vps: BOTH, setup: panel("cu"), slices: true, sliceFromScroll: true, maxSlices: 2 },
  { name: "panel-history", label: "The 'What you've watched' diary opened", vps: BOTH, setup: panel("wh"), slices: true, sliceFromScroll: true, maxSlices: 2 },
  { name: "panel-archive", label: "The 'Archive' opened (finished and dropped shows by month)", vps: PHONE, setup: panel("ar"), slices: true, sliceFromScroll: true, maxSlices: 2 },
  { name: "panel-yearlog", label: "The 'Year log' opened (shows finished per year, with stats)", vps: BOTH, setup: panel("yl"), slices: true, sliceFromScroll: true, maxSlices: 2 },
  { name: "panel-stats", label: "The 'Viewing stats' opened (monthly pace chart, marathons, lifetime counters)", vps: BOTH, setup: panel("vs"), slices: true, sliceFromScroll: true, maxSlices: 3 },
  { name: "panel-stats-light", label: "The 'Viewing stats' opened, LIGHT theme", vps: PHONE, theme: "light", setup: panel("vs"), slices: true, sliceFromScroll: true, maxSlices: 2 },
  { name: "dialog-edit", label: "The 'Update progress' dialog (edit season and episode) opened from a card", vps: BOTH, dialog: "#edit-dialog", setup: async p => { await p.locator("#now .card .action-btn.icon").first().click(); await p.waitForTimeout(300); } },
  { name: "dialog-add", label: "The 'Add a show' dialog", vps: BOTH, dialog: "#add-dialog", setup: async p => { await p.click("text=+ Add show"); await p.waitForTimeout(300); } },
  { name: "dialog-episodes", label: "The episode list dialog for a show (tapped its title): every season, watched ones dimmed", vps: BOTH, dialog: "#episodes-dialog", setup: async p => { await p.locator("#now .card .gtitle").first().click(); await p.waitForTimeout(800); } },
  { name: "dialog-recap", label: "The 'Previously on…' recap dialog (Westley recaps the last episode watched)", vps: BOTH, dialog: "#recap-dialog", setup: async p => { await p.locator("#now button", { hasText: "Previously on" }).first().click(); await p.waitForSelector("#recap-body .recap-text, #recap-body .ep-empty"); await p.waitForTimeout(300); } },
  { name: "dialog-recap-down", label: "The 'Previously on…' recap dialog when the server can't be reached", vps: PHONE, variant: "workerdown", dialog: "#recap-dialog", setup: async p => { await p.locator("#now button", { hasText: "Previously on" }).first().click(); await p.waitForSelector("#recap-body .ep-empty"); await p.waitForTimeout(300); } },
  { name: "undo-bar", label: "Right after tapping 'I watched this' on the first card: Westley reacts and an Undo bar appears at the bottom", vps: BOTH, setup: async p => { await p.locator("#now .action-btn.primary").first().click(); await p.waitForTimeout(500); } },
  { name: "westley-mask", label: "Westley (the little pixel host under the header) wearing his unlocked black mask look", vps: PHONE, storage: { "westley:mask": "on" } },
  { name: "thanksgiving", label: "Home screen wearing the THANKSGIVING look (harvest ribbon on the header, warm glow, a few still leaves), first screens", vps: BOTH, season: "thanksgiving", slices: true, maxSlices: 2 },
  { name: "thanksgiving-light", label: "Home screen, THANKSGIVING look, LIGHT theme, first screen", vps: PHONE, season: "thanksgiving", theme: "light" },
  { name: "christmas", label: "Home screen wearing the CHRISTMAS look (bulb strand on the header, red and pine glow, still snowflakes), first screens", vps: BOTH, season: "christmas", slices: true, maxSlices: 2 },
  { name: "christmas-light", label: "Home screen, CHRISTMAS look, LIGHT theme, first screen", vps: BOTH, season: "christmas", theme: "light" },
  { name: "empty", label: "A brand-new log with NO shows at all", vps: BOTH, variant: "empty", slices: true, maxSlices: 2 },
  { name: "one", label: "A log with exactly ONE show (being watched, nothing else)", vps: PHONE, variant: "one", slices: true, maxSlices: 2 },
  { name: "huge", label: "A HUGE log (500+ shows) with very long show titles on the first cards, scrolled screen by screen", vps: BOTH, variant: "huge", slices: true, maxSlices: 4 },
  { name: "huge-search", label: "A HUGE log searched for 'of' (many results with long titles)", vps: PHONE, variant: "huge", setup: async p => { await p.fill("#search", "of"); await p.waitForTimeout(400); }, slices: true, maxSlices: 2 },
  { name: "noposters", label: "No poster art available for any show (the letter fallbacks show)", vps: PHONE, variant: "noposters", slices: true, maxSlices: 2 },
  { name: "workerdown", label: "The sync server can't be reached (the page still works from this device)", vps: PHONE, variant: "workerdown" },
  { name: "stale", label: "Bad connection: only the basic show list loaded (no posters, no episode counts, no streaming info) and sync is down", vps: BOTH, variant: "stale", slices: true, maxSlices: 2 },
  { name: "loaderror", label: "The show data fails to load entirely (offline or the site is down)", vps: BOTH, variant: "loaderror" },
];

// ─── Run ───────────────────────────────────────────────────────────────────────────────────
const manifest = [], gates = [];
let weight = null, n = 0;
const shot = async (page, file, label) => {
  n++;
  const name = `${String(n).padStart(3, "0")}-${file}.png`;
  await page.screenshot({ path: join(OUT, name) });
  manifest.push({ image: name, state: label });
  return name;
};

for (const s of states) {
  if (ONLY && !ONLY.test(s.name)) continue;
  for (const vpName of s.vps) {
    const phone = vpName === "phone";
    const o = await open(vpName, { variant: s.variant || "sample", theme: s.theme || "dark", season: s.season || "off", storage: s.storage });
    const { page } = o;
    const base = `${s.name}-${vpName}`;
    const result = { state: base, label: s.label, images: [] };
    try {
      await settleImages(page);
      if (s.weight && phone) weight = o.bytes();
      if (s.setup) await s.setup(page);
      await settleImages(page);
      // Gates first, at the state's starting scroll: screenshots come after.
      Object.assign(result, await page.evaluate(measure, { phone, scope: s.dialog || null }));
      if (s.slices) {
        const H = VIEWPORTS[vpName].height;
        const start = s.sliceFromScroll ? await page.evaluate(() => scrollY) : 0;
        const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        const count = Math.min(s.maxSlices || 8, Math.ceil(Math.max(0, maxY - start) / (H - 80)) + 1);
        let lastY = -1;
        for (let i = 0; i < count; i++) {
          // A short page can't scroll as far as asked; stop rather than repeat the last slice.
          const y = await page.evaluate((y) => { scrollTo(0, y); return scrollY; }, start + i * (H - 80));
          if (y === lastY) break;
          lastY = y;
          await page.waitForTimeout(300);
          await settleImages(page);
          result.images.push(await shot(page, `${base}-${String(i + 1).padStart(2, "0")}`, `${s.label}: screen ${i + 1}, ${vpName}`));
        }
      } else {
        await page.waitForTimeout(250);
        result.images.push(await shot(page, base, `${s.label}, ${vpName}`));
      }
    } catch (e) {
      result.captureError = String(e.message).split("\n")[0];
    }
    result.errors = o.errors; result.failedRequests = o.failed; result.workerPosts = o.posts;
    gates.push(result);
    await o.ctx.close();
    process.stdout.write(".");
  }
}

// ─── Gate summary ──────────────────────────────────────────────────────────────────────────
const fails = [], warns = [];
for (const g of gates) {
  const f = (k, v) => fails.push(`${g.state}: ${k}: ${v}`);
  if (g.captureError) f("capture", g.captureError);
  g.errors.forEach(e => f("js error", e));
  g.failedRequests.forEach(e => f("failed request", e));
  if (g.overflowX) f("sideways scroll", g.overflowX);
  g.clipped?.forEach(e => f("clipped text", e));
  // The HUGE titles are absurd on purpose, so a clean ellipsis there is a warning for the critic.
  g.truncated?.forEach(e => (/^huge/.test(g.state) ? warns : fails).push(`${g.state}: truncated text: ${e}`));
  g.offscreen?.forEach(e => f("off screen", e));
  g.badText?.forEach(e => f("bad text", e));
  g.smallTargets?.forEach(e => f("tap target < 44px", e));
  g.korokCovered?.forEach(e => f("korok covered", e));
}
if (weight != null && weight > WEIGHT_BUDGET) fails.push(`page weight ${weight} bytes over budget ${WEIGHT_BUDGET}`);
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
await writeFile(join(OUT, "gates.json"), JSON.stringify({ when: new Date().toISOString(), weight, weightBudget: WEIGHT_BUDGET, fails, warns, states: gates }, null, 2));
const uniq = [...new Set(fails.map(x => x.replace(/^[^:]+-(phone|laptop): /, "").replace(/ \d+x\d+$/, "")))];
console.log(`\n${manifest.length} images, ${gates.length} states -> ${OUT}`);
console.log(`page weight: ${weight} bytes (budget ${WEIGHT_BUDGET})`);
console.log(`warnings: ${warns.length}`);
console.log(`gates: ${fails.length ? `${fails.length} failures (${uniq.length} distinct)` : "all pass"}`);
uniq.slice(0, 120).forEach(x => console.log("  " + x));
await browser.close();
server.close();
process.exit(fails.length ? 1 : 0);
