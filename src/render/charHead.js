// 角色头部：在球面上“雕”出脸（眉骨、眼窝、颧骨、鼻子、嘴唇、下巴），画上皮肤贴图，
// 再加眼球、眼睑、耳朵、口腔，以及跟着头形走的头发、胡子、帽子。
// 表情用形变目标：0 = 微笑，1 = 张嘴（笑 / 说话）；眨眼靠转动上眼睑。
import * as THREE from 'three';
import { makeCanvas, mulberry32, hexToRgb as hexArr } from './canvasTex.js';
import { valueNoise, fbm, normalCanvas } from './ptex.js';

// 十六进制颜色 → { r, g, b }（0..255）
const hexToRgb = (hex) => {
  const [r, g, b] = hexArr(hex);
  return { r, g, b };
};
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const g2 = (x, y, cx, cy, wx, wy) => Math.exp(-((x - cx) ** 2) / (wx * wx) - ((y - cy) ** 2) / (wy * wy));

// 头在头骨骨骼坐标里的中心与尺寸
export function headFrame(P) {
  const f = P.sex === 'f';
  return { center: new THREE.Vector3(0, 4.9, 0.8), S: f ? new THREE.Vector3(4.35, 4.9, 4.7) : new THREE.Vector3(4.6, 5.15, 4.95) };
}

// 单位球上的方向 → 脸型（还没乘尺寸）。只改形状，不含五官
function shapeDir(x, y, z, F) {
  const low = sstep(0.12, -0.92, y);
  const front = sstep(-0.45, 0.65, z);
  x *= 1 - 0.3 * low * F.jaw * (0.45 + 0.55 * front);
  z += 0.075 * low * front * F.chin;
  y -= 0.1 * low;
  if (z < 0) z *= 1 + 0.07 * sstep(-0.25, 0.5, y);
  if (y > 0.62) y = 0.62 + (y - 0.62) * 0.86;
  return [x, y, z];
}

// 五官起伏（沿径向的位移，单位是球半径）
function featureDisp(x, y, z, F) {
  if (z < -0.2) return 0;
  const fr = sstep(-0.2, 0.55, z);
  const ax = Math.abs(x);
  let d = 0;
  d += g2(ax, y, 0.33, 0.31, 0.17, 0.08) * 0.05 * F.brow; // 眉骨
  d -= g2(ax, y, 0.31, 0.15, 0.15, 0.11) * 0.045; // 眼窝
  d -= g2(ax, y, 0.305, 0.148, 0.105, 0.058) * 0.13; // 眼裂（杏仁形，眼球从这里露出来）
  d += g2(ax, y, 0.58, -0.03, 0.18, 0.15) * 0.045 * F.cheek; // 颧骨
  d -= g2(ax, y, 0.5, -0.32, 0.18, 0.16) * 0.02 * F.hollow; // 面颊下凹
  d += g2(ax, y, 0, -0.86, 0.22, 0.13) * 0.05; // 下巴
  // 鼻子：沿中线的鼻梁，越往下越高越宽，到鼻尖后收回
  if (y > -0.32 && y < 0.3) {
    const t = Math.min(1, Math.max(0, (0.28 - y) / 0.56)); // 0 鼻根 → 1 鼻底（夹住，负数开方会得到 NaN）
    const prof = t < 0.78 ? lerp(0.02, 0.17, Math.pow(t / 0.78, 1.3)) : lerp(0.17, 0.03, (t - 0.78) / 0.22);
    const w = lerp(0.065, 0.1, t) * F.nose;
    d += prof * F.nose * Math.exp(-((x / w) ** 2)) * sstep(0.7, 0.88, z);
    d += g2(ax, y, 0.095 * F.nose, -0.22, 0.05, 0.045) * 0.05 * F.nose; // 鼻翼
  }
  // 嘴唇与口缝
  const mw = 0.19 * F.mouth;
  const lipX = sstep(mw, mw * 0.55, ax);
  d += lipX * g2(0, y, 0, -0.405, 1, 0.045) * 0.042 * F.lips;
  d += lipX * g2(0, y, 0, -0.51, 1, 0.045) * 0.034 * F.lips;
  d -= sstep(mw + 0.02, mw * 0.7, ax) * g2(0, y, 0, -0.462, 1, 0.012) * 0.03;
  d += g2(ax, y, 0, -0.33, 0.05, 0.04) * 0.012; // 人中两侧
  return d * fr;
}

