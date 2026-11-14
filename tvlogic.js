// Display-time rules for Steph's TV log. DOM-free on purpose so they can be unit-tested in Node
// (tvlogic.test.mjs): index.html does the painting and the fetching, this file decides what counts
// as "on hold" and how the in-app months of the pace chart are computed. Nothing here reads or
// writes progress.json, so the three-place merge (page, Worker, home-hub) is untouched.
var TvLogic = (function () {
  // ─── On hold ───────────────────────────────────────────────────────────────────
  // shows.json's `dormant` is a frozen, per-show flag from her TV Time export (judged against
  // her own gap pattern for that show). Every in-app action then writes dormant:false and
  // nothing ever writes true, so a show she touched once in July never went on hold again.
  //
  // THE RULE (tune ONHOLD_DAYS here):
  //  * A show she has NOT touched in this app (no live override, not one she added) keeps the
  //    export's flag exactly as it was.
  //  * A show she HAS touched is on hold when it is `watching`, last watched more than
  //    ONHOLD_DAYS ago, AND the gap is hers: a show that is caught up and waiting on more episodes,
  //    or one with a dated upcoming episode, is never put on hold for time it could not be watched.
  //  * A touched show with no lastWatched date has no gap to measure, so its stored flag stands.
  var ONHOLD_DAYS = 45;
  // g: the merged show. ctx.touched: has a live override or is a custom show. ctx.daysSince: whole
  // days since lastWatched (null if none). ctx.waiting: caught up and the show is still running.
  // ctx.upcoming: TMDB has a dated episode still in the future.
  function isOnHold(g, ctx) {
    if (!ctx || !ctx.touched) return !!g.dormant;
    if (g.s !== 'watching') return false;
    if (ctx.daysSince == null) return !!g.dormant;
    if (ctx.waiting || ctx.upcoming) return false;
    return ctx.daysSince > ONHOLD_DAYS;
  }

  // ─── Monthly pace ──────────────────────────────────────────────────────────────
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  // Local time, not UTC: a tap at 9pm on the 31st is that month's, wherever the clock's zero is.
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function nextMonth(key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7);
    return m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1);
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthLabel(key) { return MON[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4); }

  // Months after `afterMonth` (the export's last full month, so it is never counted twice) up to
  // and including the month of `now`, counted from her own 'watched' history. Episodes only: the
  // app has no runtime data, so hrs is null rather than a guess. Months with no taps are 0, which
  // is honest here because history is logged continuously, unlike the export's unrecorded 2025 gap.
  function paceFromHistory(history, afterMonth, now) {
    var counts = {};
    (history || []).forEach(function (h) {
      if (!h || h.action !== 'watched') return;
      var d = new Date(h.at);
      if (isNaN(d)) return;
      var k = monthKey(d);
      if (k > afterMonth) counts[k] = (counts[k] || 0) + 1;
    });
    var keys = Object.keys(counts).sort();
    if (!keys.length) return [];
    var last = monthKey(now || new Date());
    if (keys[keys.length - 1] > last) last = keys[keys.length - 1];
    var out = [];
    for (var k = nextMonth(afterMonth); k <= last; k = nextMonth(k)) {
      out.push({ m: k, eps: counts[k] || 0, hrs: null, app: true });
    }
    return out;
  }
  // Honest totals: hours only add up over months that have hours.
  function paceSummary(series) {
    var eps = 0, hrs = 0, hrsMonths = 0, appMonths = 0;
    series.forEach(function (p) {
      eps += p.eps;
      if (p.hrs != null) { hrs += p.hrs; hrsMonths++; } else appMonths++;
    });
    return {
      eps: eps, hrs: hrs, hrsMonths: hrsMonths, appMonths: appMonths,
      first: series.length ? series[0].m : null, last: series.length ? series[series.length - 1].m : null
    };
  }

  return { ONHOLD_DAYS: ONHOLD_DAYS, isOnHold: isOnHold, paceFromHistory: paceFromHistory,
    paceSummary: paceSummary, monthLabel: monthLabel, monthKey: monthKey };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TvLogic;
