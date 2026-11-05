// 渲染器、相机、后期（环境光遮蔽 + 泛光 + 调色 / 暗角 / 颗粒）、主循环与补间动画
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 最后一道：在显示空间里调色（对比、饱和、暖高光 / 褐色暗部）+ 暗角 + 胶片颗粒
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 1.0 },
    uContrast: { value: 0.22 },
    uSat: { value: 0.76 },
    uLift: { value: new THREE.Vector3(0.022, 0.015, 0.009) },
    uGain: { value: new THREE.Vector3(0.99, 0.985, 0.96) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; uniform float uContrast; uniform float uSat;
    uniform vec3 uLift; uniform vec3 uGain; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = c * uGain + uLift * (1.0 - c);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.9, 0.22, length(d * vec2(1.12, 1.0)));
      c *= mix(1.0, v * 0.82 + 0.18, uAmount);
      c += (rand(vUv * 731.0 + uTime) - 0.5) * 0.022;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// 牌桌机位（v3.4 起实时画面只有这一个机位；开场、选对手、换人都是过场动画）。
// 改了机位要重新截 tools/anim 的 table 关键帧、重做低头 / 抬头的片段（它们的最后 / 第一帧就是这个机位看到的牌桌）
export const GAME_CAM = { pos: new THREE.Vector3(0, 21.5, 15.8), look: new THREE.Vector3(0, -1.6, 1.0), fov: 42 };

export class Stage {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.84; // v3.4 调暗、降饱和：原来牌桌比过场动画里的酒馆红亮得多，低头切到牌桌那一下刺眼（第二轮再调暗）
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(GAME_CAM.fov, window.innerWidth / window.innerHeight, 0.3, 1500);
    this.camera.position.copy(GAME_CAM.pos);
    this.camera.lookAt(GAME_CAM.look);
    this.camMode = 'game'; // 'game'：停在牌桌机位，有轻微呼吸感；'free'：由别处控制
    this.wobble = 1; // 镜头呼吸的幅度（从视频切回实时画面时先是 0，和视频最后一帧的机位完全一样，再慢慢加上）
    this.fovFixK = 1; // 窄屏加大视角的程度（和视频衔接时先按视频的视角，再慢慢放开）
    this.timeScale = 1; // 游戏时间的快慢：对手回合按住可以加速
    this.timeTarget = 1;
    this.videoAspect = 0; // 过场动画的宽高比（视频按高度铺满屏幕；比它还宽的屏幕上下会裁掉一点）

    // Composer applies pixelRatio itself. Supplying physical pixels here squared DPR.
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 环境光遮蔽：半分辨率计算，玻璃、火焰、光柱、毛皮外壳等不参与
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 1.0;
    this.gtao.updateGtaoMaterial({ radius: 7, distanceExponent: 1.4, thickness: 6, scale: 1.25, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    const gtaoSetSize = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => gtaoSetSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    this.gtao.setSize(size.x, size.y);
    const scene = this.scene;
    const cache = new Map();
    this.gtao.overrideVisibility = () => {
      scene.traverse((o) => {
        cache.set(o, o.visible);
        const m = o.material;
        if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (m && !Array.isArray(m) && m.transparent)) o.visible = false;
      });
    };
    this.gtao.restoreVisibility = () => {
      cache.forEach((v, o) => (o.visible = v));
      cache.clear();
    };
    this.composer.addPass(this.gtao);
    // 酒馆的光照（含环境光遮蔽）已经在 Blender 里烘焙好了，屏幕空间 AO 默认关掉，免得重复变暗
    this.gtao.enabled = false;
    // 阈值要高：只让火焰、烛光、窗户发光，不然整个画面都会被泛光糊一层
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.45, 1.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    // ?hq：锁定最高画质（无头浏览器截图自测用，软件渲染很慢，不锁会被自动降画质）
    this.quality = { level: location.search.includes('hq') ? -1 : 2, frames: 0, acc: 0 };
    this.pixelRatioCap = 2;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 一帧最多推进多少秒（卡顿时不会跳太远）。?maxdt=0.25：无头浏览器自测时帧率很低，让动画跟上真实时间
    const md = /maxdt=([0-9.]+)/.exec(location.search);
    this.maxDt = md ? +md[1] : 0.05;
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
    const pr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    if (pr !== this.renderer.getPixelRatio()) {
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
    }
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 窄屏时加大视角，保证整张桌子可见
    const aspect = w / h;
    // Keep the neutral coin and a clear gap beside the dice rows visible on narrow screens.
    const fit = 2 * Math.atan(Math.tan(GAME_CAM.fov * Math.PI / 360) * Math.max(1, 1.6 / aspect)) * 180 / Math.PI;
    this.fovFix = fit - GAME_CAM.fov;
    this.camera.updateProjectionMatrix();
  }

