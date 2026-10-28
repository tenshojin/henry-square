// 程序化贴图工具：在 canvas 上画木纹、石墙、皮革等
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb(r, g, b, a = 1) {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
export function mix(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return rgb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
export function shade(hex, f, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  if (f >= 0) return rgb(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f, a);
  return rgb(r * (1 + f), g * (1 + f), b * (1 + f), a);
}

// 柔和斑点
export function mottle(ctx, w, h, rnd, colors, count, rMin, rMax, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = rMin + rnd() * (rMax - rMin);
    const c = colors[Math.floor(rnd() * colors.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const [cr, cg, cb] = hexToRgb(c);
    g.addColorStop(0, rgb(cr, cg, cb, alpha));
    g.addColorStop(1, rgb(cr, cg, cb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// 细噪点
export function speckle(ctx, w, h, rnd, count, color, maxR = 1.2, alpha = 0.3) {
  const [r, g, b] = hexToRgb(color);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rgb(r, g, b, alpha * rnd());
    const s = 0.4 + rnd() * maxR;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// 木纹（水平方向）
export function woodGrain(ctx, x0, y0, w, h, rnd, c1, c2, opts = {}) {
  const lines = opts.lines ?? 40;
  ctx.fillStyle = c1;
  ctx.fillRect(x0, y0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.save();
  ctx.translate(x0, y0);
  mottle(ctx, w, h, rnd, [c2], 6, Math.min(w, h) * 0.3, Math.min(w, h) * 0.9, 0.25);
  ctx.restore();
  for (let i = 0; i < lines; i++) {
    const y = y0 + rnd() * h;
    const amp = 1 + rnd() * (opts.amp ?? 4);
    const freq = 0.004 + rnd() * 0.02;
    const ph = rnd() * 10;
    ctx.strokeStyle = shade(c2.startsWith('#') ? c2 : '#000000', -0.1 - rnd() * 0.3, 0.15 + rnd() * 0.35);
    ctx.lineWidth = 0.5 + rnd() * 1.8;
    ctx.beginPath();
    for (let x = x0; x <= x0 + w; x += 4) {
      const yy = y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // 节疤
  const knots = opts.knots ?? 1;
  for (let k = 0; k < knots; k++) {
    if (rnd() < 0.5) continue;
    const kx = x0 + rnd() * w;
    const ky = y0 + rnd() * h;
    for (let r = 2; r < 14; r += 2.5) {
      ctx.strokeStyle = shade(c2, -0.3, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * 2.2, r * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function canvasTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// 木地板/桌面：多条木板
export function planksTexture({ size = 1024, planks = 6, c1 = '#6b4a2f', c2 = '#3d2a1a', seed = 1, gap = '#1a120b', vertical = false, stains = 0 }) {
  const rnd = mulberry32(seed);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  const ctx = col.getContext('2d');
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);
  const ph = size / planks;
  for (let i = 0; i < planks; i++) {
    const t = rnd();
    const base = mix(c1, c2, t * 0.45);
    const dark = mix(c2, '#000000', 0.2);
    woodGrain(ctx, 0, i * ph, size, ph, rnd, base, c2.startsWith('#') ? c2 : dark, { lines: 26, amp: 3, knots: 2 });
    // 木板分段接缝
    const joints = 1 + Math.floor(rnd() * 2);
    for (let j = 0; j < joints; j++) {
      const x = rnd() * size;
      ctx.fillStyle = gap;
      ctx.fillRect(x, i * ph, 3, ph);
      bctx.fillStyle = '#202020';
      bctx.fillRect(x, i * ph, 3, ph);
    }
    ctx.fillStyle = gap;
    ctx.fillRect(0, i * ph, size, 3);
    bctx.fillStyle = '#202020';
    bctx.fillRect(0, i * ph, size, 3);
    // 板面轻微起伏
    const g = bctx.createLinearGradient(0, i * ph, 0, (i + 1) * ph);
    g.addColorStop(0, 'rgba(90,90,90,0.6)');
    g.addColorStop(0.5, 'rgba(150,150,150,0.3)');
    g.addColorStop(1, 'rgba(90,90,90,0.6)');
    bctx.fillStyle = g;
    bctx.fillRect(0, i * ph + 3, size, ph - 3);
  }
  // 污渍、杯印
  for (let s = 0; s < stains; s++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 20 + rnd() * 40;
    ctx.strokeStyle = 'rgba(30,15,5,0.25)';
    ctx.lineWidth = 3 + rnd() * 4;
    ctx.beginPath();
    ctx.arc(x, y, r, rnd() * 2, Math.PI * (1.2 + rnd() * 0.8) + 2);
    ctx.stroke();
    mottle(ctx, size, size, rnd, ['#1a0d05'], 1, 30, 80, 0.15);
  }
  speckle(ctx, size, size, rnd, 3000, '#000000', 1.5, 0.25);
  if (vertical) {
    // 旋转90度
    const r1 = rotateCanvas(col);
    const r2 = rotateCanvas(bump);
    return { col: r1, bump: r2 };
  }
  return { col, bump };
}

function rotateCanvas(src) {
  const c = makeCanvas(src.height, src.width);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// 石墙
export function stoneTexture({ size = 1024, rows = 7, seed = 3, c1 = '#7a7164', c2 = '#4a443c', mortar = '#2e2a24' }) {
  const rnd = mulberry32(seed);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  const ctx = col.getContext('2d');
  const bctx = bump.getContext('2d');
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#202020';
  bctx.fillRect(0, 0, size, size);
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 80;
    while (x < size) {
      const w = rh * (1.1 + rnd() * 1.4);
      const pad = 4 + rnd() * 3;
      const sx = x + pad;
      const sy = r * rh + pad;
      const sw = w - pad * 2;
      const sh = rh - pad * 2;
      const c = mix(c1, c2, rnd());
      const rad = 8 + rnd() * 14;
      for (const [cx, cc] of [[ctx, c], [bctx, null]]) {
        cx.save();
        cx.beginPath();
        roundRectPath(cx, sx + (rnd() - 0.5) * 4, sy + (rnd() - 0.5) * 4, sw, sh, rad);
        if (cc) {
          cx.fillStyle = cc;
          cx.fill();
          cx.clip();
          mottle(cx, size, size, rnd, ['#2a2620', '#9a9080', '#5a5248'], 6, 10, 40, 0.25);
          speckle(cx, size, size, rnd, 0, '#000');
        } else {
          const g = cx.createRadialGradient(sx + sw / 2, sy + sh / 2, 4, sx + sw / 2, sy + sh / 2, Math.max(sw, sh) * 0.7);
          g.addColorStop(0, '#d0d0d0');
          g.addColorStop(0.75, '#9a9a9a');
          g.addColorStop(1, '#505050');
          cx.fillStyle = g;
          cx.fill();
        }
        cx.restore();
      }
      x += w;
    }
  }
  speckle(ctx, size, size, rnd, 9000, '#000000', 1.6, 0.35);
  speckle(ctx, size, size, rnd, 4000, '#d8cfc0', 1.2, 0.2);
  speckle(bctx, size, size, rnd, 8000, '#000000', 2, 0.4);
  return { col, bump };
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 灰泥墙
export function plasterTexture({ size = 512, seed = 5, c1 = '#a8956f', c2 = '#6f5f45' }) {
  const rnd = mulberry32(seed);
  const col = makeCanvas(size);
  const ctx = col.getContext('2d');
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, size, size);
  mottle(ctx, size, size, rnd, [c2, '#6d5c44', '#e0d2b4'], 60, 20, 120, 0.18);
  // 烟熏（上方更暗）
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(40,28,15,0.25)');
  g.addColorStop(1, 'rgba(40,28,15,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rnd, 5000, '#3a2e20', 1.4, 0.3);
  // 裂纹
  for (let i = 0; i < 6; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    ctx.strokeStyle = 'rgba(60,45,30,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += (rnd() - 0.5) * 20;
      y += rnd() * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const bump = makeCanvas(size);
  const b = bump.getContext('2d');
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  mottle(b, size, size, rnd, ['#a0a0a0', '#606060'], 200, 4, 30, 0.35);
  speckle(b, size, size, rnd, 6000, '#000000', 1.5, 0.3);
  return { col, bump };
}

// 皮革（骰盘、骰盅）
export function leatherTexture({ size = 1024, seed = 7, c1 = '#5a2418', c2 = '#2e110a', border = true, emblem = true, gold = '#c8a24a' }) {
  const rnd = mulberry32(seed);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  const ctx = col.getContext('2d');
  const bctx = bump.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  mottle(ctx, size, size, rnd, [c2, '#000000', shade(c1, 0.15)], 120, 10, 70, 0.15);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);
  // 皮革颗粒
  for (let i = 0; i < 14000; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 0.8 + rnd() * 2.2;
    bctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)';
    bctx.beginPath();
    bctx.arc(x, y, r, 0, Math.PI * 2);
    bctx.fill();
  }
  speckle(ctx, size, size, rnd, 6000, '#000000', 1.5, 0.2);
  if (border) {
    // 烫金边框 + 压花藤蔓
    const m = size * 0.05;
    for (const [cx, stroke, lw] of [[ctx, gold, 4], [bctx, '#e0e0e0', 6]]) {
      cx.strokeStyle = stroke;
      cx.lineWidth = lw;
      cx.strokeRect(m, m, size - m * 2, size - m * 2);
      cx.lineWidth = lw * 0.5;
      cx.strokeRect(m + 14, m + 14, size - (m + 14) * 2, size - (m + 14) * 2);
    }
    ctx.globalAlpha = 0.55;
    for (let side = 0; side < 4; side++) {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate((side * Math.PI) / 2);
      ctx.translate(-size / 2, -size / 2);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const y = m + 7;
      for (let x = m + 30; x < size - m - 30; x += 3) {
        const yy = y + Math.sin(x * 0.06) * 3.5;
        if (x === m + 30) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      for (let x = m + 40; x < size - m - 40; x += 42) {
        ctx.beginPath();
        ctx.ellipse(x, y, 5, 2.4, 0.6, 0, Math.PI * 2);
        ctx.fillStyle = gold;
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  if (emblem) {
    // 中央太阳/罗盘纹章（暗压花）
    const cx = size / 2;
    const cy = size / 2;
    for (const [c, color, a] of [[ctx, shade(c2, -0.2), 0.45], [bctx, '#4a4a4a', 0.8]]) {
      c.save();
      c.globalAlpha = a;
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, size * 0.16, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 16; i++) {
        const a2 = (i / 16) * Math.PI * 2;
        const r1 = size * (i % 2 ? 0.17 : 0.17);
        const r2 = size * (i % 2 ? 0.2 : 0.24);
        c.beginPath();
        c.moveTo(cx + Math.cos(a2 - 0.08) * r1, cy + Math.sin(a2 - 0.08) * r1);
        c.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2);
        c.lineTo(cx + Math.cos(a2 + 0.08) * r1, cy + Math.sin(a2 + 0.08) * r1);
        c.stroke();
      }
      c.restore();
    }
  }
  return { col, bump };
}

// 暖色环境贴图（等距柱状），供金属/漆面反射
export function warmEnvCanvas() {
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  // 傍晚的酒馆：石灰白墙被夕阳和炉火映成暖色
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a2818');
  g.addColorStop(0.3, '#8a6a48');
  g.addColorStop(0.5, '#b08a60');
  g.addColorStop(0.62, '#5a4028');
  g.addColorStop(1, '#2a1c10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 窗户透进的夕阳
  const sun = ctx.createRadialGradient(w * 0.75, h * 0.4, 0, w * 0.75, h * 0.4, 70);
  sun.addColorStop(0, 'rgba(255,236,190,1)');
  sun.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const rnd = mulberry32(11);
  // 炉火、烛光、窗户
  const spot = (x, y, r, col, a) => {
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const [cr, cg, cb] = hexToRgb(col);
    gg.addColorStop(0, rgb(cr, cg, cb, a));
    gg.addColorStop(1, rgb(cr, cg, cb, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  spot(w * 0.25, h * 0.58, 70, '#ff8a2a', 0.9);
  spot(w * 0.25, h * 0.58, 26, '#ffd27a', 1);
  spot(w * 0.5, h * 0.12, 60, '#ffc070', 0.8);
  spot(w * 0.75, h * 0.42, 40, '#7f9ccf', 0.5);
  for (let i = 0; i < 10; i++) spot(rnd() * w, h * (0.4 + rnd() * 0.2), 10 + rnd() * 10, '#ffb060', 0.7);
  return c;
}
