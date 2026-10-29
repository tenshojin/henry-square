// 酒馆里的四个人（Blender + MPFB 做的模型，带骨骼动画和表情形态键）。
// 难度决定谁坐到对面跟你掷骰：休闲 = 女店员、新手 = 中年汉子、酒馆常客 = 老人、骰子王 = 年轻人。
// 换对手时：原来的人往后推开椅子、起身、走回自己的位置；新来的人走过来、转身坐下、再把椅子挪近桌子。
// 不上场的人：中年汉子坐桌子左边、老人坐右边（隔一会儿喝一口、偶尔大笑），年轻人坐后面那张桌，
// 女店员端着托盘在柜台和桌边来回走（要上场时先把托盘放到柜台上）。
// 所有动作都按权重平滑过渡；IK（握骰盅、放托盘）、视线、表情也都平滑开关。
import * as THREE from 'three';
import { loadGLB, assetJSON } from './assets.js';
import { UNIT, TABLE_Y, FLOOR_Y } from './world.js';

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3();
const _q1 = new Q(), _q2 = new Q(), _q3 = new Q();
const ID = new Q();

const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const clamp = THREE.MathUtils.clamp;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawOf = (dx, dz) => Math.atan2(dx, dz);
// Blender 里的地面坐标（米，Z 向上）→ 游戏坐标
const B = (bx, by) => new V3(bx * UNIT, FLOOR_Y, -by * UNIT);

export const OPPONENT_OF = { casual: 'barmaid', novice: 'drinker', regular: 'elder', king: 'dicer' };
const HOME = { drinker: 'left', elder: 'right', dicer: 'king', barmaid: null };
const CHAIR_OUT = 0.28 * UNIT; // 椅子拉开多远
const SEAT_FWD = 0.36 * UNIT; // 坐着时脚下原点在椅子中心前面多远（chars_motion.SEAT_BACK + 0.06）
// 从各自的位置走到对手座位前的路线（Blender 坐标的中间点；起点终点由座位算出）
const VIA = {
  drinker: [[-0.71, 0.3], [-0.58, 0.64]],
  elder: [[0.71, 0.3], [0.58, 0.64]],
  dicer: [[0.95, 1.95], [0.8, 1.2], [0.58, 0.66]],
  barmaid: [[-1.4, 1.35], [-0.95, 0.95], [-0.58, 0.66]],
};

function wpos(o, out = new V3()) {
  return o.getWorldPosition(out);
}

// 把骨骼在世界空间里转一个角度 q（转完写回局部旋转）。用自己的临时变量，调用方传进来的 q 不会被改掉
const _rp = new Q(), _rb = new Q();
function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(_rp);
  bone.getWorldQuaternion(_rb);
  _rb.premultiply(q);
  bone.quaternion.copy(_rp.invert().multiply(_rb));
  bone.updateMatrixWorld(true);
}

// 两节 IK：肩 A、肘 B、腕 C，目标 T，肘部朝 pole 方向弯；w 是权重（0 = 不动，1 = 完全到位）
function twoBoneIK(upper, lower, hand, T, pole, w) {
  if (w <= 0.001) return;
  upper.updateWorldMatrix(true, true);
  const A = wpos(upper, _a), Bp = wpos(lower, _b), C = wpos(hand, _c);
  const l1 = A.distanceTo(Bp), l2 = Bp.distanceTo(C);
  const dir = _d.copy(T).sub(A);
  const dist = clamp(dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  dir.normalize();
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const pd = _e.copy(pole).sub(A);
  pd.sub(dir.clone().multiplyScalar(pd.dot(dir))).normalize();
  const elbow = A.clone().addScaledVector(dir, cosA * l1).addScaledVector(pd, Math.sin(Math.acos(cosA)) * l1);
  const wrist = A.clone().addScaledVector(dir, dist);
  _q1.setFromUnitVectors(Bp.clone().sub(A).normalize(), elbow.clone().sub(A).normalize());
  if (w < 1) _q1.slerp(ID, 1 - w);
  rotateWorld(upper, _q1);
  const B2 = wpos(lower, new V3()), C2 = wpos(hand, new V3());
  _q1.setFromUnitVectors(C2.sub(B2).normalize(), wrist.sub(B2).normalize());
  if (w < 1) _q1.slerp(ID, 1 - w);
  rotateWorld(lower, _q1);
}

function setupMaterials(root) {
  const morphMeshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const m = o.material;
    const n = (m.name || '').toLowerCase();
    if (n.includes('cornea')) {
      m.transparent = true;
      m.depthWrite = false;
      m.roughness = 0.04;
      o.castShadow = false;
    } else if (m.transparent || /hair|brows|lashes|beard|moustache/.test(n)) {
      // 头发、胡子、眉毛：随机透明（不用排序，也不会一片片发灰）
      m.transparent = false;
      m.alphaHash = true;
      m.depthWrite = true;
      m.side = THREE.DoubleSide;
    }
    if (n.includes('skin')) m.roughness = 0.5;
    m.envMapIntensity = 1.0;
    if (o.morphTargetDictionary) morphMeshes.push(o);
  });
  return morphMeshes;
}

function makeFace(meshes) {
  const w = { blink: 0, smile: 0, laugh: 0, open: 0 };
  return {
    w,
    apply() {
      for (const m of meshes) {
        const d = m.morphTargetDictionary;
        for (const k in w) if (d[k] !== undefined) m.morphTargetInfluences[d[k]] = w[k];
      }
    },
  };
}

