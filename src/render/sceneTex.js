// 第二版酒馆场景用到的程序化贴图：石板地、石灰墙、圆片玻璃、稻草、光斑、光柱、麻布
import { makeCanvas, mulberry32, mottle, speckle, hexToRgb } from './canvasTex.js';

// 石板地面：可平铺的不规则石块（Voronoi 分格）
export function flagstoneTexture({ size = 1024, cells = 7, seed = 51, c1 = '#a49582', c2 = '#7a6d5c', mortar = '#4a4034' } = {}) {
  const rnd = mulberry32(seed);
  const pts = [];
  const step = size / cells;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      pts.push({
        x: (i + 0.5 + (rnd() - 0.5) * 0.7) * step,
        y: (j + 0.5 + (rnd() - 0.5) * 0.7) * step,
        tone: rnd(),
        warm: rnd(),
      });
    }
  }
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  const cctx = col.getContext('2d');
  const bctx = bump.getContext('2d');
  const cimg = cctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const m = hexToRgb(mortar);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      let best = pts[0];
      // 只看周围 5×5 个格子（可平铺：坐标取环绕距离）
      const ci = Math.floor(x / step);
      const cj = Math.floor(y / step);
      for (let k = 0; k < 25; k++) {
        const ii = (ci + (k % 5) - 2 + cells) % cells;
        const jj = (cj + Math.floor(k / 5) - 2 + cells) % cells;
        const p = pts[jj * cells + ii];
        let dx = Math.abs(x - p.x);
        let dy = Math.abs(y - p.y);
        if (dx > half) dx = size - dx;
        if (dy > half) dy = size - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          best = p;
        } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1); // 到石缝的距离
      const n = rnd();
      const idx = (y * size + x) * 4;
      if (edge < 3.2 + n * 1.5) {
        cimg.data[idx] = m[0] + n * 18;
        cimg.data[idx + 1] = m[1] + n * 16;
        cimg.data[idx + 2] = m[2] + n * 12;
        bimg.data[idx] = bimg.data[idx + 1] = bimg.data[idx + 2] = 40 + n * 30;
      } else {
        const t = best.tone;
        const wv = (best.warm - 0.5) * 18;
        const shade = 1 - Math.max(0, 1 - edge / 14) * 0.18 + (n - 0.5) * 0.1;
        cimg.data[idx] = (a[0] + (b[0] - a[0]) * t + wv) * shade;
        cimg.data[idx + 1] = (a[1] + (b[1] - a[1]) * t + wv * 0.6) * shade;
        cimg.data[idx + 2] = (a[2] + (b[2] - a[2]) * t) * shade;
        const dome = Math.min(1, edge / 18);
        bimg.data[idx] = bimg.data[idx + 1] = bimg.data[idx + 2] = 120 + dome * 90 + (n - 0.5) * 40;
      }
      cimg.data[idx + 3] = 255;
      bimg.data[idx + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  mottle(cctx, size, size, rnd, ['#5a4632', '#c8b8a0', '#3a2c20'], 70, 20, 90, 0.12);
  speckle(cctx, size, size, rnd, 6000, '#2a2018', 1.4, 0.3);
  return { col, bump };
}

// 石灰刷白的墙面
export function limewashTexture({ size = 512, seed = 52, c1 = '#e4d8bf', c2 = '#c2ae8a' } = {}) {
  const rnd = mulberry32(seed);
  const col = makeCanvas(size);
  const ctx = col.getContext('2d');
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, size, size);
  mottle(ctx, size, size, rnd, [c2, '#f2ead8', '#a8916c'], 90, 20, 110, 0.16);
  // 刷痕
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,250,235,0.07)' : 'rgba(150,120,80,0.05)';
    ctx.lineWidth = 6 + rnd() * 14;
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 40, x + (rnd() - 0.5) * 160, y + (rnd() - 0.5) * 60);
    ctx.stroke();
  }
  // 上方烟熏、墙根返潮
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(80,52,26,0.34)');
  g.addColorStop(0.45, 'rgba(80,52,26,0)');
  g.addColorStop(0.85, 'rgba(110,90,60,0)');
  g.addColorStop(1, 'rgba(110,90,60,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rnd, 1600, '#6a5638', 1.2, 0.25);
  const bump = makeCanvas(size);
  const bc = bump.getContext('2d');
  bc.fillStyle = '#808080';
  bc.fillRect(0, 0, size, size);
  mottle(bc, size, size, rnd, ['#a8a8a8', '#585858'], 260, 3, 26, 0.3);
  return { col, bump };
}

