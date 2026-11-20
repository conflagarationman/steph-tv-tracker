// Browser check for the seasonal looks (season.js): index.html in headless Chromium at phone and
// desktop width, each look forced with ?season=. Same offline setup as westley.browser.mjs: the
// Worker is stubbed and every other off-site request is aborted, so korok.js (served from the
// game tracker's site) is absent by default. Set KOROK_JS to a local copy of it to also check that
// nothing seasonal covers a Korok.
//   npm i --no-save playwright@1.56.1 && npx playwright install chromium
//   node scripts/season.browser.mjs        (PLAYWRIGHT_MODULE overrides where playwright is imported from)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript" };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try { const body = await readFile(join(ROOT, path || "index.html")); res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const KOROK = process.env.KOROK_JS ? await readFile(process.env.KOROK_JS, "utf8") : null;
let pass = 0, fail = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log("PASS  " + name); } catch (e) { fail++; console.log(`FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function open(width, season, theme) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: width < 500, isMobile: width < 500, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  if (theme) await page.addInitScript(t => { try { localStorage.setItem("tvtracker-theme", t); } catch (e) {} }, theme);
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(BASE) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    if (KOROK && /\/game-tracker\/korok\.js$/.test(url)) return route.fulfill({ status: 200, contentType: "text/javascript", body: KOROK });
    if (/workers\.dev/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ version: 1, updatedAt: null, overrides: {}, customShows: {} }) });
    return route.abort();
  });
  await page.goto(BASE + "/index.html?season=" + season);
  await page.waitForSelector("#now .card");
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx, errors };
}

for (const width of [375, 1280]) {
  for (const season of ["thanksgiving", "christmas"]) {
    await test(`${width}px ${season}: the look is on, the title fits, nothing scrolls sideways, no errors`, async () => {
      const { page, ctx, errors } = await open(width, season);
      ok(await page.getAttribute("html", "data-season") === season, "data-season not set");
      ok(await page.locator(".season-fx i").count() === 9, "no falling leaves or snow");
      const h1 = await page.evaluate(() => { const h = document.querySelector("h1"); return [h.scrollWidth, h.clientWidth]; });
      ok(h1[0] <= h1[1] + 1, `title overflows its box: ${h1[0]} > ${h1[1]}`);
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "sideways scroll");
      // The decorations sit behind the page: the list's first card is what's under its own centre.
      const under = await page.evaluate(() => { scrollTo(0, 0); const c = document.querySelector("#now .card"); c.scrollIntoView({ block: "center" }); const r = c.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const out = c.contains(h) ? "" : (h ? (h.className || h.tagName) : "nothing") + " at y=" + Math.round(r.top + r.height / 2); scrollTo(0, 0); return out; });
      ok(!under, "something covers the first card: " + under);
      if (KOROK) {
        await page.waitForSelector(".korok-btn", { timeout: 5000 });
        const covered = await page.evaluate(() => {
          const force = document.createElement("style"); force.textContent = "*{pointer-events:auto !important}"; document.head.appendChild(force);
          const out = [];
          document.querySelectorAll(".korok-btn").forEach((b, i) => {
            const sp = (b.closest(".korok-spot") || b.parentElement).getBoundingClientRect();
            b.scrollIntoView({ block: "center" });
            const r = b.getBoundingClientRect(), s2 = (b.closest(".korok-spot") || b.parentElement).getBoundingClientRect();
            const L = Math.max(r.left, s2.left), R = Math.min(r.right, s2.right), T = Math.max(r.top, s2.top), B = Math.min(r.bottom, s2.bottom);
            if (R - L < 4 || B - T < 4) return;   // a Korok tucked away by the page itself, not by a decoration
            const hit = document.elementFromPoint((L + R) / 2, (T + B) / 2);
            if (!hit || !b.contains(hit)) out.push(`Korok ${i + 1} covered by ${hit ? hit.className || hit.tagName : "nothing"}`);
          });
          force.remove(); scrollTo(0, 0); return out;
        });
        ok(!covered.length, covered.join("; "));
      }
      ok(!errors.length, errors.join("; "));
      await ctx.close();
    });
  }
}
await test("375px christmas, light theme: snowflakes switch to their light-theme colour", async () => {
  const { page, ctx, errors } = await open(375, "christmas", "light");
  ok(await page.getAttribute("html", "data-theme") === "light", "light theme not on");
  const c = await page.evaluate(() => getComputedStyle(document.querySelector(".season-fx i")).color);
  ok(c === "rgb(63, 127, 196)", "snow colour " + c);
  ok(!errors.length, errors.join("; "));
  await ctx.close();
});
await test("?season=off shows the plain page", async () => {
  const { page, ctx } = await open(375, "off");
  ok(await page.getAttribute("html", "data-season") === null, "data-season set");
  ok(await page.locator(".season-fx").count() === 0, "decorations added");
  await ctx.close();
});
await browser.close();
server.close();
console.log(`\n${pass}/${pass + fail} passing`);
if (fail) process.exit(1);
