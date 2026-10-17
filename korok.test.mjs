// Koroks and Hestu on Steph's log. korok.js is a verbatim copy of game-tracker's (its full unit
// suite lives there); this checks the copy still works and that this page holds its 2 of the 12
// shared spots. Run: node korok.test.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const K = createRequire(import.meta.url)("./korok.js");
let pass = 0, fail = 0;
const t = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };
const mem = (init = {}) => { const d = { ...init }; return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };

const st = mem({ "korok:steph-tv-tracker": '["index"]', "korok:game-tracker": '["index"]' });
const f = K.load(st, "korok:all", ["korok:game-tracker", "korok:steph-tv-tracker"]);
t("both repos' index finds survive migration", f.join() === "game-tracker/index,steph-tv-tracker/index");
t("milestones 3/6/all", K.milestone(3, 12, []).kind === "three" && K.milestone(6, 12, []).unlock && K.milestone(12, 12, []).kind === "all");
t("Hestu grid is 26 wide", K.HESTU.every(r => r.length === 26));
t("Korok sprite renders", /<svg/.test(K.korokSvg(K.variantFor("steph-tv-tracker/index"))));

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const m = html.match(/<script src="korok\.js"[^>]*>/);
t("index.html loads korok.js", !!m);
t("says total 12", /data-total="12"/.test(m[0]));
t("repo is steph-tv-tracker", /data-repo="steph-tv-tracker"/.test(m[0]));
t("holds 2 spots", K.parseSpots(m[0].match(/data-spots="([^"]+)"/)[1]).length === 2);
console.log(pass + "/" + (pass + fail) + " passing");
process.exit(fail ? 1 : 0);
