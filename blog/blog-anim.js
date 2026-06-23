/* VinRecordHub blog — scroll-reveal motion (GSAP + ScrollTrigger from CDN globals).
 * Applies the gsap-scrolltrigger skill's batch + once pattern with a heavy fade-up.
 * Fails safe: if GSAP is missing or reduced-motion is on, content stays fully visible. */
(function () {
  if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  var items = gsap.utils.toArray('.reveal');
  if (!items.length) return;

  // Hidden start state (set in JS so non-JS / reduced-motion users always see content).
  gsap.set(items, { opacity: 0, y: 30, filter: 'blur(6px)' });

  // Heavy, GPU-safe fade-up — revealed in staggered batches as they enter the viewport.
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: function (batch) {
      gsap.to(batch, {
        opacity: 1, y: 0, filter: 'blur(0px)',
        duration: 0.85, ease: 'power3.out', stagger: 0.09, overwrite: true
      });
    }
  });

  // Reveal anything already above the fold on load, and recompute after images/fonts settle.
  ScrollTrigger.refresh();
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
