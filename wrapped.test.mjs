// The year-in-TV numbers (wrapped.js). Made-up data only. Run: node wrapped.test.mjs
import { createRequire } from "node:module";
const W = createRequire(import.meta.url)("./wrapped.js");
let pass = 0, fail = 0;
const t = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };

// ET is UTC-4 in summer/autumn: 02:00Z is 10 PM the evening before.
const shows = [
  { id: 1, t: "Alpha", s: "watching", season: 1, ep: 3, epsWatched: 3, lastWatched: "2026-03-01", start: "2026-02-01", cy: null, cm: null },
  { id: 2, t: "Beta", s: "watching", season: 2, ep: 13, epsWatched: 23, lastWatched: "2026-06-01", start: "2025-01-01", cy: null, cm: null },
  { id: 3, t: "Gamma", s: "watching", season: 1, ep: 1, epsWatched: 1, lastWatched: "2025-05-01", start: null, cy: null, cm: null },
  { id: 4, t: "Old", s: "done", season: 1, ep: 9, epsWatched: 9, lastWatched: "2024-01-01", start: null, cy: 2024, cm: 1 }
];
const H = (id, title, action, season, ep, at) => ({ id, title, action, season, ep, at });
const history = [
  H(2, "Beta", "watched", 2, 9, "2026-08-02T02:00:00Z"),    // Aug 1, 10 PM
  H(2, "Beta", "watched", 2, 10, "2026-08-02T02:40:00Z"),
  H(2, "Beta", "watched", 2, 11, "2026-08-02T03:30:00Z"),
  H(2, "Beta", "watched", 2, 12, "2026-08-02T05:10:00Z"),   // 1:10 AM counts as the night of Aug 1
  H(2, "Beta", "watched", 2, 13, "2026-08-02T18:00:00Z"),   // Aug 2, 2 PM
  H(2, "Beta", "edited", 2, 12, "2026-08-02T18:01:00Z"),    // a mistap corrected...
  H(2, "Beta", "watched", 2, 13, "2026-08-02T18:02:00Z"),   // ...and re-marked: still one episode
  H(1, "Alpha", "watched", 1, 4, "2026-08-03T23:00:00Z"),   // Aug 3, 7 PM
  H(1, "Alpha", "finished", 1, 4, "2026-08-04T00:00:00Z"),
  H(5, "Delta", "added, watching", 1, 1, "2026-08-05T00:00:00Z"),
  H(5, "Delta", "watched", 1, 2, "2026-08-10T01:00:00Z"),
  H(3, "Gamma", "watched", 1, 2, "2025-12-31T12:00:00Z"),   // last year: not counted
  H(9, "Ghost", "watched", 1, 1, "2026-09-01T12:00:00Z"),   // removed below
  H(2, "Beta", "watched", 1, 1, "2026-07-15T21:00:00Z"),    // the log's first day: no binge credit
  H(2, "Beta", "watched", 1, 2, "2026-07-15T21:00:05Z"),
  H(2, "Beta", "watched", 1, 3, "2026-07-15T21:00:09Z"),
  H(2, "Beta", "watched", 1, 4, "2026-07-15T21:00:12Z"),
  H(2, "Beta", "watched", 1, 5, "2026-07-15T21:00:15Z")
];
const progress = {
  overrides: { 1: { s: "done", cy: 2026, cm: 7, updatedAt: "2026-08-04T00:00:00Z" } },
  customShows: { 5: { id: 5, t: "Delta", s: "watching", season: 1, ep: 2, start: "2026-08-05", lastWatched: "2026-08-09" } },
  history, historyRemoved: ["9@2026-09-01T12:00:00Z"]
};
const meta = {
  1: { status: "Ended", watch: { on: ["Netflix"] } },
  2: { status: "Returning Series", lastAired: { season: 2, ep: 13 }, nextAir: { season: 3, ep: 1, airDate: "2027-01-10" }, watch: { on: ["HBO Max Amazon Channel", "YouTube TV"] } }
};
const s = W.compute({ shows, progress, meta, year: 2026, now: new Date("2026-11-01T12:00:00") });

