// 穿模自测：桌上所有会动、会碰的东西，用数字查有没有互相穿过去。
//   1. 摆位：钱摞、散币、钱袋、蜡烛、酒杯、骰盅、赌注堆、钱堆、两排骰子、骰盘互不重叠
//   2. 骰子：一批投掷的每一帧，骰子之间、骰子和盘面、盘边、盅壁
//   3. 骰盅：举起、摇、倒、放回的整条路线，有没有碰到盘边、蜡烛、钱堆、骰子、桌面
//   4. 钱币：撒一大把，躺下以后币和币、币和木框、币和实心的东西
//   5. 掷币：一枚枚算下来有没有陷进皮面、撞出木框
import * as THREE from 'three';
import { simulateCupThrow, makeCupPlan, cupPose, cupFlightCtrl, CUP_STRIDE, CUP_SCALE, CUP_TOP, TRAY, DIE_CUP_SCALE } from '../src/render/physics.js';
import { COIN_STACKS, LOOSE_COINS, PURSES, PURSE, CANDLE, MUG, CUPS, CUP_R, NEUTRAL_COIN_SPOT, TOSS_SCALE } from '../src/render/coinLayout.js';
import { G_R, G_H, COIN_METALS } from '../src/render/groschen.js';
import { TABLE_Y } from '../src/render/world.js';
import { CoinField } from '../src/render/coinField.js';
import { TABLE_SOLIDS, TABLE_COINS, CUP_ARC, hopAcross } from '../src/game/game.js';
import { simulateCoinToss } from '../src/render/coinPhysics.js';
import { TOSS } from '../src/render/coinToss.js';

const cupBase = (side) => new THREE.Vector3((0.4 + Math.random() * 3) * side, 6.2, 3 * side);
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

globalThis.window ??= { innerWidth: 1280, innerHeight: 720 };
let failed = 0;
const report = (name, bad, detail = '') => {
  console.log(`${bad ? 'FAIL' : 'ok  '} ${name}${detail ? ' — ' + detail : ''}`);
  if (bad) failed++;
};

// ---------- 1. 摆位 ----------
{
  const row = (pi, slot) => (pi === 0 ? [-10.6, 4.15 - slot * 1.38] : [10.6, -2.75 + slot * 1.38]);
  const items = [
    ...COIN_STACKS.map((s) => ({ name: `${s.metal} stack`, x: s.x, z: s.z, r: G_R * COIN_METALS[s.metal].size + 0.14 })),
    ...LOOSE_COINS.map((s) => ({ name: `${s.metal} coin`, x: s.x, z: s.z, r: G_R * COIN_METALS[s.metal].size })),
    ...PURSES.map((p, i) => ({ name: 'purse' + i, x: p.x, z: p.z, r: PURSE.r })),
    { name: 'candle', x: CANDLE.x, z: CANDLE.z, r: CANDLE.r },
    { name: 'mug', x: MUG.x, z: MUG.z, r: MUG.r },
    ...CUPS.map((c, i) => ({ name: 'cup' + i, x: c.x, z: c.z, r: CUP_R })),
    { name: 'toss coin', x: NEUTRAL_COIN_SPOT.x, z: NEUTRAL_COIN_SPOT.z, r: G_R * TOSS_SCALE },
  ];
  for (const pi of [0, 1]) for (let s = 0; s < 6; s++) {
    const [x, z] = row(pi, s);
    items.push({ name: `row${pi}.${s}`, x, z, r: 0.72 });
  }
  const bad = [];
  items.forEach((a, i) => items.slice(i + 1).forEach((b) => {
    if (/^row/.test(a.name) && /^row/.test(b.name) && a.name.slice(0, 4) === b.name.slice(0, 4)) return; // 同一排相邻的骰子间距 1.38，方块宽 1
    const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
    if (gap < 0) bad.push(`${a.name}/${b.name} ${gap.toFixed(2)}`);
  }));
  for (const a of items) {
    const dx = Math.max(Math.abs(a.x) - 8.9, 0);
    const dz = Math.max(Math.abs(a.z) - 6.2, 0);
    if (Math.hypot(dx, dz) < a.r) bad.push(`${a.name}/tray ${(Math.hypot(dx, dz) - a.r).toFixed(2)}`);
  }
  report('摆位互不重叠', bad.length > 0, bad.slice(0, 8).join(', '));
}

