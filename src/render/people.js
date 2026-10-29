// 酒馆里的四个人（Blender + MPFB 做的模型，带骨骼动画和表情形态键）：
//   对面掷骰的年轻人：平时手放桌上，他的骰盅一动就俯身伸手握住，跟着摇、跟着倒；
//   左边的中年汉子、右边的老人：隔一会儿举杯喝一口，偶尔大笑；
//   女店员：端着托盘在柜台和桌边来回走。
// 动作之间都用交叉淡入淡出，IK、视线、表情的权重也都平滑过渡。
import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { UNIT, TABLE_Y, FLOOR_Y } from './world.js';
import * as P from './props.js';

const V3 = THREE.Vector3;
const Q = THREE.Quaternion;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3();
const _q1 = new Q(), _q2 = new Q(), _q3 = new Q();
const ID = new Q();

// 越来越接近目标、但不会过冲的平滑（跟帧率无关）
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

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
  const A = wpos(upper, _a), B = wpos(lower, _b), C = wpos(hand, _c);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const dir = _d.copy(T).sub(A);
  const dist = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  dir.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const pd = _e.copy(pole).sub(A);
  pd.sub(dir.clone().multiplyScalar(pd.dot(dir))).normalize();
  const elbow = A.clone().addScaledVector(dir, Math.cos(Math.acos(cosA)) * l1).addScaledVector(pd, Math.sin(Math.acos(cosA)) * l1);
  const wrist = A.clone().addScaledVector(dir, dist);
  _q1.setFromUnitVectors(B.clone().sub(A).normalize(), elbow.clone().sub(A).normalize());
  if (w < 1) _q1.slerp(ID, 1 - w);
  rotateWorld(upper, _q1);
  const B2 = wpos(lower, new V3()), C2 = wpos(hand, new V3());
  _q1.setFromUnitVectors(C2.sub(B2).normalize(), wrist.sub(B2).normalize());
  if (w < 1) _q1.slerp(ID, 1 - w);
  rotateWorld(lower, _q1);
}

// 简单的酒杯/托盘（世界单位：1 米 = 50）
function tankard(kind) {
  const mats = {
    stave: new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.6 }),
    iron: new THREE.MeshStandardMaterial({ color: '#3a3430', metalness: 0.8, roughness: 0.45 }),
    pewter: new THREE.MeshStandardMaterial({ color: '#9a9a94', metalness: 0.9, roughness: 0.32 }),
    foam: new THREE.MeshStandardMaterial({ color: '#e8dcb8', roughness: 0.9 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b48a3e', metalness: 1, roughness: 0.4 }),
    lid: new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.9 }),
  };
  const g = kind === 'pewter' ? P.pewterTankard(mats, 2.2) : P.woodTankard(mats, 2.3);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

function serveTray() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#6a4628', roughness: 0.6 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(9, 8.6, 0.6, 32), wood);
  disc.castShadow = true;
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8.9, 0.35, 6, 32), wood);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.4;
  g.add(rim);
  for (const [x, z, k] of [[-3.5, -1.5, 'wood'], [3, -2.5, 'pewter'], [0.5, 3.5, 'wood']]) {
    const t = tankard(k);
    t.position.set(x, 0.3, z);
    t.rotation.y = x;
    g.add(t);
  }
  return g;
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

class Person {
  constructor(name, gltf, marker) {
    this.name = name;
    this.root = gltf.scene;
    this.root.scale.setScalar(UNIT);
    if (marker) {
      marker.getWorldPosition(this.root.position);
      marker.getWorldQuaternion(this.root.quaternion);
    }
    this.root.updateMatrixWorld(true);
    this.bone = (n) => this.root.getObjectByName(n);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name.replace(name + '_', '')] = c;
    this.actions = {};
    for (const k in this.clips) this.actions[k] = this.mixer.clipAction(this.clips[k]);
    this.current = null;
    this.face = makeFace(setupMaterials(this.root));
    this.baseSmile = 0;
    this.laughW = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.blinkPhase = -1;
    this.look = new V3();
    this.lookW = 0;
    this.lookTarget = null;
    // 头部“正前方”：模型面朝本地 +Z，记下头骨在静止姿势下的前方向
    const head = this.bone('head');
    if (head) {
      head.getWorldQuaternion(_q1);
      const fwd = new V3(0, 0, 1).applyQuaternion(this.root.quaternion);
      this.headFwd = fwd.applyQuaternion(_q1.invert()).normalize();
    }
  }

  // 主循环动作（idle / walk）：从当前动作交叉淡入
  loop(name, fade = 0.5, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    else a.fadeIn(fade);
    this.current = a;
    this.base = name;
  }

  // 一次性动作（喝一口、大笑）：淡入，播完再淡回主循环
  once(name, fade = 0.45) {
    const a = this.actions[name];
    if (!a || this.oneShot) return false;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.oneShot = { name, a, t: 0, dur: a.getClip().duration, fade, base: this.current };
    this.current = a;
    return true;
  }

  updateAnim(dt) {
    this.mixer.update(dt);
    const s = this.oneShot;
    if (s) {
      s.t += dt;
      if (s.t >= s.dur - s.fade && !s.back) {
        s.back = true;
        const b = s.base;
        b.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        s.a.crossFadeTo(b, s.fade, false);
        this.current = b;
      }
      if (s.t >= s.dur) this.oneShot = null;
    }
  }

  phase(name) {
    const s = this.oneShot;
    return s && s.name === name ? Math.min(1, s.t / s.dur) : -1;
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
    const lp = this.phase('laugh');
    const target = lp >= 0 ? Math.sin(Math.PI * Math.min(1, lp * 1.15)) : 0;
    this.laughW = damp(this.laughW, target, 6, dt);
    const t = performance.now() / 1000;
    f.laugh = this.laughW * 0.9;
    f.open = this.laughW * (0.25 + 0.2 * Math.sin(t * 16));
    f.smile = Math.max(0, this.baseSmile * (1 - this.laughW));
    this.face.apply();
  }
}

