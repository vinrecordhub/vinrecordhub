/* VinRecordHub blog — 3D animated hero (vanilla three.js, no build step).
 * Loaded as an ES module; three.js comes from the CDN import map in the page.
 * Renders a themed, undulating point-field "data floor" behind each hero.
 * Degrades gracefully: if WebGL is unavailable the CSS gradient hero remains. */
import * as THREE from 'three';

const THEME  = { alt:0xff8a3d, aff:0x2fd47a, veh:0x4aa3ff, vin:0xb46cff, rev:0xff5a4d, idx:0xff8a3d };
const THEME2 = { idx:0xb46cff }; // secondary color for the index (gradient field)
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

function initHero(canvas){
  const key = canvas.dataset.theme || 'alt';
  const colorA = new THREE.Color(THEME[key]  ?? THEME.alt);
  const colorB = new THREE.Color(THEME2[key] ?? THEME[key] ?? THEME.alt);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 2.2, 7);

  // Grid of points.
  const N = 56, SPREAD = 26, count = N * N;
  const base = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let i = 0;
  for (let xi = 0; xi < N; xi++) for (let zi = 0; zi < N; zi++){
    base[i*3]   = (xi/(N-1) - 0.5) * SPREAD;
    base[i*3+1] = 0;
    base[i*3+2] = (zi/(N-1) - 0.5) * SPREAD;
    const c = colorA.clone().lerp(colorB, zi/(N-1));
    colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size:0.075, vertexColors:true, transparent:true,
    opacity:0.92, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true });
  const pts = new THREE.Points(geo, mat);
  pts.rotation.x = -0.95; // tilt into a receding floor
  scene.add(pts);
  const pos = geo.attributes.position;

  // Pointer parallax.
  let tmx = 0, tmy = 0, mx = 0, my = 0;
  const onMove = e => {
    const r = canvas.getBoundingClientRect();
    tmx = ((e.clientX - r.left) / r.width  - 0.5) * 2;
    tmy = ((e.clientY - r.top)  / r.height - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive:true });

  function resize(){
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  let t = 0, raf = 0, running = false, visible = true;
  function frame(){
    t += 0.02;
    for (let k = 0; k < count; k++){
      const x = base[k*3], z = base[k*3+2];
      pos.array[k*3+1] = Math.sin(x*0.35 + t)*0.55 + Math.cos(z*0.4 + t*0.85)*0.55;
    }
    pos.needsUpdate = true;
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    pts.rotation.z = mx * 0.12;
    camera.position.x = mx * 0.6;
    camera.position.y = 2.2 - my * 0.3;
    camera.lookAt(0, 0, -2);
    renderer.render(scene, camera);
  }
  function tick(){ if (!visible || REDUCE){ running = false; return; } frame(); raf = requestAnimationFrame(tick); }
  function start(){ if (running || !visible || REDUCE) return; running = true; tick(); }

  // Pause when the hero scrolls out of view (saves battery/CPU).
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }, { threshold:0 });
  io.observe(canvas);

  if (REDUCE) frame(); else start();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf); running = false;
    ro.disconnect(); io.disconnect();
    window.removeEventListener('pointermove', onMove);
    geo.dispose(); mat.dispose(); renderer.dispose();
  }, { once:true });
}

document.querySelectorAll('canvas.hero3d').forEach(c => {
  try { initHero(c); } catch (e) { /* no WebGL — the gradient hero remains */ }
});
