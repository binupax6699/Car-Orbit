import { renderer, composer, updateCamera } from './scene.js';
import { loadModels } from './car.js';

loadModels();

renderer.setAnimationLoop(() => {
  updateCamera();
  composer.render();
});
