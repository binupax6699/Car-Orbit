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

/* HEXAGON CEILING LIGHT */
const HEX_POWER = 20;
const HEX_RADIUS = 0.5;
const HEX_COLUMNS = 5;
const HEX_ROWS = 7;
const HEX_TUBE = 0.07;
const HEX_HEIGHT = 3;
const HEX_ANGLE = 0;

function buildHexLight(power) {
  const R = HEX_RADIUS;
  const stepX = 1.5 * R;
  const stepY = Math.sqrt(3) * R;

  const edges = new Map();
  for (let c = 0; c < HEX_COLUMNS; c++) {
    for (let row = 0; row < HEX_ROWS; row++) {
      const cx = c * stepX;
      const cy = row * stepY + (c % 2) * stepY / 2;
      for (let k = 0; k < 6; k++) {
        const a1 = k * Math.PI / 3;
        const a2 = (k + 1) * Math.PI / 3;
        const p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
        const p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
        const key = [p1, p2]
          .map(p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000))
          .sort()
          .join('|');
        edges.set(key, [p1, p2]);
      }
    }
  }

  const offsetX = ((HEX_COLUMNS - 1) * stepX) / 2;
  const offsetY = ((HEX_ROWS - 1) * stepY + stepY / 2) / 2;

  const geometry = new THREE.PlaneGeometry(1, HEX_TUBE);
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(power) });
  const mesh = new THREE.InstancedMesh(geometry, material, edges.size);
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();

  let i = 0;
  for (const [p1, p2] of edges.values()) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    dummy.position.set((p1[0] + p2[0]) / 2 - offsetX, (p1[1] + p2[1]) / 2 - offsetY, 0);
    dummy.rotation.z = Math.atan2(dy, dx);
    dummy.scale.set(Math.hypot(dx, dy) + HEX_TUBE * 0.55, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i++, dummy.matrix);
  }

  const bars = new THREE.Group();
  bars.rotation.x = Math.PI / 2;
  bars.add(mesh);

  const holder = new THREE.Group();
  holder.rotation.y = THREE.MathUtils.degToRad(HEX_ANGLE);
  holder.position.y = HEX_HEIGHT;
  holder.add(bars);
  return holder;
}

const studio = new THREE.Scene();
studio.add(buildHexLight(HEX_POWER));

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(studio).texture;
scene.add(buildHexLight(3));

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
