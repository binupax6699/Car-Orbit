import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// RENDERER
const canvas = document.querySelector('#webgl');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // need to add to settings (PixelRatio)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// SCENE
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// HEXAGON CEILING LIGHT
const HEX_POWER = 30;
const HEX_RADIUS = 8;
const HEX_COLUMNS = 5;
const HEX_ROWS = 4.5;
const HEX_TUBE = 0.1;
const HEX_HEIGHT = 6;
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

// REFLECTIVE FLOOR
const FLOOR_STRENGTH = 1;
const FLOOR_TINT = 0x6e6e6e;
const FLOOR_HEIGHT = 0.015;
const FLOOR_BLUR = 0.0015;

export const reflectionHook = { fn: null };
export function addReflectiveFloor(box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const quality = Math.min(devicePixelRatio, 1);
  
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
  reflectionHook.fn?.(true);
  originalOnBeforeRender.call(this, renderer, scene, camera);
  reflectionHook.fn?.(false);
};

  floor.material.transparent = true;
  floor.material.fragmentShader = floor.material.fragmentShader.replace(
    'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
    'gl_FragColor = vec4( blendOverlay( base.rgb, color ), ' + FLOOR_STRENGTH.toFixed(2) + ' );'
  );
  floor.material.needsUpdate = true;

  floor.material.fragmentShader = floor.material.fragmentShader.replace(
    'vec4 base = texture2DProj( tDiffuse, vUv );',
    `vec4 base = vec4(0.0);
     vec2 uv = vUv.xy / vUv.w;
     for (int x = -2; x <= 2; x++) {
       for (int y = -2; y <= 2; y++) {
         base += texture2D(tDiffuse, uv + vec2(float(x), float(y)) * ${FLOOR_BLUR.toFixed(4)});
       }
     }
     base /= 25.0;`
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, FLOOR_HEIGHT, center.z);
  scene.add(floor);
}


// CAMERA
export const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000); // need to add to settings (FOV)
camera.position.set(6, 2, 8);

// BLOOM
const BLOOM_STRENGTH = 0.3;  // need to add to settings (Bloom 0.5MAX)
const BLOOM_RADIUS = 1;
const BLOOM_THRESHOLD = 1;

const composerTarget = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
  type: THREE.HalfFloatType,
  samples: 2,
  depthTexture: new THREE.DepthTexture(innerWidth, innerHeight),
});

export const composer = new EffectComposer(renderer, composerTarget);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));

// MOTION BLUR
const MB_SHUTTER = 1 / 75;
const MB_MAX = 0.06;
const MB_SAMPLES = matchMedia('(pointer: coarse)').matches ? 10 : 20;

export const motionHook = { get: null };

// velocity of moving parts (alpha 1), everything else is alpha 0
const velTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });

const velMat = new THREE.ShaderMaterial({
  uniforms: {
    uPrevModel: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
  },
  vertexShader: `
    uniform mat4 uPrevModel;
    uniform mat4 uPrevViewProj;
    varying vec4 vCurr;
    varying vec4 vPrev;
    void main() {
      vec4 p = vec4(position, 1.0);
      vCurr = projectionMatrix * modelViewMatrix * p;
      vPrev = uPrevViewProj * uPrevModel * p;
      gl_Position = vCurr;
    }
  `,
  fragmentShader: `
    varying vec4 vCurr;
    varying vec4 vPrev;
    void main() {
      vec2 a = vCurr.xy / vCurr.w;
      vec2 b = vPrev.xy / max(vPrev.w, 0.0001);
      gl_FragColor = vec4(a - b, 0.0, 1.0);
    }
  `,
  side: THREE.DoubleSide,
});

const holdMat = new THREE.ShaderMaterial({
  vertexShader: `
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    void main() { gl_FragColor = vec4(0.0); }
  `,
  side: THREE.DoubleSide,
});

const motionPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tVel: { value: velTarget.texture },
    uUseVel: { value: 0 },
    uInvViewProj: { value: new THREE.Matrix4() },
    uPrevViewProj: { value: new THREE.Matrix4() },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uStrength: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tVel;
    uniform float uUseVel;
    uniform mat4 uInvViewProj;
    uniform mat4 uPrevViewProj;
    uniform float uNear;
    uniform float uFar;
    uniform float uStrength;
    varying vec2 vUv;

    float viewDepth(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }

    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      float d0 = texture2D(tDepth, vUv).x;

      vec2 vel;
      vec4 ov = texture2D(tVel, vUv);
      if (uUseVel > 0.5 && ov.a > 0.5) {
        // a moving part: its own movement (camera included)
        vel = ov.xy * 0.5 * uStrength;
      } else {
        // everything else: only the camera moved
        vec4 clip = vec4(vUv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
        vec4 wp = uInvViewProj * clip;
        wp /= wp.w;
        vec4 pc = uPrevViewProj * wp;
        vec2 prevNdc = pc.xy / max(pc.w, 0.0001);
        vel = (clip.xy - prevNdc) * 0.5 * uStrength;
      }

      float len = length(vel);
      if (len < 0.0004) { gl_FragColor = center; return; } // barely moving, skip
      if (len > ${MB_MAX.toFixed(3)}) vel *= ${MB_MAX.toFixed(3)} / len;

      // blur along the movement, only with pixels at a similar depth,
      // so silhouettes stay crisp and nothing bleeds over the car
      float z0 = viewDepth(d0);
      float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec4 sum = center;
      float wsum = 1.0;
      for (int i = 0; i < ${MB_SAMPLES}; i++) {
        float t = (float(i) + j) / float(${MB_SAMPLES}) - 0.5;
        vec2 uv = vUv + vel * t;
        float zs = viewDepth(texture2D(tDepth, uv).x);
        float w = 1.0 - smoothstep(0.03, 0.12, abs(zs - z0) / z0);
        sum += texture2D(tDiffuse, uv) * w;
        wsum += w;
      }
      gl_FragColor = sum / wsum;
    }
  `,
});
motionPass.enabled = false;

let motionFrame = 0;
const clearTmp = new THREE.Color();

function renderVelocity(renderer, car, w, h) {
  const { meshes, movers } = car.userData;
  const wires = car.userData.wires || [];
  if (velTarget.width !== w || velTarget.height !== h) velTarget.setSize(w, h);

  velMat.uniforms.uPrevViewProj.value.copy(motionPass.uniforms.uPrevViewProj.value);

  const saved = meshes.map((m) => m.material);
  const wireVis = wires.map((x) => x.visible);
  const hidden = [];
  wires.forEach((x) => { x.visible = false; });

  meshes.forEach((m, i) => {
    if (movers.has(m)) {

      if (!m.userData.prevM || m.userData.prevF !== motionFrame - 1) {
        m.userData.prevM = m.matrixWorld.clone();
      }
      m.material = velMat;
      m.onBeforeRender = function (r, s, c, g, material) {
        material.uniforms.uPrevModel.value.copy(this.userData.prevM);
        material.uniformsNeedUpdate = true;
      };
    } else if (saved[i].transparent) {
      if (m.visible) { m.visible = false; hidden.push(m); }
    } else {
      m.material = holdMat;
    }
  });

  const prevTarget = renderer.getRenderTarget();
  renderer.getClearColor(clearTmp);
  const prevAlpha = renderer.getClearAlpha();

  renderer.setRenderTarget(velTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(car, camera);

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(clearTmp, prevAlpha);

  meshes.forEach((m, i) => {
    m.material = saved[i];
    if (movers.has(m)) {
      delete m.onBeforeRender;
      m.userData.prevM.copy(m.matrixWorld);
      m.userData.prevF = motionFrame;
    }
  });
  hidden.forEach((m) => { m.visible = true; });
  wires.forEach((x, i) => { x.visible = wireVis[i]; });
}

const motionRender = motionPass.render.bind(motionPass);
motionPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
  const u = motionPass.uniforms;
  u.tDepth.value = readBuffer.depthTexture;

  const car = motionHook.get?.();
  if (car) {
    renderVelocity(renderer, car, readBuffer.width, readBuffer.height);
    u.uUseVel.value = 1;
  } else {
    u.uUseVel.value = 0;
  }
  motionRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
};
composer.addPass(motionPass);

const prevViewProj = new THREE.Matrix4();
const currViewProj = new THREE.Matrix4();
let hasPrev = false;
let lastT = performance.now();

function updateMotionBlur() {
  const now = performance.now();
  const dt = Math.min(Math.max((now - lastT) / 1000, 1 / 240), 1 / 20);
  lastT = now;
  motionFrame++;

  camera.updateMatrixWorld();
  currViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  let diff = 0;
  if (hasPrev) {
    for (let i = 0; i < 16; i++) diff += Math.abs(currViewProj.elements[i] - prevViewProj.elements[i]);
  }
  const partMoving = !!motionHook.get?.();
  motionPass.enabled = hasPrev && (partMoving || diff > 5e-4);

  if (motionPass.enabled) {
    const u = motionPass.uniforms;
    u.uPrevViewProj.value.copy(prevViewProj);
    u.uInvViewProj.value.copy(currViewProj).invert();
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uStrength.value = MB_SHUTTER / dt;
  }

  prevViewProj.copy(currViewProj);
  hasPrev = true;  // need to add to settings (Motion Blur)
}


export const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// CONTROLS
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.target.set(0, 0.6, 0);
controls.update();

// FIT CAMERA
let minCameraHeight = 0.5;

export function frameCamera(carSize, keepView = false) {
  camera.near = carSize / 200;
  camera.far = carSize * 100;
  camera.updateProjectionMatrix();
  hasPrev = false;

  const targetY = carSize * 0.12;
  controls.minDistance = carSize * 0.55;
  controls.maxDistance = carSize * 3;
  minCameraHeight = carSize * 0.01;

  if (keepView) {
    camera.position.y += targetY - controls.target.y;
    controls.target.y = targetY;
  } else {
    controls.target.set(0, targetY, 0);
    camera.position.set(carSize * 3, carSize * 0.01, 0);
  }
  controls.update();
}

// PER-FRAME CAMERA UPDATE
export function updateCamera() {
  const dist = camera.position.distanceTo(controls.target);
  const limit = (minCameraHeight - controls.target.y) / dist;
  controls.maxPolarAngle = Math.acos(THREE.MathUtils.clamp(limit, -1, 1));
  controls.update();
  updateMotionBlur();
}

// RESIZE
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  swapPass.uniforms.resolution.value.set(innerWidth, innerHeight);
});
