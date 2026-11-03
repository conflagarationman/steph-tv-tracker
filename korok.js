// Hidden Koroks, and Hestu, who pays them off. Tap a Korok and it says "Yahaha! You found me!".
// Self-contained: no dependencies, no network, our own pixel art. Include with one tag, e.g.
//   <script src="korok.js" data-repo="game-tracker" data-total="12"
//           data-spots="index:8%,index-hang:44%:top,index-end:90%">   (a script tag, closed as usual)
// Each spot is `id:left[:top]`: a Korok in the strip at the end of the page at `left`, or (with
// `:top`) one peeking down from the very top. Finds are stored as `repo/id` under ONE key, so the
// sites on the same origin share a count (github.io: key korok:all, 12 spots across the tracker,
// the owl and Steph's log; the hub keeps its own with data-key="korok:hub-all" and
// data-legacy="korok:home-hub" -- older per-repo keys are folded in, never deleted).
// Hestu dances at 3 seeds, 6 seeds and all of them; six unlocks the "Korok Forest" theme, toggled
// from the seed counter at the foot of the page. Optional data-forest="--bg:...;" replaces the
// theme's CSS variables for a site with different variable names.
// The first block is DOM-free and unit-tested in Node (scripts/korok.test.mjs); this file is
// copied verbatim into steph-tv-tracker, and its hub twin lives in home-hub's status_server.py.
var KorokCore = (function () {
  var MILESTONES = [3, 6];
  function parseSpots(str) {
    return String(str || '').split(',').map(function (p) {
      var a = p.trim().split(':');
      return a[0] ? { id: a[0], left: a[1] || '10%', top: a[2] === 'top' } : null;
    }).filter(Boolean);
  }
  function uniq(a) { return a.filter(function (x, i) { return typeof x === 'string' && a.indexOf(x) === i; }); }
  function readList(storage, key) {
    try { var v = JSON.parse(storage.getItem(key)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  // Current finds for a realm: the shared key plus any older per-repo keys, ids qualified as
  // `repo/id`. Writes back only when migration actually added something.
  function load(storage, key, legacyKeys) {
    var cur = readList(storage, key), all = cur.slice();
    (legacyKeys || []).forEach(function (lk) {
      var repo = lk.replace(/^korok:/, '');
      readList(storage, lk).forEach(function (id) {
        if (typeof id === 'string') all.push(id.indexOf('/') < 0 ? repo + '/' + id : id);
      });
    });
    all = uniq(all);
    if (all.length !== uniq(cur).length) {
      try { storage.setItem(key, JSON.stringify(all)); } catch (e) {}
    }
    return all;
  }
  function add(storage, key, found, qid) {
    if (found.indexOf(qid) >= 0) return { found: found, isNew: false };
    var next = found.concat(qid);
    try { storage.setItem(key, JSON.stringify(next)); } catch (e) {}
    return { found: next, isNew: true };
  }
  // Which Hestu visit (if any) does reaching `count` earn? `seen` are milestones already shown.
  function milestone(count, total, seen) {
    var hits = MILESTONES.concat(total).filter(function (n) { return n <= total; });
    if (hits.indexOf(count) < 0 || (seen || []).indexOf(count) >= 0) return null;
    return { n: count, kind: count === total ? 'all' : count === 3 ? 'three' : 'six', unlock: count >= 6 };
  }
  function seedsLabel(found, total) { return 'Seeds: ' + Math.min(found.length, total) + '/' + total; }
  function forestUnlocked(found, total) { return found.length >= Math.min(6, total); }
  var LINES = {
    three: 'Shaka-laka! Your seed pouch grows!',
    six: 'Whoa-ho, six seeds! Hestu shakes it for you!',
    all: 'Every last seed! Shaka-laka-LAKA!'
  };
  var UNLOCK = ' I grew you a Korok Forest: find the leaf at the foot of the page.';
  // The sprites. Jonny's verdict on the first ones (2026-10-16): none looked like the real thing, so
  // they were redrawn after references he sent, in our own pixels.
  // Korok, Wind Waker style: a bark cloak whose top corners rise into twig horns, camo blotches, a
  // fringed hem, and a heart-shaped leaf mask with slanted eyes. 16x26. Three colourways; each
  // hiding spot always gets the same one (variantFor). A = cloak, a/X = its blotches, L/l/D = leaf,
  // o = eye and mouth holes, t = twig tips.
  var KOROK = [
    '..t..........t..', '...t........t...', '...DDD....DDD...', '..DllLDDDDLllD..',
    '.DlLLLLLDLLLLlD.', '.DLLLLLLLLLLLLD.', '.DLLwoLLLLwoLLD.', '.DDLooLLLLooLDD.',
    '...DLLLLLLLLD...', '...XDLLooLLDA...', '...AADLLLLDAX...', '...AAXDLLDAXX...',
    '.ttAAXXDDAAXXtt.', 't..AAAAAAAAAA..t', '..AAAAAAAAAAAA..', '..AAAAAAAAAAAA..',
    '..XAAAAXXAAAAX..', '..XXAAAAXXAAAA..', '..XXAAAAXXAAAA..', '..AAA..AA..AAA..',
    '...a...aa...a...'
  ];
  var KOROK_PAL = { o: '#1a1510', t: '#4a3626', w: '#f6f3e4' };
  var KOROK_LOOKS = [
    { L: '#4f9a32', l: '#8fd055', D: '#2b5e1c', A: '#7a5a40', a: '#5c4230', X: '#3e2c20' },   // green leaf, brown bark
    { L: '#b8344a', l: '#e0707e', D: '#6e1a2a', A: '#8cc3c6', a: '#6aa3a8', X: '#4c7e84' },   // red leaf, pale-blue bark
    { L: '#d9b22e', l: '#f2dc78', D: '#8a6a10', A: '#5d8c48', a: '#456f36', X: '#30522a' }    // yellow leaf, green bark
  ];
  function variantFor(id) {
    var h = 0, s = String(id || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % KOROK_LOOKS.length;
  }
  function rects(rows, pal) {
    var out = '';
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var c = row.charAt(x); if (c === '.') continue;
        out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + pal[c] + '"/>';
      }
    });
    return out;
  }
  function korokSvg(look) {
    var pal = {}, k; var v = KOROK_LOOKS[look] || KOROK_LOOKS[0];
    for (k in KOROK_PAL) pal[k] = KOROK_PAL[k];
    for (k in v) pal[k] = v[k];
    return '<svg viewBox="0 0 16 21" width="26" height="34" shape-rendering="crispEdges" aria-hidden="true">' +
      rects(KOROK, pal) + '</svg>';
  }
  // Hestu: a tall pale bark body, a bonsai crown, a small green leaf face on his chest, a brown sash,
  // red maracas. 26x29. m = maraca, W = its shine, h = handle (they shake); the rest sways.
  var HESTU = [
    '.............ttttt........', '......tttttttttttttt......', '.....ttttttGGgGGgGGttt....',
    '....GGgGGgGGgGGgGGgGGgGG..', '.....nnnnnnnnnnnngGGgGGg..', '......t.nn...TT....nnn....',
    '....ttttt...TT............', '....GgGGg..TT.............', '....gGGgG...TT............',
    '.mm..nnnKCCCCCCCcK.....mm.', 'mWmm....KCCCCCCCcK....mmWm', 'mmmm...KCCCCCCCCssK...mmmm',
    '.mm...KCCCCCsssscccK...mm.', '..h...KCsssffFFCcccK...h..', '..hCCCKsCCCffFFCcccKCCCh..',
    '......CCCCffoFoFccCC......', '.....KCCCCCffFFCssssK.....', '.....KCCCCCffoFsccccK.....',
    '.....KCCssssCCCCccccK.....', '.....KssCCCCCCCCccccK.....', '.....KCbbbbbbbCCcccBB.....',
    '....KCCCCCCCCCbbbbbbBK....', '....KCCCCCCCssssccccbK....', '....KCCCssssCCCCcccccK....',
    '....KsssCCCCCCCCcccccK....', '...KCCCCCCCCCCCCccccssK...', '...KCCCCCCCCCCCCssssccK...',
    '........CCC....CCC........', '........KKK....KKK........'
  ];
  var PAL = { K: '#3a2f22', C: '#efe2bc', c: '#d6c497', s: '#b9a274', G: '#2f7a2e', g: '#4f9a3a', t: '#7fb84a',
    n: '#1f5a24', F: '#3e9a36', f: '#86cc56', o: '#1d3a18', b: '#6b4126', B: '#4c2c18', m: '#c8323a',
    W: '#ffe9e0', h: '#e8d7b0', T: '#a8875a' };
  function hestuSvg() {
    var body = [], l = [], r = [];
    HESTU.forEach(function (row, y) {
      var rest = '', left = '', right = '';
      for (var x = 0; x < row.length; x++) {
        var c = row.charAt(x);
        var keep = 'mWh'.indexOf(c) >= 0 ? '.' : c, shake = 'mWh'.indexOf(c) >= 0 ? c : '.';
        rest += keep; left += x < 13 ? shake : '.'; right += x >= 13 ? shake : '.';
      }
      body.push(rest); l.push(left); r.push(right);
    });
    return '<svg viewBox="0 0 26 29" width="78" height="87" shape-rendering="crispEdges" aria-hidden="true">' +
      '<g class="hs-body">' + rects(body, PAL) + '<g class="hs-l">' + rects(l, PAL) + '</g><g class="hs-r">' +
      rects(r, PAL) + '</g></g></svg>';
  }
  // ─── Forest skins (the shop's "Hestu's maracas") ───
  // Palettes layered on the Korok Forest theme, chosen with the localStorage key <key>:skin. The
  // page that sells them decides what is owned; here a skin is only ever a name. Blood Moon is
  // red and only shows on full-moon days, worked out locally from the mean lunar cycle.
  var SKINS = {
    autumn: '--bg:#1c120a;--surface:#2a1b0f;--surface2:#382414;--border:#4a3119;--border2:#63421f;' +
      '--text:#f7e8cf;--muted:#c9a77a;--dim:#8f7350;--accent:#f0a030;--yellow:#f4c95d;--blue:#d98a4a;',
    lostwoods: '--bg:#0a1412;--surface:#10201d;--surface2:#172b27;--border:#1f3a35;--border2:#2a4d46;' +
      '--text:#dff0ea;--muted:#86aaa2;--dim:#56776f;--accent:#7fe0c0;--yellow:#b8e6a0;--blue:#6fc8d8;',
    bloodmoon: '--bg:#14080a;--surface:#220e11;--surface2:#2e1317;--border:#44191f;--border2:#5e2229;' +
      '--text:#f6dcd8;--muted:#c28a86;--dim:#855553;--accent:#ff5a4d;--yellow:#ffa07a;--blue:#d9728a;'
  };
  var SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  // Days since the last new moon (0..29.53) at a Date, by the mean cycle.
  function moonAge(d) { var x = (d.getTime() - NEW_MOON) / 86400000; return ((x % SYNODIC) + SYNODIC) % SYNODIC; }
  // Full moon "on" a date: within a day of full at that date's local noon, so a night is one or
  // two calendar days, never a week.
  function isFullMoon(d) {
    var noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    return Math.abs(moonAge(noon) - SYNODIC / 2) <= 1;
  }
  function skinActive(skin, d) { return !!SKINS[skin] && (skin !== 'bloodmoon' || isFullMoon(d)); }
  return { parseSpots: parseSpots, load: load, add: add, milestone: milestone, seedsLabel: seedsLabel,
    forestUnlocked: forestUnlocked, LINES: LINES, UNLOCK: UNLOCK, HESTU: HESTU, hestuSvg: hestuSvg,
    KOROK: KOROK, KOROK_LOOKS: KOROK_LOOKS, korokSvg: korokSvg, variantFor: variantFor,
    MILESTONES: MILESTONES, SKINS: SKINS, moonAge: moonAge, isFullMoon: isFullMoon, skinActive: skinActive };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KorokCore;

(function () {
  var s = typeof document !== 'undefined' && document.currentScript;
  if (!s || document.getElementById('korok-foot')) return;
  var repo = s.getAttribute('data-repo') || 'site', total = parseInt(s.getAttribute('data-total'), 10) || 1;
  var key = s.getAttribute('data-key') || 'korok:all';
  var legacy = (s.getAttribute('data-legacy') || 'korok:game-tracker,korok:steph-tv-tracker')
    .split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var spots = KorokCore.parseSpots(s.getAttribute('data-spots'));
  var store; try { store = window.localStorage; store.getItem(key); } catch (e) { store = { getItem: function () { return null; }, setItem: function () {} }; }
  var found = KorokCore.load(store, key, legacy);
  var FOREST = s.getAttribute('data-forest') ||
    '--bg:#0b1a10;--surface:#12261a;--surface2:#1a3324;--border:#24402f;--border2:#2f5640;' +
    '--text:#eaf5dc;--muted:#8fae8a;--dim:#5f7d5f;--accent:#9be15d;--yellow:#c9e87a;--blue:#7ad6a0;';
  var LEAF = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M3 21C3 9 11 3 21 3c0 10-6 18-18 18z' fill='%235fa84a' stroke='%23244d1c' stroke-width='1.5'/%3E%3Cpath d='M4 20L16 8' stroke='%2386c765' stroke-width='1.5'/%3E%3C/svg%3E\") 3 21, auto";
  function forestOn() { try { return store.getItem(key + ':forest') === '1'; } catch (e) { return false; } }
  function applyForest() {
    var on = forestOn() && KorokCore.forestUnlocked(found, total);
    document.documentElement.classList.toggle('korok-forest', on);
    var skin = ''; try { skin = store.getItem(key + ':skin') || ''; } catch (e) {}
    Object.keys(KorokCore.SKINS).forEach(function (k) {
      document.documentElement.classList.toggle('korok-skin-' + k, on && skin === k && KorokCore.skinActive(k, new Date()));
    });
    var t = document.getElementById('korok-forest-btn');
    if (t) { t.setAttribute('aria-pressed', on ? 'true' : 'false'); t.textContent = on ? '🍃 Korok Forest: on' : '🍃 Korok Forest: off'; }
  }
  var fs = document.createElement('style');
  fs.textContent = ':root.korok-forest,:root.korok-forest[data-theme="light"]{' + FOREST + '}' +
    'html.korok-forest body{cursor:' + LEAF + '}' +
    'html.korok-forest .glow{background:radial-gradient(60% 42% at 12% 0%,rgba(95,168,74,.22),transparent 62%),' +
    'radial-gradient(50% 36% at 88% 8%,rgba(155,225,93,.14),transparent 60%),linear-gradient(180deg,var(--bg),var(--bg-2,var(--bg)))}';
  Object.keys(KorokCore.SKINS).forEach(function (k) {
    fs.textContent += ':root.korok-forest.korok-skin-' + k + '{' + KorokCore.SKINS[k] + '}';
  });
  fs.textContent += 'html.korok-skin-lostwoods body::before,html.korok-skin-bloodmoon body::after{content:"";position:fixed;pointer-events:none;z-index:1}' +
    'html.korok-skin-lostwoods body::before{inset:0;background:radial-gradient(60% 40% at 20% 80%,rgba(200,240,230,.10),transparent 70%),' +
    'radial-gradient(50% 35% at 80% 70%,rgba(200,240,230,.08),transparent 70%)}' +
    'html.korok-skin-bloodmoon body::after{top:14px;right:18px;width:26px;height:26px;border-radius:50%;background:#c4372c;box-shadow:0 0 28px 8px rgba(255,70,50,.35)}' +
    '@media (prefers-reduced-motion:no-preference){html.korok-skin-lostwoods body::before{animation:korok-fog 18s ease-in-out infinite alternate}' +
    '@keyframes korok-fog{from{transform:translateX(-3%)}to{transform:translateX(3%)}}}';
  document.head ? document.head.appendChild(fs) : document.addEventListener('DOMContentLoaded', function () { document.head.appendChild(fs); });
  applyForest();
  window.KorokApply = applyForest; // the page that sells skins calls this after writing <key>:skin

  function build() {
    var st = document.createElement('style');
    st.textContent = '.korok-spot{height:22px;overflow:hidden;line-height:0;position:relative;z-index:5}' +
      '.korok-btn{all:unset;display:inline-block;cursor:pointer;width:34px;height:34px;opacity:.9;transition:transform .2s}' +
      '.korok-top .korok-btn{margin-top:-12px}' +
      // the ones at the top hang upside down, so it's the leaf face that peeks over the edge
      '.korok-top .korok-btn svg{transform:rotate(180deg)}' +
      '.korok-btn:hover{transform:translateY(-3px)}.korok-btn:focus-visible{outline:2px solid #c8f542;outline-offset:2px}' +
      '.korok-btn.hop{animation:korok-hop .5s ease-out}' +
      '@keyframes korok-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-12px) rotate(-8deg)}70%{transform:translateY(-3px)}}' +
      '#korok-say{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fffbe8;color:#2b3a1c;' +
      'font:600 14px/1.3 system-ui,sans-serif;padding:9px 14px;border-radius:14px;border:2px solid #6aa84f;' +
      'box-shadow:0 4px 14px #0006;z-index:99999;max-width:80vw;text-align:center}' +
      '#korok-say[hidden]{display:none}' +
      '#korok-foot{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center;padding:4px 12px 14px;' +
      'font:600 12px/1.2 system-ui,sans-serif;color:#8fae8a;position:relative;z-index:5}' +
      '#korok-foot[hidden]{display:none}' +
      '#korok-foot button{all:unset;cursor:pointer;padding:4px 10px;border:1px solid #5fa84a88;border-radius:99px;color:#86c765}' +
      '#korok-foot button:focus-visible{outline:2px solid #c8f542;outline-offset:2px}' +
      '#korok-foot button[hidden]{display:none}' +
      '#korok-hestu{position:fixed;left:10px;bottom:70px;z-index:99998;display:flex;align-items:flex-end;gap:8px;' +
      'max-width:calc(100vw - 20px);cursor:pointer;animation:hs-in .35s ease-out}' +
      '#korok-hestu[hidden]{display:none}' +
      '#korok-hestu .hs-bubble{background:#fffbe8;color:#2b3a1c;font:600 13px/1.35 system-ui,sans-serif;padding:8px 12px;' +
      'border-radius:14px 14px 14px 4px;border:2px solid #6aa84f;box-shadow:0 4px 14px #0006;max-width:220px;margin-bottom:46px}' +
      '#korok-hestu .hs-body{transform-origin:50% 100%;animation:hs-sway .5s steps(2,jump-none) infinite alternate}' +
      '#korok-hestu .hs-l,#korok-hestu .hs-r{transform-box:fill-box;transform-origin:50% 100%}' +
      '#korok-hestu .hs-l{animation:hs-shake .25s steps(2,jump-none) infinite alternate}' +
      '#korok-hestu .hs-r{animation:hs-shake .25s steps(2,jump-none) infinite alternate-reverse}' +
      '@keyframes hs-sway{from{transform:translateY(0) rotate(-3deg)}to{transform:translateY(-2px) rotate(3deg)}}' +
      '@keyframes hs-shake{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}' +
      '@keyframes hs-in{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}' +
      '@media (prefers-reduced-motion:reduce){.korok-btn,.korok-btn.hop{animation:none;transition:none}' +
      '#korok-hestu,#korok-hestu .hs-body,#korok-hestu .hs-l,#korok-hestu .hs-r{animation:none}}';
    document.head.appendChild(st);
    var say = document.createElement('div'); say.id = 'korok-say'; say.hidden = true;
    say.setAttribute('role', 'status');
    var foot = document.createElement('div'); foot.id = 'korok-foot'; foot.hidden = true;
    var cnt = document.createElement('span'); cnt.id = 'korok-seeds';
    var tog = document.createElement('button'); tog.id = 'korok-forest-btn'; tog.type = 'button'; tog.hidden = true;
    tog.addEventListener('click', function () {
      try { store.setItem(key + ':forest', forestOn() ? '0' : '1'); } catch (e) {}
      applyForest();
    });
    foot.appendChild(cnt); foot.appendChild(tog);
    function refresh() {
      foot.hidden = found.length < 1; cnt.textContent = KorokCore.seedsLabel(found, total);
      tog.hidden = !KorokCore.forestUnlocked(found, total); applyForest();
    }
    var timer, hestu, hTimer;
    function hestuVisit(m) {
      var seen = []; try { seen = JSON.parse(store.getItem(key + ':hestu')) || []; } catch (e) {}
      try { store.setItem(key + ':hestu', JSON.stringify(seen.concat(m.n))); } catch (e) {}
      if (!hestu) {
        hestu = document.createElement('div'); hestu.id = 'korok-hestu'; hestu.setAttribute('role', 'status');
        hestu.addEventListener('click', function () { hestu.hidden = true; });
        document.body.appendChild(hestu);
      }
      hestu.innerHTML = KorokCore.hestuSvg() + '<div class="hs-bubble"></div>';
      hestu.lastChild.textContent = KorokCore.LINES[m.kind] + (m.unlock ? KorokCore.UNLOCK : '');
      hestu.hidden = false; clearTimeout(hTimer); hTimer = setTimeout(function () { hestu.hidden = true; }, 8000);
    }
    spots.forEach(function (sp) {
      var wrap = document.createElement('div'); wrap.className = 'korok-spot' + (sp.top ? ' korok-top' : '');
      wrap.setAttribute('style', 'margin:0 0 0 ' + sp.left);
      var b = document.createElement('button'); b.className = 'korok-btn'; b.type = 'button';
      b.setAttribute('aria-label', 'A hidden Korok. Activate to find it.');
      b.innerHTML = KorokCore.korokSvg(KorokCore.variantFor(repo + '/' + sp.id));
      b.addEventListener('click', function () {
        var r = KorokCore.add(store, key, found, repo + '/' + sp.id); found = r.found;
        say.textContent = (r.isNew ? 'Yahaha! You found me!' : 'Yahaha! You found me again!') +
          ' (' + Math.min(found.length, total) + '/' + total + ' Koroks found)';
        say.hidden = false; clearTimeout(timer); timer = setTimeout(function () { say.hidden = true; }, 3200);
        b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
        refresh();
        if (r.isNew) {
          var seen = []; try { seen = JSON.parse(store.getItem(key + ':hestu')) || []; } catch (e) {}
          var m = KorokCore.milestone(found.length, total, seen);
          if (m) setTimeout(function () { say.hidden = true; hestuVisit(m); }, 900);
        }
      });
      wrap.appendChild(b);
      if (sp.top) document.body.insertBefore(wrap, document.body.firstChild); else document.body.appendChild(wrap);
    });
    document.body.appendChild(foot); document.body.appendChild(say);
    refresh();
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
