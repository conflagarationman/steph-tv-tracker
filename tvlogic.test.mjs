// The on-hold rule and the monthly-pace maths. Run: node tvlogic.test.mjs
process.env.TZ = "America/New_York";   // before any Date is built: the month-boundary cases need a zone behind UTC
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("./tvlogic.js");
let pass = 0, fail = 0;
const t = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };

// --- on hold
const w = (o) => ({ s: "watching", dormant: false, ...o });
t("untouched show keeps the export's dormant:true", L.isOnHold(w({ dormant: true }), { touched: false, daysSince: 3 }) === true);
t("untouched show keeps the export's dormant:false, however old", L.isOnHold(w({}), { touched: false, daysSince: 900 }) === false);
t("touched, recent -> active", L.isOnHold(w({}), { touched: true, daysSince: 5 }) === false);
t("touched, exactly the cutoff -> still active", L.isOnHold(w({}), { touched: true, daysSince: L.ONHOLD_DAYS }) === false);
t("touched, one day past the cutoff -> on hold", L.isOnHold(w({}), { touched: true, daysSince: L.ONHOLD_DAYS + 1 }) === true);
t("touched, untouched since July (123d) -> on hold", L.isOnHold(w({}), { touched: true, daysSince: 123 }) === true);
t("touched, old but waiting on a new season -> not punished", L.isOnHold(w({}), { touched: true, daysSince: 200, waiting: true }) === false);
t("touched, old but a dated episode is coming -> not punished", L.isOnHold(w({}), { touched: true, daysSince: 200, upcoming: true }) === false);
t("touched with no lastWatched -> stored flag stands (false)", L.isOnHold(w({}), { touched: true, daysSince: null }) === false);
t("touched with no lastWatched -> stored flag stands (true)", L.isOnHold(w({ dormant: true }), { touched: true, daysSince: null }) === true);
t("non-watching show is never on hold", L.isOnHold({ s: "done", dormant: true }, { touched: true, daysSince: 500 }) === false);
t("no ctx behaves as untouched", L.isOnHold(w({ dormant: true })) === true);

// --- monthly pace
const at = (iso, action = "watched") => ({ id: 1, title: "x", action, season: 1, ep: 1, at: iso });
const NOW = new Date(2026, 10, 14, 12);                         // 14 Nov 2026, local
const hist = [
  at("2026-07-20T15:00:00Z"), at("2026-07-31T15:00:00Z"),       // July is the export's: never counted again
  at("2026-08-05T15:00:00Z"), at("2026-08-06T15:00:00Z"),
  at("2026-10-01T15:00:00Z"),
  at("2026-11-02T15:00:00Z"), at("2026-11-03T15:00:00Z"), at("2026-11-04T15:00:00Z"),
  at("2026-11-05T15:00:00Z", "edited"), at("2026-11-05T15:00:00Z", "started"), at("2026-11-05T15:00:00Z", "finished"),
];
const p = L.paceFromHistory(hist, "2026-07", NOW);
t("starts the month after the export's last", p[0].m === "2026-08");
t("July in-app taps are not double counted", !p.some((x) => x.m === "2026-07"));
t("Aug has its 2 taps", p[0].eps === 2);
t("a month with no taps between is 0, not skipped", p.find((x) => x.m === "2026-09").eps === 0);
t("Oct", p.find((x) => x.m === "2026-10").eps === 1);
t("current month counts only 'watched' (edited/started/finished ignored)", p[p.length - 1].m === "2026-11" && p[p.length - 1].eps === 3);
t("runs through the current month, no further", p.map((x) => x.m).join() === "2026-08,2026-09,2026-10,2026-11");
t("hours are unknown, not invented", p.every((x) => x.hrs === null));
// local time: 02:30Z on 1 Sep is still 31 Aug in New York
const edge = L.paceFromHistory([at("2026-09-01T02:30:00Z"), at("2026-09-01T05:00:00Z")], "2026-07", new Date(2026, 8, 20));
t("a tap at 10:30pm on Aug 31 local counts in August", edge[0].m === "2026-08" && edge[0].eps === 1);
t("a tap after local midnight counts in September", edge[1].m === "2026-09" && edge[1].eps === 1);
t("nothing after the export -> no extra months", L.paceFromHistory([at("2026-07-20T15:00:00Z")], "2026-07", NOW).length === 0);
t("empty/undefined history is safe", L.paceFromHistory(undefined, "2026-07", NOW).length === 0);
t("year rollover", L.paceFromHistory([at("2027-01-15T15:00:00Z")], "2026-11", new Date(2027, 0, 20)).map((x) => x.m).join() === "2026-12,2027-01");
t("a bad timestamp is skipped", L.paceFromHistory([at("nope"), at("2026-08-05T15:00:00Z")], "2026-07", new Date(2026, 7, 6))[0].eps === 1);

// --- summary keeps totals honest
const base = [{ m: "2026-06", eps: 41, hrs: 30 }, { m: "2026-07", eps: 29, hrs: 21 }];
const s = L.paceSummary([...base, ...p]);
t("summary: episodes include in-app months", s.eps === 41 + 29 + 6);
t("summary: hours only from months that have them", s.hrs === 51 && s.hrsMonths === 2 && s.appMonths === 4);
t("summary: first/last follow the data", s.first === "2026-06" && s.last === "2026-11");
t("monthLabel", L.monthLabel("2026-11") === "Nov 2026" && L.monthLabel("2023-03") === "Mar 2023");

console.log(`${pass}/${pass + fail} passing`);
process.exit(fail ? 1 : 0);