// 地上的柔和影子（场景光照是烘焙的，会动的人和椅子各压一块圆形暗斑）
let blobTex = null;
function blob(rx, rz, opacity) {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.7)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, color: '#000', transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(rx, rz, 1);
  m.renderOrder = 1;
  m.userData.noAO = true;
  return m;
}

// ---------------- 椅子（会被推开、挪近） ----------------
class Seat {
  constructor(name, marker, model) {
    this.name = name;
    this.center = wpos(marker, new V3()).setY(FLOOR_Y);
    const q = marker.getWorldQuaternion(new Q());
    this.fwd = new V3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
    this.right = new V3(-this.fwd.z, 0, this.fwd.x);
    this.yaw = yawOf(this.fwd.x, this.fwd.z);
    this.out = 0; // 0 = 贴着桌子，1 = 拉开
    this.occupant = null;
    this.chair = model;
    this.chair.scale.setScalar(UNIT);
    this.shadow = blob(0.62 * UNIT, 0.58 * UNIT, 0.42);
    this.place();
  }
  chairPos(out = this.out, target = new V3()) {
    return target.copy(this.center).addScaledVector(this.fwd, -CHAIR_OUT * out);
  }
  // 坐在这张椅子上时，人物的脚下原点
  rootPos(out = this.out, target = new V3()) {
    return this.chairPos(out, target).addScaledVector(this.fwd, SEAT_FWD);
  }
  standPoint() {
    return this.rootPos(1);
  }
  place() {
    this.chairPos(this.out, this.chair.position);
    this.chair.rotation.set(0, this.yaw, 0);
    this.shadow.position.copy(this.chair.position).setY(FLOOR_Y + 0.12);
    this.shadow.rotation.z = this.yaw;
  }
}

// ---------------- 人物 ----------------
class Actor {
  constructor(name, gltf, meta) {
    this.name = name;
    this.root = gltf.scene;
    this.root.scale.setScalar(UNIT);
    this.bone = (n) => this.root.getObjectByName(n);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.act = {};
    for (const c of gltf.animations) {
      const a = this.mixer.clipAction(c);
      a.setEffectiveWeight(0);
      this.act[c.name.replace(name + '_', '')] = a;
    }
    this.w = {};
    this.target = {};
    this.fade = 0.4;
    this.face = makeFace(setupMaterials(this.root));
    this.baseSmile = 0;
    this.laughW = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.blinkPhase = -1;
    this.look = new V3();
    this.lookW = 0;
    this.walkSpeed = (meta.walk || 1) * UNIT;
    this.traySpeed = (meta.walk_tray || meta.walk || 1) * UNIT;
    this.pos = new V3();
    this.yaw = 0;
    this.state = 'idle';
    this.st = 0; // 当前状态已经持续了多久
    this.seat = null;
    this.goal = 'home';
    this.walk = null;
    this.oneShot = null;
    this.shadow = blob(0.6 * UNIT, 0.6 * UNIT, 0.38);
    this.stepPhase = 0;
    const head = this.bone('head');
    if (head) {
      this.root.updateMatrixWorld(true);
      head.getWorldQuaternion(_q1);
      this.headFwd = new V3(0, 0, 1).applyQuaternion(_q1.invert()).normalize();
    }
  }

  // ---- 动作权重：每个片段一个目标权重，按 fade 秒线性靠过去（总和保持 1，就是交叉淡化） ----
  setW(map, fade = 0.4) {
    this.fade = Math.max(0.04, fade);
    for (const k in this.act) this.target[k] = map[k] || 0;
    for (const k in map) {
      const a = this.act[k];
      if (a && map[k] > 0 && !a.isRunning() && !(a.loop === THREE.LoopOnce && a.paused)) {
        a.reset();
        a.play();
      }
    }
  }
  loop(name, fade = 0.4, ts = 1) {
    const a = this.act[name];
    if (!a) return;
    if (a.loop !== THREE.LoopRepeat || a.paused) {
      a.reset();
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
    }
    a.timeScale = ts;
    if (!a.isRunning()) a.play();
    this.setW({ [name]: 1 }, fade);
  }
  once(name, fade = 0.3, ts = 1) {
    const a = this.act[name];
    if (!a) return 0;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = ts;
    a.play();
    this.setW({ [name]: 1 }, fade);
    return a.getClip().duration / ts;
  }
  updateAnim(dt) {
    for (const k in this.act) {
      const a = this.act[k];
      const tgt = this.target[k] || 0;
      let w = this.w[k] || 0;
      if (w !== tgt) {
        const step = dt / this.fade;
        w = tgt > w ? Math.min(tgt, w + step) : Math.max(tgt, w - step);
        this.w[k] = w;
      }
      if (w <= 0 && tgt <= 0) {
        if (a.isRunning() || a.paused) a.stop();
      } else a.setEffectiveWeight(w);
    }
    this.mixer.update(dt);
  }