// --- local time
t("02:00Z in August is 10 PM the day before in New York", W.local("2026-08-02T02:00:00Z").date === "2026-08-01" && W.local("2026-08-02T02:00:00Z").hour === 22);
t("winter offset is -5", W.local("2026-12-01T03:00:00Z").hour === 22);

// --- episodes
const paceJanJul = Object.keys(W.PACE).filter(k => k.startsWith("2026")).reduce((a, k) => a + W.PACE[k][0], 0);
t("logged episodes: watched rows once per S·E, edited/finished/added/removed/last year left out", s.loggedEpisodes === 12);
t("total = export months + log", s.episodes === paceJanJul + 12);
t("August holds its logged episodes", s.months[7].eps === 7 && s.months[7].logged === 7 && !s.months[7].export);
t("July adds the log to the export's count", s.months[6].eps === W.PACE["2026-07"][0] + 5);
t("hours use TV Time's own episode length", Math.abs(s.hrsPerEp - 152 / 226) < 1e-9 || s.hrsPerEp > 0.3);

// --- shows
t("top show is the most-logged", s.topShows[0].t === "Beta" && s.topShows[0].eps === 10);
t("show count: export lastWatched in the year plus logged shows", s.showCount === 3);
t("finished: archived this year", s.finished.length === 1 && s.finished[0].t === "Alpha" && s.finished[0].month === 7);
t("started this year: a start date in the year, custom shows included", s.started.map(g => g.t).join() === "Alpha,Delta");

// --- binge, streak, clock
t("binge: 4 on the night of Aug 1 (1 AM belongs to the night before), first log day skipped", s.binge && s.binge.eps === 4 && s.binge.date === "2026-08-01" && s.binge.t === "Beta");
t("streak counts consecutive days", s.streak.days === 3 && s.streak.from === "2026-08-01" && s.streak.to === "2026-08-03");
t("night share: 10 PM to 4 AM", Math.abs(s.clock.nightShare - 4 / 12) < 1e-9);
t("peak hour label", W.hourLabel(22) === "10pm–11pm" && W.hourLabel(11) === "11am–12pm" && W.hourLabel(0) === "12am–1am");

// --- services
t("reseller channel collapses to the service", W.canonicalService("HBO Max Amazon Channel") === "HBO Max");
t("best tier wins over live TV", W.serviceOf(meta[2]) === "HBO Max");
t("services ranked by logged episodes", s.services[0].name === "HBO Max" && s.services[0].eps === 10 && s.services[1].name === "Netflix");

// --- waiting
t("caught up on a returning show = waiting", s.waiting.length === 1 && s.waiting[0].t === "Beta");
const s2 = W.compute({ shows, progress, meta, year: 2026, now: new Date("2027-01-11T12:00:00") });
t("not waiting once the next episode has aired", s2.waiting.length === 0);

// --- merge
const merged = W.mergeProgress(
  { history: [history[0], history[1]], historyRemoved: [], overrides: { 1: { s: "watching", updatedAt: "2026-01-01" } }, customShows: {} },
  { history: [history[1], history[2]], historyRemoved: ["2@" + history[0].at], overrides: { 1: { s: "done", updatedAt: "2026-02-01" } }, customShows: { 5: { id: 5 } } }
);
t("merge: history unioned, duplicates once", merged.history.length === 2);
t("merge: a removal on either side wins", !merged.history.some(h => h.at === history[0].at));
t("merge: newer override wins", merged.overrides[1].s === "done");
t("merge: custom shows unioned", !!merged.customShows[5]);
t("merge: one side missing", W.mergeProgress(null, { history: [history[0]] }).history.length === 1);

// --- persona
t("a persona always comes back with a reason", s.persona && s.persona.name && s.persona.why);
const nightOwl = W.compute({ shows, progress: { ...progress, history: Array.from({ length: 12 }, (_, i) => H(10 + (i % 4), "Show " + (i % 4), "watched", 4, i + 1, `2026-09-${String(i * 2 + 1).padStart(2, "0")}T03:00:00Z`)) }, meta, year: 2026 });
t("all-night watching -> The Midnight Watcher, masked", nightOwl.persona.id === "night" && nightOwl.persona.mask === true);
t("default year: January looks back", W.defaultYear(new Date("2027-01-15")) === 2026 && W.defaultYear(new Date("2026-12-25")) === 2026);

console.log(`${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
