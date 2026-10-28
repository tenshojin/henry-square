// 角色身体：骨骼 + 沿骨骼放样的蒙皮网格
// 人物穿着衣服，所以“身体表面”直接就是衣服（衬衫、外套、裤子……），只有脖子、手、脸露出皮肤。
// 单位与场景一致（1 = 2cm），人物面朝 +z，左手在 +x 一侧，绑定姿势是站立、两臂自然下垂。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 骨骼编号
export const BN = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shL', 'uaL', 'faL', 'hdL', 'shR', 'uaR', 'faR', 'hdR', 'thL', 'snL', 'ftL', 'thR', 'snR', 'ftR'];
export const B = Object.fromEntries(BN.map((n, i) => [n, i]));
const PARENT = { hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', uaL: 'shL', faL: 'uaL', hdL: 'faL', shR: 'chest', uaR: 'shR', faR: 'uaR', hdR: 'faR', thL: 'hips', snL: 'thL', ftL: 'snL', thR: 'hips', snR: 'thR', ftR: 'snR' };

// 绑定姿势下各关节的位置（sw = 肩宽系数）
export function jointPositions(sw = 1, fem = false) {
  const nk = fem ? -1.3 : 0;
  const J = {
    root: [0, 0, 0],
    hips: [0, 46, 0],
    spine: [0, 53, -0.6],
    chest: [0, 61, -0.8],
    neck: [0, 72.6 + nk * 0.4, -1.0],
    head: [0, 77.4 + nk, 0.0],
    shL: [2.2 * sw, 70.6, -1.0],
    uaL: [8.6 * sw, 70.2, -1.0],
    faL: [8.6 * sw + 1.3, 56.9, -1.1],
    hdL: [8.6 * sw + 2.1, 44.4, -0.7],
    thL: [4.3, 44.6, 0.2],
    snL: [4.4, 24.4, 0.4],
    ftL: [4.5, 3.8, -0.6],
  };
  for (const k of ['sh', 'ua', 'fa', 'hd', 'th', 'sn', 'ft']) {
    const [x, y, z] = J[k + 'L'];
    J[k + 'R'] = [-x, y, z];
  }
  return J;
}

export function createSkeleton(J) {
  const bones = BN.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  BN.forEach((name, i) => {
    const p = J[name];
    if (name === 'root') {
      bones[i].position.set(0, 0, 0);
      return;
    }
    const pp = J[PARENT[name]];
    bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    bones[B[PARENT[name]]].add(bones[i]);
  });
  bones[0].updateMatrixWorld(true);
  return { bones, skeleton: new THREE.Skeleton(bones) };
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/**
 * 放样：一圈圈截面连成管子
 * rings: [{ c:Vector3, ax:Vector3（截面 θ=0 方向）, az:Vector3（θ=90° 方向，朝前）, rx, rz, w:[[骨骼, 权重], ...], arc?:[θ0, θ1], wf?:(θ)=>权重表 }]
 * θ 从背后 -az 开始绕一圈，UV 接缝在背后；n 越大截面越方
 */
export function loft(rings, segs, { n = 2, arc = null, capStart = false, capEnd = false, uv = 6, wobble = null } = {}) {
  const pos = [];
  const uvs = [];
  const si = [];
  const sw = [];
  const idx = [];
  let vAcc = 0;
  const per = segs + 1;
  rings.forEach((r, k) => {
    if (k) vAcc += r.c.distanceTo(rings[k - 1].c);
    const a = r.arc || arc || [-Math.PI / 2, Math.PI * 1.5];
    const circ = Math.PI * (r.rx + r.rz) * ((a[1] - a[0]) / (Math.PI * 2));
    for (let j = 0; j <= segs; j++) {
      const t = j / segs;
      const th = a[0] + (a[1] - a[0]) * t;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const X = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const Z = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      let f = r.shape ? r.shape(th) : 1;
      if (wobble) f += wobble(th, k, t);
      const rx = r.rx * f;
      const rz = r.rz * f;
      pos.push(r.c.x + r.ax.x * rx * X + r.az.x * rz * Z, r.c.y + r.ax.y * rx * X + r.az.y * rz * Z, r.c.z + r.ax.z * rx * X + r.az.z * rz * Z);
      uvs.push((t * circ) / uv, vAcc / uv);
      const w = r.wf ? r.wf(th) : r.w;
      for (let q = 0; q < 4; q++) {
        si.push(w[q] ? w[q][0] : 0);
        sw.push(w[q] ? w[q][1] : 0);
      }
    }
    if (k) {
      const r0 = (k - 1) * per;
      const r1 = k * per;
      for (let j = 0; j < segs; j++) idx.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
    }
  });
  const capAt = (k, flip) => {
    const r = rings[k];
    const ci = pos.length / 3;
    pos.push(r.c.x, r.c.y, r.c.z);
    uvs.push(0, 0);
    const w = r.w || r.wf(0);
    for (let q = 0; q < 4; q++) {
      si.push(w[q] ? w[q][0] : 0);
      sw.push(w[q] ? w[q][1] : 0);
    }
    for (let j = 0; j < segs; j++) {
      const a = k * per + j;
      if (flip) idx.push(ci, a + 1, a);
      else idx.push(ci, a, a + 1);
    }
  };
  if (capStart) capAt(0, false);
  if (capEnd) capAt(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  orientOutward(g, rings, per);
  fixSeams(g, rings.length, per, rings[0].arc || arc);
  return g;
}

// 保证法线朝外：看第一圈中间那个点的法线是否背离截面中心
function orientOutward(g, rings, per) {
  g.computeVertexNormals();
  const k = Math.min(1, rings.length - 1);
  const j = Math.floor(per / 2);
  const i = k * per + j;
  const p = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
  const nrm = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i);
  if (nrm.dot(p.sub(rings[k].c)) < 0) {
    const ix = g.index.array;
    for (let t = 0; t < ix.length; t += 3) {
      const tmp = ix[t + 1];
      ix[t + 1] = ix[t + 2];
      ix[t + 2] = tmp;
    }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
}
// 整圈截面的首尾两个点重合，法线取平均，避免背后出现一道接缝
function fixSeams(g, nRings, per, arc) {
  if (arc && Math.abs(arc[1] - arc[0] - Math.PI * 2) > 1e-3) return;
  const nr = g.attributes.normal;
  for (let k = 0; k < nRings; k++) {
    const a = k * per;
    const b = a + per - 1;
    const x = nr.getX(a) + nr.getX(b);
    const y = nr.getY(a) + nr.getY(b);
    const z = nr.getZ(a) + nr.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l);
    nr.setXYZ(b, x / l, y / l, z / l);
  }
}

// 把同一材质的几块网格合成一个
export function merge(list) {
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  return g;
}

// 顺着法线整体外扩（衣服的外层、毛皮外壳）
export function inflate(g, d) {
  const out = g.clone();
  const p = out.attributes.position;
  const nr = out.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + nr.getX(i) * d, p.getY(i) + nr.getY(i) * d, p.getZ(i) + nr.getZ(i) * d);
  return out;
}

// ---------- 身体比例 ----------
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 躯干剖面：[高度, 左右半宽, 前后半厚, 中心前后偏移]
export function torsoProfile(P) {
  const f = P.sex === 'f';
  const g = P.girth ?? 1;
  const belly = P.belly ?? 0;
  const sw = P.sw ?? 1;
  const keys = f
    ? [
        [40.5, 6.2, 5.3, 0.4],
        [44, 8.6, 6.5, 0.1],
        [47.5, 9.0, 6.7, -0.3],
        [51.5, 7.2, 5.5, 0.0],
        [54.5, 6.5, 5.1, 0.2],
        [58, 6.9, 5.5, 0.3],
        [61.5, 7.6, 6.8, 0.9],
        [64.5, 7.8, 6.5, 0.6],
        [67.5, 7.9, 5.5, -0.2],
        [69.6, 7.9 * sw, 4.9, -0.8],
        [70.9, 6.6 * sw, 4.3, -0.9],
        [72.0, 4.2, 3.4, -0.9],
        [73.0, 3.0, 2.9, -0.8],
      ]
    : [
        [40.5, 6.0, 5.2, 0.3],
        [44, 7.8, 6.2, 0.0],
        [47.5, 8.0, 6.3, -0.2],
        [51.5, 7.4 + belly * 0.8, 5.9 + belly * 2.4, 0.1 + belly * 1.7],
        [55, 7.5 + belly * 0.9, 6.0 + belly * 2.8, 0.3 + belly * 2.1],
        [59, 7.9 + belly * 0.5, 6.4 + belly * 1.7, 0.1 + belly * 1.2],
        [63, 8.5, 6.7, -0.1],
        [67, 8.8 * sw, 6.3, -0.5],
        [69.6, 8.8 * sw, 5.5, -0.9],
        [71.1, 7.9 * sw, 4.9, -1.0],
        [72.4, 5.8 * sw, 4.3, -1.0],
        [73.6, 3.6, 3.4, -0.9],
      ];
  return keys.map(([y, rx, rz, z]) => [y, rx * g, rz * (0.6 + 0.4 * g), z]);
}
function sampleProfile(keys, y) {
  if (y <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t);
      return [lerp(a[1], b[1], s), lerp(a[2], b[2], s), lerp(a[3], b[3], s)];
    }
  }
  return keys[keys.length - 1].slice(1);
}
// 躯干上某个高度属于哪些骨骼
function torsoWeights(y) {
  if (y < 49) return [[B.hips, 1]];
  if (y < 55) {
    const t = sstep(49, 55, y);
    return [[B.hips, 1 - t], [B.spine, t]];
  }
  if (y < 61) {
    const t = sstep(55, 61, y);
    return [[B.spine, 1 - t], [B.chest, t]];
  }
  if (y < 72.5) return [[B.chest, 1]];
  if (y < 76) {
    const t = sstep(72.5, 76, y);
    return [[B.chest, 1 - t], [B.neck, t]];
  }
  const t = sstep(76, 79, y);
  return [[B.neck, 1 - t], [B.head, t]];
}

