// 程序化 PBR 贴图：颜色 + 法线（凹凸）+ 粗糙度，全部可无缝平铺
// 用快速的格点值噪声和细胞（Voronoi）噪声直接写像素，1024 的贴图也只要几十毫秒
import * as THREE from 'three';
import { mulberry32, makeCanvas, hexToRgb } from './canvasTex.js';

// ---------- 噪声 ----------
// 可平铺的值噪声：格点数 period 在一张贴图内正好绕一圈
export function valueNoise(seed) {
  const rnd = mulberry32(seed);
  const lat = new Float32Array(256 * 256);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  return (u, v, period) => {
    const x = u * period;
    const y = v * period;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = lat[y0 * 256 + x0];
    const b = lat[y0 * 256 + x1];
    const c = lat[y1 * 256 + x0];
    const d = lat[y1 * 256 + x1];
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
// 分形叠加（返回大致 0..1）；每层错开一点，避免各层格点重合
export function fbm(noise, u, v, period, oct = 4, gain = 0.5) {
  let s = 0;
  let a = 1;
  let n = 0;
  let p = period;
  for (let o = 0; o < oct; o++) {
    s += noise((u + o * 0.311) % 1, (v + o * 0.173) % 1, p) * a;
    n += a;
    a *= gain;
    p *= 2;
  }
  return s / n;
}

// 可平铺的细胞噪声：返回最近两点距离 f1/f2 和所在格的随机 id
export function cellNoise(seed, cols, rows, jitter = 0.85) {
  const rnd = mulberry32(seed);
  const pts = new Float32Array(cols * rows * 3);
  for (let i = 0; i < cols * rows; i++) {
    pts[i * 3] = 0.5 + (rnd() - 0.5) * jitter;
    pts[i * 3 + 1] = 0.5 + (rnd() - 0.5) * jitter;
    pts[i * 3 + 2] = rnd();
  }
  const out = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return (u, v) => {
    const x = u * cols;
    const y = v * rows;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = 9;
    let f2 = 9;
    let id = 0;
    let cx = 0;
    let cy = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = xi + dx;
        const gy = yi + dy;
        const wx = ((gx % cols) + cols) % cols;
        const wy = ((gy % rows) + rows) % rows;
        const k = (wy * cols + wx) * 3;
        const px = gx + pts[k];
        const py = gy + pts[k + 1];
        const d = Math.hypot(px - x, py - y);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = pts[k + 2];
          cx = px / cols;
          cy = py / rows;
        } else if (d < f2) f2 = d;
      }
    }
    out.f1 = f1;
    out.f2 = f2;
    out.id = id;
    out.cx = cx;
    out.cy = cy;
    return out;
  };
}

// ---------- 像素缓冲 → 贴图 ----------
export function buffers(w, h) {
  return { w, h, col: new Float32Array(w * h * 3), hgt: new Float32Array(w * h), rough: new Float32Array(w * h).fill(0.8) };
}
// 高度场 → 切线空间法线（考虑 CanvasTexture 默认 flipY：画布向上 = 贴图 v 正方向）
export function normalCanvas(hgt, w, h, strength = 2) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w;
    const yd = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * 0.5 * strength;
      const dy = (hgt[yd + x] - hgt[yu + x]) * 0.5 * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export function colorCanvas(col, w, h, alpha = null) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, n = w * h; i < n; i++) {
    d[i * 4] = Math.max(0, Math.min(255, col[i * 3] * 255));
    d[i * 4 + 1] = Math.max(0, Math.min(255, col[i * 3 + 1] * 255));
    d[i * 4 + 2] = Math.max(0, Math.min(255, col[i * 3 + 2] * 255));
    d[i * 4 + 3] = alpha ? Math.max(0, Math.min(255, alpha[i] * 255)) : 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export function grayCanvas(val, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0, n = w * h; i < n; i++) {
    const g = Math.max(0, Math.min(255, val[i] * 255));
    d[i * 4] = g;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = g;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export function tex(canvas, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}
// 一套贴图 → 材质参数
export function pbr(b, { normal = 2, repeat = [1, 1], alpha = null } = {}) {
  return {
    map: tex(colorCanvas(b.col, b.w, b.h, alpha), { repeat }),
    normalMap: tex(normalCanvas(b.hgt, b.w, b.h, normal), { srgb: false, repeat }),
    roughnessMap: tex(grayCanvas(b.rough, b.w, b.h), { srgb: false, repeat }),
  };
}
// 已有画布（只有颜色）→ 用亮度当高度补一张法线
export function normalFromCanvas(canvas, strength = 2, blur = 1) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.55 + src[i * 4 + 2] * 0.15) / 255;
  for (let k = 0; k < blur; k++) hgt = boxBlur(hgt, w, h);
  return normalCanvas(hgt, w, h, strength);
}
function boxBlur(a, w, h) {
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      o[y * w + x] = s / 9;
    }
  }
  return o;
}

