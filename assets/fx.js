// assets/fx.js — cursor-glow cards + typewriter tagline (vanilla ports of
// BorderGlow / TextType). Loaded deferred; all effects are decorative and
// disabled for reduced-motion users.

(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // BorderGlow: track the pointer per card via CSS custom properties.
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    var raf = null;
    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.glow-card');
      if (!card || raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        var r = card.getBoundingClientRect();
        card.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%');
        card.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%');
      });
    }, { passive: true });
  }

  // TextType: <span data-typetext='["a","b"]'></span> followed by .type-caret.
  document.querySelectorAll('[data-typetext]').forEach(function (el) {
    var phrases;
    try { phrases = JSON.parse(el.getAttribute('data-typetext')); } catch (e) { return; }
    if (!Array.isArray(phrases) || !phrases.length) return;

    if (reduced) {
      el.textContent = phrases[0];
      var caret = el.parentElement && el.parentElement.querySelector('.type-caret');
      if (caret) caret.remove();
      return;
    }

    var pi = 0, ci = 0, deleting = false;
    (function tick() {
      var phrase = phrases[pi];
      if (!deleting) {
        ci++;
        el.textContent = phrase.slice(0, ci);
        if (ci === phrase.length) { deleting = true; return void setTimeout(tick, 2100); }
        setTimeout(tick, 52 + Math.random() * 40);
      } else {
        ci--;
        el.textContent = phrase.slice(0, ci);
        if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; return void setTimeout(tick, 420); }
        setTimeout(tick, 26);
      }
    })();
  });
})();