/**
 * 躯干上的一层（衬衫、外套、紧身胸衣、斗篷……）
 * off：比身体外扩多少；arc：只围一部分（比如前襟敞开）；shape：按角度额外调整；ys：高度采样
 */
export function torsoLayer(P, { y0, y1, off = 0, arc = null, step = 1.6, segs = 28, shape = null, flare = null, wobble = null, n = 2.12, capStart = false } = {}) {
  const keys = torsoProfile(P);
  const rings = [];
  const ys = [];
  for (let y = y0; y < y1 - 0.01; y += step) ys.push(y);
  ys.push(y1);
  for (const y of ys) {
    const [rx, rz, z] = sampleProfile(keys, y);
    const fl = flare ? flare(y) : 0;
    rings.push({ c: new THREE.Vector3(0, y, z), ax: new THREE.Vector3(1, 0, 0), az: new THREE.Vector3(0, 0, 1), rx: rx + off + fl, rz: rz + off + fl * 0.8, w: torsoWeights(y), arc, shape: shape ? (th) => shape(th, y) : null });
  }
  return loft(rings, segs, { n, arc, wobble, capStart });
}

// 四肢：沿两节骨骼放样；prof = [[t, 半径, 前后比例], ...]，t 在第一节 0..1、第二节 1..2
export function limbLayer(J, side, kind, prof, { off = 0, segs = 16, wobble = null, capEnd = false } = {}) {
  const S = side === 'L' ? 'L' : 'R';
  const names = kind === 'arm' ? ['sh', 'ua', 'fa', 'hd'] : ['hips', 'th', 'sn', 'ft'];
  const jn = names.map((nm, i) => (nm === 'hips' ? 'hips' : nm + S));
  const P0 = v3(J[jn[1]]);
  const P1 = v3(J[jn[2]]);
  const P2 = v3(J[jn[3]]);
  const bParent = B[jn[0]];
  const b1 = B[jn[1]];
  const b2 = B[jn[2]];
  const b3 = B[jn[3]];
  const X = new THREE.Vector3(1, 0, 0);
  const rings = prof.map(([t, r, zr = 1]) => {
    let c;
    let T;
    if (t <= 1) {
      T = P1.clone().sub(P0).normalize();
      c = P0.clone().lerp(P1, t);
    } else {
      T = P2.clone().sub(P1).normalize();
      c = P1.clone().lerp(P2, t - 1);
    }
    // 关节附近两节骨骼平滑过渡
    let w;
    if (t < 0.12) {
      const k = sstep(-0.2, 0.12, t);
      w = [[bParent, 1 - k], [b1, k]];
    } else if (t < 0.88) w = [[b1, 1]];
    else if (t < 1.12) {
      const k = sstep(0.88, 1.12, t);
      w = [[b1, 1 - k], [b2, k]];
    } else if (t < 1.9) w = [[b2, 1]];
    else {
      const k = sstep(1.9, 2.05, t);
      w = [[b2, 1 - k], [b3, k]];
    }
    const ax = X.clone().sub(T.clone().multiplyScalar(X.dot(T))).normalize();
    const az = T.clone().cross(ax).normalize();
    return { c, ax, az, rx: r + off, rz: (r + off) * zr, w };
  });
  return loft(rings, segs, { wobble, capEnd });
}