// 形变目标：微笑（嘴角上扬后拉、苹果肌鼓起）
function smileDelta(x, y, z, F) {
  if (z < 0) return [0, 0, 0];
  const ax = Math.abs(x);
  const s = Math.sign(x) || 1;
  const mw = 0.19 * F.mouth;
  const corner = g2(ax, y, mw, -0.46, 0.1, 0.08);
  const cheek = g2(ax, y, 0.38, -0.2, 0.16, 0.14);
  const lower = g2(ax, y, 0.3, 0.05, 0.12, 0.05); // 下眼睑被推上去一点
  return [s * corner * 0.03, corner * 0.05 + cheek * 0.03 + lower * 0.012, -corner * 0.03 + cheek * 0.035];
}
// 形变目标：张嘴（口缝以下绕下颌轴往下转）
function jawDelta(x, y, z, F) {
  const below = sstep(-0.44, -0.5, y) * sstep(-0.55, 0.1, z);
  if (below <= 0) return [0, 0, 0];
  const ang = 0.22 * below;
  const py = -0.05;
  const pz = -0.25;
  const dy = y - py;
  const dz = z - pz;
  const ny = py + dy * Math.cos(ang) - dz * Math.sin(ang);
  const nz = pz + dy * Math.sin(ang) + dz * Math.cos(ang);
  return [0, ny - y, nz - z];
}

function defaults(P) {
  const f = P.sex === 'f';
  return { jaw: f ? 1.12 : 0.92, chin: f ? 0.7 : 1, brow: f ? 0.5 : 1, cheek: 1, hollow: P.age > 0.5 ? 1.4 : 0.6, nose: f ? 0.86 : 1, mouth: f ? 0.92 : 1, lips: f ? 1.25 : 0.9, ...(P.face || {}) };
}

// 头部几何 + 形变目标；返回几何和每个顶点的单位方向（给头发 / 胡子取区域用）
function headGeometry(P, F, res) {
  const { S } = headFrame(P);
  const g = new THREE.SphereGeometry(1, res[0], res[1]);
  const pos = g.attributes.position;
  const dirs = new Float32Array(pos.count * 3);
  const smile = new Float32Array(pos.count * 3);
  const jaw = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    dirs[i * 3] = x;
    dirs[i * 3 + 1] = y;
    dirs[i * 3 + 2] = z;
    const [sx, sy, sz] = shapeDir(x, y, z, F);
    const r = 1 + featureDisp(x, y, z, F);
    pos.setXYZ(i, sx * r * S.x, sy * r * S.y, sz * r * S.z);
    const sm = smileDelta(x, y, z, F);
    const jw = jawDelta(sx * r, sy * r, sz * r, F);
    smile.set([sm[0] * S.x, sm[1] * S.y, sm[2] * S.z], i * 3);
    jaw.set([jw[0] * S.x, jw[1] * S.y, jw[2] * S.z], i * 3);
  }
  g.computeVertexNormals();
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(smile, 3), new THREE.Float32BufferAttribute(jaw, 3)];
  g.morphTargetsRelative = true;
  return { g, dirs };
}

