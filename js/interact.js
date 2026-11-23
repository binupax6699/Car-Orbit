import * as THREE from 'three';
import { camera, renderer } from './scene.js';
import { getCurrentCar, isSwapping, PART_NAMES, togglePart } from './car.js';

const TAP_MAX_MOVE = 8;
const TAP_MAX_TIME = 350;
const HOVER_EVERY = 80;

const canvas = renderer.domElement;
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;

function partAt(x, y) {
  const car = getCurrentCar();
  if (!car) return null;

  const rect = canvas.getBoundingClientRect();
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);

  const hit = ray.intersectObject(car, true)[0];
  if (!hit) return null;

  for (let o = hit.object; o; o = o.parent) {
    if (PART_NAMES.includes(o.name)) return o;
  }
  return null;
}

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