// 标准四肢剖面
export function armProfile(P) {
  const g = P.girth ?? 1;
  const f = P.sex === 'f' ? 0.86 : 1;
  const k = g * f;
  return [
    [-0.2, 1.2 * k],
    [-0.12, 2.4 * k],
    [-0.04, 2.95 * k],
    [0.12, 2.85 * k],
    [0.4, 2.6 * k],
    [0.7, 2.3 * k],
    [0.9, 2.05 * k],
    [1.04, 2.05 * k],
    [1.25, 2.3 * k],
    [1.55, 2.0 * k],
    [1.85, 1.65 * k, 0.8],
    [1.98, 1.5 * k, 0.75],
    [2.06, 1.4 * k, 0.75],
  ];
}
export function legProfile(P) {
  const g = P.girth ?? 1;
  const f = P.sex === 'f' ? 1.04 : 1;
  const k = g * f;
  return [
    [-0.12, 4.9 * k],
    [0.0, 4.65 * k],
    [0.3, 4.35 * k],
    [0.65, 3.65 * k],
    [0.9, 3.15 * k],
    [1.05, 3.05 * k],
    [1.28, 3.35 * k],
    [1.55, 2.95 * k],
    [1.8, 2.3 * k],
    [1.97, 2.05 * k],
  ];
}

