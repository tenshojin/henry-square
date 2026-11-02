// 胜利时从天而降的格罗申（v3.4）：难度越高撒得越多。落到桌上弹一下就躺平，落在一起的一枚枚摞起来；
// 落在骰盘、骰盘的木框、骰子、钱摞上就停在它们上面。用实例化网格画，几百枚也不卡。
import * as THREE from 'three';
import { TABLE_Y } from './world.js';
import { groschenGeometry, groschenMaterials, G_R, G_REST, G_STEP } from './groschen.js';

const GRAV = 62; // 和骰子一样的慢动作重力
const CELL = 0.45; // 摞高用的格子
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (k) => 1 - (1 - k) ** 3;

// count：撒多少枚；dice / stacks：[{x, z, top}]（落在上面就停在 top 的高度）；avoid：[{x, z, r}]（骰盅、酒杯，不往那里撒）
export function coinShower(stage, audio, { count, dice = [], stacks = [], avoid = [] }) {
  const mesh = new THREE.InstancedMesh(groschenGeometry(40, 2), groschenMaterials(), count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stage.scene.add(mesh);

  const ground = (x, z) => {
    let y = TABLE_Y;
    if (Math.abs(x) < 8 && Math.abs(z) < 5.3) y = TABLE_Y + 0.31; // 骰盘皮面
    else if (Math.abs(x) < 8.9 && Math.abs(z) < 6.2) y = TABLE_Y + 1.1; // 骰盘木框
    for (const d of dice) if (Math.abs(x - d.x) < 0.5 + G_R * 0.4 && Math.abs(z - d.z) < 0.5 + G_R * 0.4) y = Math.max(y, d.top);
    for (const s of stacks) if (Math.hypot(x - s.x, z - s.z) < G_R * 1.05) y = Math.max(y, s.top);
    return y;
  };
  // 已经躺下的币：每个格子记它最上面那枚的顶面高度
  const pile = new Map();
  const cells = (x, z, fn) => {
    const r = G_R * 0.85;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        if (Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - z) <= r) fn(i + ',' + j);
      }
    }
  };
  const restY = (x, z) => {
    let y = ground(x, z);
    let onCoin = false;
    cells(x, z, (k) => {
      const h = pile.get(k);
      if (h !== undefined && h > y) {
        y = h;
        onCoin = true;
      }
    });
    return { y: y + G_REST, onCoin };
  };

  // 落点：画面里看得见的桌面范围，中间密一些；骰盅、酒杯那里不撒
  const spot = () => {
    for (let n = 0; n < 20; n++) {
      const g = Math.random() < 0.6;
      const z = g ? THREE.MathUtils.clamp(1 + rand(-1, 1) * rand(0, 1) * 9, -12.5, 10.5) : rand(-12.5, 10.5);
      const hw = 13 + (10.5 - z) * 0.45;
      const x = g ? rand(-1, 1) * rand(0, 1) * hw : rand(-hw, hw);
      if (!avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) return [x, z];
    }
    return [rand(-6, 6), rand(-4, 4)];
  };

  const span = 1.4 + count / 300; // 多少秒内撒完
  const coins = [];
  for (let i = 0; i < count; i++) {
    const [x, z] = spot();
    const vx = rand(-2, 2);
    const vz = rand(-2, 2);
    const y0 = rand(22, 36);
    const tFall = Math.sqrt((2 * (y0 - TABLE_Y)) / GRAV);
    coins.push({
      p: new THREE.Vector3(x - vx * tFall, y0, z - vz * tFall),
      v: new THREE.Vector3(vx, -rand(0, 5), vz),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3))),
      w: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(6, 18)),
      delay: span * Math.random() ** 1.4,
      phase: 0, // 0 还没出手、1 下落、2 弹起后再落、3 躺下（插值到平放）、4 停住
      s: 1,
    });
  }
  const m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const tmpQ = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, hidden);
  let time = 0;
  let lastClink = 0;
  let fade = -1;
  const clink = (onCoin, x) => {
    if (time - lastClink < 0.035) return;
    lastClink = time;
    audio.coinClink(onCoin, THREE.MathUtils.clamp(x / 16, -0.9, 0.9), rand(0.6, 1.1));
  };
  audio.coins();

  const update = (dt) => {
    time += dt;
    let moving = false;
    for (let i = 0; i < count; i++) {
      const c = coins[i];
      if (c.phase === 4 && fade < 0) continue;
      if (c.phase === 0) {
        if (time < c.delay) {
          moving = true;
          continue;
        }
        c.phase = 1;
      }
      if (c.phase === 1 || c.phase === 2) {
        moving = true;
        c.v.y -= GRAV * dt;
        c.p.addScaledVector(c.v, dt);
        const wl = c.w.length();
        if (wl > 0) c.q.premultiply(tmpQ.setFromAxisAngle(axis.copy(c.w).divideScalar(wl), wl * dt));
        const r = restY(c.p.x, c.p.z);
        if (c.p.y <= r.y + G_R * 0.3 && c.v.y < 0) {
          if (c.phase === 1 && c.v.y < -6) {
            // 第一下：弹起一点，转慢一点
            c.phase = 2;
            c.v.set(c.v.x * 0.4, -c.v.y * 0.24, c.v.z * 0.4);
            c.w.multiplyScalar(0.5);
            clink(r.onCoin, c.p.x);
          } else {
            // 再落下：躺平（头像 / 十字随机朝上，落在别的币上的稍微斜一点）
            c.phase = 3;
            c.t = 0;
            c.q0 = c.q.clone();
            const tilt = r.onCoin ? rand(0.03, 0.12) : rand(0, 0.02);
            c.q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * Math.cos(c.p.x * 7), rand(0, 6.3), tilt * Math.sin(c.p.z * 7)));
            if (Math.random() < 0.5) c.q1.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
            c.y0 = c.p.y;
            c.y1 = r.y + (r.onCoin ? G_STEP * 0.1 : 0);
            cells(c.p.x, c.p.z, (k) => pile.set(k, c.y1 + G_REST));
            clink(r.onCoin, c.p.x);
          }
        }
      } else if (c.phase === 3) {
        moving = true;
        c.t += dt / 0.22;
        const k = ease(Math.min(1, c.t));
        c.q.slerpQuaternions(c.q0, c.q1, k);
        c.p.y = c.y0 + (c.y1 - c.y0) * k + Math.sin(Math.PI * Math.min(1, c.t)) * 0.12;
        if (c.t >= 1) c.phase = 4;
      }
      // 收走：缩小消失
      if (fade >= 0) c.s = Math.max(0, 1 - fade / 0.35);
      mesh.setMatrixAt(i, m.compose(c.p, c.q, one.setScalar(c.s)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (fade >= 0) {
      fade += dt;
      if (fade > 0.36) remove();
    } else if (!moving) {
      // 全部停住后不再每帧更新
      off();
      off = null;
    }
  };
  let off = stage.add(update);
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    if (off) off();
    off = null;
    stage.scene.remove(mesh);
    mesh.dispose();
  };
  return {
    // animated：桌面还看得见（再来一局）时缩小消失；画面已被视频盖住时直接收走
    stop(animated = false) {
      if (removed) return;
      if (!animated) return remove();
      if (fade >= 0) return;
      fade = 0;
      if (!off) off = stage.add(update);
    },
  };
}