export async function buildPeople(scene, world, { camera } = {}) {
  const updaters = [];
  const m = world.markers;
  const people = {};
  for (const name of ['dicer', 'drinker', 'elder', 'barmaid']) {
    const gltf = await loadGLB(name);
    const p = new Person(name, gltf, m['SEAT_' + name] || m.PATH_barmaid_0);
    scene.add(p.root);
    people[name] = p;
    p.loop('idle', 0.01);
  }
  const { dicer, drinker, elder, barmaid } = people;
  dicer.baseSmile = 0.3;
  drinker.baseSmile = 0.1;
  elder.baseSmile = 0.18;
  barmaid.baseSmile = 0.4;

  const tray = new V3(0, TABLE_Y, 0);
  const tmp = new V3();

  // ---------- 拿在手里的酒杯：跟着右手走，静止时杯底落在桌面上 ----------
  const holders = [];
  for (const [p, kind] of [[drinker, 'wood'], [elder, 'pewter']]) {
    const hand = p.bone('hand_r');
    if (!hand) continue;
    const mug = tankard(kind);
    scene.add(mug);
    hand.updateWorldMatrix(true, false);
    const hp = wpos(hand, new V3());
    const fwd = new V3(0, 0, 1).applyQuaternion(p.root.quaternion);
    const side = new V3(1, 0, 0).applyQuaternion(p.root.quaternion);
    const restPos = hp.clone().addScaledVector(fwd, 3.2).addScaledVector(side, 1.2);
    restPos.y = TABLE_Y;
    const hq = hand.getWorldQuaternion(new Q());
    const inv = hq.clone().invert();
    holders.push({ p, hand, mug, offPos: restPos.clone().sub(hp).applyQuaternion(inv), offRot: inv.multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), Math.atan2(fwd.x, fwd.z) + Math.PI / 2)) });
  }
  const placeHeld = () => {
    for (const h of holders) {
      h.hand.updateWorldMatrix(true, false);
      const hq = h.hand.getWorldQuaternion(_q1);
      wpos(h.hand, h.mug.position).add(_a.copy(h.offPos).applyQuaternion(hq));
      h.mug.quaternion.copy(hq).multiply(h.offRot);
    }
  };

  // ---------- 对面的年轻人：俯身握住自己的骰盅 ----------
  let cup = null;
  let cupRest = null;
  let cupW = 0;
  const grip = new V3();
  const lean = (p, amount) => {
    for (const [b, k] of [['spine_01', 0.35], ['spine_02', 0.35], ['spine_03', 0.3]]) {
      const bone = p.bone(b);
      if (!bone) continue;
      // 绕人物自己的左右轴往前弯
      const ax = new V3(1, 0, 0).applyQuaternion(p.root.quaternion);
      rotateWorld(bone, _q1.setFromAxisAngle(ax, amount * k));
    }
  };

  // ---------- 女店员：沿着标记点来回走 ----------
  const path = [0, 1, 2].map((i) => m['PATH_barmaid_' + i]).filter(Boolean).map((o) => wpos(o, new V3()));
  const walk = { seg: 0, dirSign: 1, pos: path[0] ? path[0].clone() : barmaid.root.position.clone(), wait: 2, yaw: 0, speed: 38 };
  const trayObj = serveTray();
  scene.add(trayObj);
  if (path.length > 1) walk.yaw = Math.atan2(path[1].x - path[0].x, path[1].z - path[0].z);

  // 定时：喝一口、笑一下
  const timers = { drinker: 4 + Math.random() * 4, elder: 9 + Math.random() * 5, laugh: 18 + Math.random() * 10 };

  updaters.push((dt, t, cam) => {
    // 喝酒、笑
    timers.drinker -= dt;
    timers.elder -= dt;
    timers.laugh -= dt;
    if (timers.drinker <= 0 && drinker.once('drink')) timers.drinker = 8 + Math.random() * 6;
    if (timers.elder <= 0 && elder.once('drink')) timers.elder = 11 + Math.random() * 7;
    if (timers.laugh <= 0) {
      const who = [dicer, drinker, elder][Math.floor(Math.random() * 3)];
      who.once('laugh');
      timers.laugh = 20 + Math.random() * 15;
    }
    for (const p of [dicer, drinker, elder]) p.updateAnim(dt);

    // 年轻人：盅一离开原位，权重平滑升到 1；先俯身再用 IK 握住盅身
    if (cup && cupRest) {
      const moving = cup.position.distanceTo(cupRest) > 0.15;
      cupW = damp(cupW, moving ? 1 : 0, moving ? 6 : 2.5, dt);
      if (cupW > 0.001) {
        lean(dicer, 0.42 * cupW);
        cup.updateMatrixWorld(true);
        grip.set(0, 2.1, 1.95).applyMatrix4(cup.matrixWorld);
        const sh = dicer.bone('upperarm_r');
        const pole = wpos(sh, tmp).add(new V3(-12, -10, 4).applyQuaternion(dicer.root.quaternion));
        twoBoneIK(sh, dicer.bone('lowerarm_r'), dicer.bone('hand_r'), grip, pole, cupW);
      }
    }
    // 视线：年轻人看自己的盅 / 骰盘 / 你；另外两人看骰盘或者看他
    const glance = (t * 0.07) % 1;
    const dHead = dicer.bone('head') ? wpos(dicer.bone('head'), new V3()) : null;
    if (cup && cupW > 0.3) dicer.lookAt(cup.position, 1, dt, 4);
    else if (glance > 0.55 && glance < 0.78) dicer.lookAt(tray, 0.8, dt);
    else dicer.lookAt(cam.position, 0.75, dt);
    const g2 = (t * 0.05 + 0.3) % 1;
    drinker.lookAt(drinker.phase('drink') >= 0 ? null : g2 < 0.6 ? tray : dHead, 0.7, dt);
    const g3 = (t * 0.06 + 0.6) % 1;
    elder.lookAt(elder.phase('drink') >= 0 ? null : g3 < 0.5 ? tray : dHead, 0.7, dt);
    placeHeld();

    // 女店员
    if (path.length > 1) {
      const a = path[walk.seg], b = path[walk.seg + walk.dirSign];
      if (walk.wait > 0) {
        walk.wait -= dt;
        barmaid.loop('idle', 0.6);
        if (walk.wait <= 0) walk.turning = false;
      } else if (b) {
        const to = tmp.copy(b).sub(walk.pos);
        const d = Math.hypot(to.x, to.z);
        const targetYaw = Math.atan2(to.x, to.z);
        let dy = targetYaw - walk.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        walk.yaw += dy * (1 - Math.exp(-5 * dt));
        // 先转身再迈步：朝向差得多时放慢
        const go = Math.max(0, Math.cos(dy)) ** 2;
        barmaid.loop('walk', 0.45, 0.7);
        const step = Math.min(d, walk.speed * go * dt);
        walk.pos.x += (to.x / Math.max(d, 1e-6)) * step;
        walk.pos.z += (to.z / Math.max(d, 1e-6)) * step;
        if (d < 1.5) {
          walk.seg += walk.dirSign;
          if (walk.seg <= 0 || walk.seg >= path.length - 1) {
            walk.dirSign *= -1;
            walk.wait = 3.5 + Math.random() * 3;
          }
        }
      }
      barmaid.root.position.set(walk.pos.x, FLOOR_Y, walk.pos.z);
      barmaid.root.rotation.set(0, walk.yaw, 0);
    }
    barmaid.updateAnim(dt);
    barmaid.lookAt(tray, walk.wait > 0 ? 0.6 : 0.3, dt);
    // 托盘：两只手中间，保持水平
    const hl = barmaid.bone('hand_l'), hr = barmaid.bone('hand_r');
    if (hl && hr) {
      barmaid.root.updateMatrixWorld(true);
      const pl = wpos(hl, _d), pr = wpos(hr, _e);
      trayObj.position.copy(pl).add(pr).multiplyScalar(0.5);
      trayObj.position.y += 1.2;
      trayObj.rotation.set(0, walk.yaw, 0);
    }

    for (const p of Object.values(people)) p.updateFace(dt);
  });

  return {
    updaters,
    people,
    setOpponentCup(obj, rest) {
      cup = obj;
      cupRest = rest.clone();
    },
    // 游戏里的事件：有人爆了、收了大分……让桌边的人有点反应
    react(kind) {
      if (kind === 'bust' || kind === 'big') {
        const who = kind === 'bust' ? [drinker, elder] : [dicer];
        who.forEach((p, i) => setTimeout(() => p.once('laugh'), 250 + i * 400));
      }
    },
  };
}
