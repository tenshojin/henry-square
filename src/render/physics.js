// 投掷物理：用 cannon-es 离线模拟整段滚动并记录轨迹，然后在画面中回放。
// 点数由概率表决定，回放时通过旋转骰子内层，让指定的面朝上（物理碰撞形状是对称的立方体，不受影响）。
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { VALUE_NORMALS } from './diceFaces.js';

export const TRAY = { minX: -8.0, maxX: 8.0, minZ: -5.3, maxZ: 5.3 };
const DT = 1 / 120;
const MAX_STEPS = 120 * 9;

function topFace(q) {
  let best = 1;
  let bestY = -2;
  const v = new THREE.Vector3();
  for (const k of [1, 2, 3, 4, 5, 6]) {
    v.copy(VALUE_NORMALS[k]).applyQuaternion(q);
    if (v.y > bestY) {
      bestY = v.y;
      best = k;
    }
  }
  return { value: best, flat: bestY };
}

// 盘边看不见的围墙，覆盖高度 y0..y1
function addTrayWalls(world, wallMat, y0, y1) {
  const h = (y1 - y0) / 2;
  const yc = (y0 + y1) / 2;
  const walls = [
    [new CANNON.Vec3(0.5, h, (TRAY.maxZ - TRAY.minZ) / 2 + 1), new CANNON.Vec3(TRAY.minX - 0.5, yc, 0)],
    [new CANNON.Vec3(0.5, h, (TRAY.maxZ - TRAY.minZ) / 2 + 1), new CANNON.Vec3(TRAY.maxX + 0.5, yc, 0)],
    [new CANNON.Vec3((TRAY.maxX - TRAY.minX) / 2 + 1, h, 0.5), new CANNON.Vec3(0, yc, TRAY.minZ - 0.5)],
    [new CANNON.Vec3((TRAY.maxX - TRAY.minX) / 2 + 1, h, 0.5), new CANNON.Vec3(0, yc, TRAY.maxZ + 0.5)],
  ];
  for (const [half, pos] of walls) {
    const w = new CANNON.Body({ mass: 0, material: wallMat });
    w.addShape(new CANNON.Box(half));
    w.position.copy(pos);
    w.userData = { kind: 'wall' };
    world.addBody(w);
  }
}

// wallTop：围墙先建多高。骰盅是举在盘子边缘上方摇的，围墙太高会穿进盅里把骰子挤飞，所以摇盅时先建矮墙
function buildWorld({ wallTop = 28 } = {}) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -62, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 14;
  const floorMat = new CANNON.Material('floor');
  const wallMat = new CANNON.Material('wall');
  const diceMat = new CANNON.Material('dice');
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, diceMat, { friction: 0.32, restitution: 0.32 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wallMat, diceMat, { friction: 0.08, restitution: 0.5 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.12, restitution: 0.35 }));

  const floor = new CANNON.Body({ mass: 0, material: floorMat });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  floor.userData = { kind: 'floor' };
  world.addBody(floor);

  addTrayWalls(world, wallMat, 0, wallTop);
  return { world, diceMat, wallMat };
}

/**
 * 模拟一次投掷
 * @param {number} n 骰子数
 * @param {THREE.Vector3} spawn 出口中心
 * @param {THREE.Vector3} dir 抛出方向（水平分量为主）
 * @returns {{frames: Float32Array[], tops: number[], impacts: {f:number, i:number, v:number, kind:string}[]}}
 */
export function simulateThrow(n, spawn, dir, rnd = Math.random) {
  let best = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    const r = runOnce(n, spawn, dir, rnd, attempt);
    if (r.ok) return r;
    if (!best || r.badness < best.badness) best = r;
  }
  return best;
}