const rgb01 = (hex) => hexToRgb(hex).map((x) => x / 255);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function put(b, i, r, g, bl) {
  b.col[i * 3] = r;
  b.col[i * 3 + 1] = g;
  b.col[i * 3 + 2] = bl;
}

// ---------- 木地板：一排排长木板，木纹、节疤、缝隙、端头接缝、磨损 ----------
export function woodFloor({ size = 1024, rows = 5, seed = 11, c1 = '#7a5434', c2 = '#4a3020', gap = '#140c06' } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  const rnd = mulberry32(seed + 1);
  const A = rgb01(c1);
  const B = rgb01(c2);
  const G = rgb01(gap);
  // 每排木板的端头接缝位置与色调
  const plank = [];
  for (let r = 0; r < rows; r++) {
    const cuts = [rnd() * 0.5];
    cuts.push((cuts[0] + 0.45 + rnd() * 0.25) % 1);
    plank.push({ cuts, tone: [0.82 + rnd() * 0.3, 0.82 + rnd() * 0.3], knots: Array.from({ length: 2 }, () => [rnd(), rnd() * 0.6 + 0.2, 0.006 + rnd() * 0.01]) });
  }
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rf = v * rows;
    const r = Math.floor(rf);
    const fv = rf - r;
    const P = plank[r];
    const edge = Math.min(fv, 1 - fv) * (size / rows);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      // 哪一块板
      const [c0, c1x] = P.cuts;
      const inSecond = c0 < c1x ? u >= c0 && u < c1x : u >= c0 || u < c1x;
      const tone = P.tone[inSecond ? 1 : 0];
      const du = Math.min(Math.abs(u - c0), Math.abs(u - c1x), Math.abs(u - c0 + 1), Math.abs(u - c1x - 1), Math.abs(u - c0 - 1), Math.abs(u - c1x + 1)) * size;
      // 木纹：沿 u 拉长的噪声 + 细线
      const off = r * 0.173 + (inSecond ? 0.41 : 0);
      const g1 = n((u + off) % 1, (v * 9) % 1, 4);
      const g2 = n((u * 1 + off) % 1, (v * 37) % 1, 8);
      const lines = Math.sin((v * rows * 26 + g1 * 6 + n((u + off) % 1, v, 16) * 2) * Math.PI * 2) * 0.5 + 0.5;
      let w = 0.55 * g1 + 0.25 * g2 + 0.2 * Math.pow(lines, 3);
      // 节疤
      let knot = 0;
      for (const [ku, kv, kr] of P.knots) {
        const dx = (u - ku + 1.5) % 1 - 0.5;
        const dy = (fv - kv) / rows;
        const d = Math.hypot(dx * 0.6, dy * 1.4);
        knot = Math.max(knot, sstep(kr * 2.2, kr * 0.4, d));
      }
      w = lerp(w, 0.05, knot * 0.8);
      const wear = n(u, v, 6) * 0.15;
      let cr = lerp(B[0], A[0], w) * tone + wear * 0.06;
      let cg = lerp(B[1], A[1], w) * tone + wear * 0.04;
      let cb = lerp(B[2], A[2], w) * tone + wear * 0.02;
      // 缝隙
      const gapT = sstep(2.6, 0.6, edge) * 0.95 + sstep(2.2, 0.4, du) * 0.9;
      const g = Math.min(1, gapT);
      cr = lerp(cr, G[0], g);
      cg = lerp(cg, G[1], g);
      cb = lerp(cb, G[2], g);
      put(b, i, cr, cg, cb);
      // 高度：板面略拱，缝隙下凹，木纹细槽
      b.hgt[i] = 0.6 + sstep(0, 6, edge) * 0.25 - g * 0.8 + (w - 0.5) * 0.12 - knot * 0.05;
      b.rough[i] = 0.62 + (1 - w) * 0.2 + g * 0.15 + wear * 0.2;
    }
  }
  return b;
}

