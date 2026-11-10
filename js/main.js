/* ===== START ===== */

import { renderer, scene, camera, updateCamera } from './scene.js';
import { loadModels } from './car.js';

loadModels();

renderer.setAnimationLoop(() => {
  updateCamera();
  renderer.render(scene, camera);
});
