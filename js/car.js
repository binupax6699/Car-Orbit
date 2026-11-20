import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { scene, frameCamera, addReflectiveFloor } from './scene.js';
import { hideLoading } from './loading.js';
import { cars } from './cars.js';

const PLATFORM_URL = 'models/platform.glb';

const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

let currentCar = null;

function removeCar() {
  if (!currentCar) return;
  scene.remove(currentCar);
  currentCar.traverse((obj) => {
    if (!obj.isMesh) return;
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

// loads a car by id
export function loadCar(id) {
  const data = cars.find((c) => c.id === id);
  if (!data) return Promise.resolve(false);

  return new Promise((resolve) => {
    loader.load(data.file, (gltf) => {
      removeCar();

      const car = gltf.scene;
      const box = new THREE.Box3().setFromObject(car);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      car.position.set(-center.x, -box.min.y, -center.z);
      scene.add(car);
      currentCar = car;

      car.traverse((obj) => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat.transparent) mat.depthWrite = false;
        }
      });

      frameCamera(Math.max(size.x, size.y, size.z));
      resolve(true);
    }, undefined, (err) => {
      console.error('Car error:', data.file, err);
      resolve(false);
    });
  });
}

// load
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
