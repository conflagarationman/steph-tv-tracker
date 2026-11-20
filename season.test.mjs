// season.js is a plain browser script; run it in a fresh VM context.
// Its dates must match the Home Hub's _hub_season() and the game tracker's copy.
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

const src = await readFile(new URL("./season.js", import.meta.url), "utf8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const { season, fromQuery, thanksgivingDay } = ctx.TVSeason;

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n        ${e.message}`); }
};
const on = (y, m, d) => season(new Date(y, m - 1, d));

await test("Thanksgiving is the 4th Thursday of November", () => {
  assert.equal(thanksgivingDay(2026), 26);
  assert.equal(thanksgivingDay(2027), 25);
  assert.equal(thanksgivingDay(2028), 23);
});
await test("Christmas runs November 1 through January 1", () => {
  assert.equal(on(2026, 10, 31), "");
  assert.equal(on(2026, 11, 1), "christmas");
  assert.equal(on(2026, 12, 31), "christmas");
  assert.equal(on(2027, 1, 1), "christmas");
  assert.equal(on(2027, 1, 2), "");
  assert.equal(on(2027, 7, 4), "");
});
await test("Thanksgiving takes the Thursday a week before through Thanksgiving Day", () => {
  assert.equal(on(2026, 11, 18), "christmas");
  assert.equal(on(2026, 11, 19), "thanksgiving");
  assert.equal(on(2026, 11, 26), "thanksgiving");
  assert.equal(on(2026, 11, 27), "christmas");
  assert.equal(on(2027, 11, 18), "thanksgiving");
  assert.equal(on(2027, 11, 26), "christmas");
});
await test("?season= previews: a holiday, off, or nothing", () => {
  assert.equal(fromQuery("?season=christmas"), "christmas");
  assert.equal(fromQuery("?x=1&season=thanksgiving"), "thanksgiving");
  assert.equal(fromQuery("?season=off"), "");
  assert.equal(fromQuery(""), null);
  assert.equal(fromQuery("?season=easter"), null);
});
await test("never takes body::before or ::after (korok.js's forest skins own them)", () => {
  const code = src.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/body::(before|after)/.test(code));
});
await test("the ribbon and bulbs live on the header bar, never a layer over the page", () => {
  assert.match(src, /html\[data-season="christmas"\] \.appbar\{background:/);
  assert.ok(!/position:(absolute|fixed)[^}]*z-index:[1-9]/.test(src));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
