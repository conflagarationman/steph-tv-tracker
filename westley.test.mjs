// Westley's lines, progress maths and (above all) the spoiler-safe recap. Run: node westley.test.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const W = createRequire(import.meta.url)("./westley.js");
let pass = 0, fail = 0;
const t = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };

// --- recap: only the episode she last watched
const eps = [
  { ep: 1, name: "Pilot", overview: "One." },
  { ep: 2, name: "Two", overview: "SECOND EPISODE: Jim finds the map." },
  { ep: 3, name: "Three", overview: "SPOILER: the butler did it." },
];
const r = W.recap(eps, 1, 2);
t("recaps the last-watched episode", r && r.ep === 2 && r.name === "Two" && /finds the map/.test(r.text));
t("never contains the next episode's overview", !/SPOILER|butler/.test(JSON.stringify(r)));
t("episode 3 watched -> recap of 3 only", /butler/.test(W.recap(eps, 1, 3).text) && !/map/.test(W.recap(eps, 1, 3).text));
t("watched past the list -> nothing, not the next one", W.recap(eps, 1, 4) === null);
t("no overview -> null", W.recap([{ ep: 1, name: "x", overview: null }, { ep: 2, overview: "later" }], 1, 1) === null);
t("blank overview -> null", W.recap([{ ep: 1, overview: "   " }], 1, 1) === null);
t("bad input -> null", W.recap(null, 1, 1) === null && W.recap(undefined, 1, 1) === null && W.recap("x", 1, 1) === null);
const long = "A sentence goes here. ".repeat(40);
const lr = W.recap([{ ep: 1, overview: long }], 1, 1);
t("long overviews are trimmed to one paragraph at a sentence end", lr.text.length <= 420 && /\.$/.test(lr.text));
t("one unbroken long word still trims", W.recap([{ ep: 1, overview: "word ".repeat(200) }], 1, 1).text.length <= 425);

// --- progress / "mostly finished"
const counts = { 1: 10, 2: 10 };
t("progress at S1E5 is 25%", W.progress(counts, 1, 5) === 0.25);
t("progress at S2E8 is 90%", W.progress(counts, 2, 8) === 0.9);
t("mostly finished from 90% up to but excluding 100%", W.mostlyFinished(counts, 2, 8) && W.mostlyFinished(counts, 2, 9) && !W.mostlyFinished(counts, 2, 10) && !W.mostlyFinished(counts, 2, 7));
t("unknown counts -> null, never mostly", W.progress(null, 1, 1) === null && !W.mostlyFinished(undefined, 1, 1) && W.progress(counts, null, 1) === null);

// --- lines
t("watching an episode says As you wish…", W.line("watched") === "As you wish…");
t("a 90% show adds the original aside", /^As you wish… Mostly finished/.test(W.line("watched", { mostly: true })));
t("asking for a recap says As you wish…", W.line("recap") === "As you wish…");
t("Inconceivable! is only the new-drop line", W.line("drop") === "Inconceivable!" &&
  ["watched", "started", "finished", "recap", "mask", "idle"].every(k => !/Inconceivable/.test(W.line(k))) && W.IDLE.every(l => !/Inconceivable/.test(l)));
t("idle: a nearly-done show is named", W.line("idle", { nearly: "Ted Lasso" }) === "Ted Lasso is mostly finished.");
t("idle: nothing ready", /All caught up/.test(W.line("idle", { ready: 0 })));
t("idle rotates by seed", W.line("idle", { ready: 3, seed: 0 }) !== W.line("idle", { ready: 3, seed: 1 }));
t("idle with a huge seed still resolves", typeof W.line("idle", { ready: 3, seed: 12345 }) === "string");

// --- sprite
t("grid is 16x22", W.GRID.length === 22 && W.GRID.every(r => r.length === 16));
t("masked grid keeps its shape and swaps the look", W.grid(true).length === 22 && W.grid(true).every(r => r.length === 16) && W.grid(true).join() !== W.GRID.join());
t("every letter in both looks has a colour", !/undefined/.test(W.svg(false) + W.svg(true)));
t("both looks render", /<svg/.test(W.svg(false)) && /<svg/.test(W.svg(true, 4)));

// --- the page is wired to it
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
t("index.html loads westley.js before its own script", html.indexOf('src="westley.js"') > 0 && html.indexOf('src="westley.js"') < html.indexOf("<script>\nconst M="));
t("recap fetch asks for only the season she is in", /seasons=\$\{g\.season\}/.test(html));

console.log(pass + "/" + (pass + fail) + " passing");
process.exit(fail ? 1 : 0);