// ---------- 石墙：大小不一的石块 + 灰浆缝，块面有起伏 ----------
export function stoneWall({ size = 1024, cols = 6, rows = 8, seed = 21, palette = ['#8c8172', '#776c5e', '#9a8d78', '#6e6254', '#857a68'], mortar = '#a49678', stretch = 1 } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  const cell = cellNoise(seed + 3, cols, rows, 0.75);
  const pal = palette.map(rgb01);
  const M = rgb01(mortar);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      // 稍微扰动采样点，石块边缘不那么规整
      const wu = (u + (n(u, v, 8) - 0.5) * 0.025 + 1) % 1;
      const wv = (v + (n((u + 0.5) % 1, v, 8) - 0.5) * 0.025 + 1) % 1;
      const c = cell(wu, wv);
      const edge = (c.f2 - c.f1) * stretch;
      const m = sstep(0.07, 0.02, edge); // 1 = 灰浆
      const base = pal[Math.floor(c.id * pal.length)];
      const det = fbm(n, u, v, 16, 3);
      const spots = sstep(0.62, 0.8, fbm(n, (u + 0.3) % 1, v, 8, 3));
      const k = 0.78 + det * 0.38 - spots * 0.12;
      let cr = base[0] * k;
      let cg = base[1] * k;
      let cb = base[2] * k;
      const mk = 0.85 + fbm(n, (u + 0.6) % 1, v, 32, 2) * 0.25;
      cr = lerp(cr, M[0] * mk, m);
      cg = lerp(cg, M[1] * mk, m);
      cb = lerp(cb, M[2] * mk, m);
      // 缝边上一圈脏
      const dirt = sstep(0.16, 0.05, edge) * (1 - m) * 0.25;
      put(b, i, cr * (1 - dirt), cg * (1 - dirt), cb * (1 - dirt));
      b.hgt[i] = (1 - m) * (0.55 + sstep(0.02, 0.22, edge) * 0.35) + det * 0.25 - spots * 0.05;
      b.rough[i] = 0.82 + det * 0.12 + m * 0.06;
    }
  }
  return b;
}

// ---------- 粗木梁：深色、顺纹的裂缝和刨痕 ----------
export function beamWood({ size = 512, seed = 31, c1 = '#5a3c24', c2 = '#2a1a0e' } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  const A = rgb01(c1);
  const B = rgb01(c2);
  const rnd = mulberry32(seed);
  const cracks = Array.from({ length: 7 }, () => [rnd(), 0.002 + rnd() * 0.004, rnd() * 0.6 + 0.2, rnd()]);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const g1 = n(u, (v * 8) % 1, 2);
      const g2 = n(u, (v * 32) % 1, 4);
      const lines = Math.pow(Math.sin((v * 46 + g1 * 5) * Math.PI) * 0.5 + 0.5, 4);
      let w = 0.5 * g1 + 0.3 * g2 + 0.2 * lines;
      // 顺纹裂缝：在某段 u 内的细长暗线
      let cr = 0;
      for (const [cv, cw, len, cu] of cracks) {
        const du = (u - cu + 1.5) % 1 - 0.5;
        if (Math.abs(du) > len / 2) continue;
        const wob = (n(u, cv, 8) - 0.5) * 0.01;
        const d = Math.abs(v - cv - wob);
        cr = Math.max(cr, sstep(cw * 2, cw * 0.3, d) * sstep(len / 2, len / 2 - 0.05, Math.abs(du)));
      }
      const adze = Math.pow(n(u, v, 24), 2) * 0.2;
      w = w * (1 - cr * 0.9);
      put(b, i, lerp(B[0], A[0], w) * (1 - cr * 0.5), lerp(B[1], A[1], w) * (1 - cr * 0.5), lerp(B[2], A[2], w) * (1 - cr * 0.5));
      b.hgt[i] = 0.5 + (w - 0.5) * 0.3 - cr * 0.8 - adze;
      b.rough[i] = 0.78 + (1 - w) * 0.15;
    }
  }
  return b;
}

