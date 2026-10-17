// Westley, the farm boy who hosts Steph's TV log. Our own pixel character with short,
// original lines ("As you wish…" is the one catchphrase, "Inconceivable!" is used once per
// new-season drop). DOM-free on purpose so it can be unit-tested in Node (westley.test.mjs):
// index.html does the painting and the fetching, this file decides what he says and what the
// "Previously on…" recap is allowed to contain.
var Westley = (function () {
  var ASYOUWISH = 'As you wish…';
  var IDLE = [
    'Farm boy at your service. What shall we watch?',
    'Your list is waiting. Choose well.',
    'Nothing in the world beats the next episode.',
    'Pick a show, any show. I\'ll fetch the popcorn.'
  ];
  function line(kind, ctx) {
    ctx = ctx || {};
    switch (kind) {
      case 'watched': return ctx.mostly ? ASYOUWISH + ' Mostly finished, that one.' : ASYOUWISH;
      case 'started': return ASYOUWISH + ' A new story begins.';
      case 'finished': return ASYOUWISH + ' And that is a wrap.';
      case 'recap': return ASYOUWISH;
      case 'drop': return 'Inconceivable!';
      case 'mask': return 'A black mask. It suits you. (Tap me to wear it.)';
      default:
        if (ctx.nearly) return ctx.nearly + ' is mostly finished.';
        if (ctx.ready === 0) return 'All caught up. Rest, my love.';
        return IDLE[(ctx.seed || 0) % IDLE.length];
    }
  }
  // Fraction of a show she has watched, from episode counts by season ({"1":10,"2":8}) and her
  // position (the last episode she watched). null when the counts aren't known.
  function progress(counts, season, ep) {
    if (!counts || season == null || ep == null) return null;
    var total = 0, seen = 0;
    Object.keys(counts).forEach(function (s) {
      var n = counts[s]; total += n;
      if (+s < season) seen += n; else if (+s === season) seen += Math.min(ep, n);
    });
    return total ? seen / total : null;
  }
  function mostlyFinished(counts, season, ep) {
    var p = progress(counts, season, ep);
    return p != null && p >= 0.9 && p < 1;
  }
  // The recap: ONLY the episode she last watched (season, ep). The next episode is never read,
  // so its overview cannot leak whatever the cache holds. eps is the cached list for that season:
  // [{ep, name, overview, airDate}, ...]. Returns null when there is nothing safe to say.
  function recap(eps, season, ep) {
    if (!Array.isArray(eps)) return null;
    var e = null;
    for (var i = 0; i < eps.length; i++) if (eps[i] && eps[i].ep === ep) { e = eps[i]; break; }
    if (!e || !e.overview || !String(e.overview).trim()) return null;
    var text = String(e.overview).replace(/\s+/g, ' ').trim();
    if (text.length > 420) {
      var cut = text.slice(0, 420), dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      text = dot > 150 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…';
    }
    return { season: season, ep: ep, name: e.name || null, text: text };
  }
  // 16x22 pixels, our own art, redrawn 2026-10-16 when Jonny said the first one didn't look like him.
  // The farm boy: sandy, wavy hair, a loose cream shirt with a laced V, brown breeches, boots.
  // h/H hair, s skin, S shade, e eyes, K outline, w/W shirt, v laces, p/P breeches, b boots.
  var GRID = [
    '.....hhhhhh.....', '....hhHhhhHh....', '...hhhhhhhhhh...', '...hhssssssKh...',
    '...hssssssssKh..', '...hssesssesKh..', '....KssssssK....', '....KsSSSSsK....',
    '.....KssssK.....', '...KKKKKKKKKK...', '.KwwwwwssvWWWWK.', '.KwwwwwwvwWWWWK.',
    '.KwwwwwvwvWWWWK.', '.KwwwwwwwwWWWWK.', '.KwwwwwwwwWWWWK.', '.sswwwwwwwWWWss.',
    '...KppppppPPK...', '....ppppppPP....', '....ppppppPP....', '....ppppppPP....',
    '...bbbb.bbbb....', '..bbbbb.bbbbb...'
  ];
  // The mask look is the Dread Pirate Roberts: the same silhouette in black with a grey edge (so he
  // shows on the dark page), a black head wrap and eye mask, a thin moustache, gloves, a rapier.
  // m/M black, G grey edge, E eyes behind the mask, n moustache, g the rapier.
  var DPR = [
    '....GmmmmmmG....', '...GmmmmmmmmG...', '..GmmmmmmmmmmG..', '..GmmmmmmmmmmG..',
    '..GmmmmmmmmmmmG.', '...msmEmmmEmGm..', '....GssssssG....', '....GsnnnnnG....',
    '.....GssssG.....', '...GGGGGGGGGG...', '.GmmmmmsssMMMMG.', '.GmmmmmmsmMMMMG.',
    '.GmmmmmsmsMMMMGg', '.GmmmmmmmmMMMMgg', '.GmmmmmmmmMMMMGg', '.mmmmmmmmmMMMmmg',
    '...GmmmmmmmmG..g', '....mmmmmmmm...g', '....mmmmmmmm...g', '....mmmmmmmm...g',
    '...bbbb.bbbb...g', '..bbbbb.bbbbb..g'
  ];
  var PAL = { K: '#1d1a17', h: '#c79a55', H: '#a07638', s: '#f0c8a0', S: '#d6a77c', e: '#2b2418',
    w: '#efe6cf', W: '#cfc3a3', v: '#7a5232', p: '#6b4f34', P: '#4f3a26', b: '#3a2a1c',
    m: '#1b1b20', M: '#33333b', G: '#7c7c8c', E: '#f4f4f4', n: '#5a3c22', g: '#9aa3b2' };
  function grid(masked) { return masked ? DPR : GRID; }
  function svg(masked, scale) {
    scale = scale || 2;
    var rects = '';
    grid(masked).forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var c = row.charAt(x); if (c === '.') continue;
        rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + PAL[c] + '"/>';
      }
    });
    return '<svg class="westley-sprite" viewBox="0 0 16 22" width="' + 16 * scale + '" height="' + 22 * scale +
      '" shape-rendering="crispEdges" aria-hidden="true">' + rects + '</svg>';
  }
  return { line: line, progress: progress, mostlyFinished: mostlyFinished, recap: recap, grid: grid, svg: svg,
    GRID: GRID, ASYOUWISH: ASYOUWISH, IDLE: IDLE };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Westley;
