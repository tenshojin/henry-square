// 掷币物理的统计：一枚枚算出来看合不合适（落点、弹几下、打转多久、有没有穿过皮面）
import * as THREE from 'three';
import { simulateCoinToss, COIN_FRAME, COIN_STRIDE } from '../src/render/coinPhysics.js';
import { TOSS } from '../src/render/coinToss.js';
globalThis.window ??= { innerWidth: 1280, innerHeight: 720 };

const N = Number(process.argv[2] || 60);
if (process.env.DRAG) TOSS.drag = Number(process.env.DRAG);
const rows = [];
let ms = 0;
const q = new THREE.Quaternion();
const n = new THREE.Vector3();
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const r = simulateCoinToss(TOSS);
  ms += performance.now() - t0;
  rows.push(r);
}
const avg = (f) => (rows.reduce((a, r) => a + f(r), 0) / N).toFixed(2);
console.log('平均耗时', (ms / N).toFixed(1), 'ms，平均试了', avg((r) => r.attempt + 1), '次');
console.log('落地', avg((r) => r.tLand), '秒，从落地到躺平', avg((r) => r.tEnd - r.tLand), '秒，最长', Math.max(...rows.map((r) => r.tEnd - r.tLand)).toFixed(2));
console.log('磕碰次数', avg((r) => r.hits), '撞边', avg((r) => r.wallHits), '没停下', rows.filter((r) => !r.stopped).length, '飞出框', rows.filter((r) => r.overRim).length, '分数不为 0', rows.filter((r) => r.score > 0).length);
console.log('终点 x', avg((r) => Math.abs(r.end.x)), 'z', avg((r) => r.end.z), '最远', Math.max(...rows.map((r) => Math.hypot(r.end.x, r.end.z))).toFixed(2));
console.log('最低点离皮面', Math.min(...rows.map((r) => r.lowest - TOSS.floor)).toFixed(3));
console.log('朝上：正面', rows.filter((r) => r.flatUp).length, '/', N);
console.log('最后一秒的磕碰声', avg((r) => r.events.filter((e) => e.t > r.tEnd - 1).length), '整段', avg((r) => r.events.length));

// 看一枚的过程
const r = rows[0];
const S = COIN_STRIDE;
const out = [];
for (let f = 0; f * S < r.frames.length; f += 12) {
  const o = f * S;
  q.set(r.frames[o + 3], r.frames[o + 4], r.frames[o + 5], r.frames[o + 6]);
  n.set(0, 1, 0).applyQuaternion(q);
  out.push(`${(f * COIN_FRAME).toFixed(1)}s y${r.frames[o + 1].toFixed(2)} tilt${Math.round(Math.acos(Math.abs(n.y)) * 57.3)}`);
}
console.log(out.join(' | '));
console.log(r.events.slice(0, 40).map((e) => `${e.t.toFixed(2)}${e.kind[0]}${e.v.toFixed(1)}`).join(' '));