// ---------- 布料细节（灰度，乘在材质颜色上）：经纬编织 + 起毛不匀 ----------
export function clothDetail({ size = 256, seed = 41, threads = 64, fuzz = 0.5 } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const wu = Math.sin(u * threads * Math.PI * 2);
      const wv = Math.sin(v * threads * Math.PI * 2);
      const over = ((Math.floor(u * threads) + Math.floor(v * threads)) & 1) === 0;
      const weave = over ? wu * 0.5 + 0.5 : wv * 0.5 + 0.5;
      const slub = fbm(n, u, v, 8, 3);
      const k = 0.8 + weave * 0.12 + (slub - 0.5) * 0.3 * fuzz;
      put(b, i, k, k, k);
      b.hgt[i] = weave * 0.6 + slub * 0.4;
      b.rough[i] = 0.9 + (slub - 0.5) * 0.1;
    }
  }
  return b;
}

// ---------- 皮革细节（灰度）：细纹、折痕、划痕 ----------
export function leatherDetail({ size = 256, seed = 51 } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  const cell = cellNoise(seed + 1, 22, 22, 0.9);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const c = cell(u, v);
      const grain = sstep(0.0, 0.25, c.f2 - c.f1);
      const crease = Math.pow(n(u, v, 6), 3);
      const k = 0.78 + grain * 0.14 + fbm(n, u, v, 8, 3) * 0.16 - crease * 0.15;
      put(b, i, k, k, k);
      b.hgt[i] = grain * 0.4 + crease * 0.6;
      b.rough[i] = 0.55 + (1 - grain) * 0.2 + crease * 0.15;
    }
  }
  return b;
}

// ---------- 毛皮外壳用：每根毛的“长度”（alpha）+ 花纹颜色 ----------
// pattern: 'mottled'（杂色毛皮）| 'tabby'（虎斑猫）
export function furTexture({ size = 512, seed = 61, pattern = 'mottled', c1 = '#6a5a48', c2 = '#2e241a', c3 = '#a8977e', density = 0.85 } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  const rnd = mulberry32(seed + 9);
  const alpha = new Float32Array(size * size);
  const A = rgb01(c1);
  const B = rgb01(c2);
  const C = rgb01(c3);
  // 毛根：每个像素一根，长度随机，偶尔留空
  for (let i = 0; i < size * size; i++) alpha[i] = rnd() < density ? 0.15 + rnd() * 0.85 : 0;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      let t;
      if (pattern === 'tabby') {
        // 虎斑：沿 v 方向弯曲的深色条纹
        const s = Math.sin((u * 10 + fbm(n, u, v, 4, 3) * 1.8) * Math.PI * 2);
        t = sstep(0.35, 0.8, s);
      } else t = sstep(0.4, 0.75, fbm(n, u, v, 6, 4));
      const tip = fbm(n, (u + 0.5) % 1, v, 32, 2);
      put(b, i, lerp(lerp(A[0], B[0], t), C[0], tip * 0.35), lerp(lerp(A[1], B[1], t), C[1], tip * 0.35), lerp(lerp(A[2], B[2], t), C[2], tip * 0.35));
      b.hgt[i] = alpha[i];
      b.rough[i] = 0.9;
    }
  }
  return { b, alpha };
}

// ---------- 头发：一缕缕的细丝（颜色明暗 + 边缘透明 + 丝状凹凸） ----------
export function hairTexture({ w = 256, h = 512, seed = 71 } = {}) {
  const b = buffers(w, h);
  const n = valueNoise(seed);
  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;
      const s1 = n(u, (v * 0.25) % 1, 64);
      const s2 = n((u + 0.31) % 1, (v * 0.5) % 1, 128);
      const strand = s1 * 0.6 + s2 * 0.4;
      const k = 0.55 + strand * 0.6;
      put(b, i, k, k, k);
      b.hgt[i] = strand;
      b.rough[i] = 0.55 + (1 - strand) * 0.25;
      // 发梢（贴图底部）变稀
      alpha[i] = Math.min(1, sstep(0.0, 0.18, v) * 1.0 + 0.0) * (1 - sstep(0.72, 1.0, v) * (1 - strand * 1.2));
    }
  }
  return { b, alpha };
}

