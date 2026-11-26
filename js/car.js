import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { scene, camera, renderer, frameCamera, addReflectiveFloor, reflectionHook, motionHook } from './scene.js';
import { hideLoading } from './loading.js';
import { cars } from './cars.js';
import { orbyTop, orbyMain } from './orby.js';

const PLATFORM_URL = 'models/platform.glb';

// swap look
const FRONT_IS_POS_Z = true;
const WIRE_COLOR = 0xffffff;
const WIRE_GLOW = 0.03;
const BAND = 0.8;
const EDGE_NOISE = 0.04;
const DISSOLVE_CELLS = 60;
const OUT_MS = 2000;
const IN_MS = 2000;

// loading
const PRELOAD_AT_LAUNCH = 1;
const MAX_READY = 6;

// wire cost
const MOBILE = matchMedia('(pointer: coarse)').matches;
const WIRE_TRI_BUDGET = MOBILE ? 150000 : 200000;
const WIRE_IN_REFLECTION = true;

// parts that can do stuff
export const PART_NAMES = ['DoorL', 'DoorR', 'HoodF', 'HoodB', 'Arow', 'Roof'];

const IDLE = -0.1;
const P_START = -0.05;
const P_END = 1 + BAND + 0.05;

const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

let currentCar = null;
let framed = false;
let swapping = false;

export function getCurrentCar() { return currentCar; }
export function isSwapping() { return swapping; }

const fx = {
  p: { value: IDLE },
  mode: { value: 0 },
  band: { value: BAND },
  z: { value: new THREE.Vector2(1, -1) },
  cell: { value: 10 },
  jit: { value: EDGE_NOISE },
};

const HASH = `float hash13(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`;

// polygon lines
const wireMat = new THREE.ShaderMaterial({
  wireframe: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  uniforms: {
    uColor: { value: new THREE.Color(WIRE_COLOR) },
    uGlow: { value: WIRE_GLOW },
    uP: fx.p,
    uBand: fx.band,
    uZ: fx.z,
  },
  vertexShader: `
    uniform vec2 uZ;
    varying float vS;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vS = (wp.z - uZ.x) / (uZ.y - uZ.x);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uGlow;
    uniform float uP;
    uniform float uBand;
    varying float vS;
    void main() {
      float d = uP - vS; // how far behind the light this point is
      float a = smoothstep(0.0, 0.015, d) * (1.0 - smoothstep(uBand - 0.12, uBand, d));
      if (a <= 0.0) discard;
      float lead = 1.0 - smoothstep(0.0, 0.1, d); // brighter at the light
      gl_FragColor = vec4(uColor * uGlow * (0.6 + 1.6 * lead), a);
    }
  `,
});

export function setWireColor(hex) { wireMat.uniforms.uColor.value.set(hex); }
export function setWireGlow(v) { wireMat.uniforms.uGlow.value = v; }

function prepareSolid(car) {
  car.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat.userData.dissolveReady) continue;
      mat.userData.dissolveReady = true;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uP = fx.p;
        shader.uniforms.uMode = fx.mode;
        shader.uniforms.uBand = fx.band;
        shader.uniforms.uZ = fx.z;
        shader.uniforms.uCell = fx.cell;
        shader.uniforms.uJit = fx.jit;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vDWorld;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            uniform float uP;
            uniform float uMode;
            uniform float uBand;
            uniform vec2 uZ;
            uniform float uCell;
            uniform float uJit;
            varying vec3 vDWorld;
            ${HASH}`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            float dS = (vDWorld.z - uZ.x) / (uZ.y - uZ.x);
            float dD = uP - dS + (hash13(floor(vDWorld * uCell)) - 0.5) * uJit;
            if (uMode < 0.5) { if (dD > 0.0) discard; }
            else { if (dD < uBand) discard; }`);
      };
      mat.customProgramCacheKey = () => 'dissolve';
      mat.needsUpdate = true;
    }
  });
}

function lightGeometry(geo, step) {
  if (step <= 1) return geo;
  const pos = geo.attributes.position;
  const src = geo.index ? geo.index.array : null;
  const tris = Math.floor((src ? src.length : pos.count) / 3);
  const keep = Math.floor(tris / step);
  if (keep < 1) return geo;
  const out = new Uint32Array(keep * 3);
  for (let i = 0; i < keep; i++) {
    const t = i * step * 3;
    for (let k = 0; k < 3; k++) out[i * 3 + k] = src ? src[t + k] : t + k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos);
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.userData.own = true;
  return g;
}

