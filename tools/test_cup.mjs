// 骰盅投掷自测：成功率、耗时，以及摇盅阶段骰子会不会飞出盅口
import * as THREE from 'three';
import { simulateCupThrow, makeCupPlan, cupPose, CUP_TOP, CUP_IN_R, CUP_STRIDE, DIE_CUP_SCALE } from '../src/render/physics.js';
const noLid = {}, lidDelay = [];
let smallAtEnd = 0, bigInCup = 0;
let ok = 0, total = 0, tsum = 0, attempts = 0, maxMs = 0, worstRise = -9, escapes = 0, cupHits = 0, riseSum = 0;
const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const inv = new THREE.Quaternion();
const p = new THREE.Vector3();
for (let k = 0; k < 36; k++) {
  const side = k % 2 ? -1 : 1;
  const n = 1 + (k % 6);
  const plan = makeCupPlan({ base: new THREE.Vector3((0.4 + Math.random() * 3) * side, 6.2, 3.0 * side), side, n });
  const t0 = performance.now();
  const r = simulateCupThrow(n, plan);
  const ms = performance.now() - t0;
  tsum += ms; maxMs = Math.max(maxMs, ms); total++; if (r.ok) ok++; attempts += r.attempt + 1;
  // 摇盅阶段（骰子全部落进去之后 → 开始倒之前），换算到骰盅本地坐标
  let rise = -9, escaped = false;
  r.frames.forEach((fr, fi) => {
    const t = fi / 60;
    if (t < plan.tShake0 || t > plan.tShake1) return;
    cupPose(plan, t, pose);
    inv.copy(pose.quat).invert();
    for (let i = 0; i < n; i++) {
      p.set(fr[i * CUP_STRIDE], fr[i * CUP_STRIDE + 1], fr[i * CUP_STRIDE + 2]).sub(pose.pos).applyQuaternion(inv);
      rise = Math.max(rise, p.y - CUP_TOP);
      if (p.y > CUP_TOP && Math.hypot(p.x, p.z) > CUP_IN_R) escaped = true;
    }
  });
  worstRise = Math.max(worstRise, rise); riseSum += rise; if (escaped) escapes++;
  const hits = r.impacts.filter((i) => i.kind === 'cup' && i.f / 60 > plan.tShake0 && i.f / 60 < plan.tShake1).length;
  cupHits += hits;
  // 最后一帧：每颗骰子都应长回原大小
  const lastF = r.frames[r.frames.length - 1];
  for (let i = 0; i < n; i++) if (lastF[i * CUP_STRIDE + 7] < 0.999) smallAtEnd++;
  // 在盅里（摇盅阶段）应是小骰子
  const midF = r.frames[Math.round(((plan.tShake0 + plan.tShake1) / 2) * 60)];
  for (let i = 0; i < n; i++) if (Math.abs(midF[i * CUP_STRIDE + 7] - DIE_CUP_SCALE) > 1e-3) bigInCup++;
  if (r.lidT < 0) noLid[n] = (noLid[n] || 0) + 1;
  else lidDelay.push(r.lidT - plan.spawnT[n - 1]);
}
console.log('ok', ok, '/', total, '| avg ms', (tsum / total).toFixed(0), 'max ms', maxMs.toFixed(0), '| avg attempts', (attempts / total).toFixed(2));
console.log('lid never placed (by dice count):', JSON.stringify(noLid), '| lid delay after last drop avg', (lidDelay.reduce((a, b) => a + b, 0) / Math.max(1, lidDelay.length)).toFixed(2), 's max', Math.max(...lidDelay).toFixed(2));
console.log('dice still small at the end:', smallAtEnd, '| dice not small while in the cup:', bigInCup);
console.log('shake: dice above rim by avg', (riseSum / total).toFixed(2), 'worst', worstRise.toFixed(2), '| throws with a die leaving the cup', escapes, '/', total, '| cup hits per throw', (cupHits / total).toFixed(1));
