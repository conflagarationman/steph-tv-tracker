// Browser check for wrapped.html: every story card at phone and desktop sizes, against the committed
// shows.json/show-meta.json and a made-up log served by a stubbed Worker. Fails on page errors,
// sideways scroll, a card taller than the screen, any write to the Worker, or a broken share image.
//   npm i --no-save playwright@1.56.1 && npx playwright install chromium
//   node scripts/wrapped.browser.mjs        (PLAYWRIGHT_MODULE overrides where playwright is imported from)
//   SHOTS=/some/dir saves a screenshot of every card.
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const chromium = pw.chromium || pw.default.chromium;
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript" };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try { const body = await readFile(join(ROOT, path || "index.html")); res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// A made-up log over real show ids: a few months of evenings, a binge, a finish.
const shows = JSON.parse(await readFile(join(ROOT, "shows.json"), "utf8"));
const ids = shows.filter(g => g.s === "watching").slice(0, 8).map(g => g.id);
const history = [];
let day = new Date("2026-07-20T02:00:00Z");
for (let i = 0; i < 120; i++) {
  const id = ids[i % 5 === 0 ? 0 : i % ids.length];
  history.push({ id, title: "x", action: "watched", season: 1, ep: i + 1, at: new Date(day.getTime() + (i % 3) * 3600e3).toISOString() });
  day = new Date(day.getTime() + (i % 4 === 0 ? 0 : 86400e3));
}
for (let k = 0; k < 6; k++) history.push({ id: ids[1], title: "x", action: "watched", season: 9, ep: k + 1, at: `2026-09-1${k < 3 ? 2 : 2}T${String(1 + k).padStart(2, "0")}:00:00Z` });
const PROGRESS = { version: 1, overrides: { [ids[2]]: { s: "done", cy: 2026, cm: 8, updatedAt: "2026-09-01T00:00:00Z" } }, customShows: {}, history, dismissed: [], historyRemoved: [] };

let pass = 0, fail = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log("PASS  " + name); } catch (e) { fail++; console.log(`FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function open(width, height, query = "?year=2026") {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
  const page = await ctx.newPage();
  const errors = [], writes = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(BASE) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    if (/workers\.dev/.test(url)) {
      if (route.request().method() !== "GET") { writes.push(url); return route.fulfill({ status: 500, body: "" }); }
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(PROGRESS) });
    }
    return route.abort();
  });
  await page.goto(BASE + "/wrapped.html" + query);
  await page.waitForFunction(() => window.__wrapped, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx, errors, writes };
}

for (const [w, h] of [[390, 844], [360, 640], [1280, 800]]) {
  await test(`${w}x${h}: every card fits, no sideways scroll`, async () => {
    const { page, ctx, errors, writes } = await open(w, h);
    const n = await page.locator(".card").count();
    ok(n >= 12, `only ${n} cards`);
    for (let i = 0; i < n; i++) {
      await page.evaluate(i => { document.querySelectorAll(".card").forEach((c, j) => c.classList.toggle("on", j === i)); }, i);
      await page.waitForTimeout(80);
      const m = await page.evaluate(i => { const c = document.querySelectorAll(".card")[i]; return { sh: c.scrollHeight, ch: c.clientHeight, sw: c.scrollWidth, cw: c.clientWidth }; }, i);
      ok(m.sh <= m.ch + 1, `card ${i} is ${m.sh}px tall in ${m.ch}px`);
      ok(m.sw <= m.cw + 1, `card ${i} scrolls sideways`);
      if (process.env.SHOTS) { await mkdir(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: join(process.env.SHOTS, `${w}-${String(i).padStart(2, "0")}.png`) }); }
    }
    ok(!errors.length, errors.join("; "));
    ok(!writes.length, "wrote to the Worker");
    await ctx.close();
  });
}

await test("tap through: right side advances, left goes back, last card stays, Esc shows the summary", async () => {
  const { page, ctx, errors, writes } = await open(390, 844);
  const n = await page.locator(".card").count();
  const at = () => page.evaluate(() => [...document.querySelectorAll(".card")].findIndex(c => c.classList.contains("on")));
  ok(await at() === 0, "doesn't open on the gift card");
  await page.mouse.click(300, 400); ok(await at() === 1, "right tap didn't advance");
  await page.mouse.click(40, 400); ok(await at() === 0, "left tap didn't go back");
  for (let i = 0; i < n + 3; i++) await page.mouse.click(300, 300);
  ok(await at() === n - 1, "didn't stop on the last card");
  await page.keyboard.press("Escape");
  ok(await page.locator("#story.on").count() === 0, "Esc didn't close");
  ok(await page.locator("#summary .tile").count() >= 8, "summary has no tiles");
  ok(!errors.length && !writes.length, errors.join("; ") || "wrote");
  await ctx.close();
});

await test("share image draws at 1080x1920 without tainting", async () => {
  const { page, ctx, errors } = await open(390, 844);
  const len = await page.evaluate(() => window.__wrappedImage());
  ok(len > 20000, `image too small (${len})`);
  ok(!errors.length, errors.join("; "));
  await ctx.close();
});

await test("works from this browser's own copy when the Worker is down", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/*", route => route.request().url().startsWith(BASE) ? route.continue() : route.abort());
  await page.addInitScript(p => localStorage.setItem("tvtracker-progress", p), JSON.stringify(PROGRESS));
  await page.goto(BASE + "/wrapped.html?year=2026");
  await page.waitForFunction(() => window.__wrapped, null, { timeout: 15000 });
  ok(await page.evaluate(() => window.__wrapped.loggedEpisodes) > 50, "didn't read localStorage");
  await ctx.close();
});

await browser.close();
server.close();
console.log(`${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
