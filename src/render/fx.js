// 牌桌上的小特效（v5）：骰子砸在皮面上扬起的灰、金属骰子撞出的火星、全骰得分时飘起来的火星子、爆骰时冒的一缕烟、大分时落下的金屑。
// 全部是一个粒子池画的（两个 Points：柔光用普通混合，发光的用叠加），每帧在 CPU 上算，几百颗以内几乎没有开销。
import * as THREE from 'three';

const MAX = 700;
const VERT = /* glsl */ `
  attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
  void main(){
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec4 vColor; uniform float uHard;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(uHard, 1.0, d);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

class Pool {
  constructor(scene, blending, hard, renderOrder) {
    this.n = 0;
    this.p = new Float32Array(MAX * 3);
    this.c = new Float32Array(MAX * 4);
    this.s = new Float32Array(MAX);
    this.items = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.g = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uHard: { value: hard } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.userData.noAO = true;
    this.points.visible = false;
    scene.add(this.points);
  }
  add(o) {
    if (this.items.length >= MAX) this.items.shift();
    this.items.push(o);
  }
  update(dt, scale) {
    const it = this.items;
    let k = 0;
    for (let i = 0; i < it.length; i++) {
      const o = it[i];
      o.t += dt;
      if (o.t < 0) { it[k++] = o; continue; }
      if (o.t >= o.life) continue;
      o.vx *= 1 - o.drag * dt;
      o.vy = (o.vy - o.g * dt) * (1 - o.drag * dt);
      o.vz *= 1 - o.drag * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.z += o.vz * dt;
      if (o.floor !== undefined && o.y < o.floor) {
        o.y = o.floor;
        o.vy *= -0.3;
        o.vx *= 0.6;
        o.vz *= 0.6;
      }
      it[k++] = o;
    }
    it.length = k;
    let n = 0;
    for (const o of it) {
      if (o.t < 0) continue;
      const u = o.t / o.life;
      const j = n * 3;
      this.p[j] = o.x;
      this.p[j + 1] = o.y;
      this.p[j + 2] = o.z;
      const q = n * 4;
      // 淡入一点、淡出：灰尘先膨胀再散开，火星亮到最后才灭
      const a = o.a * Math.min(1, u * o.fadeIn) * (1 - u ** o.fade);
      this.c[q] = o.r;
      this.c[q + 1] = o.gc;
      this.c[q + 2] = o.b;
      this.c[q + 3] = a;
      this.s[n] = o.size * (1 + o.grow * u);
      n++;
    }
    this.n = n;
    this.points.visible = n > 0;
    if (!n) return;
    this.g.setDrawRange(0, n);
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.aColor.needsUpdate = true;
    this.g.attributes.aSize.needsUpdate = true;
    this.mat.uniforms.uScale.value = scale;
  }
}

const rand = (a, b) => a + Math.random() * (b - a);

export class TableFX {
  constructor(stage) {
    this.stage = stage;
    this.soft = new Pool(stage.scene, THREE.NormalBlending, 0, 7);
    this.glow = new Pool(stage.scene, THREE.AdditiveBlending, 0.15, 8);
    this.off = stage.add((dt) => this.update(dt));
    this.size = new THREE.Vector2();
  }

  update(dt) {
    const st = this.stage;
    st.renderer.getDrawingBufferSize(this.size);
    const scale = this.size.y / (2 * Math.tan((st.camera.fov * Math.PI) / 360));
    this.soft.update(dt, scale);
    this.glow.update(dt, scale);
  }


  // 金属撞金属：几颗一闪就灭的火星
  sparks(x, y, z, strength = 0.5) {
    const n = Math.round(3 + strength * 8);
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      const v = rand(5, 16) * (0.5 + strength);
      this.glow.add({
        t: 0, life: rand(0.14, 0.34), x, y: y + 0.1, z, vx: Math.cos(a) * v, vy: rand(3, 13), vz: Math.sin(a) * v, g: 120, drag: 1.4, floor: y,
        size: rand(0.07, 0.13), grow: -0.5, fade: 3, fadeIn: 40, a: 1, r: 3.2, gc: 1.7, b: 0.6,
      });
    }
  }

  // 火星子：从 (x, z) 附近慢慢飘起来（全骰得分）
  embers(x, y, z, n = 26, spread = 1.4) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28);
      const r = Math.sqrt(Math.random()) * spread;
      this.glow.add({
        t: rand(-0.45, 0), life: rand(0.9, 2.1), x: x + Math.cos(a) * r, y: y + rand(0, 0.7), z: z + Math.sin(a) * r,
        vx: rand(-1.4, 1.4), vy: rand(3.5, 10), vz: rand(-1.4, 1.4), g: -2.4, drag: 0.5,
        size: rand(0.08, 0.2), grow: -0.5, fade: 2.2, fadeIn: 9, a: 1, r: 2.8, gc: rand(1, 1.5), b: 0.28,
      });
    }
  }

  // 一缕烟（爆骰、吹灭蜡烛）
  smoke(x, y, z, n = 10, color = [0.3, 0.27, 0.25]) {
    for (let i = 0; i < n; i++) {
      this.soft.add({
        t: -i * 0.07, life: rand(1.1, 2), x: x + rand(-0.14, 0.14), y: y + rand(0, 0.2), z: z + rand(-0.14, 0.14),
        vx: rand(-0.5, 0.5), vy: rand(1.8, 3.8), vz: rand(-0.5, 0.5), g: -0.9, drag: 0.9,
        size: rand(0.38, 0.6), grow: 3.4, fade: 1.3, fadeIn: 4, a: rand(0.12, 0.22), r: color[0], gc: color[1], b: color[2],
      });
    }
  }

  // 金屑：从上方慢慢飘落（大分）
  motes(cx, cz, n = 36, spread = 7) {
    for (let i = 0; i < n; i++) {
      this.glow.add({
        t: rand(-0.7, 0), life: rand(1.1, 2.2), x: cx + rand(-spread, spread), y: rand(6, 11), z: cz + rand(-spread * 0.7, spread * 0.7),
        vx: rand(-0.7, 0.7), vy: rand(-6, -2.6), vz: rand(-0.7, 0.7), g: 3, drag: 0.8,
        size: rand(0.06, 0.15), grow: 0, fade: 2.6, fadeIn: 6, a: 1, r: 2.5, gc: 1.75, b: 0.6,
      });
    }
  }
}