  add(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  frame() {
    if (this.paused || this.interactionPaused || document.hidden) {
      this.clock.getDelta();
      return;
    }
    const elapsed = this.clock.getDelta();
    const real = Math.min(elapsed, this.maxDt);
    // 时间快慢平滑地变：进慢镜头慢一点，出来快一点
    this.timeScale += (this.timeTarget - this.timeScale) * Math.min(1, real * (this.timeTarget < this.timeScale ? 7 : 11));
    const dt = real * this.timeScale;
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
      this.gamePos(t, this.camera.position);
      this.camera.fov = this.fovFor(GAME_CAM.fov);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(GAME_CAM.look);
    }
    this.grade.uniforms.uTime.value = t;
    this.composer.render();
    if (!document.hidden && elapsed < 0.5) this.watchQuality(elapsed);
  }

  // 牌桌机位此刻的位置（带呼吸）；别处临时接管镜头（掷币时推近）时从这里出发、回到这里
  gamePos(t = this.time, v = new THREE.Vector3()) {
    const p = GAME_CAM.pos;
    const wb = this.reducedMotion ? 0 : this.wobble;
    // 喝多了（彩蛋）：镜头慢慢晃
    const d = this.reducedMotion ? 0 : this.tipsy || 0;
    return v.set(p.x + Math.sin(t * 0.21) * 0.25 * wb + Math.sin(t * 0.9) * 1.1 * d, p.y + Math.sin(t * 0.33) * 0.15 * wb + Math.sin(t * 0.6) * 0.5 * d, p.z + Math.sin(t * 0.17) * 0.2 * wb + Math.cos(t * 0.75) * 0.8 * d);
  }


  // 开局后统计几秒帧时间：太慢就先关环境光遮蔽，再降分辨率
  watchQuality(dt) {
    const q = this.quality;
    if (q.level <= 0 || this.time < 4) return;
    q.frames++;
    q.acc += dt;
    if (q.frames < 90) return;
    const avg = q.acc / q.frames;
    q.frames = 0;
    q.acc = 0;
    if (avg < 1 / 40) return;
    if (q.level === 2) {
      this.bloom.enabled = false;
      q.level = 1;
    } else if (q.level === 1) {
      this.pixelRatioCap = 1;
      q.level = 0;
      this.resize();
    }
  }

  // 视频铺满屏幕后看到的竖直视角：屏幕比视频宽时视频按宽度铺满、上下裁掉，看到的范围比原来窄
  videoFov(f) {
    const aspect = window.innerWidth / window.innerHeight;
    if (!this.videoAspect || aspect <= this.videoAspect) return f;
    return (2 * Math.atan(Math.tan((f * Math.PI) / 360) * (this.videoAspect / aspect)) * 180) / Math.PI;
  }

  // 实时画面的视角：fovFixK = 0 时和视频一样（衔接用），1 时窄屏加大视角（保证整张桌子可见）
  fovFor(f) {
    const vf = this.videoFov(f);
    return vf + (f + this.fovFix - vf) * this.fovFixK;
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
