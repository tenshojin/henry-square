// 开局掷币的物理：把金币当成一枚真的薄圆片算一遍——飞、砸在皮面上、弹、立着滚、打着转（欧拉盘）、躺平，
// 全程离线算好再回放（和骰子一样），翻转时的摆动、落地后的弹跳和越转越快的抖动都是算出来的，不是摆出来的。
// 圆片是对称的：算出来朝上的是哪一面、头像朝哪边都不要紧，回放时绕自身的轴转一下、翻个面，
// 想要的那一面就能朝上、头像也摆正，整段轨迹一点不用变。
import * as THREE from 'three';

const V3 = THREE.Vector3;
const STEP = 1 / 1200;
const FRAME = 1 / 120;
export const COIN_FRAME = FRAME;
export const COIN_STRIDE = 7;
export const COIN_G = 30; // 比骰子（62）还慢一点：这枚金币是主角，要看清

const _r = new V3();
const _a = new V3();
const _b = new V3();
const _t = new V3();
const _c = new V3();
const _dq = new THREE.Quaternion();

// 接触材质：皮面软，弹得低、摩擦大；木框硬一点
const LEATHER = { e: 0.42, mu: 0.45 };
const WOOD = { e: 0.5, mu: 0.3 };

function run(o, launch) {
  const { R, half, floor, walls, rimTop, maxT } = o;
  const m = 1;
  const Id = m * (R * R / 4 + (4 * half * half) / 12); // 绕直径的转动惯量
  const Ia = (m * R * R) / 2; // 绕币轴的转动惯量
  const p = launch.p.clone();
  const v = launch.v.clone();
  const q = launch.q.clone();
  const n = new V3(0, 1, 0).applyQuaternion(q);
  // 角动量：不碰东西时守恒，币翻转时的摆动就是这么来的
  const inertia = (out, x, inverse) => {
    const along = x.dot(n);
    const ka = inverse ? 1 / Ia : Ia;
    const kd = inverse ? 1 / Id : Id;
    return out.copy(n).multiplyScalar(along * ka).addScaledVector(_t.copy(x).addScaledVector(n, -along), kd);
  };
  const L = inertia(new V3(), launch.w, false);
  const w = launch.w.clone();
  const frames = [];
  const events = [];
  const record = () => frames.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
  record();

  let t = 0;
  let nextFrame = FRAME;
  let lastHit = -1;
  let lastContact = -1;
  let tLand = 0;
  let wallHits = 0;
  let hits = 0;
  let azimuth = null;
  let turned = 0;
  let lastTick = 0;
  let stillFor = 0;
  let lowest = Infinity;

  // 币上离平面最近的一点（平面法线 N、距原点 d）：币边上朝平面的那一点
  const touch = (N, d, mat, kind) => {
    const nn = n.dot(N);
    _a.copy(N).multiplyScalar(-1).addScaledVector(n, nn);
    const len = _a.length();
    if (len > 1e-5) _a.multiplyScalar(R / len);
    else _a.set(R, 0, 0).addScaledVector(n, -n.x * R); // 正好平躺：边上哪一点都一样
    _r.copy(_a).addScaledVector(n, nn > 0 ? -half : half);
    const depth = d - N.dot(_c.copy(p).add(_r));
    if (depth <= 0) return false;
    // 碰撞点的速度
    _c.crossVectors(w, _r).add(v);
    const vn = _c.dot(N);
    if (vn < 0) {
      inertia(_b, _a.crossVectors(_r, N), true);
      const K = 1 / m + N.dot(_a.crossVectors(_b, _r));
      const e = -vn > 2.2 ? mat.e : 0;
      const jn = (-(1 + e) * vn) / K;
      v.addScaledVector(N, jn / m);
      L.add(_a.crossVectors(_r, _b.copy(N).multiplyScalar(jn)));
      inertia(w, L, true);
      // 摩擦：把碰撞点沿桌面的滑动吃掉一部分，转动和前进就这样互相转换
      _c.crossVectors(w, _r).add(v);
      _c.addScaledVector(N, -_c.dot(N));
      const slip = _c.length();
      if (slip > 1e-4) {
        _c.multiplyScalar(1 / slip);
        inertia(_b, _a.crossVectors(_r, _c), true);
        const Kt = 1 / m + _c.dot(_a.crossVectors(_b, _r));
        const jt = Math.min(slip / Kt, mat.mu * jn);
        v.addScaledVector(_c, -jt / m);
        L.add(_a.crossVectors(_r, _b.copy(_c).multiplyScalar(-jt)));
        inertia(w, L, true);
      }
      if (-vn > 1.1 && t - lastHit > 0.05) {
        lastHit = t;
        hits++;
        events.push({ t, kind, v: -vn });
      }
    }
    p.addScaledVector(N, depth);
    if (kind === 'floor') {
      lastContact = t;
      if (!tLand) tLand = t;
      // 接触点绕币心转了半圈，币就在皮面上磕一下：这就是打转时越来越密的声音
      const az = Math.atan2(_r.z, _r.x);
      if (azimuth !== null) {
        let dA = az - azimuth;
        if (dA > Math.PI) dA -= Math.PI * 2;
        if (dA < -Math.PI) dA += Math.PI * 2;
        turned += Math.abs(dA);
        if (turned >= Math.PI) {
          turned -= Math.PI;
          if (t - lastHit > 0.08) events.push({ t, kind: 'rattle', v: 1 / Math.max(0.02, t - lastTick) });
          lastTick = t;
        }
      }
      azimuth = az;
    } else {
      wallHits++;
      if (p.y > rimTop) o.overRim = true;
    }
    return true;
  };

  const UP = new V3(0, 1, 0);
  while (t < maxT) {
    v.y -= COIN_G * STEP;
    // 皮面又软又涩：贴着它的时候转动慢慢被吃掉，要不然欧拉盘能转上半分钟
    if (t - lastContact < 0.02) {
      const k = Math.exp(-o.drag * STEP);
      L.multiplyScalar(k);
      v.x *= k;
      v.z *= k;
    }
    inertia(w, L, true);
    touch(UP, floor, LEATHER, 'floor');
    if (p.y < rimTop + R) for (const wall of walls) touch(wall.n, wall.d, WOOD, 'wall'); // 木框只有这么高，高处飞过去碰不到
    p.addScaledVector(v, STEP);
    const ang = w.length();
    if (ang > 1e-6) {
      _dq.setFromAxisAngle(_a.copy(w).multiplyScalar(1 / ang), ang * STEP);
      q.premultiply(_dq).normalize();
    }
    n.set(0, 1, 0).applyQuaternion(q);
    inertia(w, L, true);
    t += STEP;
    lowest = Math.min(lowest, p.y - (R * Math.sqrt(Math.max(0, 1 - n.y * n.y)) + half * Math.abs(n.y)));
    if (t >= nextFrame) {
      nextFrame += FRAME;
      record();
    }
    // 倒得差不多了、也不怎么动了：啪地躺平
    const tilt = Math.acos(Math.min(1, Math.abs(n.y)));
    if (tLand && tilt < 0.045 && p.y - floor < half + R * 0.07 && Math.abs(v.y) < 1.2) stillFor += STEP;
    else stillFor = 0;
    if (stillFor > 0.03) break;
  }
  // 最后几帧放平
  const qEnd = q.clone();
  const qFlat = new THREE.Quaternion().setFromUnitVectors(n, n.y >= 0 ? UP : _a.set(0, -1, 0)).multiply(qEnd);
  const y0 = p.y;
  const settle = 5;
  for (let i = 1; i <= settle; i++) {
    const k = i / settle;
    q.slerpQuaternions(qEnd, qFlat, k);
    p.y = y0 + (floor + half - y0) * k;
    record();
  }
  return { frames: new Float32Array(frames), events, tLand, tEnd: frames.length / COIN_STRIDE * FRAME, hits, wallHits, lowest, end: p.clone(), flatUp: n.y >= 0, overRim: !!o.overRim, stopped: t < maxT };
}