// ---------- 脸部皮肤贴图（在球面 UV 上按方向画五官的颜色和细节） ----------
function faceTextures(P, F, W) {
  const H = W / 2;
  const skin = hexToRgb(P.skin);
  const hair = hexToRgb(P.hairColor || '#3a2a1a');
  const brow = hexToRgb(P.browColor || P.hairColor || '#3a2a1a');
  const lip = hexToRgb(P.lipColor || (P.sex === 'f' ? '#b05a50' : '#9a5a4c'));
  const n = valueNoise(P.seed || 7);
  const rnd = mulberry32((P.seed || 7) + 3);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const hgt = new Float32Array(W * H);
  const male = P.sex !== 'f';
  const age = P.age || 0;
  const stubble = male ? (P.stubble ?? 0.6) : 0;
  const shaved = P.hair === 'undercut';
  const capM = P.hair && P.hair !== 'none' ? capMaskFn(P) : null;
  const beardM = P.beard && P.beard !== 'none' ? beardMaskFn(F, P.beard === 'short' ? 0.1 : 0) : null;
  const beardC = hexToRgb(P.beardColor || P.hairColor || '#3a2a1a');
  for (let row = 0; row < H; row++) {
    const th = (row / H) * Math.PI;
    const st = Math.sin(th);
    const y = Math.cos(th);
    for (let col = 0; col < W; col++) {
      const ph = (col / W) * Math.PI * 2;
      const x = -Math.cos(ph) * st;
      const z = Math.sin(ph) * st;
      const u = col / W;
      const v = row / H;
      const i = row * W + col;
      const ax = Math.abs(x);
      const fr = sstep(-0.1, 0.5, z);
      // 后脑勺总被头发 / 帽子 / 头巾挡着：只填底色，省掉一半的计算
      if (z < -0.35 && !shaved) {
        const o = i * 4;
        const k = 1 + (n(u, v, 16) - 0.5) * 0.08;
        const hk = capM ? sstep(0.0, 0.45, capM(x, y, z)) * 0.88 : 0;
        d[o] = lerp(skin.r * k, hair.r * 0.85, hk);
        d[o + 1] = lerp(skin.g * k, hair.g * 0.85, hk);
        d[o + 2] = lerp(skin.b * k, hair.b * 0.85, hk);
        d[o + 3] = 255;
        hgt[i] = 0.5;
        continue;
      }
      let r = skin.r;
      let g = skin.g;
      let b = skin.b;
      const mot = (fbm(n, u, v, 8, 3) - 0.5) * 0.1;
      r *= 1 + mot;
      g *= 1 + mot * 0.9;
      b *= 1 + mot * 0.8;
      // 红润：面颊、鼻尖、额角
      const red = (g2(ax, y, 0.45, -0.16, 0.2, 0.15) * 0.16 + g2(ax, y, 0, -0.16, 0.08, 0.07) * 0.18 + g2(ax, y, 0, -0.62, 0.15, 0.08) * 0.05) * fr * (P.flush ?? 1);
      r = r * (1 + red * 0.5);
      g = g * (1 - red * 0.25);
      b = b * (1 - red * 0.3);
      // 眼窝暗一点
      const sock = g2(ax, y, 0.31, 0.14, 0.17, 0.12) * fr;
      r *= 1 - sock * 0.16;
      g *= 1 - sock * 0.2;
      b *= 1 - sock * 0.12;
      let h = 0.5 + (fbm(n, (u * 3) % 1, (v * 3) % 1, 32, 2) - 0.5) * 0.15;
      // 嘴唇
      const mw = 0.19 * F.mouth;
      const lipX = sstep(mw + 0.01, mw * 0.6, ax) * fr;
      const lipK = Math.max(g2(0, y, 0, -0.41, 1, 0.04), g2(0, y, 0, -0.515, 1, 0.045)) * lipX;
      r = lerp(r, lip.r, lipK * 0.8);
      g = lerp(g, lip.g, lipK * 0.8);
      b = lerp(b, lip.b, lipK * 0.8);
      const line = g2(0, y, 0, -0.462, 1, 0.009) * sstep(mw + 0.02, mw * 0.75, ax) * fr;
      r *= 1 - line * 0.6;
      g *= 1 - line * 0.65;
      b *= 1 - line * 0.6;
      h -= line * 0.6;
      // 鼻孔
      const nos = g2(ax, y, 0.05 * F.nose, -0.235, 0.025, 0.014) * fr;
      r *= 1 - nos * 0.7;
      g *= 1 - nos * 0.75;
      b *= 1 - nos * 0.7;
      // 胡茬 / 剃短的头发：一层发青的细点
      let stub = 0;
      if (male) stub = stubble * sstep(-0.12, -0.3, y) * sstep(-0.3, 0.1, z) * (1 - lipK) * (1 - g2(ax, y, 0, -0.2, 0.12, 0.1));
      if (shaved) stub = Math.max(stub, sstep(0.05, 0.25, y) * sstep(0.35, 0.6, ax) * 0.9 + sstep(0.2, -0.3, z) * sstep(-0.2, 0.3, y) * 0.9);
      if (stub > 0) {
        const dots = rnd() < 0.55 ? 1 : 0.4;
        const k = stub * 0.35 * dots;
        r = lerp(r, hair.r * 0.8, k);
        g = lerp(g, hair.g * 0.8, k);
        b = lerp(b, hair.b * 0.85 + 8, k);
      }
      // 眉毛：沿眉骨一道道细丝
      const bx = ax;
      const by = 0.258 + (bx - 0.3) * (bx - 0.3) * -0.6 + (P.browLift || 0);
      const bw = lerp(0.03, 0.022, sstep(0.15, 0.48, bx)) * (P.browThick || 1);
      const browK = sstep(0.11, 0.15, bx) * sstep(0.5, 0.44, bx) * Math.exp(-(((y - by) / bw) ** 2)) * fr;
      if (browK > 0.02) {
        const strand = 0.6 + 0.4 * Math.sin((bx * 260 + y * 90) + n(u, v, 64) * 6);
        const k = Math.min(1, browK * strand * 1.3);
        r = lerp(r, brow.r, k);
        g = lerp(g, brow.g, k);
        b = lerp(b, brow.b, k);
        h += k * 0.25;
      }
      // 皱纹（年龄）：额头横纹、眼角鱼尾纹、法令纹
      if (age > 0) {
        const fore = Math.pow(Math.max(0, Math.sin(y * 70)), 6) * sstep(0.38, 0.45, y) * sstep(0.68, 0.6, y) * sstep(0.45, 0.25, ax) * fr;
        const crow = Math.pow(Math.max(0, Math.sin((y - (ax - 0.45) * 0.6) * 90)), 6) * g2(ax, y, 0.48, 0.13, 0.06, 0.08) * fr;
        const nl = Math.exp(-(((ax - (0.13 + (-0.2 - y) * 0.35)) / 0.012) ** 2)) * sstep(-0.18, -0.25, y) * sstep(-0.5, -0.42, y) * fr;
        const wr = (fore + crow + nl * 1.2) * age;
        r *= 1 - wr * 0.18;
        g *= 1 - wr * 0.2;
        b *= 1 - wr * 0.18;
        h -= wr * 0.5;
      }
      // 头发、胡子底下先涂一层发色（边缘渐淡），网格边缘的锯齿就看不出来
      if (capM) {
        const k = sstep(0.0, 0.45, capM(x, y, z)) * 0.88;
        r = lerp(r, hair.r * 0.85, k);
        g = lerp(g, hair.g * 0.85, k);
        b = lerp(b, hair.b * 0.85, k);
      }
      if (beardM) {
        const k = sstep(0.0, 0.35, beardM(x, y, z)) * (0.6 + 0.3 * n((u * 4) % 1, (v * 4) % 1, 64));
        r = lerp(r, beardC.r * 0.8, k);
        g = lerp(g, beardC.g * 0.8, k);
        b = lerp(b, beardC.b * 0.8, k);
      }
      const o = i * 4;
      d[o] = Math.min(255, r);
      d[o + 1] = Math.min(255, g);
      d[o + 2] = Math.min(255, b);
      d[o + 3] = 255;
      hgt[i] = h;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const nm = new THREE.CanvasTexture(normalCanvas(hgt, W, H, 1.6));
  nm.anisotropy = 4;
  return { map, normalMap: nm };
}

// ---------- 眼球（虹膜在 +z 方向） ----------
const irisCache = new Map();
function eyeTexture(color) {
  if (irisCache.has(color)) return irisCache.get(color);
  const W = 256;
  const H = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const dd = img.data;
  const ic = hexToRgb(color);
  for (let row = 0; row < H; row++) {
    const th = (row / H) * Math.PI;
    for (let col = 0; col < W; col++) {
      const ph = (col / W) * Math.PI * 2;
      const x = -Math.cos(ph) * Math.sin(th);
      const y = Math.cos(th);
      const z = Math.sin(ph) * Math.sin(th);
      const a = Math.acos(Math.max(-1, Math.min(1, z)));
      const ang = Math.atan2(y, x);
      let r = 236;
      let g = 228;
      let b = 216;
      // 眼白靠边缘有点血丝和暗
      const edge = sstep(0.6, 1.5, a);
      r *= 1 - edge * 0.25;
      g *= 1 - edge * 0.32;
      b *= 1 - edge * 0.3;
      if (a < 0.56) {
        const streak = 0.75 + 0.25 * Math.sin(ang * 23 + Math.sin(ang * 7) * 2) * Math.sin(ang * 11);
        const k = (0.55 + (a / 0.56) * 0.45) * streak;
        r = ic.r * k;
        g = ic.g * k;
        b = ic.b * k;
        const limbal = sstep(0.45, 0.56, a);
        r *= 1 - limbal * 0.6;
        g *= 1 - limbal * 0.6;
        b *= 1 - limbal * 0.6;
      }
      if (a < 0.22) {
        r = 12;
        g = 9;
        b = 8;
      }
      const o = (row * W + col) * 4;
      dd[o] = r;
      dd[o + 1] = g;
      dd[o + 2] = b;
      dd[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  irisCache.set(color, t);
  return t;
}

// ---------- 头发、胡子：从头部网格里挑出一块区域，沿法线鼓出来 ----------
function regionShell(headG, dirs, maskFn, thickFn, { minMask = 0.04, lift = 0.05, morph = false } = {}) {
  const pos = headG.attributes.position;
  const nrm = headG.attributes.normal;
  const uvA = headG.attributes.uv;
  const idx = headG.index.array;
  const count = pos.count;
  const mask = new Float32Array(count);
  for (let i = 0; i < count; i++) mask[i] = maskFn(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
  const map = new Int32Array(count).fill(-1);
  const P = [];
  const N = [];
  const U = [];
  const Ms = [];
  const Mj = [];
  const C = [];
  const I = [];
  const sm = headG.morphAttributes.position?.[0];
  const jw = headG.morphAttributes.position?.[1];
  const add = (i) => {
    if (map[i] >= 0) return map[i];
    const m = mask[i];
    const t = thickFn(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], m) + lift;
    P.push(pos.getX(i) + nrm.getX(i) * t, pos.getY(i) + nrm.getY(i) * t, pos.getZ(i) + nrm.getZ(i) * t);
    N.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    U.push(uvA.getX(i) * 6, uvA.getY(i) * 3);
    // 边缘渐隐（配合材质的 alphaHash），发际线和胡子边就不会是一格格的锯齿
    C.push(1, 1, 1, sstep(0.03, 0.42, m));
    if (morph && sm) {
      Ms.push(sm.getX(i), sm.getY(i), sm.getZ(i));
      Mj.push(jw.getX(i), jw.getY(i), jw.getZ(i));
    }
    map[i] = P.length / 3 - 1;
    return map[i];
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    if (Math.max(mask[a], mask[b], mask[c]) < minMask) continue;
    I.push(add(a), add(b), add(c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  g.setIndex(I);
  if (morph && sm) {
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(Ms, 3), new THREE.Float32BufferAttribute(Mj, 3)];
    g.morphTargetsRelative = true;
  }
  g.computeVertexNormals();
  return g;
}

// 头发覆盖的区域（单位球方向 → 0..1）
function capMaskFn(P) {
  return (x, y, z) => {
    const m = hairline(x, y, z, P);
    if (P.hair === 'undercut') return m * sstep(0.42, 0.28, Math.abs(x)) * sstep(-0.2, 0.15, y + z * 0.3);
    if (P.hair === 'balding') return m * sstep(0.62, 0.45, y) * (1 - sstep(0.25, 0.6, z) * sstep(0.35, 0.5, y));
    return m;
  };
}
// 胡子覆盖的区域：上边界在鼻翼两侧低、往耳朵方向抬高成鬓角；嘴唇周围留空，上唇上方单独一撇小胡子
function beardMaskFn(F, trim = 0) {
  const mw = 0.19 * F.mouth;
  return (x, y, z) => {
    const ax = Math.abs(x);
    const top = lerp(-0.3, -0.03, sstep(0.16, 0.78, ax)) - trim;
    const area = sstep(top + 0.03, top - 0.09, y) * sstep(-0.45, -0.08, z);
    const lips = sstep(mw + 0.04, mw - 0.03, ax) * g2(0, y, 0, -0.465, 1, 0.062);
    const mustache = sstep(mw + 0.1, mw - 0.02, ax) * g2(0, y, 0, -0.35, 1, 0.04) * sstep(0.5, 0.75, z);
    return Math.max(0, Math.min(1, area * (1 - lips * 1.3) + mustache * 0.9));
  };
}

// 发际线：前额高、两侧在耳朵上方、后面到后颈
function hairline(x, y, z, P) {
  const front = sstep(0.15, 0.75, z);
  const back = sstep(0.05, -0.65, z);
  const side = Math.max(0, 1 - front - back);
  const hl = 0.56 * front + 0.1 * side - 0.48 * back + (P.recede || 0) * front;
  return sstep(hl - 0.03, hl + 0.07, y);
}

// 一缕缕垂下的长发（双面发片）
function hairCards(P, frame, color, mat, count = 14, len = 15) {
  const group = new THREE.Group();
  const rnd = mulberry32((P.seed || 3) + 41);
  const { S, center } = frame;
  for (let i = 0; i < count; i++) {
    // 从侧后方一圈出发
    const a = lerp(-1.3, 1.3, i / (count - 1)) + (rnd() - 0.5) * 0.1;
    const sx = Math.sin(a);
    const sz = -Math.cos(a);
    const w = 1.6 + rnd() * 0.8;
    const L = len * (0.75 + rnd() * 0.35) * (Math.abs(a) > 1.4 ? 0.8 : 1);
    const seg = 7;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const out = 1.03 + t * 0.32 + Math.sin(t * 3) * 0.04;
      const y = center.y + S.y * (0.35 - t * 0.4) - t * L;
      const cx = center.x + S.x * sx * out * (1 + t * 0.15);
      const cz = center.z + S.z * sz * out * (1 + t * 0.2) - t * 1.5;
      const tx = Math.cos(a);
      const tz = Math.sin(a);
      const ww = w * (1 - t * 0.35);
      pos.push(cx - tx * ww, y, cz - tz * ww, cx + tx * ww, y, cz + tz * ww);
      uv.push(0, 1 - t, 1, 1 - t);
      if (k) {
        const b0 = (k - 1) * 2;
        idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    group.add(m);
  }
  return group;
}

// 发辫：一串交错的椭球
// 布料材质的双面版本（头巾、帽子边缘看得到反面）
function M2(m, ds) {
  if (!ds) return m;
  if (!m.userData.ds) {
    const c = m.clone();
    c.side = THREE.DoubleSide;
    m.userData.ds = c;
  }
  return m.userData.ds;
}

function braid(frame, mat, tieMat, len = 16) {
  const g = new THREE.Group();
  const { S, center } = frame;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = lerp(1.05, 0.55, t);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
    m.scale.set(1, 1.6, 0.85);
    m.position.set(center.x + (i % 2 ? 0.35 : -0.35) * r, center.y + S.y * 0.15 - t * len, center.z - S.z * 1.02 - t * 1.8 - Math.sin(t * 3) * 0.6);
    m.rotation.z = i % 2 ? 0.35 : -0.35;
    m.castShadow = true;
    g.add(m);
  }
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 12), tieMat);
  tie.position.set(center.x, center.y + S.y * 0.15 - len * 0.88, center.z - S.z * 1.02 - 1.7);
  g.add(tie);
  return g;
}

/**
 * 组装整个头部（挂在头骨骼上）
 * P: { sex, skin, seed, age, eyeColor, hair:'short'|'long'|'undercut'|'updo'|'balding'|'none', hairColor, beard:'full'|'short'|'long'|'none', beardColor, hat:{kind,color}, face:{...} }
 */
export function buildHead(P, mats, { hiRes = true } = {}) {
  const F = defaults(P);
  const frame = headFrame(P);
  const { center, S } = frame;
  const group = new THREE.Group();
  const res = hiRes ? [150, 112] : [84, 64];
  const { g, dirs } = headGeometry(P, F, res);
  const ft = faceTextures(P, F, hiRes ? 640 : 384);
  const faceMat = new THREE.MeshPhysicalMaterial({ map: ft.map, normalMap: ft.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color('#c0503a'), sheenRoughness: 0.6 });
  const head = new THREE.Mesh(g, faceMat);
  head.position.copy(center);
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);
  const out = { group, head, morphHeads: [head], lids: [], eyes: [], F };

  // 口腔（张嘴时能看到暗色和一排上牙）
  const mouthIn = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mats.mouth);
  mouthIn.scale.set(S.x * 0.17, S.y * 0.1, S.z * 0.16);
  mouthIn.position.set(center.x, center.y - S.y * 0.5, center.z + S.z * 0.7);
  group.add(mouthIn);
  const teeth = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.42, Math.PI * 0.16), mats.teeth);
  teeth.scale.set(S.x * 0.17, S.y * 0.5, S.z * 0.15);
  teeth.position.set(center.x, center.y - S.y * 0.25, center.z + S.z * 0.74);
  group.add(teeth);

  // 眼睛与眼睑
  const eyeR = 0.125 * (S.x + S.z) * 0.5;
  for (const s of [1, -1]) {
    const dir = new THREE.Vector3(s * 0.305, 0.148, 0.94).normalize();
    const ec = new THREE.Vector3(dir.x * S.x, dir.y * S.y, dir.z * S.z).multiplyScalar(0.8).add(center);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 24, 16), new THREE.MeshPhysicalMaterial({ map: eyeTexture(P.eyeColor || '#5a3a20'), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));
    eye.position.copy(ec);
    eye.rotation.y = s * 0.06;
    group.add(eye);
    out.eyes.push(eye);
    const lidPivot = new THREE.Group();
    lidPivot.position.copy(ec);
    group.add(lidPivot);
    const up = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.skin);
    up.castShadow = false;
    lidPivot.add(up);
    const low = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.08, 20, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mats.skin);
    low.rotation.x = 0.75;
    lidPivot.add(low);
    out.lids.push({ up, low, open: -0.42 - (P.lidOpen || 0) });
    up.rotation.x = out.lids[out.lids.length - 1].open;
  }

  // 耳朵
  for (const s of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.8), mats.skin);
    ear.scale.set(0.42, 1.25, 0.82);
    ear.position.set(center.x + s * S.x * 0.94, center.y + S.y * 0.02, center.z - S.z * 0.06);
    ear.rotation.set(0, s * 0.35, s * -0.08);
    ear.castShadow = true;
    group.add(ear);
  }

  // 头发
  const hc = P.hairColor || '#3a2a1a';
  const hairMat = mats.hair(hc);
  const capMask = capMaskFn(P);
  if (P.hair && P.hair !== 'none') {
    const thick = { short: 0.18, long: 0.24, undercut: 0.2, updo: 0.2, balding: 0.12 }[P.hair] ?? 0.18;
    const n = valueNoise((P.seed || 3) + 17);
    const capG = regionShell(g, dirs, capMask, (x, y, z, m) => thick * S.x * m * (0.75 + 0.5 * n((Math.atan2(z, x) / 6.283 + 1) % 1, (y + 1) / 2, 12)) * (1 + sstep(0.2, 0.9, y) * 0.3), { lift: 0.04 });
    const cap = new THREE.Mesh(capG, mats.hairEdge(hc));
    cap.position.copy(center);
    cap.castShadow = true;
    group.add(cap);
    if (P.hair === 'long') group.add(hairCards(P, frame, hc, mats.hairCard(hc), 15, P.hairLen || 14));
    if (P.hair === 'undercut') group.add(braid(frame, hairMat, mats.leather('#3a2414'), P.braidLen || 17));
    if (P.hair === 'updo') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), hairMat);
      bun.scale.set(S.x * 0.42, S.y * 0.36, S.z * 0.36);
      // 戴头巾时发髻低一点，从头巾下面露出来
      if (P.hat?.kind === 'kerchief') bun.position.set(center.x, center.y - S.y * 0.12, center.z - S.z * 0.92);
      else bun.position.set(center.x, center.y + S.y * 0.48, center.z - S.z * 0.86);
      bun.castShadow = true;
      group.add(bun);
    }
  }

  // 胡子
  if (P.beard && P.beard !== 'none') {
    const bc = P.beardColor || hc;
    const L = { full: 0.2, short: 0.07, long: 0.28 }[P.beard] ?? 0.18;
    const ext = { full: 0.3, short: 0.06, long: 0.95 }[P.beard] ?? 0.2;
    const beardMask = beardMaskFn(F, P.beard === 'short' ? 0.1 : 0);
    const n = valueNoise((P.seed || 3) + 29);
    const beardG = regionShell(
      g,
      dirs,
      beardMask,
      (x, y, z, m) => {
        const chin = sstep(-0.45, -0.95, y);
        return S.x * m * (L * (0.55 + 0.6 * chin) * (0.75 + 0.5 * n((x + 1) / 2, (y + 1) / 2, 10)));
      },
      { morph: true, lift: 0.03 }
    );
    // 长胡子往下拉
    const p = beardG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / S.y;
      if (y < -0.55) p.setY(i, p.getY(i) - (-0.55 - y) * ext * S.y * 2.2);
    }
    beardG.computeVertexNormals();
    const beard = new THREE.Mesh(beardG, mats.hairEdge(bc));
    beard.position.copy(center);
    beard.castShadow = true;
    group.add(beard);
    out.morphHeads.push(beard);
  }

  // 帽子
  if (P.hat) {
    const hm = mats.cloth(P.hat.color || '#3a3028');
    if (P.hat.kind === 'brim') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(S.x * 0.78, S.x * 0.98, S.y * 0.62, 28), hm);
      crown.position.set(center.x, center.y + S.y * 0.86, center.z - 0.2);
      crown.rotation.x = -0.12;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(S.x * 1.95, S.x * 2.05, 0.35, 36), hm);
      brim.position.set(center.x, center.y + S.y * 0.56, center.z - 0.1);
      brim.rotation.x = -0.12;
      brim.scale.z = 1.08;
      crown.castShadow = brim.castShadow = true;
      group.add(crown, brim);
    } else if (P.hat.kind === 'beanie') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), hm);
      cap.scale.set(S.x * 1.07, S.y * 1.12, S.z * 1.08);
      cap.position.set(center.x, center.y + S.y * 0.06, center.z - 0.25);
      cap.rotation.x = -0.18;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 8, 28), hm);
      rim.scale.set(S.x * 1.06, S.z * 1.07, S.y * 0.9);
      rim.rotation.x = Math.PI / 2 - 0.18;
      rim.position.set(center.x, center.y + S.y * 0.16, center.z - 0.1);
      cap.castShadow = rim.castShadow = true;
      group.add(cap, rim);
    } else if (P.hat.kind === 'kerchief') {
      // 白头巾：盖住头顶和后脑，前沿在发际线，后颈打个结、垂两条尾巴
      const km = M2(hm, true);
      const scarf = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), km);
      scarf.scale.set(S.x * 1.1, S.y * 1.14, S.z * 1.14);
      scarf.position.set(center.x, center.y + S.y * 0.02, center.z - 0.35);
      scarf.rotation.x = -0.62;
      scarf.castShadow = true;
      group.add(scarf);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), km);
      knot.scale.set(1.1, 0.8, 0.8);
      knot.position.set(center.x, center.y - S.y * 0.3, center.z - S.z * 1.02);
      group.add(knot);
      for (const s of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5.5, 1, 4), km);
        const tp = tail.geometry.attributes.position;
        for (let i = 0; i < tp.count; i++) tp.setZ(i, Math.sin((tp.getY(i) + 2.75) * 0.5) * 0.4);
        tail.geometry.computeVertexNormals();
        tail.position.set(center.x + s * 0.7, center.y - S.y * 0.3 - 2.6, center.z - S.z * 1.06);
        tail.rotation.set(0.12, Math.PI, s * 0.18);
        group.add(tail);
      }
    } else if (P.hat.kind === 'cap') {
      // 老人的软布帽：鼓鼓的帽顶带几道褶，额前一圈卷边
      const cm = M2(hm, true);
      const cg = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const cp = cg.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i);
        const y = cp.getY(i);
        const z = cp.getZ(i);
        const a = Math.atan2(z, x);
        const k = 1 + Math.sin(a * 5) * 0.04 * y + y * 0.12;
        cp.setXYZ(i, x * k, y * (1 + 0.18 * y), z * k);
      }
      cg.computeVertexNormals();
      const cap = new THREE.Mesh(cg, cm);
      cap.scale.set(S.x * 1.16, S.y * 1.0, S.z * 1.18);
      cap.position.set(center.x + 0.3, center.y + S.y * 0.22, center.z - 0.5);
      cap.rotation.set(-0.3, 0, -0.08);
      cap.castShadow = true;
      group.add(cap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 8, 30), cm);
      band.scale.set(S.x * 1.06, S.z * 1.1, S.y * 0.95);
      band.rotation.x = Math.PI / 2 - 0.3;
      band.position.set(center.x + 0.1, center.y + S.y * 0.28, center.z - 0.3);
      band.castShadow = true;
      group.add(band);
    } else if (P.hat.kind === 'hood') {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hm);
      hood.scale.set(S.x * 1.22, S.y * 1.2, S.z * 1.25);
      hood.position.set(center.x, center.y + S.y * 0.02, center.z - 0.7);
      hood.rotation.x = -0.78;
      hood.material = hm.clone();
      hood.material.side = THREE.DoubleSide;
      hood.castShadow = true;
      group.add(hood);
    }
  }
  return out;
}
