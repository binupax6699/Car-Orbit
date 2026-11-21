export const ORBY_COLORS = [
  '#e4c57c',
  '#f1a335',
  '#cc419e',
  '#352fd3',
  '#4b99dd',
  '#dac88b',
];

const BASE_SPEED = 2;
const EXCITE_SPEED = 4;
const REACH_PX = 230;
const MAX_DPR = 2;

const VERT = `
attribute vec2 a;
varying vec2 vUv;
void main() {
  vUv = a * 0.5 + 0.5;
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform float uPhase;
uniform float uExcite;
uniform float uGlint;
uniform vec2 uPos[6];
uniform vec3 uC0, uC1, uC2, uC3, uC4, uC5;

// liquid domain warp
vec2 warpField(vec2 p, float t) {
  vec2 w1 = vec2(
    sin(p.y * 3.8 + t * 1.5) + cos(p.x * 2.4 - t * 1.1),
    cos(p.x * 3.8 - t * 1.3) + sin(p.y * 2.4 + t * 1.2)
  ) * 0.065;
  vec2 w2 = vec2(
    sin((p.x + p.y) * 5.0 - t * 1.9),
    cos((p.x - p.y) * 5.0 + t * 1.7)
  ) * 0.025;
  return w1 + w2;
}

// blend the six colors by distance to the blob centers (centers come from JS)
vec3 liquid(vec2 q, float s2) {
  vec2 d0 = q - uPos[0];
  vec2 d1 = q - uPos[1];
  vec2 d2 = q - uPos[2];
  vec2 d3 = q - uPos[3];
  vec2 d4 = q - uPos[4];
  vec2 d5 = q - uPos[5];

  float w0 = exp(-dot(d0, d0) / s2);
  float w1 = exp(-dot(d1, d1) / s2);
  float w2 = exp(-dot(d2, d2) / s2);
  float w3 = exp(-dot(d3, d3) / s2);
  float w4 = exp(-dot(d4, d4) / s2);
  float w5 = exp(-dot(d5, d5) / s2);

  float sumW = max(w0 + w1 + w2 + w3 + w4 + w5, 1e-4);
  vec3 col = (uC0 * w0 + uC1 * w1 + uC2 * w2 + uC3 * w3 + uC4 * w4 + uC5 * w5) / sumW;

  // bright ribbons where streams meet
  float density = clamp(sumW * 0.58, 0.0, 1.5);
  float caustic = smoothstep(0.65, 1.35, sumW) * 0.35;
  return col * (density + caustic);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float t = uPhase;

  // droplet edge with a slow breathing
  float baseR = 0.66 + 0.025 * uExcite + 0.008 * sin(t * 0.9);
  float wobble =
    0.016 * sin(ang * 3.0 + t * 2.0) +
    0.010 * cos(ang * 4.0 - t * 2.5) +
    0.005 * sin(ang * 6.0 + t * 3.1) +
    0.018 * uExcite * sin(ang * 5.0 - t * 3.4);
  float Rw = baseR + wobble;

  // 0 at the center, 1 at the rim
  float nr = clamp(r / max(Rw, 0.001), 0.0, 1.0);
  float inside = 1.0 - smoothstep(Rw - 0.012, Rw + 0.004, r);

  // glass refraction
  float refractFactor = 1.0 - 0.34 * pow(nr, 2.4);
  vec2 rp = p * refractFactor;

  float blobRadius = 0.31 + 0.06 * uExcite;
  float s2 = blobRadius * blobRadius;
  vec2 q = rp + warpField(rp, t);
  vec3 liquidCol = liquid(q, s2);

  // color split near the edge (skipped in the middle to save work)
  float edge3 = nr * nr * nr;
  if (nr > 0.45) {
    vec3 disp = liquid(q * 1.06, s2);
    liquidCol.r = mix(liquidCol.r, disp.r, edge3 * 0.45);
    liquidCol.b = mix(liquidCol.b, disp.b, edge3 * 0.45);
  }

  // glass depth
  float coreDepth = mix(0.42, 1.35, pow(nr, 1.6));
  float fresnel = pow(nr, 3.8) * inside;
  vec3 body = liquidCol * coreDepth * (0.95 + 0.45 * uExcite);

  // iridescent rim and glow
  float rimMixA = 0.5 + 0.5 * sin(ang * 2.0 + t * 1.4);
  float rimMixB = 0.5 + 0.5 * cos(ang * 3.0 - t * 1.0 + 1.2);
  vec3 rimTint = mix(uC3, uC4, rimMixA);
  rimTint = mix(rimTint, uC2, rimMixB * 0.5);
  rimTint = mix(rimTint, uC1, smoothstep(0.65, 1.0, rimMixA * rimMixB) * 0.55);

  float rd = abs(r - Rw) / 0.014;
  float sharpRim = exp(-rd * rd);
  float innerGlow = exp(-max(Rw - r, 0.0) * 8.5) * inside;

  float distOut = max(r - Rw, 0.0);
  float nearBloom = exp(-distOut * 7.5);
  float wideBloom = exp(-distOut * 3.6);
  float edgeFade = 1.0 - smoothstep(0.76, 1.0, r);
  float outerGlow = (nearBloom * 0.65 + wideBloom * 0.35) * edgeFade;

  // glass reflections
  float arc1 = max(0.0, cos(ang - uGlint));
  float b1 = (nr - 0.84) / 0.075;
  float specPrimary = pow(arc1, 10.0) * exp(-b1 * b1) * inside * 1.45;

  float arc2 = max(0.0, -cos(ang - uGlint));
  float b2 = (nr - 0.90) / 0.09;
  float specBounce = pow(arc2, 6.0) * exp(-b2 * b2) * inside * 0.55;

  float shimmer = pow(max(0.0, cos(ang - t * 1.1)), 12.0) * sharpRim * 0.95;

  vec3 glassWhite = mix(uC5, vec3(1.0), 0.78);
  float boost = 1.0 + 0.65 * uExcite;

  vec3 color = body * inside;
  color += rimTint * (sharpRim * 0.95 + innerGlow * 0.42 + fresnel * 0.55) * boost;
  color += mix(rimTint, liquidCol, 0.45) * outerGlow * (0.85 + 0.55 * uExcite);
  color += glassWhite * (specPrimary + shimmer) * (1.0 + 0.35 * uExcite);
  color += mix(uC0, vec3(1.0), 0.55) * specBounce * boost;

  color = 1.0 - exp(-color * 1.65);

  // tiny noise so the glow has no banding
  float m = max(max(color.r, color.g), color.b);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  color = max(color + (n - 0.5) / 255.0 * smoothstep(0.0, 0.01, m), 0.0);

  // premultiplied alpha
  float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}`;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const smoothstepJs = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

