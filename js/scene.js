/* ===== SCENE ===== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* RENDERER */
const canvas = document.querySelector('#webgl');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

/* SCENE */
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* CAMERA */
export const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(6, 2, 8);

/* CONTROLS */
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.target.set(0, 0.6, 0);
controls.update();

/* FIT CAMERA */
let minCameraHeight = 0.25;

export function frameCamera(carSize) {
  camera.near = carSize / 200;
  camera.far = carSize * 100;
  camera.updateProjectionMatrix();

  controls.target.set(0, carSize * 0.12, 0);
  controls.minDistance = carSize * 0.6;
  controls.maxDistance = carSize * 4;
  camera.position.set(carSize * 1.1, carSize * 0.4, carSize * 1.4);
  minCameraHeight = carSize * 0.05;
  controls.update();
}

/* PER-FRAME CAMERA UPDATE */
export function updateCamera() {
  const dist = camera.position.distanceTo(controls.target);
  const limit = (minCameraHeight - controls.target.y) / dist;
  controls.maxPolarAngle = Math.acos(THREE.MathUtils.clamp(limit, -1, 1));
  controls.update();
}

/* RESIZE */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
