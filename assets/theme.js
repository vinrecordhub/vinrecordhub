// assets/theme.js — theme toggle behavior. The pre-paint snippet in each
// page's <head> sets data-theme before first paint; this file only handles
// user interaction after load. Manual choice persists in localStorage and
// overrides the OS preference; with no stored choice we follow the OS live.

(function () {
  var KEY = 'vrh-theme';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f1e9d9' : '#12171e');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    });
    window.dispatchEvent(new CustomEvent('vrh-theme', { detail: { theme: theme } }));
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = current() === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, next); } catch (err) { /* private mode */ }
    apply(next);
  });

  var mq = window.matchMedia('(prefers-color-scheme: light)');
  var onOsChange = function (e) {
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (err) { /* private mode */ }
    if (!stored) apply(e.matches ? 'light' : 'dark');
  };
  if (mq.addEventListener) mq.addEventListener('change', onOsChange);

  apply(current());
})();