const damp = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));

function blobPositions(t, pullX, pullY, out) {
  for (let i = 0; i < 6; i++) {
    const a1 = t * (0.62 + 0.14 * i) + i * 1.95;
    const a2 = t * (0.5 + 0.12 * i) + i * 3.35 + 1.1;
    const k = 0.24 + 0.06 * i;
    out[i * 2] = Math.cos(a1) * 0.3 + Math.sin(a1 * 1.65 + i) * 0.1 + pullX * k;
    out[i * 2 + 1] = Math.sin(a2) * 0.3 + Math.cos(a2 * 1.45 - i) * 0.1 + pullY * k;
  }
}

// shared pointer state across all orbs
const pointer = { x: -9999, y: -9999, active: false };

function onPointerMove(e) {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
}

function clearPointer() {
  pointer.x = -9999;
  pointer.y = -9999;
  pointer.active = false;
}

window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerdown', onPointerMove, { passive: true });
window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') clearPointer();
}, { passive: true });
window.addEventListener('pointercancel', clearPointer, { passive: true });
document.documentElement.addEventListener('mouseleave', clearPointer);

const activeOrbs = new Set();
let rafId = 0;

function tick(nowMs) {
  for (const orb of activeOrbs) orb.draw(nowMs * 0.001);
  rafId = activeOrbs.size > 0 ? requestAnimationFrame(tick) : 0;
}

function setupGL(gl) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Orby shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Orby program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // colors never change, set once
  ORBY_COLORS.forEach((hex, i) => {
    gl.uniform3fv(gl.getUniformLocation(program, 'uC' + i), hexToRgb(hex));
  });
  gl.clearColor(0, 0, 0, 0);

  const uPhase = gl.getUniformLocation(program, 'uPhase');
  const uExcite = gl.getUniformLocation(program, 'uExcite');
  const uGlint = gl.getUniformLocation(program, 'uGlint');
  const uPos = gl.getUniformLocation(program, 'uPos');

  return {
    resize(px) { gl.viewport(0, 0, px, px); },
    render(phase, excite, glint, pos) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uPhase, phase);
      gl.uniform1f(uExcite, excite);
      gl.uniform1f(uGlint, glint);
      gl.uniform2fv(uPos, pos);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

