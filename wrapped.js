// Steph's year in TV: the numbers behind wrapped.html. DOM-free on purpose so it can be
// unit-tested in Node (wrapped.test.mjs); the page does the painting and the fetching.
//
// Where a year's numbers come from:
// - Jan 1 to mid-July 2026: TV Time's own monthly counters from her export (PACE below, the same
//   figures as MONTHLY_PACE in index.html). Episodes and hours per month, nothing per show.
// - From 2026-07-15: her own log (progress.history), one row per tap, with a timestamp. Only
//   'watched' and 'started' rows are episodes ('edited' can jump any distance, 'finished' and
//   'added' don't watch anything).
// So per-show, per-day and per-hour stats only cover the logged part of the year, and the cards
// that use them say "since July". The export ends where the log begins (shows.json's newest
// lastWatched is 2026-07-15, the log's first row is that afternoon), so nothing is counted twice.
// Read-only: nothing here writes progress, and wrapped.html never POSTs to the Worker.
var WrappedTV = (function () {
  var TZ = 'America/New_York';
  // TV Time's monthly counters, frozen in her export (copied from index.html's MONTHLY_PACE; it's
  // export data, so it can't drift). 2026-07 covers July 1-15 only.
  var PACE = {
    '2025-08': [44, 23.0], '2025-09': [34, 24.0], '2025-10': [41, 22.0], '2025-11': [43, 30.0],
    '2025-12': [39, 27.0], '2026-01': [38, 23.0], '2026-02': [27, 14.0], '2026-03': [36, 26.0],
    '2026-04': [26, 12.0], '2026-05': [29, 16.0], '2026-06': [41, 30.0], '2026-07': [29, 21.0]
  };
  var LOG_START = '2026-07-15';
  // TV Time's lifetime counter at export time (index.html's LIFETIME).
  var LIFETIME = { hours: 7324, since: 2017 };
  var EPISODE_ACTIONS = { watched: 1, started: 1 };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---- local time (America/New_York), from an ISO timestamp
  var fmt = null;
  function local(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    if (!fmt) fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
    var p = {};
    fmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { date: p.year + '-' + p.month + '-' + p.day, year: +p.year, month: +p.month - 1,
      hour: +p.hour % 24, weekday: wd };
  }
  function addDays(date, n) {
    var d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // ---- progress: the same base + override + tombstone rules as index.html and the Worker
  function isLive(o) { return !!o && !o.__deleted; }
  var histKey = function (h) { return h.id + '@' + h.at; };
  // Two copies of progress (this browser's localStorage and the Worker's) merged the way the
  // Worker would: history unioned minus removals, the newer override per show, custom shows unioned.
  function mergeProgress(a, b) {
    a = a || {}; b = b || {};
    var removed = {};
    (a.historyRemoved || []).concat(b.historyRemoved || []).forEach(function (k) { removed[k] = 1; });
    var seen = {}, history = [];
    (a.history || []).concat(b.history || []).forEach(function (h) {
      if (!h || !h.at) return;
      var k = histKey(h);
      if (seen[k] || removed[k]) return;
      seen[k] = 1; history.push(h);
    });
    function newer(x, y) {
      var out = {};
      [x || {}, y || {}].forEach(function (src) {
        Object.keys(src).forEach(function (id) {
          var cur = out[id], v = src[id];
          if (!cur || String(v && v.updatedAt || '') > String(cur.updatedAt || '')) out[id] = v;
        });
      });
      return out;
    }
    return { overrides: newer(a.overrides, b.overrides), customShows: newer(a.customShows, b.customShows),
      history: history, historyRemoved: Object.keys(removed) };
  }
  function liveShows(shows, progress) {
    var ov = progress.overrides || {};
    var out = (shows || []).map(function (g) { return isLive(ov[g.id]) ? Object.assign({}, g, ov[g.id]) : g; });
    Object.keys(progress.customShows || {}).forEach(function (id) {
      var c = progress.customShows[id];
      if (isLive(c)) out.push(isLive(ov[id]) ? Object.assign({}, c, ov[id]) : c);
    });
    return out;
  }

  // ---- streaming services (a copy of index.html's canonicalService/watchServices; a drift only
  // changes which logo the Wrapped service card names, never her main page)
  var RESELLER_RE = /\s+(amazon|apple tv|roku premium|roku)\s+channel\s*$/i;
  var TIER_RE = /\s+(standard\s+)?with\s+ads$/i;
  var FREE_ADS_RE = /\s+free\s+with\s+ads$/i;
  var SERVICE_ALIAS = {
    'amazon prime video': 'Prime Video', 'amazon video': 'Prime Video', 'disney plus': 'Disney+',
    'apple tv': 'Apple TV+', 'apple tv plus': 'Apple TV+', 'peacock premium': 'Peacock',
    'peacock premium plus': 'Peacock', 'paramount plus': 'Paramount+', 'paramount plus premium': 'Paramount+',
    'paramount plus essential': 'Paramount+', 'paramount+': 'Paramount+', 'amc plus': 'AMC+', 'amc+': 'AMC+',
    'mgm plus': 'MGM+', 'mgm+': 'MGM+', 'britbox': 'BritBox', 'tubi tv': 'Tubi', 'discovery +': 'Discovery+',
    'the roku channel': 'Roku Channel'
  };
  var LIVE_TV = ['youtube tv', 'philo', 'fubotv', 'spectrum on demand', 'directv', 'sling tv'];
  var FREE_SVC = ['tubi', 'pluto tv', 'roku channel', 'xumo play', 'fandango at home free', 'freevee'];
  var NETWORK = ['nbc', 'tbs', 'tnt', 'usa network', 'freeform', 'pbs', 'pbs kids', 'history',
    'investigation discovery', 'disneynow', 'thirteen', 'kqed', 'weta+', 'fox one', 'angel studios',
    'the cw', 'a&e', 'bravo', 'syfy', 'amc', 'pure flix', 'ondemandkorea', 'youtube premium'];
  function canonicalService(name) {
    var raw = String(name || '').trim();
    var direct = SERVICE_ALIAS[raw.toLowerCase()];
    if (direct) return direct;
    var n = raw.replace(RESELLER_RE, '').replace(FREE_ADS_RE, '').replace(TIER_RE, '').trim();
    if (!n) return raw;
    return SERVICE_ALIAS[n.toLowerCase()] || n;
  }
  function tier(name) {
    var k = name.toLowerCase();
    return LIVE_TV.indexOf(k) >= 0 ? 3 : NETWORK.indexOf(k) >= 0 ? 2 : FREE_SVC.indexOf(k) >= 0 ? 1 : 0;
  }
  // The one service a show would be credited to: the first of its best tier.
  function serviceOf(meta) {
    var on = meta && meta.watch && meta.watch.on;
    if (!on || !on.length) return null;
    var best = null;
    on.forEach(function (raw) {
      var n = canonicalService(raw);
      if (n && (!best || tier(n) < tier(best))) best = n;
    });
    return best;
  }

  // ---- the year
  // opts: { shows, progress, meta, year, now }  (progress already merged; meta = show-meta.json)
  function compute(opts) {
    var year = opts.year, shows = opts.shows || [], meta = opts.meta || {};
    var progress = opts.progress || {};
    var removed = {};
    (progress.historyRemoved || []).forEach(function (k) { removed[k] = 1; });
    var all = liveShows(shows, progress);
    var byId = {};
    all.forEach(function (g) { byId[g.id] = g; });
    var title = function (id, fallback) { return (byId[id] && byId[id].t) || fallback || 'a show'; };

    // Episodes in the log for this year, oldest first, with their local time.
    var log = (progress.history || []).filter(function (h) { return h && !removed[histKey(h)]; })
      .map(function (h) { return { h: h, l: local(h.at) }; })
      .filter(function (x) { return x.l && x.l.year === year; })
      .sort(function (a, b) { return a.h.at < b.h.at ? -1 : a.h.at > b.h.at ? 1 : 0; });
    // One per episode: a mistap corrected with 'edited' and re-marked leaves the same S·E twice,
    // and the later row is the one that stuck.
    var lastOf = {};
    log.forEach(function (x, i) { if (EPISODE_ACTIONS[x.h.action]) lastOf[x.h.id + '|' + x.h.season + '|' + x.h.ep] = i; });
    var eps = log.filter(function (x, i) { return lastOf[x.h.id + '|' + x.h.season + '|' + x.h.ep] === i; });

    // Hours per episode from TV Time's own counters for the year (else all of them).
    var pe = 0, ph = 0, ae = 0, ah = 0;
    Object.keys(PACE).forEach(function (m) {
      ae += PACE[m][0]; ah += PACE[m][1];
      if (+m.slice(0, 4) === year) { pe += PACE[m][0]; ph += PACE[m][1]; }
    });
    var hrsPerEp = pe ? ph / pe : ah / ae;

    // Month by month: export counters, plus logged episodes.
    var months = MONTHS.map(function (name, i) {
      var key = year + '-' + String(i + 1).padStart(2, '0');
      var p = PACE[key];
      return { name: name, short: name.slice(0, 3), eps: p ? p[0] : 0, hours: p ? p[1] : 0, export: !!p, logged: 0 };
    });
    eps.forEach(function (x) { months[x.l.month].eps++; months[x.l.month].logged++; months[x.l.month].hours += hrsPerEp; });
    var total = 0, hours = 0;
    months.forEach(function (m) { total += m.eps; hours += m.hours; });
    var busiest = null;
    months.forEach(function (m) { if (m.eps && (!busiest || m.eps > busiest.eps)) busiest = m; });

    // Per show (logged part only).
    var perShow = {};
    eps.forEach(function (x) {
      var id = x.h.id;
      if (!perShow[id]) perShow[id] = { id: id, t: title(id, x.h.title), eps: 0, last: x.h.at };
      perShow[id].eps++; perShow[id].last = x.h.at;
    });
    var top = Object.keys(perShow).map(function (k) { return perShow[k]; })
      .sort(function (a, b) { return b.eps - a.eps || (a.last < b.last ? 1 : -1); });

    // Every show she watched any of this year: the export's lastWatched for the first half,
    // the log after it.
    var watchedIds = {};
    shows.forEach(function (g) { if (String(g.lastWatched || '').slice(0, 4) === String(year)) watchedIds[g.id] = 1; });
    eps.forEach(function (x) { watchedIds[x.h.id] = 1; });
    all.forEach(function (g) { if (String(g.lastWatched || '').slice(0, 4) === String(year)) watchedIds[g.id] = 1; });
    var showCount = Object.keys(watchedIds).length;

    // Finished: archived with this year's stamp, or a 'finished' row this year.
    var finished = {}, fin = [];
    all.forEach(function (g) {
      if (g.s === 'done' && g.cy === year) finished[g.id] = { id: g.id, t: g.t, month: g.cm };
    });
    log.forEach(function (x) {
      if (x.h.action === 'finished' && !finished[x.h.id] && byId[x.h.id] && byId[x.h.id].s === 'done')
        finished[x.h.id] = { id: x.h.id, t: title(x.h.id, x.h.title), month: x.l.month };
    });
    Object.keys(finished).forEach(function (k) { fin.push(finished[k]); });
    fin.sort(function (a, b) { return (a.month == null ? 99 : a.month) - (b.month == null ? 99 : b.month); });

    // Started this year (a start date in the year).
    var started = all.filter(function (g) { return String(g.start || '').slice(0, 4) === String(year); })
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; })
      .map(function (g) { return { id: g.id, t: g.t, start: g.start }; });

    // Biggest binge: most episodes of one show on one local day (before 4 AM counts as the night
    // before). The log's first day is skipped: it holds catch-up taps for episodes seen earlier.
    var dayShow = {}, binge = null;
    eps.forEach(function (x) {
      var day = x.l.hour < 4 ? addDays(x.l.date, -1) : x.l.date;
      if (day <= LOG_START) return;
      var k = day + '|' + x.h.id;
      dayShow[k] = (dayShow[k] || 0) + 1;
      if (!binge || dayShow[k] > binge.eps) binge = { id: x.h.id, t: title(x.h.id, x.h.title), eps: dayShow[k], date: day };
    });

    // Longest run of days with an episode.
    var days = {};
    eps.forEach(function (x) { days[x.l.hour < 4 ? addDays(x.l.date, -1) : x.l.date] = 1; });
    var dl = Object.keys(days).sort(), streak = null, run = 0, from = null;
    dl.forEach(function (d, i) {
      if (i && addDays(dl[i - 1], 1) === d) run++; else { run = 1; from = d; }
      if (!streak || run > streak.days) streak = { days: run, from: from, to: d };
    });

    // When she watches.
    var night = 0, hours24 = new Array(24).fill(0), wd = new Array(7).fill(0);
    eps.forEach(function (x) {
      hours24[x.l.hour]++; wd[x.l.weekday]++;
      if (x.l.hour >= 22 || x.l.hour < 4) night++;
    });
    var peakHour = eps.length ? hours24.indexOf(Math.max.apply(null, hours24)) : null;
    var favDay = eps.length ? wd.indexOf(Math.max.apply(null, wd)) : null;
    var clock = eps.length ? { nightShare: night / eps.length, peakHour: peakHour, peakLabel: hourLabel(peakHour),
      favDay: favDay, favDayName: DAYS[favDay], weekdays: wd, hours: hours24 } : null;

    // Services, by logged episodes.
    var svc = {}, svcList = [];
    eps.forEach(function (x) {
      var s = serviceOf(meta[x.h.id] || (byId[x.h.id] && byId[x.h.id].tmdb && byId[x.h.id].tmdb.meta));
      if (s) svc[s] = (svc[s] || 0) + 1;
    });
    Object.keys(svc).forEach(function (k) { svcList.push({ name: k, eps: svc[k] }); });
    svcList.sort(function (a, b) { return b.eps - a.eps; });

    // Caught up and waiting: shows still airing where she's seen the newest episode (and the next
    // one hasn't aired yet, in case show-meta.json is a day behind).
    var today = isoDay(opts.now || new Date());
    var waiting = all.filter(function (g) {
      var m = meta[g.id];
      if (g.s !== 'watching' || !m || !m.lastAired || !/returning/i.test(m.status || '')) return false;
      if (!watchedIds[g.id]) return false;
      if (m.nextAir && m.nextAir.airDate && m.nextAir.airDate <= today) return false;
      return g.season > m.lastAired.season || (g.season === m.lastAired.season && g.ep >= m.lastAired.ep);
    }).map(function (g) { return { id: g.id, t: g.t, next: meta[g.id].nextAir || null }; });

    var loggedHours = eps.length * hrsPerEp;
    var stats = {
      year: year, through: eps.length ? eps[eps.length - 1].l.date : null, logStart: LOG_START,
      episodes: total, hours: Math.round(hours), hrsPerEp: hrsPerEp, loggedEpisodes: eps.length,
      months: months, busiest: busiest, topShows: top.slice(0, 5), showCount: showCount,
      finished: fin, started: started, binge: binge, streak: streak, clock: clock,
      services: svcList, waiting: waiting,
      lifetime: { hours: Math.round(LIFETIME.hours + (year >= 2026 ? loggedHours : 0)), since: LIFETIME.since }
    };
    stats.persona = persona(stats);
    return stats;
  }
  function isoDay(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function hourLabel(h) {
    if (h == null) return null;
    var a = h % 12 || 12, b = (h + 1) % 12 || 12;
    return a + (h < 12 ? 'am' : 'pm') + '–' + b + ((h + 1) % 24 < 12 ? 'am' : 'pm');
  }

  // ---- persona: whichever trait clears its bar by the most, with the number behind it
  var PERSONAS = [
    { id: 'marathon', name: 'The Marathoner', mask: false,
      score: function (s) { return s.binge ? s.binge.eps / 4 : 0; },
      why: function (s) { return s.binge.eps + ' episodes of ' + s.binge.t + ' in one sitting.'; },
      line: 'One more episode? As you wish. And another. And another.' },
    { id: 'night', name: 'The Midnight Watcher', mask: true,
      score: function (s) { return s.clock && s.loggedEpisodes >= 10 ? s.clock.nightShare / 0.35 : 0; },
      why: function (s) { return Math.round(s.clock.nightShare * 100) + '% of your episodes were watched after 10 PM.'; },
      line: 'You do your best watching in the dark, behind a mask, while the house sleeps.' },
    { id: 'finisher', name: 'The Finisher', mask: false,
      score: function (s) { return s.finished.length / 3; },
      why: function (s) { return s.finished.length + ' shows watched all the way to the end.'; },
      line: 'You never leave a story unfinished. A rare and noble quality.' },
    { id: 'explorer', name: 'The Explorer', mask: false,
      score: function (s) { return s.started.length / 10; },
      why: function (s) { return s.started.length + ' new shows started this year.'; },
      line: 'Every new show is a voyage. You set sail more than most.' },
    { id: 'devoted', name: 'The Devoted', mask: false,
      score: function (s) { return s.topShows[0] && s.loggedEpisodes >= 10 ? (s.topShows[0].eps / s.loggedEpisodes) / 0.25 : 0; },
      why: function (s) { return Math.round(s.topShows[0].eps / s.loggedEpisodes * 100) + '% of your episodes were ' + s.topShows[0].t + '.'; },
      line: 'When you love a show, you love it truly. That is not something you find every day.' }
  ];
  function persona(s) {
    var best = null, bestScore = 1;
    PERSONAS.forEach(function (p) {
      var sc = p.score(s);
      if (sc >= bestScore) { best = p; bestScore = sc; }
    });
    if (!best) return { id: 'couch', name: 'The Couch Companion', mask: false, why: s.episodes + ' episodes, one cozy year.',
      line: 'Steady, faithful and always up for the next episode.' };
    return { id: best.id, name: best.name, mask: best.mask, why: best.why(s), line: best.line };
  }

  // The year to show by default: this one, except in January, when last year is the one to look back on.
  function defaultYear(now) {
    now = now || new Date();
    return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  }

  return { compute: compute, mergeProgress: mergeProgress, liveShows: liveShows, local: local,
    serviceOf: serviceOf, canonicalService: canonicalService, defaultYear: defaultYear, hourLabel: hourLabel,
    PACE: PACE, LOG_START: LOG_START, MONTHS: MONTHS, DAYS: DAYS, PERSONAS: PERSONAS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WrappedTV;
