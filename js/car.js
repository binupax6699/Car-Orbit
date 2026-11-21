import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { scene, camera, renderer, frameCamera, addReflectiveFloor, reflectionHook } from './scene.js';
import { hideLoading } from './loading.js';
import { cars } from './cars.js';

const PLATFORM_URL = 'models/platform.glb';

// swap look
const FRONT_IS_POS_Z = true;
const WIRE_COLOR = 0xffffff;
const WIRE_GLOW = 0.03;
const BAND = 0.8;
const EDGE_NOISE = 0.04;
const DISSOLVE_CELLS = 60;
const OUT_MS = 5000;
const IN_MS = 3000;

// wire cost
const MOBILE = matchMedia('(pointer: coarse)').matches;
const WIRE_TRI_BUDGET = MOBILE ? 150000 : 200000;
const WIRE_IN_REFLECTION = true;

const IDLE = -0.1;
const P_START = -0.05;
const P_END = 1 + BAND + 0.05;

const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

let currentCar = null;

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
  g.setAttribute('position', pos); // shares the car's vertex data
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

function removeCar() {
  if (!currentCar) return;
  scene.remove(currentCar);
  currentCar.traverse((obj) => {
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
  currentCar = null;
}

async function uploadTextures(car) {
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
  for (const tex of texs) {
    renderer.initTexture(tex);
    if (performance.now() - t0 > 6) {
      await nextFrame();
      t0 = performance.now();
    }
  }
}

async function prepareCar(data) {
  const base = data.file.slice(0, data.file.lastIndexOf('/') + 1);
  const res = await fetch(data.file);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const gltf = await loader.parseAsync(await res.arrayBuffer(), base);

  const car = gltf.scene;
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

  await uploadTextures(car);
  try { await renderer.compileAsync(car, camera, scene); } catch (e) { /* skip */ }

  return {
    car,
    maxSize,
    zFront: FRONT_IS_POS_Z ? wb.max.z : wb.min.z,
    zBack: FRONT_IS_POS_Z ? wb.min.z : wb.max.z,
    cell: DISSOLVE_CELLS / maxSize,
  };
}

// loads a car
export async function loadCar(id, animate = false) {
  const data = cars.find((c) => c.id === id);
  if (!data) return false;

  const old = animate ? currentCar : null;

  const preparing = prepareCar(data).then((r) => ({ r }), (err) => ({ err }));

  if (old) await playOut(old);

  const { r, err } = await preparing;
  if (err) {
    console.error('Car error:', data.file, err);
    if (old) await playIn(old);
    return false;
  }

  const { car, maxSize, zFront, zBack, cell } = r;

  fx.z.value.set(zFront, zBack);
  fx.cell.value = cell;

  removeCar();

  fx.mode.value = 1;
  fx.p.value = IDLE;
  scene.add(car);
  currentCar = car;
  showWires(car, true);
  frameCamera(maxSize, !!old);
  await nextFrame();
  await nextFrame();
  showWires(car, false);

  if (old) {
    await playIn(car);
  } else {
    fx.mode.value = 0;
    fx.p.value = IDLE;
  }
  return true;
}

export function loadModels() {
  let pending = 2;
  const oneDone = () => { if (--pending === 0) hideLoading(); };

  loadCar(cars[0].id).then(oneDone);

  loader.load(PLATFORM_URL, (gltf) => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    scene.add(gltf.scene);
    addReflectiveFloor(box);
    oneDone();
  }, undefined, (err) => {
    console.error('Platform error:', PLATFORM_URL, err);
    oneDone();
  });
}