function attachWires(car) {
  const list = [];
  let total = 0;
  car.traverse((o) => {
    if (!o.isMesh || o.userData.isWire) return;
    list.push(o);
    total += Math.floor((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3);
  });
  const step = Math.max(1, Math.ceil(total / WIRE_TRI_BUDGET));

  const wires = [];
  for (const m of list) {
    const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const w = new THREE.Mesh(lightGeometry(m.geometry, tris < 3000 ? 1 : step), wireMat);
    w.userData.isWire = true;
    w.frustumCulled = false;
    w.renderOrder = 5;
    w.raycast = () => {};
    w.visible = false;
    m.add(w);
    wires.push(w);
  }
  car.userData.wires = wires;
}

function showWires(car, on) {
  car.userData.wiresOn = on;
  for (const w of car.userData.wires) w.visible = on;
}

reflectionHook.fn = (starting) => {
  if (WIRE_IN_REFLECTION || !currentCar || !currentCar.userData.wiresOn) return;
  for (const w of currentCar.userData.wires) w.visible = !starting;
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function sweep(ms) {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / ms, 1);
      const e = -(Math.cos(Math.PI * t) - 1) / 2;
      fx.p.value = P_START + (P_END - P_START) * e;
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// solid > wireframe > nothing
async function playOut(car) {
  fx.mode.value = 0;
  fx.p.value = P_START;
  showWires(car, true);
  await sweep(OUT_MS);
  showWires(car, false);
}

// nothing > wireframe > solid
async function playIn(car) {
  fx.mode.value = 1;
  fx.p.value = P_START;
  showWires(car, true);
  await sweep(IN_MS);
  showWires(car, false);
  fx.mode.value = 0;
  fx.p.value = IDLE;
}

function disposeCar(car) {
  car.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData.isWire) {
      if (obj.geometry.userData.own) obj.geometry.dispose();
      return;
    }
    obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      for (const key in mat) {
        if (mat[key] && mat[key].isTexture) mat[key].dispose();
      }
      mat.dispose();
    }
  });
}

async function uploadTextures(car, onProgress) {
  const texs = new Set();
  car.traverse((o) => {
    if (!o.isMesh || o.userData.isWire) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      for (const key in mat) {
        if (mat[key] && mat[key].isTexture) texs.add(mat[key]);
      }
    }
  });
  let t0 = performance.now();
  let i = 0;
  for (const tex of texs) {
    renderer.initTexture(tex);
    onProgress?.(++i / texs.size);
    if (performance.now() - t0 > 6) {
      await nextFrame();
      t0 = performance.now();
    }
  }
}

async function warmUp(car) {
  const meshes = [];
  car.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const keep = meshes.map((m) => m.frustumCulled);
  meshes.forEach((m) => { m.frustumCulled = false; });
  for (const w of car.userData.wires) w.visible = true;

  const y = car.position.y;
  car.position.y = y - 5000;
  scene.add(car);
  await nextFrame();
  await nextFrame();
  scene.remove(car);
  car.position.y = y;

  for (const w of car.userData.wires) w.visible = false;
  meshes.forEach((m, i) => { m.frustumCulled = keep[i]; });
}

async function download(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = +res.headers.get('content-length') || 0;

  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onProgress(1);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(got / total, 1));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

// open/close parts
function buildParts(car, animations) {
    const byPart = {};
    for (const clip of animations) {
    for (const track of clip.tracks) {
      const raw = track.name.split('.')[0];
      const node = raw.replace(/\d+$/, '');
    if (!PART_NAMES.includes(node)) continue;
    (byPart[node] ||= []).push(track);
    (car.userData.animNodes ||= []).push(raw);
    }
  }

//motion blur
function motionLists(car) {
  if (car.userData.meshes) return;
  const meshes = [];
  car.traverse((o) => { if (o.isMesh && !o.userData.isWire) meshes.push(o); });
  const movers = new Set();
  for (const name of car.userData.animNodes || []) {
    car.getObjectByName(name)?.traverse((o) => {
      if (o.isMesh && !o.userData.isWire) movers.add(o);
    });
  }
  car.userData.meshes = meshes;
  car.userData.movers = movers;
}

motionHook.get = () => {
  const car = currentCar;
  const parts = car?.userData.parts;
  if (!parts) return null;
  if (!Object.values(parts).some((p) => p.action.isRunning())) return null;
  motionLists(car);
  return car;
};

  const names = Object.keys(byPart);
  if (!names.length) {
    console.warn('No part animations found. Clips:', animations.map((a) => a.name));
    return;
  }

  const mixer = new THREE.AnimationMixer(car);
  const parts = {};
  for (const name of names) {
    const clip = new THREE.AnimationClip(name + '_open', -1, byPart[name]);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    parts[name] = { action, open: false };
  }
  car.userData.mixer = mixer;
  car.userData.parts = parts;
}

function setPartOpen(part, open) {
  part.open = open;
  const a = part.action;
  a.enabled = true;
  a.paused = false;
  a.timeScale = open ? 1 : -1;
  a.play();
}

export function togglePart(name) {
  if (!currentCar || swapping) return;
  const part = currentCar.userData.parts?.[name];
  if (!part) {
    console.warn('No animation for', name);
    return;
  }
  setPartOpen(part, !part.open);
}

function closeParts(car) {
  for (const p of Object.values(car.userData.parts || {})) {
    if (p.open) setPartOpen(p, false);
  }
}

function resetParts(car) {
  for (const p of Object.values(car.userData.parts || {})) {
    p.action.stop();
    p.open = false;
  }
}

