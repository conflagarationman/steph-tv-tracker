// A hidden Korok. Tap it and it says "Yahaha! You found me!". Self-contained: no dependencies, no
// network, original leaf-sprite art. Include with one tag, e.g.
//   <script src="korok.js" data-id="index" data-repo="game-tracker" data-total="4"
//           data-style="margin:0 0 0 12%"></script>
// data-id names this spot, data-repo + data-total drive the "n/total found" count (localStorage,
// per repo), data-style places it (it sits in a short strip at the end of the page, half hidden).
(function () {
  var s = document.currentScript; if (!s || document.getElementById('korok-spot')) return;
  var id = s.getAttribute('data-id') || 'page', repo = s.getAttribute('data-repo') || 'site';
  var total = parseInt(s.getAttribute('data-total'), 10) || 1, key = 'korok:' + repo;
  function load() { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(key, JSON.stringify(a)); } catch (e) {} }
  function build() {
    var st = document.createElement('style');
    st.textContent = '#korok-spot{height:22px;overflow:hidden;line-height:0;position:relative;z-index:5}' +
      '#korok-btn{all:unset;display:inline-block;cursor:pointer;width:34px;height:34px;opacity:.9;transition:transform .2s}' +
      '#korok-btn:hover{transform:translateY(-3px)}#korok-btn:focus-visible{outline:2px solid #c8f542;outline-offset:2px}' +
      '#korok-btn.hop{animation:korok-hop .5s ease-out}' +
      '@keyframes korok-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-12px) rotate(-8deg)}70%{transform:translateY(-3px)}}' +
      '#korok-say{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#fffbe8;color:#2b3a1c;' +
      'font:600 14px/1.3 system-ui,sans-serif;padding:9px 14px;border-radius:14px;border:2px solid #6aa84f;' +
      'box-shadow:0 4px 14px #0006;z-index:99999;max-width:80vw;text-align:center}' +
      '#korok-say[hidden]{display:none}' +
      '@media (prefers-reduced-motion:reduce){#korok-btn,#korok-btn.hop{animation:none;transition:none}}';
    document.head.appendChild(st);
    var wrap = document.createElement('div'); wrap.id = 'korok-spot';
    wrap.setAttribute('style', s.getAttribute('data-style') || '');
    var b = document.createElement('button'); b.id = 'korok-btn'; b.type = 'button';
    b.setAttribute('aria-label', 'A hidden Korok. Activate to find it.');
    b.innerHTML = '<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">' +
      '<path d="M17 2c-6 0-11 4-11 9 4-1 8 0 11 3 3-3 7-4 11-3 0-5-5-9-11-9z" fill="#5fa84a"/>' +
      '<path d="M17 4c-2 2-3 5-3 9h6c0-4-1-7-3-9z" fill="#86c765"/>' +
      '<circle cx="17" cy="21" r="11" fill="#e9e2c8"/>' +
      '<circle cx="12.5" cy="20" r="2" fill="#2b2418"/><circle cx="21.5" cy="20" r="2" fill="#2b2418"/>' +
      '<ellipse cx="17" cy="26" rx="2" ry="2.4" fill="#2b2418"/></svg>';
    var say = document.createElement('div'); say.id = 'korok-say'; say.hidden = true;
    say.setAttribute('role', 'status');
    var timer;
    b.addEventListener('click', function () {
      var f = load(), again = f.indexOf(id) >= 0;
      if (!again) { f.push(id); save(f); }
      say.textContent = (again ? 'Yahaha! You found me again!' : 'Yahaha! You found me!') + ' (' + f.length + '/' + total + ' Koroks found)';
      say.hidden = false; clearTimeout(timer); timer = setTimeout(function () { say.hidden = true; }, 3200);
      b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
    });
    wrap.appendChild(b); document.body.appendChild(wrap); document.body.appendChild(say);
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