function runOnce(n, spawn, dir, rnd, attempt) {
  const { world, diceMat } = buildWorld();
  const bodies = [];
  const d = dir.clone().setY(0).normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x);
  for (let i = 0; i < n; i++) {
    const body = new CANNON.Body({ mass: 1, material: diceMat, linearDamping: 0.08, angularDamping: 0.08 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    body.sleepSpeedLimit = 0.22;
    body.sleepTimeLimit = 0.22;
    const col = (i % 3) - 1;
    const row = Math.floor(i / 3);
    const off = side.clone().multiplyScalar(col * 1.12 + (rnd() - 0.5) * 0.15).add(d.clone().multiplyScalar(-row * 1.1));
    body.position.set(spawn.x + off.x, spawn.y + row * 0.4 + rnd() * 0.3, spawn.z + off.z);
    body.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    const speed = 7.5 + rnd() * 4 + attempt * 0.2;
    const sideKick = (rnd() - 0.5) * 6;
    body.velocity.set(d.x * speed + side.x * sideKick, -3 - rnd() * 4, d.z * speed + side.z * sideKick);
    body.angularVelocity.set((rnd() - 0.5) * 36, (rnd() - 0.5) * 36, (rnd() - 0.5) * 36);
    body.userData = { kind: 'die', index: i };
    world.addBody(body);
    bodies.push(body);
  }

  const frames = [];
  const impacts = [];
  const lastImpact = new Array(n).fill(-1);
  let frameIdx = 0;
  bodies.forEach((body, i) => {
    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v < 1.0) return;
      if (frameIdx - lastImpact[i] < 3) return;
      lastImpact[i] = frameIdx;
      impacts.push({ f: frameIdx, i, v, kind: e.body.userData?.kind || 'floor' });
    });
  });

  const record = () => {
    const arr = new Float32Array(n * 7);
    bodies.forEach((b, i) => {
      arr[i * 7] = b.position.x;
      arr[i * 7 + 1] = b.position.y;
      arr[i * 7 + 2] = b.position.z;
      arr[i * 7 + 3] = b.quaternion.x;
      arr[i * 7 + 4] = b.quaternion.y;
      arr[i * 7 + 5] = b.quaternion.z;
      arr[i * 7 + 6] = b.quaternion.w;
    });
    frames.push(arr);
  };
  record();
  let calm = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    world.step(DT);
    if (step % 2 === 1) {
      frameIdx++;
      record();
      const allStill = bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.05));
      if (allStill && step > 60) calm++;
      else calm = 0;
      if (calm > 8) break;
    }
  }

  // 校验：都平躺、都在盘内
  let badness = 0;
  const tops = [];
  const q = new THREE.Quaternion();
  bodies.forEach((b) => {
    q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const t = topFace(q);
    tops.push(t.value);
    if (t.flat < 0.985) badness += 1 + (1 - t.flat);
    if (b.position.y > 0.62) badness += 1;
    if (b.position.x < TRAY.minX || b.position.x > TRAY.maxX || b.position.z < TRAY.minZ || b.position.z > TRAY.maxZ) badness += 5;
  });
  if (badness > 0) {
    // 为最坏情况准备：在末尾补几帧把骰子摆平
    const last = frames[frames.length - 1];
    const fixed = new Float32Array(last);
    bodies.forEach((b, i) => {
      q.set(last[i * 7 + 3], last[i * 7 + 4], last[i * 7 + 5], last[i * 7 + 6]);
      const t = topFace(q);
      const up = VALUE_NORMALS[t.value].clone().applyQuaternion(q);
      const fix = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
      q.premultiply(fix);
      fixed[i * 7] = THREE.MathUtils.clamp(last[i * 7], TRAY.minX + 0.6, TRAY.maxX - 0.6);
      fixed[i * 7 + 1] = 0.5;
      fixed[i * 7 + 2] = THREE.MathUtils.clamp(last[i * 7 + 2], TRAY.minZ + 0.6, TRAY.maxZ - 0.6);
      fixed[i * 7 + 3] = q.x;
      fixed[i * 7 + 4] = q.y;
      fixed[i * 7 + 5] = q.z;
      fixed[i * 7 + 6] = q.w;
    });
    for (let k = 1; k <= 12; k++) {
      const t = k / 12;
      const f = new Float32Array(last.length);
      for (let i = 0; i < n; i++) {
        const qa = new THREE.Quaternion(last[i * 7 + 3], last[i * 7 + 4], last[i * 7 + 5], last[i * 7 + 6]);
        const qb = new THREE.Quaternion(fixed[i * 7 + 3], fixed[i * 7 + 4], fixed[i * 7 + 5], fixed[i * 7 + 6]);
        qa.slerp(qb, t);
        for (let j = 0; j < 3; j++) f[i * 7 + j] = last[i * 7 + j] + (fixed[i * 7 + j] - last[i * 7 + j]) * t;
        f[i * 7 + 3] = qa.x;
        f[i * 7 + 4] = qa.y;
        f[i * 7 + 5] = qa.z;
        f[i * 7 + 6] = qa.w;
      }
      frames.push(f);
    }
    tops.length = 0;
    for (let i = 0; i < n; i++) {
      q.set(fixed[i * 7 + 3], fixed[i * 7 + 4], fixed[i * 7 + 5], fixed[i * 7 + 6]);
      tops.push(topFace(q).value);
    }
  }
  return { ok: badness === 0, badness, frames, tops, impacts };
}