// 掷一次：从 start 弹起，T 秒后落到 land 附近。多试几个手法，挑一枚落在盘中间、没撞出盘外、时长合适的
export function simulateCoinToss(o, rnd = Math.random) {
  const { start, land, T } = o;
  const rr = (a, b) => a + (b - a) * rnd();
  let best = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    // 拇指一弹：绕一条横着的直径翻转，再带一股朝上的旋转（空中摆动，落地后接着打转）
    const lx = land.x + rr(-1.4, 1.4);
    const lz = land.z + rr(-0.8, 0.8);
    const v = new V3((lx - start.x) / T, (land.y - start.y + 0.5 * COIN_G * T * T) / T, (lz - start.z) / T);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(0.9, 1.3), rr(-0.3, 0.3), rr(-0.15, 0.15)));
    const flip = rr(18, 25) * (rnd() < 0.5 ? 1 : -1);
    const w = new V3(flip, rr(13, 23) * (rnd() < 0.5 ? 1 : -1), rr(-1.4, 1.4));
    const r = run({ ...o, overRim: false }, { p: start, v, q, w });
    const settled = r.tEnd - r.tLand;
    const score = (r.stopped ? 0 : 50) + (r.overRim ? 30 : 0) + Math.max(0, Math.abs(r.end.x) - 5) * 4 + Math.max(0, Math.abs(r.end.z) - 3.2) * 4
      + Math.max(0, o.settleMin - settled) * 6 + Math.max(0, settled - o.settleMax) * 6 + r.wallHits * 0.5;
    if (!best || score < best.score) best = { ...r, score, attempt };
    if (score === 0) break;
  }
  return best;
}