// 圆片玻璃窗（中世纪德意志地区常见的“牛眼窗”），被夕阳照亮
export function bullseyeTexture(cols = 5) {
  const W = 256;
  const H = 336;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(0, 0, W, H);
  const r = W / cols / 2;
  const rnd = mulberry32(61);
  for (let j = 0; j <= Math.ceil(H / (r * 1.75)); j++) {
    const off = j % 2 ? r : 0;
    for (let i = -1; i <= cols; i++) {
      const x = i * r * 2 + r + off;
      const y = j * r * 1.75 + r * 0.6;
      const warm = 0.85 + rnd() * 0.15;
      const g = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.05, x, y, r * 0.95);
      g.addColorStop(0, `rgba(255,${Math.round(246 * warm)},${Math.round(214 * warm)},1)`);
      g.addColorStop(0.35, 'rgba(255,214,150,1)');
      g.addColorStop(0.8, 'rgba(236,168,92,1)');
      g.addColorStop(1, 'rgba(160,100,50,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,240,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,140,80,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return c;
}

// 地上散落的稻草（带透明度）
export function strawTexture({ size = 512, seed = 71, count = 700 } = {}) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = Math.pow(rnd(), 0.7) * size * 0.42;
    const x = size / 2 + Math.cos(ang) * dist;
    const y = size / 2 + Math.sin(ang) * dist;
    const len = 12 + rnd() * 34;
    const dir = rnd() * Math.PI;
    const alpha = 0.55 + rnd() * 0.45;
    const tone = 170 + rnd() * 70;
    ctx.strokeStyle = `rgba(${tone | 0},${(tone * 0.8) | 0},${(tone * 0.42) | 0},${alpha})`;
    ctx.lineWidth = 1 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(dir + 0.3) * len * 0.5, y + Math.sin(dir + 0.3) * len * 0.5, x + Math.cos(dir) * len, y + Math.sin(dir) * len);
    ctx.stroke();
  }
  return c;
}

// 透过圆片玻璃落在地上的斑驳光块
export function windowPatchTexture(size = 256) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.filter = 'blur(12px)';
  ctx.fillStyle = 'rgba(255,214,150,0.95)';
  ctx.fillRect(size * 0.14, size * 0.14, size * 0.72, size * 0.72);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.filter = 'blur(3px)';
  const r = size / 14;
  for (let j = 0; j < 10; j++) {
    for (let i = 0; i < 9; i++) {
      const x = i * r * 2 + (j % 2 ? r : 0);
      const y = j * r * 1.75;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  return c;
}

// 光柱：沿长度渐隐、两侧柔边
export function shaftTexture() {
  const c = makeCanvas(64, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,214,150,0.9)');
  g.addColorStop(0.6, 'rgba(255,190,120,0.35)');
  g.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = 'destination-out';
  const e = ctx.createLinearGradient(0, 0, 64, 0);
  e.addColorStop(0, 'rgba(0,0,0,1)');
  e.addColorStop(0.25, 'rgba(0,0,0,0)');
  e.addColorStop(0.75, 'rgba(0,0,0,0)');
  e.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, 64, 256);
  return c;
}

// 麻布袋
export function burlapTexture({ size = 256, seed = 81, c1 = '#a88a5e' } = {}) {
  const rnd = mulberry32(seed);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 3) {
    ctx.fillStyle = `rgba(60,40,20,${0.08 + rnd() * 0.08})`;
    ctx.fillRect(i, 0, 1, size);
    ctx.fillRect(0, i, size, 1);
  }
  mottle(ctx, size, size, rnd, ['#5a4228', '#c8ac80'], 20, 10, 50, 0.2);
  return c;
}