export function updateCarAnimations(dt) {
  currentCar?.userData.mixer?.update(dt);
}

const progress = new Map();
let launchIds = null;
let swapId = null;

function report(id, v) {
  v = Math.min(1, Math.max(progress.get(id) || 0, v));
  progress.set(id, v);
  if (id === swapId) orbyTop.setProgress(v);
  if (launchIds) {
    let sum = 0;
    for (const i of launchIds) sum += progress.get(i) || 0;
    orbyMain.setProgress(sum / launchIds.length);
  }
}

async function prepareCar(data) {
  const id = data.id;
  const base = data.file.slice(0, data.file.lastIndexOf('/') + 1);

  const buf = await download(data.file, (v) => report(id, v * 0.55));
  report(id, 0.55);
  const gltf = await loader.parseAsync(buf, base);
  report(id, 0.7);

  const car = gltf.scene;
  buildParts(car, gltf.animations);
  prepareSolid(car);

  const box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  car.position.set(-center.x, -box.min.y, -center.z);
  car.updateMatrixWorld(true);

  const wb = new THREE.Box3().setFromObject(car);

  attachWires(car);

  car.traverse((obj) => {
    if (!obj.isMesh || obj.userData.isWire) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat.transparent) mat.depthWrite = false;
    }
  });

  await uploadTextures(car, (v) => report(id, 0.7 + v * 0.15));
  report(id, 0.85);
  try { await renderer.compileAsync(car, camera, scene); } catch (e) {}
  report(id, 0.93);
  await warmUp(car);
  report(id, 1);

  return {
    car,
    maxSize,
    zFront: FRONT_IS_POS_Z ? wb.max.z : wb.min.z,
    zBack: FRONT_IS_POS_Z ? wb.min.z : wb.max.z,
    cell: DISSOLVE_CELLS / maxSize,
  };
}

const prepared = new Map();
const readyIds = new Set();

function ensure(data) {
  let p = prepared.get(data.id);
  if (!p) {
    p = prepareCar(data);
    prepared.set(data.id, p);
    p.then(
      () => readyIds.add(data.id),
      () => { prepared.delete(data.id); progress.delete(data.id); }
    );
  }
  return p;
}

function touch(id) {
  const p = prepared.get(id);
  if (!p) return;
  prepared.delete(id);
  prepared.set(id, p);
}

function evict(keepId) {
  for (const [id, p] of prepared) {
    if (prepared.size <= MAX_READY) break;
    if (id === keepId) continue;
    prepared.delete(id);
    readyIds.delete(id);
    progress.delete(id);
    p.then((r) => disposeCar(r.car)).catch(() => {});
  }
}

export async function loadCar(id, animate = false) {
  const data = cars.find((c) => c.id === id);
  if (!data) return false;

  const old = animate ? currentCar : null;
  if (old) {
    swapping = true; // taps are ignored during a swap
    closeParts(old); // open doors close while the old car leaves
  }

  const needsLoad = animate && !readyIds.has(id);
  const orbTimer = needsLoad ? setTimeout(() => {
    swapId = id;
    orbyTop.show();
    orbyTop.setProgress(progress.get(id) || 0);
  }, 200) : 0;

  const preparing = ensure(data).then((r) => ({ r }), (err) => ({ err }));

  if (old) {
    await playOut(old);
    resetParts(old);
  }

  const { r, err } = await preparing;
  clearTimeout(orbTimer);
  if (needsLoad) {
    swapId = null;
    orbyTop.setProgress(1);
    orbyTop.hide();
  }
  if (err) {
    console.error('Car error:', data.file, err);
    if (old) { await playIn(old); swapping = false; }
    return false;
  }

  const { car, maxSize, zFront, zBack, cell } = r;
  touch(id);

  fx.z.value.set(zFront, zBack);
  fx.cell.value = cell;

  if (currentCar) scene.remove(currentCar);
  fx.mode.value = old ? 1 : 0;
  fx.p.value = IDLE;
  scene.add(car);
  currentCar = car;

  if (!framed) {
    frameCamera(maxSize);
    framed = true;
  }

  if (old) { await playIn(car); swapping = false; }
  evict(id);
  return true;
}

export async function loadModels() {
  const n = Math.min(PRELOAD_AT_LAUNCH, cars.length);
  launchIds = ['platform', ...cars.slice(0, n).map((c) => c.id)];

  const platform = new Promise((resolve) => {
    loader.load(PLATFORM_URL, (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      scene.add(gltf.scene);
      addReflectiveFloor(box);
      report('platform', 1);
      resolve();
    }, (e) => {
      if (e.total) report('platform', (e.loaded / e.total) * 0.95);
    }, (err) => {
      console.error('Platform error:', PLATFORM_URL, err);
      report('platform', 1);
      resolve();
    });
  });

  await Promise.all([loadCar(cars[0].id), platform]);

  for (let i = 1; i < n; i++) {
    try { await ensure(cars[i]); }
    catch (e) { console.error('Preload error:', cars[i].file, e); }
  }

  launchIds = null;
  orbyMain.setProgress(1);
  hideLoading();
}