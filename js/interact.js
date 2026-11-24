import * as THREE from 'three';
import { camera, renderer } from './scene.js';
import { getCurrentCar, isSwapping, PART_NAMES, togglePart } from './car.js';

const TAP_MAX_MOVE = 8;
const TAP_MAX_TIME = 350;
const HOVER_EVERY = 80;

const canvas = renderer.domElement;

let down = null;

const pickTarget = new THREE.WebGLRenderTarget(1, 1);
const pickPixel = new Uint8Array(4);

const flat = (id) => new THREE.MeshBasicMaterial({
  color: new THREE.Color().setRGB(id / 255, 0, 0, THREE.LinearSRGBColorSpace),
  side: THREE.DoubleSide,
  toneMapped: false,
});
const blockerMat = flat(0);
const partMats = PART_NAMES.map((_, i) => flat(i + 1));

function partAt(x, y) {
  const car = getCurrentCar();
  if (!car) return null;

  if (!car.userData.pickList) {
    const list = [];
    car.traverse((o) => {
      if (!o.isMesh || o.userData.isWire) return;
      let mat = blockerMat;
      for (let p = o; p; p = p.parent) {
        const i = PART_NAMES.indexOf(p.name);
        if (i >= 0) { mat = partMats[i]; break; }
      }
      list.push([o, mat]);
    });
    car.userData.pickList = list;
  }
  const list = car.userData.pickList;

  const rect = canvas.getBoundingClientRect();
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const saved = list.map(([m]) => m.material);

  try {
    list.forEach(([m, mat]) => { m.material = mat; });
    camera.setViewOffset(rect.width, rect.height, x - rect.left, y - rect.top, 1, 1);
    renderer.setRenderTarget(pickTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(car, camera);
    renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
  } finally {
    camera.clearViewOffset();
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    list.forEach(([m], i) => { m.material = saved[i]; });
  }

  if (pickPixel[3] === 0 || pickPixel[0] === 0) return null;
  return { name: PART_NAMES[pickPixel[0] - 1] };
}

const warm = setInterval(() => {
  if (!getCurrentCar() || isSwapping()) return;
  clearInterval(warm);
  partAt(innerWidth / 2, innerHeight / 2);
}, 500);

canvas.addEventListener('pointerdown', (e) => {
  down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});

canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const time = performance.now() - down.t;
  down = null;
  if (moved <= TAP_MAX_MOVE && time <= TAP_MAX_TIME) {
    const part = partAt(e.clientX, e.clientY);
    if (part) togglePart(part.name);
  }
});

canvas.addEventListener('pointercancel', () => { down = null; });

let hovering = false;
let hoverX = 0;
let hoverY = 0;
let hoverTimer = 0;

function setHover(on) {
  if (on === hovering) return;
  hovering = on;
  canvas.style.cursor = on ? 'pointer' : '';
}

function checkHover() {
  hoverTimer = 0;
  const car = getCurrentCar();
  const part = !car || isSwapping() ? null : partAt(hoverX, hoverY);
  setHover(!!part && !!car.userData.parts?.[part.name]);
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (e.buttons) {setHover(false);
  return;
  }
  hoverX = e.clientX;
  hoverY = e.clientY;
  if (!hoverTimer) hoverTimer = setTimeout(checkHover, HOVER_EVERY);
});

canvas.addEventListener('pointerleave', () => setHover(false));