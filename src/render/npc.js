// 中世纪平民 NPC：用关节层级搭出的风格化人物 + 程序化循环动作
// 单位与场景一致（1 = 2cm）。人物面朝 +z，左手在 +x 一侧。
import * as THREE from 'three';
import { makeCanvas, mulberry32 } from './canvasTex.js';

let weave = null;
function weaveTex() {
  if (weave) return weave;
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  const rnd = mulberry32(17);
  for (let i = 0; i < 128; i += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.1})`;
    ctx.fillRect(i, 0, 1, 128);
    ctx.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.08})`;
    ctx.fillRect(0, i, 128, 1);
  }
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)';
    ctx.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 1);
  }
  weave = new THREE.CanvasTexture(c);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(3, 3);
  return weave;
}
const matCache = new Map();
function cloth(color) {
  const k = 'c' + color;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.93, bumpMap: weaveTex(), bumpScale: 0.8 }));
  return matCache.get(k);
}
function solid(color, roughness = 0.8) {
  const k = 's' + color + roughness;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness }));
  return matCache.get(k);
}
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 12);
const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/**
 * 生成一个人物
 * opts: { female, skin, hair, tunic, hose, boots, belt, headwear: 'hair'|'hood'|'coif'|'hat'|'cap'|'veil', hood, beard, apron, scale, width }
 */