// ---------- 地毯：酒红底、多重花边、菱形纹样、两端流苏 ----------
export function rugCanvas({ w = 1024, h = 640, seed = 81, field = '#7c1c1a', border = '#1e2a4a', accent = '#d6a64e', cream = '#e6d4ae' } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, w, h);
  const fr = 34; // 流苏
  const band = (inset, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(fr + inset + width / 2, inset + width / 2, w - 2 * fr - 2 * inset - width, h - 2 * inset - width);
  };
  band(10, 40, border);
  band(52, 6, accent);
  band(62, 26, cream);
  band(92, 6, accent);
  // 外圈花边上的小菱形
  ctx.fillStyle = accent;
  for (let x = fr + 30; x < w - fr - 30; x += 28) {
    for (const y of [30, h - 30]) diamond(ctx, x, y, 9, 7);
  }
  for (let y = 40; y < h - 40; y += 28) for (const x of [fr + 30, w - fr - 30]) diamond(ctx, x, y, 7, 9);
  ctx.fillStyle = field;
  for (let x = fr + 75; x < w - fr - 70; x += 22) for (const y of [75, h - 75]) diamond(ctx, x, y, 6, 6);
  // 中心大徽章
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = border;
  diamond(ctx, cx, cy, 170, 130);
  ctx.fillStyle = accent;
  diamond(ctx, cx, cy, 150, 112);
  ctx.fillStyle = field;
  diamond(ctx, cx, cy, 138, 102);
  ctx.fillStyle = cream;
  diamond(ctx, cx, cy, 70, 52);
  ctx.fillStyle = border;
  diamond(ctx, cx, cy, 52, 38);
  ctx.fillStyle = accent;
  for (const [dx, dy] of [[-100, 0], [100, 0], [0, -76], [0, 76]]) diamond(ctx, cx + dx, cy + dy, 16, 16);
  // 四角的小图案
  for (const [x, y] of [[fr + 150, 150], [w - fr - 150, 150], [fr + 150, h - 150], [w - fr - 150, h - 150]]) {
    ctx.fillStyle = cream;
    diamond(ctx, x, y, 34, 34);
    ctx.fillStyle = border;
    diamond(ctx, x, y, 20, 20);
  }
  // 流苏
  ctx.strokeStyle = cream;
  ctx.lineWidth = 2;
  for (let y = 4; y < h; y += 5) {
    for (const [x0, dir] of [[fr, -1], [w - fr, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + dir * (fr - 4 - rnd() * 8), y + (rnd() - 0.5) * 4);
      ctx.stroke();
    }
  }
  // 磨损褪色
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = valueNoise(seed + 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const wear = fbm(n, x / w, y / h, 6, 2);
      const f = 0.78 + wear * 0.3 + ((x * 7 + y * 13) % 5) * 0.012;
      d[i] *= f;
      d[i + 1] *= f;
      d[i + 2] *= f;
      if (x < fr || x > w - fr) d[i + 3] = (x % 5 < 2 || ((x * 31 + y * 17) % 7 === 0)) ? 255 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function diamond(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.moveTo(x, y - ry);
  ctx.lineTo(x + rx, y);
  ctx.lineTo(x, y + ry);
  ctx.lineTo(x - rx, y);
  ctx.closePath();
  ctx.fill();
}

// ---------- 铁器：深色、带锈点 ----------
export function ironDetail({ size = 256, seed = 91 } = {}) {
  const b = buffers(size, size);
  const n = valueNoise(seed);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const f = fbm(n, u, v, 8, 4);
      const rust = sstep(0.6, 0.78, fbm(n, (u + 0.4) % 1, v, 12, 3));
      put(b, i, lerp(0.16 + f * 0.08, 0.36, rust), lerp(0.15 + f * 0.07, 0.2, rust), lerp(0.14 + f * 0.06, 0.1, rust));
      b.hgt[i] = f * 0.5 + rust * 0.3;
      b.rough[i] = 0.45 + f * 0.2 + rust * 0.35;
    }
  }
  return b;
}
