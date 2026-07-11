// assets/fx-aurora.js — single WebGL aurora for the hero (vanilla port of the
// SoftAurora concept, no dependencies). Rules it must obey:
//   * one WebGL context, hero only, never blocks LCP (loads deferred, renders
//     only when the hero is on screen and the tab is visible)
//   * prefers-reduced-motion / Save-Data / no-WebGL -> removes itself; the
//     static .hero-aura CSS gradient underneath stays as the fallback
//   * colors come from theme tokens (--fx-aurora-*) and follow theme switches

(function () {
  var canvas = document.querySelector('[data-fx-aurora]');
  if (!canvas) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduced || saveData) { canvas.remove(); return; }

  var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) { canvas.remove(); return; }

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    'precision mediump float;',
    'uniform vec2 uRes;uniform float uT;uniform float uAlpha;',
    'uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uC3;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;',
    ' vec2 q=vec2(uv.x*1.6, uv.y*.9);',
    ' float t=uT*.045;',
    ' float band1=fbm(q*2.2+vec2(t*1.4, -t*.6));',
    ' float band2=fbm(q*1.7+vec2(-t, t*.8)+3.7);',
    ' float band3=fbm(q*2.8+vec2(t*.7, t*.4)+8.1);',
    ' float veil=smoothstep(.15,.85,uv.y);',
    ' vec3 col=uC1*pow(band1,2.2)*1.25+uC2*pow(band2,2.6)*.9+uC3*pow(band3,3.0)*.55;',
    ' float a=clamp((band1*.55+band2*.35+band3*.25),0.,1.)*veil*uAlpha;',
    ' gl_FragColor=vec4(col,a);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes');
  var uT = gl.getUniformLocation(prog, 'uT');
  var uAlpha = gl.getUniformLocation(prog, 'uAlpha');
  var uC = [gl.getUniformLocation(prog, 'uC1'), gl.getUniformLocation(prog, 'uC2'), gl.getUniformLocation(prog, 'uC3')];

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    for (var i = 0; i < 3; i++) {
      var raw = cs.getPropertyValue('--fx-aurora-' + (i + 1)).trim().split(/\s+/).map(Number);
      if (raw.length === 3 && raw.every(function (n) { return !isNaN(n); })) {
        gl.uniform3f(uC[i], raw[0] / 255, raw[1] / 255, raw[2] / 255);
      }
    }
    var alpha = parseFloat(cs.getPropertyValue('--fx-aurora-alpha')) || 0.5;
    gl.uniform1f(uAlpha, alpha);
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    var w = Math.round(canvas.clientWidth * dpr);
    var h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  }

  var running = false;
  var visible = false;
  var start = performance.now();

  function frame(now) {
    if (!running) return;
    resize();
    gl.uniform1f(uT, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) requestAnimationFrame(frame);
  }

  var io = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    setRunning(visible && !document.hidden);
  }, { threshold: 0.01 });
  io.observe(canvas);

  document.addEventListener('visibilitychange', function () {
    setRunning(visible && !document.hidden);
  });
  window.addEventListener('vrh-theme', readColors);
  window.addEventListener('resize', resize);

  readColors();
  resize();
})();