// ---------- 布料的褶皱 ----------
export const folds = (amp, freq, along = 0) => (th, k, t) => Math.sin(th * freq + k * along) * amp + Math.sin(th * freq * 2.3 + k * 0.7) * amp * 0.4;

// ---------- 靴子：小腿下段 + 脚掌 ----------
export function bootLayer(J, side, { top = 1.45, off = 0.55, segs = 18 } = {}) {
  const S = side;
  const g = [];
  g.push(
    limbLayer(J, side, 'leg', [
      [top, 3.7],
      [top + 0.05, 3.75],
      [1.6, 3.3],
      [1.8, 2.75],
      [1.97, 2.55],
      [2.03, 2.55],
    ], { off, segs })
  );
  // 脚：从脚跟到脚尖，截面是扁椭圆
  const a = v3(J['ft' + S]);
  const rings = [];
  const pts = [
    [-3.2, 1.8, 2.3, 2.0],
    [-2.4, 2.4, 2.6, 2.6],
    [0, 2.6, 2.5, 2.4],
    [2.5, 2.7, 2.2, 1.6],
    [4.8, 2.5, 1.7, 1.25],
    [6.6, 1.9, 1.3, 1.0],
    [7.4, 1.0, 0.8, 0.9],
  ];
  for (const [z, rx, ry, y] of pts) {
    rings.push({ c: new THREE.Vector3(a.x, a.y - 3.8 + y + 0.15, a.z + z), ax: new THREE.Vector3(1, 0, 0), az: new THREE.Vector3(0, 1, 0), rx: rx + 0.15, rz: ry + 0.15, w: z < -1 ? [[B['sn' + S], 0.35], [B['ft' + S], 0.65]] : [[B['ft' + S], 1]] });
  }
  g.push(loft(rings, segs, { n: 2.6, capStart: true, capEnd: true }));
  return merge(g);
}