// ---------- 2. 骰子 ----------
const _q = new THREE.Quaternion();
const AX = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const BX = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const axes = (out, q) => {
  out[0].set(1, 0, 0).applyQuaternion(q);
  out[1].set(0, 1, 0).applyQuaternion(q);
  out[2].set(0, 0, 1).applyQuaternion(q);
};
// 两个方块的穿透深度（分离轴），不相交返回 0
function obbDepth(pa, A, ha, pb, B, hb) {
  const d = new THREE.Vector3().subVectors(pb, pa);
  let depth = Infinity;
  const test = (ax) => {
    if (ax.lengthSq() < 1e-8) return true;
    const n = ax.clone().normalize();
    let ra = 0, rb = 0;
    for (let i = 0; i < 3; i++) {
      ra += Math.abs(A[i].dot(n)) * ha;
      rb += Math.abs(B[i].dot(n)) * hb;
    }
    const over = ra + rb - Math.abs(d.dot(n));
    if (over <= 0) return false;
    depth = Math.min(depth, over);
    return true;
  };
  for (const a of A) if (!test(a)) return 0;
  for (const b of B) if (!test(b)) return 0;
  for (const a of A) for (const b of B) if (!test(new THREE.Vector3().crossVectors(a, b))) return 0;
  return depth;
}
{
  const N = 60;
  let dieDie = 0, floor = 0, wall = 0, cupWall = 0, frames = 0, worst = '';
  const p = [new THREE.Vector3(), new THREE.Vector3()];
  const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const inv = new THREE.Quaternion();
  const c = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    const side = k % 2 ? -1 : 1;
    const n = 1 + (k % 6);
    const plan = makeCupPlan({ base: cupBase(side), side, n });
    const r = simulateCupThrow(n, plan);
    r.frames.forEach((F, fi) => {
      frames++;
      const t = fi / 60;
      for (let i = 0; i < n; i++) {
        const started = t >= plan.spawnT[i];
        if (!started) continue;
        const o = i * CUP_STRIDE;
        const h = 0.5 * F[o + 7];
        _q.set(F[o + 3], F[o + 4], F[o + 5], F[o + 6]);
        p[0].set(F[o], F[o + 1], F[o + 2]);
        axes(AX, _q);
        // 画面里的骰子是圆角的：倒角之后的角点离心 0.5*(√3 - 0.1) 左右，取方块角点减去倒角量
        const trim = 0.08 * F[o + 7] * 0.57; // 最方的骰子（金属）
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          c.copy(p[0]).addScaledVector(AX[0], sx * h).addScaledVector(AX[1], sy * h).addScaledVector(AX[2], sz * h);
          floor = Math.max(floor, 0.01 - (c.y + trim));
          if (t > plan.tPour1 + 0.15 && c.y < 0.8) wall = Math.max(wall, Math.abs(c.x) - trim - TRAY.maxX, Math.abs(c.z) - trim - TRAY.maxZ);
        }
        // 在盅里：离盅轴的距离不超过模型内壁
        if (t > plan.spawnT[n - 1] + 0.3 && t < plan.tShake1) {
          cupPose(plan, t, pose);
          inv.copy(pose.quat).invert();
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            c.copy(p[0]).addScaledVector(AX[0], sx * h).addScaledVector(AX[1], sy * h).addScaledVector(AX[2], sz * h).sub(pose.pos).applyQuaternion(inv);
            if (c.y > 0.5 && c.y < 4) cupWall = Math.max(cupWall, Math.hypot(c.x, c.z) - trim - 1.47);
          }
        }
        for (let j = i + 1; j < n; j++) {
          if (t < plan.spawnT[j]) continue;
          const u = j * CUP_STRIDE;
          _q.set(F[u + 3], F[u + 4], F[u + 5], F[u + 6]);
          p[1].set(F[u], F[u + 1], F[u + 2]);
          axes(BX, _q);
          const dd = obbDepth(p[0], AX, h - trim, p[1], BX, 0.5 * F[u + 7] - trim);
          if (dd > dieDie) {
            dieDie = dd;
            worst = `${t < plan.tShake0 ? '落进盅' : t < plan.tShake1 ? '摇' : t < plan.tAway1 ? '倒' : '盘里'} n=${n}`;
          }
        }
      }
    });
  }
  report('骰子互相穿过', dieDie > 0.06, `最深 ${dieDie.toFixed(3)}（${frames} 帧，${worst}）`);
  report('骰子陷进盘面', floor > 0.05, `最深 ${floor.toFixed(3)}`);
  report('骰子穿出盘边', wall > 0.05, `最深 ${wall.toFixed(3)}`);
  report('骰子穿出盅壁', cupWall > 0.06, `最深 ${cupWall.toFixed(3)}`);
}

