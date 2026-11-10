/* ===== CAR + PLATFORM ===== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { scene, frameCamera, addReflectiveFloor } from './scene.js';
import { hideLoading } from './loading.js';

/* FILE PATHS */
const PLATFORM_URL = 'models/platform.glb';
const CAR_URL = 'cars/BUGATTI_Brouillard.glb';

/* LOADER */
const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

/* HIDE LOADING SCREEN*/
let pending = 2;

function oneDone() {
  pending--;
  if (pending === 0) hideLoading();
}

/* LOAD EVERYTHING */
export function loadModels() {

  /* Car */
  loader.load(CAR_URL, (gltf) => {
    const car = gltf.scene;
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    car.position.set(-center.x, -box.min.y, -center.z);
    scene.add(car);
    car.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
    if (mat.transparent) mat.depthWrite = false;   // lets lights behind the glass show through
    }
  });

    frameCamera(Math.max(size.x, size.y, size.z));
    oneDone();
  }, undefined, (err) => {
    console.error('Car error:', CAR_URL, err);
    oneDone();
  });

  /* Platform */
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