// ---------- 长裙（从腰到脚踝），下摆跟着大腿走 ----------
export function skirtLayer(P, J, { y0 = 52, y1 = 3, flare = 14, segs = 36, wobble = null, arc = null, off = 0, yStop = -Infinity } = {}) {
  const keys = torsoProfile(P);
  const rings = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = lerp(y0, y1, t);
    if (y < yStop - 3.1) break;
    const top = sampleProfile(keys, Math.max(y, 44));
    const rx = lerp(top[0] + 0.6, flare, Math.pow(t, 0.8)) + off;
    const rz = lerp(top[1] + 0.6, flare * 0.82, Math.pow(t, 0.8)) + off;
    rings.push({
      c: new THREE.Vector3(0, y, top[2] + t * 0.6),
      ax: new THREE.Vector3(1, 0, 0),
      az: new THREE.Vector3(0, 0, 1),
      rx,
      rz,
      arc,
      // 下半截的左、右两侧分别挂在左右大腿上，坐下时裙子会搭在腿上
      wf: (th) => {
        const side = Math.cos(th); // >0 左
        const fr = Math.max(0, Math.sin(th)); // 前
        const k = sstep(0.12, 0.6, t) * (0.35 + 0.55 * fr);
        const L = Math.max(0, side) * k + k * 0.5 * (1 - Math.abs(side));
        const R = Math.max(0, -side) * k + k * 0.5 * (1 - Math.abs(side));
        const h = Math.max(0, 1 - L - R);
        return [[B.hips, h], [B.thL, L], [B.thR, R]];
      },
    });
  }
  return loft(rings, segs, { wobble, arc });
}

// ---------- 斗篷 / 披风：搭在肩上、沿背后垂下，前面敞开 ----------
export function cloakLayer(P, { y0 = 74, y1 = 38, open = 0.75, off = 1.6, flare = 3.5, segs = 30, wobble = null } = {}) {
  const keys = torsoProfile(P);
  const rings = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = lerp(y0, y1, t);
    const [rx0, rz0, z] = sampleProfile(keys, Math.max(y, 44));
    // 肩部要把肩头整个包住
    const shoulder = sstep(74, 69, y) * (1 - sstep(64, 56, y));
    const rx = rx0 + off + shoulder * 2.4 + t * flare;
    const rz = rz0 + off + t * flare * 0.7;
    const a0 = Math.PI / 2 + open * (0.6 + 0.4 * t);
    rings.push({
      c: new THREE.Vector3(0, y, z - 0.4 - t * 1.2),
      ax: new THREE.Vector3(1, 0, 0),
      az: new THREE.Vector3(0, 0, 1),
      rx,
      rz,
      arc: [a0, a0 + Math.PI * 2 - 2 * open * (0.6 + 0.4 * t)],
      w: y > 60 ? [[B.chest, 1]] : y > 52 ? [[B.chest, 0.5], [B.spine, 0.5]] : [[B.spine, 0.6], [B.hips, 0.4]],
    });
  }
  return loft(rings, segs, { wobble, n: 2.2 });
}

// ---------- 围在脖子上的厚领 / 围巾 / 放下的兜帽 ----------
export function collarLayer(P, { y = 72.6, h = 3.2, r = 5.4, thick = 2.2, segs = 28, front = 0.5 } = {}) {
  // 用一圈“甜甜圈”截面的管子：沿着脖子周围的椭圆走
  const ringsOut = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const yy = y + Math.sin(a) * h * 0.5;
    const rr = r + Math.cos(a) * thick;
    ringsOut.push({ c: new THREE.Vector3(0, yy, -0.9 - Math.cos(a) * 0.2), ax: new THREE.Vector3(1, 0, 0), az: new THREE.Vector3(0, 0, 1), rx: rr * 1.08, rz: rr * 0.95, shape: (th) => 1 - Math.max(0, Math.sin(th)) * (1 - front) * 0.3, w: [[B.chest, 0.6], [B.neck, 0.4]] });
  }
  return loft(ringsOut, segs);
}

// ---------- 腰带 ----------
export function beltLayer(P, { y = 49.2, h = 2.2, off = 0.7 } = {}) {
  return torsoLayer(P, { y0: y - h / 2, y1: y + h / 2, off, step: h / 2, segs: 32 });
}

