// 渲染器、相机、后期（泛光 + 暗角）、主循环与补间动画
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0, v * 0.85 + 0.15, uAmount);
      c.rgb += (rand(vUv * 731.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = c;
    }`,
};

export const GAME_CAM = { pos: new THREE.Vector3(0, 21.5, 15.8), look: new THREE.Vector3(0, -1.6, 1.0), fov: 42 };

export class Stage {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(GAME_CAM.fov, window.innerWidth / window.innerHeight, 0.3, 1500);
    this.camera.position.copy(GAME_CAM.pos);
    this.camLook = GAME_CAM.look.clone();
    this.camera.lookAt(this.camLook);
    this.camMode = 'free'; // 'game' 时有轻微呼吸感
    this.baseFov = GAME_CAM.fov;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.6, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.time = 0;
    this.updaters = new Set();
    this.tweens = new Set();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 窗口拖到不同缩放比例的显示器时同步像素比
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    if (pr !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
    }
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 窄屏时加大视角，保证整张桌子可见
    const aspect = w / h;
    this.fovFix = aspect < 1.6 ? Math.min(30, (1.6 / aspect - 1) * 38) : 0;
    this.camera.updateProjectionMatrix();
  }

  add(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  frame() {
    if (this.paused) {
      this.clock.getDelta();
      return;
    }
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;
    for (const tw of [...this.tweens]) {
      tw.elapsed += dt;
      const k = Math.min(1, tw.elapsed / tw.duration);
      tw.fn(tw.ease(k), k);
      if (k >= 1) {
        this.tweens.delete(tw);
        tw.resolve();
      }
    }
    for (const fn of this.updaters) fn(dt, t, this.camera);
    if (this.camMode === 'game') {
      const p = GAME_CAM.pos;
      this.camera.position.set(p.x + Math.sin(t * 0.21) * 0.25, p.y + Math.sin(t * 0.33) * 0.15, p.z + Math.sin(t * 0.17) * 0.2);
      this.camera.fov = this.baseFov + this.fovFix;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLook);
    }
    this.vignette.uniforms.uTime.value = t;
    this.composer.render();
  }

  tween(duration, fn, ease = easeInOut) {
    return new Promise((resolve) => {
      if (duration <= 0) {
        fn(1, 1);
        resolve();
        return;
      }
      this.tweens.add({ duration, fn, ease, elapsed: 0, resolve });
    });
  }

  wait(seconds) {
    return this.tween(seconds, () => {}, linear);
  }

  pick(objects, clientX, clientY) {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(objects, true);
    return hits.length ? hits[0] : null;
  }
}

export const linear = (k) => k;
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeIn = (k) => k * k * k;
export const easeOutBack = (k) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