// ---------- 3. 骰盅 ----------
{
  const R = 1.46 * CUP_SCALE;
  const H = 3.4 * CUP_SCALE;
  const cup = new THREE.Object3D();
  const p = new THREE.Vector3();
  const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const rows = [];
  for (let s = 0; s < 6; s++) rows.push({ x: -10.6, z: 4.15 - s * 1.38, r: 0.72, top: TABLE_Y + 1.1 }, { x: 10.6, z: -2.75 + s * 1.38, r: 0.72, top: TABLE_Y + 1.1 });
  const coins = TABLE_COINS.map((c) => ({ ...c, top: c.top + 0.02 }));
  const others = TABLE_SOLIDS.filter((s) => s.r !== CUP_R);
  const pts = [];
  for (const y of [0, H * 0.5, H]) for (let i = 0; i < 24; i++) pts.push(new THREE.Vector3(Math.cos((i / 24) * 6.283) * R, y, Math.sin((i / 24) * 6.283) * R));
  const hits = {};
  let low = 99;
  const check = (label) => {
    cup.updateMatrix();
    for (const v of pts) {
      p.copy(v).applyMatrix4(cup.matrix);
      low = Math.min(low, p.y - TABLE_Y);
      const inTrayArea = Math.abs(p.x) < 9.3 && Math.abs(p.z) < 6.6;
      if (inTrayArea && p.y < TABLE_Y + 1.2) hits['tray ' + label] = (hits['tray ' + label] || 0) + 1;
      for (const s of [...others, ...coins, ...rows]) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < s.r && p.y < s.top) { const key = label + ' ' + (s.name || s.r.toFixed(2)); hits[key] = (hits[key] || 0) + 1; }
      }
      if (p.y < TABLE_Y - 0.02) hits['table ' + label] = (hits['table ' + label] || 0) + 1;
    }
  };
  for (let k = 0; k < 40; k++) {
    const side = k % 2 ? -1 : 1;
    const pi = side > 0 ? 0 : 1;
    const rest = new THREE.Vector3(CUPS[pi].x, TABLE_Y, CUPS[pi].z);
    const plan = makeCupPlan({ base: cupBase(side), side, n: 6 });
    const restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pi === 0 ? -0.4 : 0.4, 0));
    const p0 = cupPose(plan, 0, { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    for (let u = 0.02; u <= 1; u += 0.02) {
      const e = easeInOut(u);
      cup.position.lerpVectors(rest, p0.pos, hopAcross(e));
      cup.position.y = rest.y + (p0.pos.y - rest.y) * e + Math.sin(e * Math.PI) * CUP_ARC;
      cup.quaternion.slerpQuaternions(restQ, p0.quat, e);
      check('举盅');
    }
    for (let t = 0; t <= plan.tAway1; t += 1 / 60) {
      cupPose(plan, t, pose);
      cup.position.copy(pose.pos);
      cup.quaternion.copy(pose.quat);
      check('摇和倒');
    }
    const away = cupPose(plan, plan.tAway1, { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    for (let u = 0; u <= 0.98; u += 0.02) {
      const e = easeInOut(u);
      cup.position.lerpVectors(away.pos, rest, e);
      cup.position.y += Math.sin(u * Math.PI) * 2;
      cup.quaternion.slerpQuaternions(away.quat, restQ, e);
      check('放回');
    }
  }
  report('骰盅的路线', Object.keys(hits).length > 0, Object.keys(hits).length ? JSON.stringify(hits) : `离桌面最低 ${low.toFixed(2)}`);
}

// ---------- 3b. 骰子飞进骰盅的路线：骰子可能就在举起来的骰盅底下 ----------
{
  let clip = 0;
  let total = 0;
  const v = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let k = 0; k < 400; k++) {
    const side = k % 2 ? -1 : 1;
    const plan = makeCupPlan({ base: cupBase(side), side, n: 6 });
    const pose = cupPose(plan, 0, { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    const inv = pose.quat.clone().invert();
    const p1 = new THREE.Vector3(0, CUP_TOP + 1.3, 0).applyQuaternion(pose.quat).add(pose.pos);
    // 从排上或盘里起飞
    const p0 = k % 4 < 2 ? new THREE.Vector3(side > 0 ? -10.6 : 10.6, 0.2, (Math.random() - 0.5) * 7) : new THREE.Vector3((Math.random() - 0.5) * 15, 0.5, (Math.random() - 0.5) * 9.6);
    cupFlightCtrl(p0, p1, plan.base, c);
    for (let e = 0; e <= 1; e += 0.02) {
      pa.copy(p0).lerp(c, e);
      pb.copy(c).lerp(p1, e);
      v.copy(pa.lerp(pb, e)).sub(pose.pos).applyQuaternion(inv);
      const r = Math.hypot(v.x, v.z);
      const half = 0.5 * (1 - (1 - DIE_CUP_SCALE) * e) * 1.2;
      total++;
      if (v.y < CUP_TOP + 0.15 + half && v.y > -0.5 && r < 1.75 + half) clip++;
    }
  }
  report('骰子飞进骰盅时碰到盅身', clip > 0, `${clip} / ${total} 个采样点`);
}

// ---------- 3c. 留下的骰子跳到排上：越过木框，不碰盘角的铜块 ----------
{
  let rim = 0;
  const a = new THREE.Vector3();
  for (let k = 0; k < 600; k++) {
    const pi = k % 2;
    const p0 = new THREE.Vector3((Math.random() - 0.5) * 15, 0.5, (Math.random() - 0.5) * 9.6);
    const slot = k % 6;
    const target = pi === 0 ? new THREE.Vector3(-10.6, TABLE_Y + 0.5, 4.15 - slot * 1.38) : new THREE.Vector3(10.6, TABLE_Y + 0.5, -2.75 + slot * 1.38);
    const hop = 2.4 + p0.distanceTo(target) * 0.1;
    for (let e = 0; e <= 1; e += 0.01) {
      a.lerpVectors(p0, target, hopAcross(e));
      a.y = p0.y + (target.y - p0.y) * e + Math.sin(e * Math.PI) * hop;
      const ax = Math.abs(a.x), az = Math.abs(a.z);
      const onRim = ax < 9.3 && az < 6.6 && !(ax < 7.6 && az < 4.9);
      const low = a.y - (0.5 + 0.37 * Math.min(1, e / 0.25, (1 - e) / 0.25)); // 起跳和落地时是平的，中间翻着
      if (onRim && low < TABLE_Y + (ax > 7.3 && az > 4.6 ? 1.46 : 1.1)) rim++;
    }
  }
  report('骰子跳到排上时碰到木框', rim > 0, `${rim} 个采样点`);
}

// ---------- 4. 钱币 ----------
{
  const stage = { scene: new THREE.Scene(), updaters: new Set(), add(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); } };
  const audio = new Proxy({}, { get: () => () => {} });
  const field = new CoinField(stage, audio, { solids: TABLE_SOLIDS, statics: TABLE_COINS });
  // 一排骰子留在桌上
  field.dice = [];
  for (let s = 0; s < 6; s++) field.dice.push({ x: -10.6, z: 4.15 - s * 1.38, top: TABLE_Y + 1.1 }, { x: 10.6, z: -2.75 + s * 1.38, top: TABLE_Y + 1.1 });
  field.shower(420);
  const t0 = performance.now();
  for (let i = 0; i < 60 * 12; i++) for (const fn of stage.updaters) fn(1 / 60);
  const ms = performance.now() - t0;
  const coins = field.coins;
  const moving = coins.filter((c) => c.phase !== 4).length;
  const axis = coins.map((c) => new THREE.Vector3(0, 1, 0).applyQuaternion(c.q));
  let pairs = 0, deepest = 0;
  const bad = [];
  const half = (c) => (G_H / 2) * c.size;
  for (let i = 0; i < coins.length; i++) {
    const a = coins[i];
    const ra = G_R * a.size;
    for (let j = 0; j < coins.length; j++) {
      if (i === j) continue;
      const b = coins[j];
      if (Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) > ra + G_R * b.size) continue;
      // a 的币面上取一圈点，看有没有落进 b 的薄圆片里
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * 6.283;
        const rr = ra * (k % 2 ? 0.96 : 0.6);
        const u = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(rr);
        u.addScaledVector(axis[i], -u.dot(axis[i]));
        const pt = a.p.clone().add(u).sub(b.p);
        const along = pt.dot(axis[j]);
        const radial = pt.clone().addScaledVector(axis[j], -along).length();
        if (radial < G_R * b.size * 0.97 && Math.abs(along) < half(b)) {
          const depth = half(b) - Math.abs(along);
          deepest = Math.max(deepest, depth);
          pairs++;
          break;
        }
      }
    }
  }
  report('钱币互相穿过', pairs > coins.length * 0.04, `${coins.length} 枚里 ${pairs} 对，最深 ${deepest.toFixed(3)}，还在动 ${moving} 枚，模拟 12 秒用 ${ms.toFixed(0)} 毫秒`);
  // 币面一圈的点有没有落进木框、实心物里（斜靠在框上的币只有上半边高过框顶，这样才算得准）
  let rim = 0, solid = 0, sink = 0;
  const solidsAll = [...TABLE_SOLIDS, ...field.dice.map((d) => ({ ...d, r: 0.7 }))];
  coins.forEach((c, ci) => {
    const R = G_R * c.size;
    let inRim = false, inSolid = false, under = false;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * 6.283;
      const u = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(R * 0.97);
      u.addScaledVector(axis[ci], -u.dot(axis[ci])).add(c.p);
      const ax = Math.abs(u.x), az = Math.abs(u.z);
      if (ax < 8.87 && az < 6.17 && !(ax < 8.03 && az < 5.33) && u.y < TABLE_Y + 1.08) inRim = true;
      for (const s of solidsAll) if (u.y < s.top - 0.03 && Math.hypot(u.x - s.x, u.z - s.z) < s.r - 0.03) inSolid = true;
      if (u.y < TABLE_Y - 0.03) under = true;
    }
    if (inRim) rim++;
    if (inSolid) solid++;
    if (under) sink++;
  });
  report('钱币穿过木框', rim > 0, `${rim} 枚`);
  report('钱币穿过实心物', solid > 2, `${solid} 枚`);
  report('钱币陷进桌面', sink > 0, `${sink} 枚`);
}

// ---------- 5. 掷币 ----------
{
  let sink = 0, stuck = 0, over = 0, far = 0;
  for (let i = 0; i < 30; i++) {
    const r = simulateCoinToss(TOSS);
    sink = Math.max(sink, TOSS.floor - r.lowest);
    if (!r.stopped) stuck++;
    if (r.overRim) over++;
    if (Math.abs(r.end.x) > 7 || Math.abs(r.end.z) > 4.4) far++;
  }
  report('掷币陷进皮面', sink > 0.06, `最深 ${sink.toFixed(3)}`);
  report('掷币停不下来或飞出木框', stuck + over + far > 0, `没停 ${stuck}，飞出 ${over}，太靠边 ${far}`);
}

console.log(failed ? `\n${failed} 项没过` : '\n全部通过');
if (failed) process.exitCode = 1;