// ================= 骰盅投掷：骰子落进骰盅 → 在盅里翻滚 → 倒进骰盘 =================
// 骰盅是运动学刚体（底 + 一圈墙），它的动作由 cupPose(plan, t) 给出；回放时用同一个函数，画面与物理完全一致。
export const CUP_SCALE = 1.2;
export const CUP_IN_R = 1.5; // 内壁半径（略小于模型，避免骰子穿模）
const CUP_FLOOR = 0.55; // 内底高度
export const CUP_TOP = 4.0;
const CUP_WALL = 0.3;
const COLLAR_H = 1.6; // 摇盅时盅口上方看不见的围领高度

// 生成一次投掷的骰盅动作计划
export function makeCupPlan({ base, side, n, rnd = Math.random }) {
  const drop = 0.13; // 前一颗下落 1 个骰子身位以上再放下一颗，否则出生时互相重叠会被物理引擎弹飞
  const spawnT = Array.from({ length: n }, (_, i) => i * drop);
  const tShake0 = n * drop + 0.3;
  const tShake1 = tShake0 + 1.15;
  const tPour1 = tShake1 + 0.42;
  const tHold1 = tPour1 + 0.3;
  const tAway1 = tHold1 + 0.45;
  return {
    base: base.clone(),
    side, // +1 玩家（向 -z 倒），-1 对手（向 +z 倒）
    tilt: 0.38, // 摇的时候口朝镜头偏一点，看得见里面的骰子
    spawnT,
    tShake0,
    tShake1,
    tPour1,
    tHold1,
    tAway1,
    ph: [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6],
    f: [4.2 + rnd() * 1.2, 5.4 + rnd() * 1.4, 3.6 + rnd() * 1.0],
  };
}

const _e = new THREE.Euler();
const smooth = (x) => x * x * (3 - 2 * x);
export function cupPose(plan, t, out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }) {
  const s = plan.side;
  let rx = plan.tilt;
  let rz = 0;
  out.pos.copy(plan.base);
  if (t > plan.tShake0 && t < plan.tShake1) {
    const u = (t - plan.tShake0) / (plan.tShake1 - plan.tShake0);
    const env = Math.sin(Math.PI * u);
    const [p0, p1, p2, p3] = plan.ph;
    const [f0, f1, f2] = plan.f;
    out.pos.x += Math.sin(t * Math.PI * 2 * f0 + p0) * 0.45 * env;
    out.pos.y += (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * f1 + p1)) * 0.8 * env;
    out.pos.z += Math.sin(t * Math.PI * 2 * f2 + p2) * 0.3 * env;
    rz = Math.sin(t * Math.PI * 2 * f0 + p3) * 0.3 * env;
    rx += Math.sin(t * Math.PI * 2 * f2 + p1) * 0.16 * env;
  } else if (t >= plan.tShake1) {
    const pour = s > 0 ? -2.3 : 2.3;
    const e = smooth(Math.min(1, (t - plan.tShake1) / (plan.tPour1 - plan.tShake1)));
    rx = plan.tilt + (pour - plan.tilt) * e;
    out.pos.z += -s * 1.3 * e;
    out.pos.y -= 0.7 * e;
    if (t > plan.tHold1) {
      const w = smooth(Math.min(1, (t - plan.tHold1) / (plan.tAway1 - plan.tHold1)));
      rx = pour * (1 - w * 0.75);
      out.pos.y += 3.2 * w;
      out.pos.z += s * 3.6 * w;
    }
  }
  _e.set(rx, 0, rz);
  out.quat.setFromEuler(_e);
  return out;
}

// 盅壁：16 块竖板围成一圈，覆盖本地高度 y0..y1；返回 [shape, offset, orientation]
function cupWallShapes(y0, y1) {
  const N = 16;
  const rc = CUP_IN_R + CUP_WALL / 2;
  const halfW = rc * Math.tan(Math.PI / N) + 0.05;
  const halfH = (y1 - y0) / 2;
  return Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -a);
    return [new CANNON.Box(new CANNON.Vec3(CUP_WALL / 2, halfH, halfW)), new CANNON.Vec3(Math.cos(a) * rc, y0 + halfH, Math.sin(a) * rc), q];
  });
}