  setState(s) {
    this.state = s;
    this.st = 0;
  }
  place() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
  }

  // 头转向目标：限制角度，平滑跟随；脖子分担一部分
  lookAt(target, w, dt, rate = 3) {
    const head = this.bone('head');
    if (!head || !this.headFwd) return;
    if (target) {
      if (!this.lookInit) {
        this.look.copy(target);
        this.lookInit = true;
      }
      this.look.x = damp(this.look.x, target.x, rate, dt);
      this.look.y = damp(this.look.y, target.y, rate, dt);
      this.look.z = damp(this.look.z, target.z, rate, dt);
    }
    this.lookW = damp(this.lookW, target ? w : 0, 2.5, dt);
    if (this.lookW < 0.01) return;
    head.updateWorldMatrix(true, false);
    const hp = wpos(head, _a);
    const want = _b.copy(this.look).sub(hp).normalize();
    head.getWorldQuaternion(_q1);
    const cur = _c.copy(this.headFwd).applyQuaternion(_q1).normalize();
    const ang = cur.angleTo(want);
    const lim = 0.9;
    if (ang > lim) want.copy(cur).lerp(want, lim / ang).normalize();
    _q2.setFromUnitVectors(cur, want).slerp(ID, 1 - this.lookW);
    const neck = this.bone('neck_01');
    if (neck) {
      _q3.copy(ID).slerp(_q2, 0.4);
      rotateWorld(neck, _q3);
      head.getWorldQuaternion(_q1);
      const cur2 = _c.copy(this.headFwd).applyQuaternion(_q1).normalize();
      _q2.setFromUnitVectors(cur2, want).slerp(ID, 1 - this.lookW);
    }
    rotateWorld(head, _q2);
  }

  updateFace(dt) {
    const f = this.face.w;
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinkPhase < 0) {
      this.blinkPhase = 0;
      this.blinkT = 2.5 + Math.random() * 4;
    }
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.16;
      f.blink = Math.sin(Math.min(1, this.blinkPhase) * Math.PI);
      if (this.blinkPhase >= 1) this.blinkPhase = -1;
    }
    const o = this.oneShot;
    const lp = o && o.name === 'laugh' ? Math.min(1, o.t / o.dur) : -1;
    const target = lp >= 0 ? Math.sin(Math.PI * Math.min(1, lp * 1.15)) : 0;
    this.laughW = damp(this.laughW, target, 6, dt);
    const t = performance.now() / 1000;
    f.laugh = this.laughW * 0.9;
    f.open = this.laughW * (0.25 + 0.2 * Math.sin(t * 16));
    f.smile = Math.max(0, this.baseSmile * (1 - this.laughW));
    this.face.apply();
  }
}

// 路线：平滑曲线 + 弧长参数
function makeRoute(points) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal', 0.5);
  return { curve, len: curve.getLength() };
}
function nearestU(route, pos) {
  let best = 0, bd = Infinity;
  const n = 80;
  for (let i = 0; i <= n; i++) {
    const p = route.curve.getPointAt(i / n);
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < bd) {
      bd = d;
      best = i / n;
    }
  }
  return best * route.len;
}