export function createOrby(container) {
  const noop = { draw() {}, start() {}, stop() {}, setProgress() {}, reset() {} };
  if (!container) return noop;

  const canvas = document.createElement('canvas');
  canvas.className = 'orby-canvas';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);

  // percentage
  const pct = document.createElement('span');
  pct.className = 'orby-pct';
  pct.textContent = '0%';
  container.appendChild(pct);
  let target = 0;
  let shown = 0;
  let lastText = '0%';

  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    powerPreference: 'low-power',
  });
  const gfx = gl ? setupGL(gl) : null;

  let excite = 0;
  let phase = Math.random() * 20;
  let lastTime = performance.now() * 0.001;
  let dirX = 0;
  let dirY = 0;
  let sizePx = 0;
  const pos = new Float32Array(12);

  const api = {
    draw(nowSec) {
      const dt = Math.min(Math.max(nowSec - lastTime, 0), 0.1);
      lastTime = nowSec;

      shown = damp(shown, target, 9, dt);
      if (target - shown < 0.0015) shown = target;
      const text = Math.round(shown * 100) + '%';
      if (text !== lastText) {
        pct.textContent = text;
        lastText = text;
      }

      if (!gfx) return;

      const size = Math.min(container.clientWidth, container.clientHeight) || container.clientWidth;
      if (!size) return;
      const px = Math.max(1, Math.round(size * Math.min(window.devicePixelRatio || 1, MAX_DPR)));
      if (px !== sizePx) {
        sizePx = px;
        canvas.width = px;
        canvas.height = px;
        gfx.resize(px);
      }

      // pointer distance, direction
      const rect = container.getBoundingClientRect();
      const radiusPx = Math.min(rect.width, rect.height) * 0.5;
      let targetExcite = 0;
      let tx = 0;
      let ty = 0;
      if (pointer.active) {
        const dx = pointer.x - (rect.left + rect.width * 0.5);
        const dy = pointer.y - (rect.top + rect.height * 0.5);
        const dist = Math.hypot(dx, dy);
        const reach = Math.max(radiusPx * 2.5, REACH_PX);
        targetExcite = 1 - smoothstepJs(radiusPx * 0.5, reach, dist);
        if (dist > 0.001) {
          tx = dx / dist;
          ty = -dy / dist;
        }
      }

      // quick to get excited, slow to calm down
      excite = damp(excite, targetExcite, targetExcite > excite ? 7 : 2.5, dt);
      dirX = damp(dirX, tx, 8, dt);
      dirY = damp(dirY, ty, 8, dt);

      phase += dt * (BASE_SPEED + EXCITE_SPEED * excite);

      const pull = 0.28 * excite;
      blobPositions(phase, dirX * pull, dirY * pull, pos);
      const glint = 2.25 + Math.sin(phase * 0.55) * 0.28 + dirX * 0.25 * excite;

      gfx.render(phase, excite, glint, pos);
    },

    start() {
      lastTime = performance.now() * 0.001;
      activeOrbs.add(api);
      if (!rafId) rafId = requestAnimationFrame(tick);
    },

    stop() {
      activeOrbs.delete(api);
    },

    setProgress(v) { target = Math.min(1, Math.max(0, v)); },

    reset() {
      target = shown = 0;
      pct.textContent = lastText = '0%';
    },
  };

  return api;
}

// show/hide
function makeToggle(id) {
  const el = document.getElementById(id);
  if (!el) return { show() {}, hide() {}, setProgress() {} };
  const orb = createOrby(el);
  let timer = 0;
  return {
    show() {
      clearTimeout(timer);
      orb.reset();
      el.classList.add('show');
      orb.start();
    },
    hide() {
      el.classList.remove('show');
      clearTimeout(timer);
      timer = setTimeout(() => orb.stop(), 700);
    },
    setProgress(v) { orb.setProgress(v); },
  };
}

export const orbyTop = makeToggle('orby-top');
export const orbyMain = makeToggle('orby-main');