// ---------- 手：手掌 + 四指 + 拇指（刚性，挂在手骨上；curl 0 = 自然张开，1 = 握拳） ----------
export function handGeometry(side, { curl = 0.35, size = 1 } = {}) {
  const s = side === 'L' ? 1 : -1;
  const parts = [];
  // 手掌：沿 -y 方向的扁截面（x 方向薄）
  const palm = [];
  for (const [y, w, t] of [
    [0.6, 1.25, 0.75],
    [-0.4, 1.5, 0.8],
    [-1.6, 1.65, 0.78],
    [-2.8, 1.7, 0.72],
    [-3.6, 1.62, 0.6],
  ]) {
    palm.push({ c: new THREE.Vector3(0, y, 0.15), ax: new THREE.Vector3(1, 0, 0), az: new THREE.Vector3(0, 0, 1), rx: t, rz: w, w: [[0, 1]] });
  }
  parts.push(loft(palm, 14, { n: 2.6, capStart: true, capEnd: true }));
  // 手指：每根三节，按 curl 往掌心（-s·x）弯
  const fingers = [
    [1.05, 3.0, 0.42],
    [0.35, 3.4, 0.44],
    [-0.35, 3.2, 0.42],
    [-1.02, 2.5, 0.36],
  ];
  for (const [z, len, r] of fingers) {
    const pts = [];
    let p = new THREE.Vector3(0, -3.5, z);
    let dir = new THREE.Vector3(0, -1, 0);
    const segL = [len * 0.42, len * 0.32, len * 0.26];
    pts.push(p.clone());
    for (let k = 0; k < 3; k++) {
      dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), -s * curl * (k === 0 ? 1.0 : 1.25));
      p = p.clone().addScaledVector(dir, segL[k]);
      pts.push(p);
    }
    parts.push(tubeAlong(pts, [r, r * 0.95, r * 0.88, r * 0.78], 8));
  }
  // 拇指：从掌根前侧伸出，朝前下方
  const th = [];
  let tp = new THREE.Vector3(-s * 0.2, -1.0, 1.35);
  let td = new THREE.Vector3(-s * 0.35, -0.6, 0.72).normalize();
  th.push(tp.clone());
  for (let k = 0; k < 3; k++) {
    td.applyAxisAngle(new THREE.Vector3(0, 1, 0), s * curl * 0.5);
    td.applyAxisAngle(new THREE.Vector3(0, 0, 1), -s * curl * 0.35);
    tp = tp.clone().addScaledVector(td, [1.4, 1.1, 0.9][k]);
    th.push(tp);
  }
  parts.push(tubeAlong(th, [0.62, 0.52, 0.46, 0.4], 8));
  const g = mergeGeometries(
    parts.map((p) => {
      p.deleteAttribute('skinIndex');
      p.deleteAttribute('skinWeight');
      return p;
    })
  );
  g.scale(size, size, size);
  g.computeVertexNormals();
  return g;
}
// 沿折线的圆管（两端封口）
export function tubeAlong(pts, radii, segs = 8) {
  const rings = pts.map((c, i) => {
    const T = (i < pts.length - 1 ? pts[i + 1].clone().sub(c) : c.clone().sub(pts[i - 1])).normalize();
    const ref = Math.abs(T.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ax = ref.clone().sub(T.clone().multiplyScalar(ref.dot(T))).normalize();
    const az = T.clone().cross(ax).normalize();
    return { c, ax, az, rx: radii[i], rz: radii[i], w: [[0, 1]] };
  });
  return loft(rings, segs, { capStart: true, capEnd: true });
}

// ---------- 毛皮外壳：同一网格一层层外扩，每层用不同的 alphaTest 截掉更多的毛 ----------
export function shellMaterials({ map, alphaMap, layers = 12, base = 0.42, repeat = [4, 4] }) {
  const mats = [];
  for (let i = 0; i < layers; i++) {
    const t = (i + 1) / layers;
    const m = new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: Math.min(0.97, 0.1 + t * 0.85), roughness: 0.95, color: new THREE.Color().setScalar(base + (1 - base) * t) });
    if (map) map.repeat.set(repeat[0], repeat[1]);
    if (alphaMap) alphaMap.repeat.set(repeat[0], repeat[1]);
    mats.push(m);
  }
  return mats;
}
export function addShells(parent, geometry, mats, length, skeleton = null) {
  const shells = [];
  mats.forEach((m, i) => {
    const g = inflate(geometry, (length * (i + 1)) / mats.length);
    const mesh = skeleton ? new THREE.SkinnedMesh(g, m) : new THREE.Mesh(g, m);
    if (skeleton) mesh.bind(skeleton, new THREE.Matrix4());
    mesh.userData.noAO = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    shells.push(mesh);
  });
  return shells;
}