export async function buildPeople(scene, world, { audio } = {}) {
  const updaters = [];
  const m = world.markers;
  const meta = assetJSON('people-meta') || {};
  const props = await loadGLB('props');
  const proto = (n) => props.scene.getObjectByName(n);

  // ---------- 座位 ----------
  const seats = {};
  for (const n of ['opp', 'left', 'right', 'king']) {
    const mk = m['CHAIR_' + n];
    if (!mk) continue;
    const chair = proto('chair').clone();
    chair.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const s = new Seat(n, mk, chair);
    scene.add(chair, s.shadow);
    seats[n] = s;
  }
  const opp = seats.opp;

  // ---------- 人物 ----------
  const actors = {};
  for (const name of ['dicer', 'drinker', 'elder', 'barmaid']) {
    const gltf = await loadGLB(name);
    const a = new Actor(name, gltf, meta[name] || {});
    scene.add(a.root, a.shadow);
    actors[name] = a;
  }
  const list = Object.values(actors);
  actors.dicer.baseSmile = 0.3;
  actors.drinker.baseSmile = 0.1;
  actors.elder.baseSmile = 0.18;
  const bm = actors.barmaid;
  bm.baseSmile = 0.4;

  const board = new V3(0, TABLE_Y, 0);
  // 对面的人瞄骰盘时看高一点：头不至于低到只露头顶，脸还在镜头里
  const boardUp = new V3(0, TABLE_Y + 0.25 * UNIT, 0);
  const tmp = new V3();
  const pan = (p) => clamp(p.x / 140, -0.8, 0.8);

  // ---------- 路线 ----------
  const path = [0, 1, 2].map((i) => m['PATH_barmaid_' + i]).filter(Boolean).map((o) => wpos(o, new V3()).setY(FLOOR_Y));
  const counter = m.TRAY_counter ? wpos(m.TRAY_counter, new V3()) : path[0].clone().setY(FLOOR_Y + 1.085 * UNIT);
  const routes = {};
  for (const name in VIA) {
    const start = HOME[name] ? seats[HOME[name]].standPoint() : path[0].clone();
    routes[name] = makeRoute([start, ...VIA[name].map(([x, y]) => B(x, y)), opp.standPoint()]);
  }
  const serveRoute = makeRoute(path);

  // ---------- 拿在手里的酒杯：放在座位前的桌上，喝的时候跟着右手 ----------
  const mugs = {};
  for (const [seatName, kind] of [['left', 'mug_wood'], ['right', 'mug_pewter'], ['king', 'mug_wood']]) {
    const seat = seats[seatName];
    if (!seat) continue;
    const g = proto(kind).clone();
    g.scale.setScalar(UNIT);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    scene.add(g);
    // 坐好时右手大概在脚下原点的位置（手伸到桌上），杯子在手前面一点、右边一点
    const rest = seat.rootPos(0, new V3()).addScaledVector(seat.fwd, 3.4).addScaledVector(seat.right, 0.2 * UNIT + 1.4);
    rest.y = seatName === 'king' ? FLOOR_Y + 0.745 * UNIT : TABLE_Y;
    const restQ = new Q().setFromAxisAngle(new V3(0, 1, 0), seat.yaw + Math.PI / 2);
    g.position.copy(rest);
    g.quaternion.copy(restQ);
    mugs[seatName] = { obj: g, rest, restQ, held: false, off: null, offQ: null, fitted: false };
  }
  // 按主人坐好时右手的真实位置摆杯子：在手外侧前方一点（喝的时候手握着杯把一起抬起来）
  const fitMug = (seatName) => {
    const mug = mugs[seatName];
    const seat = seats[seatName];
    const owner = list.find((x) => x.seat === seat && HOME[x.name] === seatName && x.state === 'seated');
    if (!mug || !owner) return;
    owner.root.updateMatrixWorld(true);
    const rest = wpos(owner.bone('hand_r'), new V3()).addScaledVector(seat.fwd, 3.2).addScaledVector(seat.right, 2.2);
    rest.y = mug.rest.y;
    mug.rest.copy(rest);
    mug.fitted = true;
    mug.obj.position.copy(rest);
    mug.obj.quaternion.copy(mug.restQ);
  };

  // ---------- 托盘 ----------
  const tray = proto('tray').clone();
  tray.scale.setScalar(UNIT);
  tray.traverse((o) => o.isMesh && (o.castShadow = true));
  scene.add(tray);
  let trayOnCounter = false;
  const trayLocal = new V3(0, 0.0, 0.3); // 端着时托盘在人物本地坐标里的位置（运行时按手的位置更新）

  // ---------- 状态切换 ----------
  const seatNow = (a, seat) => {
    a.seat = seat;
    seat.occupant = a;
    seat.out = 0;
    seat.place();
    seat.rootPos(0, a.pos);
    a.yaw = seat.yaw;
    a.walk = null;
    a.oneShot = null;
    a.loop('sit', 0.01);
    a.setState('seated');
    a.place();
  };
  const serveNow = (a) => {
    a.seat = null;
    a.walk = null;
    a.pos.copy(path[1] || path[0]);
    a.yaw = 0;
    a.loop('idle_tray', 0.01);
    a.serve = { seg: 1, dirSign: 1, wait: 1.5, v: 0 };
    a.setState('serve');
    trayOnCounter = false;
    a.place();
  };
  // 走一条路线（正向 = 去对手座位，反向 = 回去），从离现在位置最近的地方开始；到了执行 then()
  const walkRoute = (a, route, reverse, then, gate = false) => {
    a.walk = { route, u: nearestU(route, a.pos), dirSign: reverse ? -1 : 1, v: 0, then, gate };
    a.setState('walk');
  };
  const leaveSeat = (a, after) => {
    a.after = after;
    a.oneShot = null;
    a.lapSet = false;
    a.setW({ sit: 1 }, 0.3);
    a.setState('scoot_out');
    if (audio) audio.chairScrape(0.6, pan(a.pos), 0.1);
  };
  const arrive = (a, seat) => {
    a.walk = null;
    a.arriveSeat = seat;
    a.setState('arrive');
  };
  const goCounter = (a) => {
    a.walk = { route: serveRoute, u: nearestU(serveRoute, a.pos), dirSign: -1, v: 0, then: () => trayTask(a, 'down'), tray: true, toCounter: true };
    a.setState('walk');
  };
  const trayTask = (a, task) => {
    a.walk = null;
    a.task = task;
    a.setState('face_counter');
  };
  const backHome = (a) => (a.name === 'barmaid' ? walkRoute(a, routes.barmaid, true, () => trayTask(a, 'up')) : walkRoute(a, routes[a.name], true, () => arrive(a, seats[HOME[a.name]])));
  const toOpp = (a) => walkRoute(a, routes[a.name], false, () => arrive(a, opp), true);
  // 对手座位前那块地方有没有别人
  const gapBusy = (who) => {
    const sp = opp.standPoint();
    for (const o of list) {
      if (o === who) continue;
      if (o.seat === opp) return true;
      if (o.state === 'walk' && o.pos.distanceTo(sp) < 0.75 * UNIT) return true;
    }
    return false;
  };

  // ---------- 每个人朝自己的目标去（goal: 'opp' 坐到对面 / 'home' 回自己的位置） ----------
  function think(a) {
    const wantOpp = a.goal === 'opp';
    switch (a.state) {
      case 'seated':
        if (wantOpp && a.seat !== opp) {
          const o = opp.occupant;
          // 对面的人已经在走 / 起身了，或者没人：自己也起身
          if (!o || o === a || o.goal !== 'opp') leaveSeat(a, () => toOpp(a));
        } else if (!wantOpp && a.seat === opp) {
          leaveSeat(a, () => backHome(a));
        }
        break;
      case 'walk': {
        const w = a.walk;
        if (w.route === routes[a.name]) {
          const headingOpp = w.dirSign > 0;
          if (headingOpp !== wantOpp) {
            // 目标变了：掉头
            w.dirSign *= -1;
            w.gate = wantOpp;
            w.then = wantOpp ? () => arrive(a, opp) : a.name === 'barmaid' ? () => trayTask(a, 'up') : () => arrive(a, seats[HOME[a.name]]);
          }
        } else if (w.route === serveRoute && w.toCounter && !wantOpp) {
          // 正端着托盘往柜台走，又不用上场了：接着来回送酒
          a.walk = null;
          let seg = 0, bd = Infinity;
          path.forEach((p, i) => {
            const d = p.distanceTo(a.pos);
            if (d < bd) {
              bd = d;
              seg = i;
            }
          });
          a.serve = { seg, dirSign: seg >= path.length - 1 ? -1 : 1, wait: 0, v: 0 };
          a.setState('serve');
        }
        break;
      }
      case 'serve':
        if (wantOpp) goCounter(a);
        break;
      case 'stand':
        if (wantOpp) {
          if (a.name === 'barmaid' && !trayOnCounter) goCounter(a);
          else toOpp(a);
        } else if (a.name === 'barmaid') {
          if (trayOnCounter) {
            if (a.pos.distanceTo(path[0]) < 0.3 * UNIT) trayTask(a, 'up');
            else backHome(a);
          } else {
            a.serve = { seg: 0, dirSign: 1, wait: 0.5, v: 0 };
            a.setState('serve');
          }
        } else backHome(a);
        break;
    }
  }

  // ---------- 状态推进 ----------
  function step(a, dt) {
    a.st += dt;
    switch (a.state) {
      case 'seated': {
        // 偶尔喝一口 / 大笑（一次性片段，播完回到 sit）
        const o = a.oneShot;
        if (o) {
          o.t += dt;
          if (!o.back && o.t >= o.dur - 0.45) {
            o.back = true;
            a.setW({ sit: 1 }, 0.45);
          }
          if (o.t >= o.dur) a.oneShot = null;
        }
        a.seat.rootPos(a.seat.out, a.pos);
        break;
      }
      case 'scoot_out':
      case 'scoot_in': {
        // 连人带椅子一起挪
        const T = 0.75;
        const k = ease(clamp(a.st / T, 0, 1));
        const out = a.state === 'scoot_out';
        a.seat.out = out ? k : 1 - k;
        a.seat.place();
        a.seat.rootPos(a.seat.out, a.pos);
        if (out && a.st > 0.2 && !a.lapSet) {
          a.lapSet = true;
          a.setW({ sit_lap: 1 }, 0.45);
        }
        if (a.st >= T) {
          if (out) {
            a.riseT = a.once('stand_up', 0.3);
            a.setState('rise');
          } else a.setState('seated');
        }
        break;
      }
      case 'rise':
        if (a.st >= a.riseT - 0.05) {
          const seat = a.seat;
          a.seat = null;
          if (seat && seat.occupant === a) seat.occupant = null;
          a.loop(a.name === 'barmaid' && !trayOnCounter ? 'idle_tray' : 'idle', 0.3);
          a.setState('stand');
          const f = a.after;
          a.after = null;
          if (f) f();
        }
        break;
      case 'walk':
        walkStep(a, dt);
        break;
      case 'arrive': {
        const seat = a.arriveSeat;
        if ((seat === opp) !== (a.goal === 'opp')) {
          a.setState('stand');
          break;
        }
        // 对手座位还有人 / 门口有人在走：等一等
        if (seat === opp && ((opp.occupant && opp.occupant !== a) || gapBusy(a))) {
          a.setW({ idle: 1 }, 0.4);
          break;
        }
        a.seat = seat;
        seat.occupant = a;
        a.setState('turn_to_sit');
        break;
      }
      case 'turn_to_sit': {
        // 转身背对椅子（边转边小碎步），站到椅子前面
        const dy = wrapAngle(a.seat.yaw - a.yaw);
        a.yaw += dy * (1 - Math.exp(-5 * dt));
        a.pos.lerp(a.seat.standPoint(), 1 - Math.exp(-6 * dt));
        const turning = Math.min(1, Math.abs(dy) / 0.6) * 0.55;
        a.setW({ idle: 1 - turning, walk: turning }, 0.25);
        if (a.act.walk) a.act.walk.timeScale = 0.6;
        if ((Math.abs(dy) < 0.05 && a.pos.distanceTo(a.seat.standPoint()) < 0.6) || a.st > 1.8) {
          a.yaw = a.seat.yaw;
          a.pos.copy(a.seat.standPoint());
          a.seat.out = 1;
          a.seat.place();
          a.sitT = a.once('sit_down', 0.3);
          a.setState('sit_down');
        }
        break;
      }
      case 'sit_down':
        if (a.st >= a.sitT - 0.15) {
          a.setW({ sit: 1 }, 0.5);
          a.setState('scoot_in');
          if (audio) audio.chairScrape(0.5, pan(a.pos), 0.09);
        }
        break;
      case 'serve':
        serveStep(a, dt);
        break;
      case 'face_counter': {
        const want = yawOf(counter.x - a.pos.x, counter.z - a.pos.z);
        const dy = wrapAngle(want - a.yaw);
        a.yaw += dy * (1 - Math.exp(-5 * dt));
        const turning = Math.min(1, Math.abs(dy) / 0.6) * 0.5;
        if (a.task === 'down') a.setW({ idle_tray: 1 - turning, walk_tray: turning }, 0.25);
        else a.setW({ idle: 1 - turning, walk: turning }, 0.25);
        if (Math.abs(dy) < 0.06 || a.st > 1.5) {
          a.released = false;
          a.setState(a.task === 'down' ? 'tray_down' : 'tray_up');
        }
        break;
      }
      case 'tray_down':
        // 托盘放到柜台上：0.75 秒手托着送过去，然后松手、手臂放下
        if (a.st > 0.75 && !a.released) {
          a.released = true;
          trayOnCounter = true;
          a.setW({ idle: 1 }, 0.6);
          if (audio) audio.place(0);
        }
        if (a.st >= 1.4) a.setState('stand');
        break;
      case 'tray_up':
        // 先伸手扶住托盘（0.45 秒），再端起来（到 1.1 秒），手臂换成端托盘的姿势
        if (a.st > 0.5 && !a.released) {
          a.released = true;
          trayOnCounter = false;
          a.setW({ idle_tray: 1 }, 0.6);
        }
        if (a.st >= 1.45) {
          a.serve = { seg: 0, dirSign: 1, wait: 0.6, v: 0 };
          a.setState('serve');
        }
        break;
      case 'stand':
        a.setW(a.name === 'barmaid' && !trayOnCounter ? { idle_tray: 1 } : { idle: 1 }, 0.4);
        break;
    }
  }

  // 走路：加速、减速、转弯时放慢；idle / walk 按速度混合，步子频率跟速度对上（脚不打滑）
  function walkStep(a, dt) {
    const w = a.walk;
    const withTray = a.name === 'barmaid' && !trayOnCounter;
    const vmax = withTray ? a.traySpeed : a.walkSpeed;
    const remaining = w.dirSign > 0 ? w.route.len - w.u : w.u;
    if (w.gate && w.dirSign > 0 && remaining < 1.1 * UNIT && gapBusy(a)) {
      // 对手座位前还有人：在路口停下等
      w.v = Math.max(0, w.v - 2.5 * UNIT * dt);
    } else {
      const vStop = Math.sqrt(2 * 1.1 * UNIT * Math.max(0, remaining - 0.01 * UNIT));
      const p0 = w.route.curve.getPointAt(clamp(w.u / w.route.len, 0, 1));
      const p1 = w.route.curve.getPointAt(clamp((w.u + w.dirSign * 0.3 * UNIT) / w.route.len, 0, 1));
      const dy = p0.distanceTo(p1) > 0.01 ? wrapAngle(yawOf(p1.x - p0.x, p1.z - p0.z) - a.yaw) : 0;
      const turnSlow = Math.max(0.2, Math.cos(Math.min(Math.abs(dy), 1.45)) ** 2);
      const vt = Math.min(vmax * turnSlow, vStop);
      w.v = w.v < vt ? Math.min(vt, w.v + 1.5 * UNIT * dt) : Math.max(vt, w.v - 3 * UNIT * dt);
      a.yaw += dy * (1 - Math.exp(-4.5 * dt));
    }
    w.u = clamp(w.u + w.dirSign * w.v * dt, 0, w.route.len);
    const p = w.route.curve.getPointAt(clamp(w.u / w.route.len, 0, 1));
    a.pos.set(p.x, FLOOR_Y, p.z);
    const k = clamp(w.v / (0.45 * vmax), 0, 1);
    const walkName = withTray ? 'walk_tray' : 'walk';
    const idleName = withTray ? 'idle_tray' : 'idle';
    a.setW({ [idleName]: 1 - k, [walkName]: k }, 0.2);
    const wa = a.act[walkName];
    if (wa) wa.timeScale = clamp(w.v / vmax, 0.45, 1.2);
    // 脚步声：一个走路循环两步
    a.stepPhase += (w.v / vmax) * dt * 2 / (wa ? wa.getClip().duration : 1.1);
    if (a.stepPhase >= 1) {
      a.stepPhase -= 1;
      if (audio && k > 0.3) audio.footstep(pan(a.pos), 0.03 * k);
    }
    // 离终点不到 1.6 厘米就算到了（减速公式会让人停在终点前一点点）
    const left = w.dirSign > 0 ? w.route.len - w.u : w.u;
    if (left < 0.8 && !(w.gate && w.dirSign > 0 && gapBusy(a))) {
      w.u = w.dirSign > 0 ? w.route.len : 0;
      const pe = w.route.curve.getPointAt(w.u / w.route.len);
      a.pos.set(pe.x, FLOOR_Y, pe.z);
      const f = w.then;
      a.walk = null;
      a.setState('stand');
      if (f) f();
    }
  }

  // 女店员端托盘在柜台和桌边之间来回走
  function serveStep(a, dt) {
    const sv = a.serve;
    if (sv.wait > 0) {
      sv.wait -= dt;
      sv.v = damp(sv.v, 0, 6, dt);
      a.setW({ idle_tray: 1 }, 0.5);
      return;
    }
    const b = path[sv.seg + sv.dirSign];
    if (!b) {
      sv.dirSign *= -1;
      sv.wait = 3 + Math.random() * 3;
      return;
    }
    const to = tmp.copy(b).sub(a.pos);
    const d = Math.hypot(to.x, to.z);
    const dy = wrapAngle(yawOf(to.x, to.z) - a.yaw);
    a.yaw += dy * (1 - Math.exp(-5 * dt));
    const go = Math.max(0, Math.cos(dy)) ** 2;
    sv.v = damp(sv.v, a.traySpeed * 0.9 * go, 4, dt);
    const stepLen = Math.min(d, sv.v * dt);
    a.pos.x += (to.x / Math.max(d, 1e-6)) * stepLen;
    a.pos.z += (to.z / Math.max(d, 1e-6)) * stepLen;
    const k = clamp(sv.v / (0.45 * a.traySpeed), 0, 1);
    a.setW({ idle_tray: 1 - k, walk_tray: k }, 0.3);
    if (a.act.walk_tray) a.act.walk_tray.timeScale = clamp(sv.v / a.traySpeed, 0.5, 1.1);
    if (d < 1.5) {
      sv.seg += sv.dirSign;
      if (sv.seg <= 0 || sv.seg >= path.length - 1) {
        sv.dirSign *= -1;
        sv.wait = 3.5 + Math.random() * 3;
      }
    }
  }

  // ---------- 安排座位（instant：开局时直接坐好） ----------
  let want = 'elder';
  function arrange(name) {
    want = name;
    for (const s of Object.values(seats)) {
      s.occupant = null;
      s.out = 1;
      s.place();
    }
    for (const a of list) {
      a.goal = a.name === want ? 'opp' : 'home';
      if (a.goal === 'opp') seatNow(a, opp);
      else if (HOME[a.name]) seatNow(a, seats[HOME[a.name]]);
      else serveNow(a);
      a.updateAnim(0.001);
    }
    // 女店员坐在对面时，托盘留在柜台上
    trayOnCounter = want === 'barmaid';
    for (const [n, mg] of Object.entries(mugs)) {
      mg.held = false;
      if (!mg.fitted) fitMug(n);
      mg.obj.position.copy(mg.rest);
      mg.obj.quaternion.copy(mg.restQ);
    }
  }
  arrange(want);

  // ---------- 对手的骰盅：俯身伸手握住 ----------
  let cup = null;
  let cupRest = null;
  let cupW = 0;
  const grip = new V3();
  const lean = (p, amount) => {
    const ax = new V3(1, 0, 0).applyQuaternion(p.root.quaternion);
    for (const [b, k] of [['spine_01', 0.35], ['spine_02', 0.35], ['spine_03', 0.3]]) {
      const bone = p.bone(b);
      if (bone) rotateWorld(bone, _q1.setFromAxisAngle(ax, amount * k));
    }
  };

  const timers = { drink: 5 + Math.random() * 4, laugh: 18 + Math.random() * 10 };
  const seatedIdle = (a) => a.state === 'seated' && !a.oneShot && (a.w.sit || 0) > 0.95;

  function placeMugs() {
    for (const [n, mg] of Object.entries(mugs)) {
      if (mg.fitted) continue;
      const owner = list.find((x) => HOME[x.name] === n);
      if (owner && owner.seat === seats[n] && seatedIdle(owner)) fitMug(n);
    }
    for (const [seatName, mug] of Object.entries(mugs)) {
      const a = list.find((x) => x.seat === seats[seatName] && x.state === 'seated' && x.oneShot && x.oneShot.name === 'drink');
      if (a) {
        const hand = a.bone('hand_r');
        hand.updateWorldMatrix(true, false);
        const hq = hand.getWorldQuaternion(_q1);
        if (!mug.held) {
          // 开始喝：记下手和杯子的相对位置，之后杯子跟着手
          const inv = hq.clone().invert();
          mug.off = mug.rest.clone().sub(wpos(hand, new V3())).applyQuaternion(inv);
          mug.offQ = inv.multiply(mug.restQ);
          mug.held = true;
        }
        wpos(hand, mug.obj.position).add(_a.copy(mug.off).applyQuaternion(hq));
        mug.obj.quaternion.copy(hq).multiply(mug.offQ);
      } else if (mug.held) {
        mug.held = false;
        mug.obj.position.copy(mug.rest);
        mug.obj.quaternion.copy(mug.restQ);
      }
    }
  }

  function updateTray() {
    const s = bm.state;
    const hl = bm.bone('hand_l'), hr = bm.bone('hand_r');
    bm.root.updateMatrixWorld(true);
    const handsMid = () => wpos(hl, _d).add(wpos(hr, _e)).multiplyScalar(0.5).add(_c.set(0, 1.2, 0));
    const hold = () => bm.root.localToWorld(_b.copy(trayLocal));
    let ikW = 0;
    if (s === 'tray_down') {
      const k = ease(clamp(bm.st / 0.75, 0, 1));
      tray.position.lerpVectors(hold(), counter, k);
      ikW = bm.st < 0.75 ? 1 : clamp(1 - (bm.st - 0.75) / 0.5, 0, 1);
    } else if (s === 'tray_up') {
      const k = ease(clamp((bm.st - 0.45) / 0.65, 0, 1));
      tray.position.lerpVectors(counter, hold(), k);
      ikW = bm.st < 1.1 ? clamp(bm.st / 0.4, 0, 1) : clamp(1 - (bm.st - 1.1) / 0.3, 0, 1);
    } else if (!trayOnCounter) {
      tray.position.copy(handsMid());
      // 记下端着时托盘在她本地坐标里的位置（放下 / 拿起时用）
      bm.root.worldToLocal(trayLocal.copy(tray.position));
    } else {
      tray.position.copy(counter);
    }
    if (!trayOnCounter || s === 'tray_down' || s === 'tray_up') tray.rotation.set(0, bm.yaw, 0);
    if (ikW > 0.001) {
      // 两只手扶在托盘左右两边
      const side = _a.set(Math.cos(bm.yaw), 0, -Math.sin(bm.yaw));
      for (const [sd, sx] of [['l', 1], ['r', -1]]) {
        const tgt = tray.position.clone().addScaledVector(side, sx * 8.2).add(new V3(0, -0.5, 0));
        const sh = bm.bone('upperarm_' + sd);
        const pole = wpos(sh, new V3()).addScaledVector(side, sx * 14).add(new V3(0, -14, 0));
        twoBoneIK(sh, bm.bone('lowerarm_' + sd), bm.bone('hand_' + sd), tgt, pole, ikW);
      }
    }
  }

  updaters.push((dt, t, cam) => {
    for (const a of list) think(a);
    for (const a of list) step(a, dt);

    // 喝酒、笑（只有坐在自己老位子、手边有杯子的人才喝）
    timers.drink -= dt;
    timers.laugh -= dt;
    if (timers.drink <= 0) {
      const cands = list.filter((a) => seatedIdle(a) && a.seat !== opp && mugs[a.seat.name] && a.act.drink);
      if (cands.length) {
        const a = cands[Math.floor(Math.random() * cands.length)];
        a.oneShot = { name: 'drink', t: 0, dur: a.once('drink', 0.45) };
      }
      timers.drink = 6 + Math.random() * 6;
    }
    if (timers.laugh <= 0) {
      const cands = list.filter(seatedIdle);
      if (cands.length) {
        const a = cands[Math.floor(Math.random() * cands.length)];
        a.oneShot = { name: 'laugh', t: 0, dur: a.once('laugh', 0.4) };
      }
      timers.laugh = 20 + Math.random() * 15;
    }

    for (const a of list) {
      a.place();
      a.updateAnim(dt);
    }

    // 对手：盅一离开原位，权重平滑升到 1；先俯身再用 IK 握住盅身
    const oppA = opp.occupant && opp.occupant.state === 'seated' ? opp.occupant : null;
    if (cup && cupRest) {
      const moving = cup.position.distanceTo(cupRest) > 0.15;
      cupW = damp(cupW, moving && oppA ? 1 : 0, moving ? 6 : 2.5, dt);
      if (cupW > 0.001 && oppA) {
        lean(oppA, 0.42 * cupW);
        cup.updateMatrixWorld(true);
        grip.set(0, 2.1, 1.95).applyMatrix4(cup.matrixWorld);
        const sh = oppA.bone('upperarm_r');
        const pole = wpos(sh, tmp).add(new V3(-12, -10, 4).applyQuaternion(oppA.root.quaternion));
        twoBoneIK(sh, oppA.bone('lowerarm_r'), oppA.bone('hand_r'), grip, pole, cupW);
      }
    }

    // 视线：对手看自己的盅 / 骰盘 / 你；旁边的人看骰盘、看对手，有人走过来就看他
    const glance = (t * 0.07) % 1;
    const oppHead = oppA && oppA.bone('head') ? wpos(oppA.bone('head'), new V3()) : null;
    const mover = list.find((a) => ['walk', 'rise', 'sit_down', 'turn_to_sit', 'arrive'].includes(a.state));
    const moverHead = mover && mover.bone('head') ? wpos(mover.bone('head'), new V3()) : null;
    for (const a of list) {
      if (a === oppA) {
        if (cup && cupW > 0.3) a.lookAt(cup.position, 1, dt, 4);
        else if (moverHead && mover !== a && mover.pos.distanceTo(a.pos) < 2.2 * UNIT) a.lookAt(moverHead, 0.7, dt);
        else if (glance > 0.55 && glance < 0.78) a.lookAt(boardUp, 0.8, dt);
        else a.lookAt(cam.position, 0.75, dt);
      } else if (a.state === 'seated') {
        const drinking = a.oneShot && a.oneShot.name === 'drink';
        const g2 = (t * 0.05 + a.name.length * 0.13) % 1;
        const tgt = drinking ? null : moverHead && mover !== a && mover.pos.distanceTo(a.pos) < 2.5 * UNIT ? moverHead : g2 < 0.6 ? board : oppHead;
        a.lookAt(tgt, 0.7, dt);
      } else if (a.state === 'serve') {
        a.lookAt(board, a.serve.wait > 0 ? 0.6 : 0.3, dt);
      } else a.lookAt(null, 0, dt);
    }
    placeMugs();
    updateTray();

    // 地上的影子跟着骨盆
    for (const a of list) {
      const pel = a.bone('pelvis');
      if (pel) {
        wpos(pel, a.shadow.position);
        a.shadow.position.y = FLOOR_Y + 0.15;
      }
      a.updateFace(dt);
    }
  });

  return {
    updaters,
    people: actors,
    seats,
    setOpponentCup(obj, rest) {
      cup = obj;
      cupRest = rest.clone();
    },
    // 换对手：instant = 直接坐好（刚进游戏时用）
    setOpponent(name, instant = false) {
      if (!actors[name]) return;
      if (instant) arrange(name);
      want = name;
      for (const a of list) a.goal = a.name === want ? 'opp' : 'home';
    },
    opponent: () => want,
    // 对手坐稳了没有、有没有人还在走动
    isReady() {
      const a = actors[want];
      return !!a && opp.occupant === a && a.state === 'seated' && opp.out < 0.01;
    },
    busy() {
      return list.some((a) => !['seated', 'serve'].includes(a.state));
    },
    whenReady(timeout = 25) {
      return new Promise((res) => {
        const t0 = performance.now();
        const tick = () => {
          if (this.isReady() || performance.now() - t0 > timeout * 1000) res();
          else setTimeout(tick, 100);
        };
        tick();
      });
    },
    // 游戏里的事件：有人爆了、收了大分……让桌边的人有点反应
    react(kind) {
      const oppA = opp.occupant;
      const who = list.filter((a) => a.state === 'seated' && !a.oneShot && (kind === 'bust' ? a !== oppA : a === oppA));
      who.forEach((p, i) =>
        setTimeout(() => {
          if (p.state === 'seated' && !p.oneShot) p.oneShot = { name: 'laugh', t: 0, dur: p.once('laugh', 0.4) };
        }, 250 + i * 400)
      );
    },
  };
}
