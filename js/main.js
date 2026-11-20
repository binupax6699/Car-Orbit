import { renderer, composer, updateCamera } from './scene.js';
import { loadModels } from './car.js';
import './ui.js'

loadModels();

renderer.setAnimationLoop(() => {
  updateCamera();
  composer.render();
});