export function createNPC(opts = {}) {
  const P = {
    female: false,
    skin: '#dcae8a',
    hair: '#4a3420',
    tunic: '#6b4f33',
    hose: '#4a3a2a',
    boots: '#3a2616',
    belt: '#3a2414',
    headwear: 'hair',
    hood: '#3e5a3a',
    beard: false,
    apron: null,
    scale: 1,
    width: 1,
    ...opts,
  };
  const M = {
    tunic: cloth(P.tunic),
    hose: cloth(P.hose),
    skin: solid(P.skin, 0.62),
    lip: solid('#8a4a3a', 0.6),
    dark: solid('#1e140e', 0.4),
    hair: solid(P.hair, 0.95),
    boots: solid(P.boots, 0.7),
    belt: solid(P.belt, 0.55),
    hood: cloth(P.hood),
    linen: cloth('#e8e0cc'),
    buckle: new THREE.MeshStandardMaterial({ color: '#b08a3a', metalness: 1, roughness: 0.4 }),
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(P.scale);
  root.add(body);
  const pelvis = new THREE.Group();
  pelvis.position.y = 46;
  body.add(pelvis);
  const torso = new THREE.Group();
  pelvis.add(torso);

  // 躯干（束腰外衣 / 连衣裙上身）
  const torsoPts = P.female
    ? [[6.4, 0], [6.0, 4], [5.8, 8], [7.6, 14], [8.2, 17], [7.6, 21], [6.6, 24], [2.8, 26.4], [2.1, 27]]
    : [[7.0, 0], [7.4, 4], [7.1, 9], [8.1, 16], [8.7, 21], [8.3, 24.4], [6.6, 26.2], [3.0, 27.3], [2.2, 27.8]];
  const chest = mesh(lathe(torsoPts, 22), M.tunic);
  chest.scale.set(1.17 * P.width, 1, 0.8);
  torso.add(chest);
  // 腰带
  const belt = mesh(new THREE.TorusGeometry(7.1, 0.75, 6, 26), M.belt, 0, 1.4, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.17 * P.width, 0.8, 1);
  torso.add(belt);
  torso.add(mesh(new THREE.BoxGeometry(2, 1.8, 0.6), M.buckle, 0, 1.4, 5.8));
  if (!P.female) {
    const pouch = mesh(new THREE.BoxGeometry(2.6, 3.2, 1.6), M.belt, -5.8, -1.2, 3.4);
    pouch.rotation.y = 0.5;
    torso.add(pouch);
  }
  // 下摆：男子的外衣下摆（坐下时隐藏）/ 女子的长裙
  const skirt = P.female
    ? mesh(lathe([[6.6, 0], [8.4, -8], [10.4, -22], [11.8, -38], [12.2, -45], [11.6, -45.2]], 24), M.tunic)
    : mesh(lathe([[7.2, 0], [8.4, -6], [9.4, -14], [9.8, -18.5], [9.2, -18.7]], 22), M.tunic);
  skirt.material = skirt.material.clone();
  skirt.material.side = THREE.DoubleSide;
  skirt.scale.set(1.12 * P.width, 1, 0.86);
  pelvis.add(skirt);
  if (P.apron) {
    // 围裙顺着裙摆的弧度贴在前面（挂在下摆上，跟着一起摆动）
    const prof = P.female
      ? [[7.1, 0.8], [8.9, -8], [10.9, -22], [12.3, -36]]
      : [[7.7, 0.8], [8.9, -6], [9.9, -14], [10.3, -20], [10.4, -25]];
    const apron = mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 12, -0.95, 1.9), cloth(P.apron));
    apron.material = apron.material.clone();
    apron.material.side = THREE.DoubleSide;
    skirt.add(apron);
  }

  // 头颈
  const neck = new THREE.Group();
  neck.position.y = 26.4;
  torso.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(2.0, 2.3, 4.2, 12), M.skin, 0, 1.6, 0));
  const head = new THREE.Group();
  head.position.y = 3.4;
  neck.add(head);
  const skull = mesh(new THREE.SphereGeometry(4.3, 22, 18), M.skin, 0, 4.7, 0.2);
  skull.scale.set(0.93, 1.13, 1.02);
  head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(3.2, 16, 12), M.skin, 0, 2.6, 1.0);
  jaw.scale.set(1, 0.85, 1);
  head.add(jaw);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.95, 10, 8), M.skin, s * 3.95, 4.5, 0.1);
    ear.scale.set(0.45, 1, 0.75);
    head.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.46, 10, 8), M.dark, s * 1.45, 5.3, 3.85);
    eye.scale.z = 0.6;
    head.add(eye);
    const brow = mesh(new THREE.BoxGeometry(1.8, 0.4, 0.5), M.hair, s * 1.5, 6.25, 3.95);
    brow.rotation.z = s * -0.12;
    head.add(brow);
  }
  const nose = mesh(new THREE.ConeGeometry(0.75, 2.2, 8), M.skin, 0, 4.4, 4.45);
  nose.rotation.x = Math.PI / 2 - 0.35;
  head.add(nose);
  head.add(mesh(new THREE.BoxGeometry(1.7, 0.32, 0.4), M.lip, 0, 2.55, 3.95));
  if (P.beard) {
    const beard = mesh(new THREE.SphereGeometry(3.1, 14, 10), M.hair, 0, 2.0, 1.9);
    beard.scale.set(1.05, 0.95, 0.85);
    head.add(beard);
    const stache = mesh(cap(0.5, 2.2), M.hair, 0, 3.15, 4.0);
    stache.rotation.z = Math.PI / 2;
    head.add(stache);
  }
  // 头部装束
  const hw = P.headwear;
  if (hw === 'hair' || hw === 'hat' || hw === 'cap') {
    const hair = mesh(new THREE.SphereGeometry(4.55, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 5.0, -0.25);
    hair.scale.set(0.97, 1.12, 1.06);
    hair.rotation.x = -0.62;
    head.add(hair);
  }
  if (hw === 'hat') {
    const felt = solid(P.hood, 0.95);
    head.add(mesh(new THREE.CylinderGeometry(6.8, 6.8, 0.5, 24), felt, 0, 8.4, 0));
    head.add(mesh(new THREE.CylinderGeometry(3.4, 4.0, 4.4, 20), felt, 0, 10.6, 0));
  }
  if (hw === 'cap') {
    const c = mesh(new THREE.SphereGeometry(4.75, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth(P.hood), 0, 5.6, -0.2);
    c.rotation.x = -0.2;
    head.add(c);
  }
  if (hw === 'coif') {
    const c = mesh(new THREE.SphereGeometry(4.6, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), M.linen, 0, 4.9, -0.3);
    c.scale.set(0.98, 1.12, 1.06);
    head.add(c);
  }
  if (hw === 'hood') {
    // 兜帽 + 披肩 + 帽尾
    // 帽沿停在额头，露出整张脸；后面一直包到后颈
    const h = mesh(new THREE.SphereGeometry(5.3, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hood, 0, 4.9, -0.9);
    h.scale.set(1, 1.12, 1.1);
    h.rotation.x = -0.75;
    head.add(h);
    // 披肩顺着肩膀垂下来，把肩头整个盖住
    const capelet = mesh(lathe([[13.8, 17.2], [13.6, 19.5], [13.2, 22.8], [12.0, 25.8], [8.4, 27.9], [3.4, 28.8]], 26), M.hood);
    capelet.scale.set(P.width, 1, 0.88);
    capelet.material = capelet.material.clone();
    capelet.material.side = THREE.DoubleSide;
    torso.add(capelet);
    const tail = mesh(cap(1.0, 9), M.hood, 0, 2.0, -6.6);
    tail.rotation.x = 0.3;
    head.add(tail);
  }
  if (hw === 'veil') {
    // 头巾：前沿在额头，后面垂到肩背；脖子上再围一圈裹颈布
    const v = mesh(new THREE.SphereGeometry(5.0, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M.linen, 0, 4.9, -0.5);
    v.scale.set(1, 1.12, 1.08);
    v.rotation.x = -0.76;
    head.add(v);
    const linen2 = M.linen.clone();
    linen2.side = THREE.DoubleSide;
    head.add(mesh(new THREE.CylinderGeometry(4.9, 7.4, 15, 18, 1, true, Math.PI / 2, Math.PI), linen2, 0, -2.5, -0.6));
    neck.add(mesh(new THREE.CylinderGeometry(2.55, 3.3, 4.6, 14, 1, true), linen2, 0, 1.3, 0.1));
  }

  // 手臂
  const sh = [];
  const el = [];
  const hand = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 9.4 * P.width, 23.4, 0);
    torso.add(shoulder);
    shoulder.add(mesh(new THREE.SphereGeometry(3.0, 14, 10), M.tunic, 0, 0, 0));
    shoulder.add(mesh(cap(2.45, 8.6), M.tunic, 0, -6.4, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -12.8;
    shoulder.add(elbow);
    elbow.add(mesh(cap(2.1, 8.2), M.tunic, 0, -5.4, 0));
    const cuff = mesh(new THREE.TorusGeometry(2.0, 0.5, 6, 14), M.tunic, 0, -10.4, 0);
    cuff.rotation.x = Math.PI / 2;
    elbow.add(cuff);
    const hd = new THREE.Group();
    hd.position.y = -12.4;
    elbow.add(hd);
    const palm = mesh(new THREE.SphereGeometry(1.75, 12, 10), M.skin, 0, -0.9, 0.2);
    palm.scale.set(0.85, 1.2, 0.62);
    hd.add(palm);
    const thumb = mesh(cap(0.5, 1.4), M.skin, s * -1.1, -0.6, 0.9);
    thumb.rotation.z = s * 0.6;
    hd.add(thumb);
    sh.push(shoulder);
    el.push(elbow);
    hand.push(hd);
  }

  // 腿
  const hip = [];
  const knee = [];
  for (const s of [1, -1]) {
    const h = new THREE.Group();
    h.position.set(s * 4.4, -1.5, 0);
    pelvis.add(h);
    h.add(mesh(cap(3.3, 14), M.tunic, 0, -10, 0));
    const k = new THREE.Group();
    k.position.y = -20.2;
    h.add(k);
    k.add(mesh(cap(2.6, 14.5), M.hose, 0, -9.6, 0));
    const boot = mesh(cap(2.1, 5.2), M.boots, 0, -20.6, 1.9);
    boot.rotation.x = Math.PI / 2;
    k.add(boot);
    k.add(mesh(new THREE.CylinderGeometry(2.7, 2.5, 5, 12), M.boots, 0, -17.6, 0));
    hip.push(h);
    knee.push(k);
  }

  const rig = { root, body, pelvis, torso, neck, head, skirt, sh, el, hand, hip, knee, P };
  return rig;
}

// 坐下（座面高度 seatH，相对人物所在地面）
export function seat(rig, seatH) {
  rig.pelvis.position.y = seatH + 3.4;
  for (const h of rig.hip) h.rotation.x = -Math.PI / 2;
  for (const k of rig.knee) k.rotation.x = Math.PI / 2;
  if (!rig.P.female) rig.skirt.visible = false;
}
// 设置一条手臂：side 0 = 左，1 = 右；fwd 前举，out 外展，bend 屈肘
export function arm(rig, side, fwd, out, bend) {
  const s = side === 0 ? 1 : -1;
  rig.sh[side].rotation.set(-fwd, 0, s * out);
  rig.el[side].rotation.set(-bend, 0, 0);
}
// 两节手臂的解析 IK：把 side 侧的手腕放到躯干坐标系里的 target，肘尖朝 pole 方向
// 肩的 -y 对准上臂；肘只绕本地 x 弯曲，所以前臂落在（上臂, 肩本地 z）这个平面里
const _ik = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _ikM = new THREE.Matrix4();
export function reach(rig, side, target, pole) {
  const L1 = 12.8;
  const L2 = 12.4;
  const S = rig.sh[side].position;
  const [e, p, u, f, yl, xl] = _ik;
  e.subVectors(target, S);
  const d = THREE.MathUtils.clamp(e.length(), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.01);
  e.normalize();
  p.copy(pole).addScaledVector(e, -pole.dot(e)).normalize();
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  u.copy(e).multiplyScalar(cosA).addScaledVector(p, Math.sqrt(1 - cosA * cosA));
  const cosG = THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  // 前臂相对上臂朝哪边弯 = 肩的本地 z
  f.copy(e).multiplyScalar(d).addScaledVector(u, -L1);
  f.addScaledVector(u, -f.dot(u));
  if (f.lengthSq() < 1e-6) f.copy(p).negate();
  f.normalize();
  yl.copy(u).negate();
  xl.crossVectors(yl, f);
  _ikM.makeBasis(xl, yl, f);
  rig.sh[side].quaternion.setFromRotationMatrix(_ikM);
  rig.el[side].rotation.set(-(Math.PI - Math.acos(cosG)), 0, 0);
}
// 手里拿东西：物体的“上”与前臂平放时的世界上方一致
export function holdInHand(rig, side, obj, offset = new THREE.Vector3(0, -1.6, 1.2)) {
  obj.rotation.x = Math.PI / 2;
  obj.position.copy(offset);
  rig.hand[side].add(obj);
  return obj;
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
// 循环关键帧：在 [0,1) 的相位上平滑插值
function cycle(phase, keys) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (phase >= t0 && phase <= t1) {
      const u = ease((phase - t0) / Math.max(1e-6, t1 - t0));
      return v0.map((v, j) => lerp(v, v1[j], u));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------- 动作 ----------
// 所有动作都返回 update(dt, t)
export function behaviorDrinker(rig, { period = 8, offset = 0, talkTo = 0 } = {}) {
  return (dt, t) => {
    const p = ((t + offset) % period) / period;
    // [右肩前举, 右肩外展, 右屈肘, 头仰, 躯干后仰]
    const [f, o, b, nod, lean] = cycle(p, [
      [0, [0.75, -0.1, 0.85, 0, 0.12]],
      [0.55, [0.75, -0.1, 0.85, 0, 0.12]],
      [0.66, [1.2, -0.25, 1.95, -0.35, -0.08]],
      [0.82, [1.2, -0.25, 1.95, -0.4, -0.1]],
      [0.92, [0.75, -0.1, 0.85, 0, 0.12]],
      [1, [0.75, -0.1, 0.85, 0, 0.12]],
    ]);
    arm(rig, 1, f, o, b);
    arm(rig, 0, 0.72, 0.12, 0.85);
    rig.head.rotation.x = nod + Math.sin(t * 0.7 + offset) * 0.05;
    rig.head.rotation.y = talkTo + Math.sin(t * 0.37 + offset) * 0.25;
    rig.torso.rotation.x = lean;
    rig.torso.scale.y = 1 + Math.sin(t * 1.6 + offset) * 0.006;
  };
}
export function behaviorTalker(rig, { offset = 0, talkTo = 0 } = {}) {
  return (dt, t) => {
    const g = Math.max(0, Math.sin(t * 0.9 + offset));
    arm(rig, 0, 0.75 + g * 0.5, 0.15 + g * 0.3, 0.85 + Math.sin(t * 3.1 + offset) * 0.25 * g);
    arm(rig, 1, 0.72, 0.1, 0.85);
    rig.head.rotation.y = talkTo + Math.sin(t * 0.5 + offset) * 0.3;
    rig.head.rotation.x = Math.sin(t * 2.3 + offset) * 0.06 * g;
    rig.torso.rotation.x = 0.1 + Math.sin(t * 0.8 + offset) * 0.04;
    rig.torso.rotation.y = Math.sin(t * 0.45 + offset) * 0.08;
  };
}
// 掷骰的人：攥着骰子摇两下，然后往桌上一扔；dice 为桌上的骰子网格
export function behaviorDiceThrower(rig, { period = 6, offset = 0, onThrow } = {}) {
  let last = -1;
  return (dt, t) => {
    const p = ((t + offset) % period) / period;
    const shake = p > 0.35 && p < 0.6 ? Math.sin(t * 28) * 0.12 : 0;
    const [f, o, b, lean] = cycle(p, [
      [0, [0.75, -0.1, 0.85, 0.15]],
      [0.3, [0.75, -0.1, 0.85, 0.15]],
      [0.4, [1.0, -0.15, 1.5, 0.05]],
      [0.6, [1.05, -0.15, 1.55, 0.05]],
      [0.68, [0.85, -0.1, 0.4, 0.28]],
      [0.85, [0.8, -0.1, 0.5, 0.25]],
      [1, [0.75, -0.1, 0.85, 0.15]],
    ]);
    arm(rig, 1, f + shake, o, b);
    arm(rig, 0, 0.7, 0.15, 0.9);
    rig.torso.rotation.x = lean;
    rig.head.rotation.x = 0.3;
    const cyc = Math.floor((t + offset) / period);
    if (p > 0.66 && cyc !== last) {
      last = cyc;
      onThrow && onThrow();
    }
  };
}
export function behaviorWatcher(rig, { offset = 0, lookAt = 0 } = {}) {
  return (dt, t) => {
    arm(rig, 0, 0.72, 0.12, 0.88);
    arm(rig, 1, 0.72, 0.12, 0.88);
    const laugh = Math.max(0, Math.sin(t * 0.55 + offset)) ** 6;
    rig.torso.rotation.x = 0.22 - laugh * 0.25 + Math.sin(t * 9) * 0.03 * laugh;
    rig.head.rotation.x = 0.35 - laugh * 0.4;
    rig.head.rotation.y = lookAt + Math.sin(t * 0.6 + offset) * 0.2;
  };
}
// 醉倒的人：上身伏到桌沿，额头抵着桌面，两条胳膊耷拉在身体两侧（凳子要离桌沿远一点）
export function behaviorSleeper(rig, { offset = 0 } = {}) {
  return (dt, t) => {
    const lean = 0.95 + Math.sin(t * 1.1 + offset) * 0.015;
    // 前举角度等于前倾角度 → 胳膊始终竖直下垂，随呼吸轻轻晃
    arm(rig, 0, lean + Math.sin(t * 0.7 + offset) * 0.03, 0.12, 0.15);
    arm(rig, 1, lean + Math.sin(t * 0.7 + offset + 1) * 0.03, 0.12, 0.15);
    rig.torso.rotation.x = lean;
    rig.head.rotation.x = 0.85;
    rig.head.rotation.z = 0.3;
  };
}
export function behaviorWarmer(rig, { offset = 0 } = {}) {
  return (dt, t) => {
    const rub = Math.sin(t * 5 + offset) * 0.08;
    arm(rig, 0, 1.15 + rub, -0.25, 0.25);
    arm(rig, 1, 1.15 - rub, -0.25, 0.25);
    rig.torso.rotation.x = 0.18 + Math.sin(t * 0.5 + offset) * 0.04;
    rig.head.rotation.x = 0.1;
  };
}
export function behaviorInnkeeper(rig, { offset = 0 } = {}) {
  return (dt, t) => {
    const a = t * 2.6 + offset;
    arm(rig, 0, 0.95, -0.2, 1.25);
    arm(rig, 1, 0.95 + Math.sin(a) * 0.12, -0.35 + Math.cos(a) * 0.1, 1.35 + Math.sin(a) * 0.15);
    rig.head.rotation.x = 0.35 + Math.sin(t * 0.3) * 0.05;
    rig.head.rotation.y = Math.sin(t * 0.21 + offset) * 0.3;
    rig.torso.rotation.x = 0.08;
  };
}
// 弹鲁特琴的人：lute 是 holdLute() 的返回值；左手按在琴颈上偶尔换把，右手在音孔下来回拨弦
export function behaviorBard(rig, { offset = 0, lute: L } = {}) {
  const tl = new THREE.Vector3();
  const tr = new THREE.Vector3();
  const poleL = new THREE.Vector3(1, -0.7, -0.2);
  const poleR = new THREE.Vector3(-1, -0.5, -0.4);
  return (dt, t) => {
    tl.copy(L.center).addScaledVector(L.neck, 12.5 + Math.sin(t * 0.8 + offset) * 1.3).addScaledVector(L.face, 0.8);
    tr.copy(L.center).addScaledVector(L.neck, -1.2).addScaledVector(L.face, 1.6).addScaledVector(L.across, Math.sin(t * 11) * 0.9);
    reach(rig, 0, tl, poleL);
    reach(rig, 1, tr, poleR);
    rig.head.rotation.z = Math.sin(t * 2.7 + offset) * 0.08;
    rig.head.rotation.x = 0.25 + Math.sin(t * 5.4) * 0.04;
    rig.torso.rotation.x = 0.1 + Math.sin(t * 2.7) * 0.02;
  };
}
// 端着托盘来回走的女招待
export function behaviorWalker(rig, { a, b, speed = 30, offset = 0 } = {}) {
  const ab = b.clone().sub(a);
  const len = ab.length();
  const yawAB = Math.atan2(ab.x, ab.z);
  return (dt, t) => {
    const cycleLen = len * 2 / speed + 3; // 两端各停 1.5 秒
    let u = (t + offset) % cycleLen;
    let pos;
    let yaw;
    let moving = true;
    const leg = len / speed;
    if (u < 1.5) {
      pos = a;
      yaw = yawAB;
      moving = false;
    } else if (u < 1.5 + leg) {
      pos = a.clone().addScaledVector(ab, (u - 1.5) / leg);
      yaw = yawAB;
    } else if (u < 3 + leg) {
      pos = b;
      yaw = yawAB + Math.PI;
      moving = false;
    } else {
      pos = b.clone().addScaledVector(ab, -(u - 3 - leg) / leg);
      yaw = yawAB + Math.PI;
    }
    rig.root.position.set(pos.x, rig.root.position.y, pos.z);
    // 转身时平滑
    let d = yaw - rig.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    rig.root.rotation.y += d * Math.min(1, dt * 6);
    const ph = t * 7.5;
    const w = moving ? 1 : 0;
    // 长裙里迈小步：步子太大脚会从裙摆后面戳出来
    const hipA = rig.P.female ? 0.2 : 0.38;
    const kneeA = rig.P.female ? 0.25 : 0.6;
    rig.hip[0].rotation.x = Math.sin(ph) * hipA * w;
    rig.hip[1].rotation.x = -Math.sin(ph) * hipA * w;
    rig.knee[0].rotation.x = Math.max(0, -Math.cos(ph)) * kneeA * w;
    rig.knee[1].rotation.x = Math.max(0, Math.cos(ph)) * kneeA * w;
    rig.pelvis.position.y = 46 + Math.abs(Math.cos(ph)) * 0.8 * w;
    rig.skirt.rotation.z = Math.sin(ph) * 0.03 * w;
    arm(rig, 0, 0.9, -0.1, 0.67); // 托盘：前举 + 屈肘 = 90°，小臂水平，托盘才是平的
    arm(rig, 1, Math.sin(ph) * 0.3 * w, 0.06, 0.25);
    rig.head.rotation.y = Math.sin(t * 0.4 + offset) * 0.2;
  };
}
// 只是坐着、手放在腿上（游戏桌对面的陌生人）
export function behaviorIdleSeated(rig, { offset = 0 } = {}) {
  return (dt, t) => {
    arm(rig, 0, 0.35, -0.08, 0.9);
    arm(rig, 1, 0.35, -0.08, 0.9);
    rig.torso.rotation.x = 0.06 + Math.sin(t * 0.8 + offset) * 0.015;
    rig.head.rotation.x = 0.2 + Math.sin(t * 0.33 + offset) * 0.05;
    rig.head.rotation.y = Math.sin(t * 0.21 + offset) * 0.15;
  };
}

// ---------- 小道具 ----------
export function lute() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a2a', roughness: 0.45 });
  const top = new THREE.MeshStandardMaterial({ color: '#d8b07a', roughness: 0.55 });
  // 半球转到背面：本地 y 变成深度、本地 z 变成高度，所以缩放是 (宽, 深, 高)
  const back = mesh(new THREE.SphereGeometry(4.2, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), wood);
  back.rotation.x = -Math.PI / 2;
  back.scale.set(1, 0.55, 1.3);
  g.add(back);
  const face = mesh(new THREE.CircleGeometry(4.2, 24), top, 0, 0, 0.02);
  face.scale.set(1, 1.3, 1);
  g.add(face);
  const rose = mesh(new THREE.CircleGeometry(0.9, 16), solid('#2a1a0e'), 0, 1.4, 0.05);
  g.add(rose);
  g.add(mesh(new THREE.BoxGeometry(1.5, 11, 0.8), wood, 0, 10, 0.2));
  const pegbox = mesh(new THREE.BoxGeometry(1.3, 4, 0.9), wood, 0, 16.8, -1.2);
  pegbox.rotation.x = -0.9;
  g.add(pegbox);
  return g;
}
// 抱琴：琴身贴着肚子略偏右，琴颈朝左上前方伸出去；返回琴在躯干坐标系里的位置和三个方向
export function holdLute(rig) {
  const lu = lute();
  const center = new THREE.Vector3(-2, 7, 7.6);
  const neck = new THREE.Vector3(0.82, 0.45, 0.35).normalize();
  const face = new THREE.Vector3(0, 0, 1).addScaledVector(neck, -neck.z).normalize();
  const across = new THREE.Vector3().crossVectors(neck, face);
  lu.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, neck, face));
  lu.position.copy(center);
  rig.torso.add(lu);
  return { center, neck, face, across };
}
export function tray(mat) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(5.5, 5.2, 0.6, 24), mat));
  const rim = mesh(new THREE.TorusGeometry(5.4, 0.35, 6, 24), mat, 0, 0.35, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  return g;
}