function cupBody(cupMat) {
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: cupMat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(CUP_IN_R + CUP_WALL, 0.15, CUP_IN_R + CUP_WALL)), new CANNON.Vec3(0, CUP_FLOOR - 0.15, 0));
  for (const [shape, offset, q] of cupWallShapes(CUP_FLOOR - 0.3, CUP_TOP)) body.addShape(shape, offset, q);
  body.userData = { kind: 'cup' };
  return body;
}

/**
 * 模拟一次“骰盅投掷”，多次尝试直到骰子都平躺在盘里
 * 返回 { frames（60 帧/秒，每帧 n×7 个数）, tops, impacts, spawnFrames, endT }
 */
export function simulateCupThrow(n, plan, rnd = Math.random) {
  let best = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = runCup(n, plan, rnd, attempt);
    if (r.ok) return r;
    if (!best || r.badness < best.badness) best = r;
  }
  return best;
}

function runCup(n, plan, rnd, attempt) {
  const { world, diceMat, wallMat } = buildWorld({ wallTop: 6.5 });
  world.allowSleep = false;
  const cupMat = new CANNON.Material('cup');
  world.addContactMaterial(new CANNON.ContactMaterial(cupMat, diceMat, { friction: 0.18, restitution: 0.42 }));
  const cup = cupBody(cupMat);
  const pose = cupPose(plan, 0);
  cup.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
  cup.quaternion.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
  world.addBody(cup);

  // 骰子出生点：骰盅口正上方
  const mouth = new THREE.Vector3(0, CUP_TOP + 1.3, 0).applyQuaternion(pose.quat).add(pose.pos);
  const bodies = [];
  const spawnPos = [];
  for (let i = 0; i < n; i++) {
    const body = new CANNON.Body({ mass: 1, material: diceMat, linearDamping: 0.06, angularDamping: 0.06 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    body.sleepSpeedLimit = 0.22;
    body.sleepTimeLimit = 0.22;
    const p = mouth.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.7));
    spawnPos.push(p);
    body.position.set(p.x, p.y, p.z);
    body.quaternion.setFromEuler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
    body.velocity.set((rnd() - 0.5) * 1.2, -3 - rnd() * 1.5, (rnd() - 0.5) * 1.2);
    body.angularVelocity.set((rnd() - 0.5) * 14, (rnd() - 0.5) * 14, (rnd() - 0.5) * 14);
    body.userData = { kind: 'die', index: i };
    bodies.push(body);
  }

  const frames = [];
  const impacts = [];
  const lastImpact = new Array(n).fill(-1);
  const spawned = new Array(n).fill(false);
  let frameIdx = 0;
  bodies.forEach((body, i) => {
    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v < 0.9) return;
      if (frameIdx - lastImpact[i] < 2) return;
      lastImpact[i] = frameIdx;
      impacts.push({ f: frameIdx, i, v, kind: e.body.userData?.kind || 'floor' });
    });
  });
  const record = () => {
    const arr = new Float32Array(n * 7);
    bodies.forEach((b, i) => {
      arr[i * 7] = b.position.x;
      arr[i * 7 + 1] = b.position.y;
      arr[i * 7 + 2] = b.position.z;
      arr[i * 7 + 3] = b.quaternion.x;
      arr[i * 7 + 4] = b.quaternion.y;
      arr[i * 7 + 5] = b.quaternion.z;
      arr[i * 7 + 6] = b.quaternion.w;
    });
    frames.push(arr);
  };

  const target = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const qCur = new THREE.Quaternion();
  const qDelta = new THREE.Quaternion();
  // 盅口上方加一圈看不见的围领（摇盅阶段才有），盖子盖在围领顶上
  const collar = cupWallShapes(CUP_TOP, CUP_TOP + COLLAR_H).map(([shape, offset, q]) => {
    cup.addShape(shape, offset, q);
    return shape;
  });
  const lid = new CANNON.Box(new CANNON.Vec3(CUP_IN_R + CUP_WALL, 0.15, CUP_IN_R + CUP_WALL));
  const lidOffset = new CANNON.Vec3(0, CUP_TOP + COLLAR_H + 0.15, 0);
  let lidOn = false;
  let lidT = -1;
  let highWalls = false;
  let t = 0;
  let nextRecord = 0;
  let calm = 0;
  const maxT = plan.tAway1 + 7;
  while (t < maxT) {
    const dt = t < plan.tAway1 ? 1 / 240 : 1 / 120;
    // 盅里用 3 倍重力：场景整体是慢放的重力，摇盅却是正常速度，不加重力骰子会被甩出盅口；倒出来以后恢复慢放
    world.gravity.set(0, t < plan.tShake1 ? -190 : -62, 0);
    // 按时出生
    for (let i = 0; i < n; i++) {
      if (!spawned[i] && t >= plan.spawnT[i]) {
        spawned[i] = true;
        world.addBody(bodies[i]);
      }
    }
    // 看不见的盖子：骰子全部落进“盅口 + 围领”以下就盖上，开始倒之前连同围领一起拿掉。
    // 骰子始终看得见，但摇的时候飞不出去
    if (!lidOn && lidT < 0 && t < plan.tShake1 && spawned[n - 1]) {
      const inv = cup.quaternion.conjugate();
      const allIn = bodies.every((b) => inv.vmult(b.position.vsub(cup.position)).y < CUP_TOP + COLLAR_H - 0.9);
      if (allIn) {
        cup.addShape(lid, lidOffset);
        lidOn = true;
        lidT = t;
      }
    }
    if (collar.length && t >= plan.tShake1) {
      if (lidOn) cup.removeShape(lid);
      lidOn = false;
      collar.forEach((s) => cup.removeShape(s));
      collar.length = 0;
    }
    // 开始倒了，骰盅离开盘边，把围墙补高，免得骰子弹出盘外
    if (!highWalls && t >= plan.tShake1) {
      addTrayWalls(world, wallMat, 6.5, 28);
      highWalls = true;
    }
    // 运动学骰盅：用速度驱动到下一时刻的位姿
    const tt = Math.min(t + dt, plan.tAway1);
    cupPose(plan, tt, target);
    cup.velocity.set((target.pos.x - cup.position.x) / dt, (target.pos.y - cup.position.y) / dt, (target.pos.z - cup.position.z) / dt);
    qCur.set(cup.quaternion.x, cup.quaternion.y, cup.quaternion.z, cup.quaternion.w);
    qDelta.copy(target.quat).multiply(qCur.invert());
    if (qDelta.w < 0) qDelta.set(-qDelta.x, -qDelta.y, -qDelta.z, -qDelta.w);
    const ang = 2 * Math.acos(Math.min(1, qDelta.w));
    const sn = Math.sqrt(Math.max(1e-12, 1 - qDelta.w * qDelta.w));
    if (ang > 1e-6) cup.angularVelocity.set((qDelta.x / sn) * (ang / dt), (qDelta.y / sn) * (ang / dt), (qDelta.z / sn) * (ang / dt));
    else cup.angularVelocity.set(0, 0, 0);
    if (t >= plan.tAway1) {
      cup.velocity.set(0, 0, 0);
      cup.angularVelocity.set(0, 0, 0);
      world.allowSleep = true;
    }
    world.step(dt);
    t += dt;
    if (t >= nextRecord - 1e-9) {
      frameIdx++;
      record();
      nextRecord += 1 / 60;
      if (t > plan.tAway1 + 0.3) {
        const allStill = bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.05));
        if (allStill) calm++;
        else calm = 0;
        if (calm > 8) break;
      }
    }
  }

  // 校验：都平躺、都在盘内（没有卡在盅里）
  let badness = 0;
  const tops = [];
  const q = new THREE.Quaternion();
  bodies.forEach((b) => {
    q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const tf = topFace(q);
    tops.push(tf.value);
    if (tf.flat < 0.985) badness += 1 + (1 - tf.flat);
    if (b.position.y > 0.62) badness += 3;
    if (b.position.x < TRAY.minX || b.position.x > TRAY.maxX || b.position.z < TRAY.minZ || b.position.z > TRAY.maxZ) badness += 5;
  });
  const spawnFrames = plan.spawnT.map((st) => Math.ceil(st * 60));
  return { ok: badness === 0, badness, frames, tops, impacts, spawnFrames, spawnPos, endT: frames.length / 60, attempt, lidT };
}
