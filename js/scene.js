/* ===== SCENE ===== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

/* RENDERER */
const canvas = document.querySelector('#webgl');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

/* SCENE */
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

/* STUDIO LIGHT */
const LIGHT_POWER = 2;
const LIGHT_WIDTH = 8;
const LIGHT_LENGTH = 10;
const LIGHT_HEIGHT = 5;

const studio = new THREE.Scene();
const lightMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(LIGHT_POWER), side: THREE.DoubleSide });
const lightPanel = new THREE.Mesh(new THREE.PlaneGeometry(LIGHT_WIDTH, LIGHT_LENGTH), lightMaterial);
lightPanel.position.y = LIGHT_HEIGHT;
lightPanel.rotation.x = Math.PI / 2;
studio.add(lightPanel);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio).texture;

const visiblePanel = lightPanel.clone();
visiblePanel.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
scene.add(visiblePanel);

/* REFLECTIVE FLOOR */
const FLOOR_STRENGTH = 1;
const FLOOR_TINT = 0x888888;
const FLOOR_HEIGHT = 0.03;

export function addReflectiveFloor(box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const quality = Math.min(devicePixelRatio, 1.5);

  const floorSizeMultiplier = 2; 
  const floor = new Reflector(new THREE.PlaneGeometry(size.x * floorSizeMultiplier, size.z * floorSizeMultiplier), {
    textureWidth: Math.round(innerWidth * quality),
    textureHeight: Math.round(innerHeight * quality),
    color: FLOOR_TINT,
    clipBias: 0.0001,
  });

  floor.camera.minDistance = 0.001;
  const originalOnBeforeRender = floor.onBeforeRender;
  floor.onBeforeRender = function (renderer, scene, camera) {

    originalOnBeforeRender.call(this, renderer, scene, camera);
  };

  floor.material.transparent = true;
  floor.material.fragmentShader = floor.material.fragmentShader.replace(
    'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
    'gl_FragColor = vec4( blendOverlay( base.rgb, color ), ' + FLOOR_STRENGTH.toFixed(2) + ' );'
  );
  floor.material.needsUpdate = true;

  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, FLOOR_HEIGHT, center.z);
  scene.add(floor);
}


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
