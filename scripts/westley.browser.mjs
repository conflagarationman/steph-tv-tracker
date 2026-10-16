// Browser check for Westley and "Previously on…": index.html in headless Chromium at phone and
// desktop width against the committed JSON. Nothing is written: the Worker is stubbed (progress
// writes are recorded, never sent; /tmdb-episodes answers from a canned generator) and every other
// off-site request is aborted.
//   npm i --no-save playwright@1.56.1 && npx playwright install chromium
//   node scripts/westley.browser.mjs        (PLAYWRIGHT_MODULE overrides where playwright is imported from)
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
let pass = 0, fail = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log("PASS  " + name); } catch (e) { fail++; console.log(`FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function open(width, reducedMotion = "no-preference") {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: width < 500, isMobile: width < 500, reducedMotion });
  const page = await ctx.newPage();
  const errors = [], episodeAsks = [], writes = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => { errors.push("alert: " + d.message()); d.dismiss(); });
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(BASE) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    if (/workers\.dev/.test(url)) {
      const u = new URL(url), h = { "Access-Control-Allow-Origin": "*" };
      if (u.pathname.endsWith("/tmdb-episodes")) {
        episodeAsks.push(u.search);
        const out = {};
        for (const s of (u.searchParams.get("seasons") || "").split(",")) out[s] = Array.from({ length: 30 }, (_, i) => ({ ep: i + 1, name: `Title ${i + 1}`, overview: `RECAP-${s}-${i + 1}`, airDate: null }));
        return route.fulfill({ status: 200, contentType: "application/json", headers: h, body: JSON.stringify(out) });
      }
      if (route.request().method() === "POST") writes.push(url);
      return route.fulfill({ status: 200, contentType: "application/json", headers: h, body: JSON.stringify({ version: 1, updatedAt: null, overrides: {}, customShows: {} }) });
    }
    return route.abort();
  });
  await page.goto(BASE + "/index.html");
  await page.waitForSelector("#now .card");
  return { page, ctx, errors, episodeAsks, writes };
}
const noSideScroll = page => page.evaluate(async () => { await document.fonts.ready; return document.documentElement.scrollWidth <= window.innerWidth + 1; });

for (const width of [375, 1280]) {
  await test(`${width}px: Westley sits under the header, the list stays visible, no sideways scroll`, async () => {
    const { page, errors, ctx } = await open(width);
    ok(await page.locator("#westley .westley-sprite").count() === 1, "no sprite");
    ok((await page.textContent("#westley .westley-say")).length > 5, "no line");
    const w = await page.locator("#westley").boundingBox(), n = await page.locator("#now").boundingBox();
    ok(w.height < 70, "strip is taller than one line of host: " + w.height);
    ok(n.y >= w.y + w.height - 1, "list overlaps Westley");
    ok(await noSideScroll(page), "page scrolls sideways");
    ok(errors.length === 0, errors.join(" | "));
    await ctx.close();
  });
}

await test("Previously on…: recaps only the last-watched episode, asks only for its season, and writes nothing", async () => {
  const { page, errors, episodeAsks, writes, ctx } = await open(375);
  const btn = page.locator("#now button", { hasText: "Previously on" }).first();
  await btn.waitFor();
  const card = page.locator("#now .card", { has: btn }).first();
  const id = Number(/openRecap\((\d+)\)/.exec(await btn.getAttribute("onclick"))[1]);
  const pos = await page.evaluate(i => { const g = liveShows().find(x => x.id === i); return [g.season, g.ep]; }, id);
  const writesBefore = writes.length;
  await btn.click();
  await page.waitForSelector("#recap-body .recap-text");
  const text = await page.textContent("#recap-body");
  ok(text.includes(`RECAP-${pos[0]}-${pos[1]}`), "recap missing the last-watched episode: " + text);
  ok(!text.includes(`RECAP-${pos[0]}-${pos[1] + 1}`) && !text.includes(`RECAP-${pos[0] + 1}-`), "recap leaked a later episode: " + text);
  ok(episodeAsks.length === 1 && new RegExp(`seasons=${pos[0]}$`).test(episodeAsks[0]), "asked for more than her season: " + episodeAsks);
  ok(/As you wish/.test(await page.textContent("#recap-head")) && /As you wish/.test(await page.textContent("#westley")), "no As you wish…");
  ok(await noSideScroll(page), "dialog scrolls sideways");
  await page.click("#recap-dialog .action-btn");
  await btn.click();                       // second open: from the cache, no second fetch
  await page.waitForSelector("#recap-body .recap-text");
  ok(episodeAsks.length === 1, "recap wasn't cached");
  ok(writes.length === writesBefore, "opening a recap wrote something: " + writes);
  ok(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await test("Previously on…: a Worker that's down says so kindly instead of breaking", async () => {
  const { page, ctx, errors } = await open(375);
  await page.route(/tmdb-episodes/, r => r.fulfill({ status: 502, headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" }));
  await page.locator("#now button", { hasText: "Previously on" }).first().click();
  await page.waitForSelector("#recap-body .ep-empty");
  ok(/Couldn't reach/.test(await page.textContent("#recap-body")), "no kind failure note");
  ok(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await test("marking an episode watched makes Westley say As you wish…, and reduced motion stills him", async () => {
  const { page, ctx, errors, writes } = await open(375, "reduce");
  await page.locator("#now .action-btn.primary", { hasText: "I watched this" }).first().click();
  await page.waitForFunction(() => /As you wish/.test(document.querySelector("#westley .westley-say").textContent));
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".westley-btn")).animationName) === "none", "still animating under reduced motion");
  ok(await page.locator(".undo-bar").count() > 0, "undo bar missing");
  ok(errors.length === 0, errors.join(" | "));
  void writes;
  await ctx.close();
});

await test("finishing a show unlocks the mask look, and tapping him wears it", async () => {
  const { page, ctx, errors } = await open(375);
  await page.evaluate(() => { const g = liveShows().find(x => x.s === "watching"); markFinished(g.id); });
  await page.waitForFunction(() => /mask/i.test(document.querySelector("#westley .westley-say").textContent));
  ok(await page.evaluate(() => localStorage.getItem("westley:mask")) === "unlocked", "mask not unlocked");
  const before = await page.innerHTML("#westley .westley-btn");
  await page.locator(".westley-btn").dispatchEvent("click");   // he bobs, so Playwright never sees him "stable"
  ok(await page.evaluate(() => localStorage.getItem("westley:mask")) === "on", "mask not worn");
  ok(await page.innerHTML("#westley .westley-btn") !== before, "look didn't change");
  ok(errors.length === 0, errors.join(" | "));
  await ctx.close();
});

await browser.close();
server.close();
console.log(`\n${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
