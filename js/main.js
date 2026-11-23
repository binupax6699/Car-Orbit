import { renderer, composer, updateCamera } from './scene.js';
import { loadModels, updateCarAnimations } from './car.js';
import './interact.js';
import './ui.js';

loadModels();

let last = performance.now();

renderer.setAnimationLoop((now) => {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  updateCarAnimations(dt);
  updateCamera();
  composer.render();
});
