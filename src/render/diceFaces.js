// 为每种骰子绘制 6 个面的贴图（颜色、凹凸、金属度、自发光）
import * as THREE from 'three';
import { makeCanvas, mulberry32, mottle, speckle, woodGrain, shade, mix, hexToRgb, rgb, roundRectPath } from './canvasTex.js';

const S = 256; // 每面分辨率
const C = S / 2;
const D = 62; // 点距

const LAYOUT = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function newLayers(style) {
  const col = makeCanvas(S);
  const bump = makeCanvas(S);
  const met = makeCanvas(S);
  const emi = makeCanvas(S);
  const L = {
    col, bump, met, emi,
    c: col.getContext('2d'),
    b: bump.getContext('2d'),
    m: met.getContext('2d'),
    e: emi.getContext('2d'),
    usesEmi: false,
    usesMet: false,
  };
  L.b.fillStyle = '#9a9a9a';
  L.b.fillRect(0, 0, S, S);
  const baseMet = Math.round((style.mat?.metalness ?? 0) * 255);
  L.m.fillStyle = rgb(baseMet, baseMet, baseMet);
  L.m.fillRect(0, 0, S, S);
  L.e.fillStyle = '#000';
  L.e.fillRect(0, 0, S, S);
  L.baseMet = baseMet;
  return L;
}

// ---------- 底材 ----------
function drawBase(L, style, rnd, value) {
  const { c, b } = L;
  const c1 = style.faceTint?.[value] ? mix(style.c1, style.faceTint[value], 0.6) : style.c1;
  const c2 = style.c2;
  switch (style.base) {
    case 'wood':
    case 'darkwood':
      woodGrain(c, 0, 0, S, S, rnd, c1, c2, { lines: 34, amp: 2.5, knots: style.base === 'wood' ? 1 : 0 });
      for (let i = 0; i < 40; i++) {
        b.strokeStyle = 'rgba(60,60,60,0.25)';
        b.beginPath();
        const y = rnd() * S;
        b.moveTo(0, y);
        b.lineTo(S, y + (rnd() - 0.5) * 8);
        b.stroke();
      }
      break;
    case 'metal':
    case 'gold':
    case 'copper':
    case 'bronze': {
      const g = c.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, shade(c1, 0.12));
      g.addColorStop(0.5, c1);
      g.addColorStop(1, c2);
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) {
        c.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        c.lineWidth = 0.6;
        const y = rnd() * S;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(S, y + (rnd() - 0.5) * 3);
        c.stroke();
      }
      mottle(c, S, S, rnd, [c2], 10, 10, 40, 0.18);
      speckle(b, S, S, rnd, 600, '#000000', 1, 0.3);
      break;
    }
    case 'stone':
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, shade(c1, 0.2)], 40, 6, 30, 0.35);
      speckle(c, S, S, rnd, 2500, '#000000', 1.6, 0.4);
      speckle(c, S, S, rnd, 1200, '#ffffff', 1.2, 0.25);
      mottle(b, S, S, rnd, ['#d0d0d0', '#505050'], 80, 3, 14, 0.4);
      speckle(b, S, S, rnd, 2500, '#000000', 1.8, 0.5);
      break;
    case 'marble': {
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2], 8, 30, 80, 0.15);
      for (let v = 0; v < 6; v++) {
        let x = rnd() * S;
        let y = 0;
        c.strokeStyle = shade(c2, -0.1, 0.35 + rnd() * 0.3);
        c.lineWidth = 0.6 + rnd() * 1.6;
        c.beginPath();
        c.moveTo(x, y);
        while (y < S) {
          x += (rnd() - 0.5) * 18;
          y += 6 + rnd() * 10;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    }
    case 'lacquer': {
      const g = c.createRadialGradient(C * 0.8, C * 0.8, 10, C, C, S * 0.75);
      g.addColorStop(0, shade(c1, 0.12));
      g.addColorStop(0.6, c1);
      g.addColorStop(1, c2);
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
      speckle(c, S, S, rnd, 200, '#000000', 1, 0.2);
      break;
    }
    case 'pearl': {
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.35)' : rgb(...hexToRgb(c2), 0.25);
        c.lineWidth = 2 + rnd() * 6;
        c.beginPath();
        const off = rnd() * S;
        for (let x = -10; x <= S + 10; x += 6) {
          const y = off + Math.sin(x * 0.03 + i) * 14 + x * 0.25;
          if (x === -10) c.moveTo(x, y % (S + 40) - 20);
          else c.lineTo(x, y % (S + 40) - 20);
        }
        c.stroke();
      }
      mottle(c, S, S, rnd, ['#ffffff', '#d9b3f0', '#b3e0f0'], 12, 20, 60, 0.15);
      break;
    }
    case 'jade':
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, shade(c1, 0.3), '#e8f0d8'], 40, 10, 50, 0.22);
      for (let v = 0; v < 3; v++) {
        let x = rnd() * S;
        let y = rnd() * S;
        c.strokeStyle = 'rgba(240,250,230,0.25)';
        c.lineWidth = 2 + rnd() * 3;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 10; k++) {
          x += (rnd() - 0.4) * 30;
          y += (rnd() - 0.4) * 30;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    case 'pastry': {
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, '#7a4518'], 30, 10, 45, 0.35);
      mottle(c, S, S, rnd, ['#f3d08a'], 15, 6, 25, 0.3);
      speckle(c, S, S, rnd, 900, '#5a2e0e', 1.5, 0.5);
      // 叉压花边
      for (let side = 0; side < 4; side++) {
        c.save();
        b.save();
        for (const cx of [c, b]) {
          cx.translate(C, C);
          cx.rotate((side * Math.PI) / 2);
          cx.translate(-C, -C);
        }
        for (let x = 30; x < S - 30; x += 9) {
          c.strokeStyle = 'rgba(110,60,20,0.55)';
          c.lineWidth = 2.2;
          c.beginPath();
          c.moveTo(x, 18);
          c.lineTo(x, 36);
          c.stroke();
          b.strokeStyle = '#3a3a3a';
          b.lineWidth = 3;
          b.beginPath();
          b.moveTo(x, 18);
          b.lineTo(x, 36);
          b.stroke();
        }
        c.restore();
        b.restore();
      }
      mottle(b, S, S, rnd, ['#c0c0c0', '#606060'], 60, 5, 20, 0.4);
      break;
    }
    case 'parchment': {
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, '#a88b5a'], 20, 15, 60, 0.3);
      const g = c.createRadialGradient(C, C, S * 0.3, C, C, S * 0.72);
      g.addColorStop(0, 'rgba(80,50,20,0)');
      g.addColorStop(1, 'rgba(80,50,20,0.45)');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
      speckle(c, S, S, rnd, 800, '#5a4020', 1.2, 0.35);
      break;
    }
    case 'char':
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, '#000000', '#3a2a22'], 30, 10, 40, 0.4);
      for (let i = 0; i < 30; i++) {
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 1 + rnd() * 2;
        const y = rnd() * S;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(S, y + (rnd() - 0.5) * 10);
        c.stroke();
      }
      speckle(b, S, S, rnd, 1800, '#000000', 2, 0.5);
      break;
    case 'grime':
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, '#1a1408', '#7a6a48'], 50, 8, 40, 0.4);
      speckle(c, S, S, rnd, 1500, '#100c06', 1.8, 0.5);
      mottle(b, S, S, rnd, ['#c8c8c8', '#505050'], 60, 4, 20, 0.4);
      break;
    case 'painted':
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2], 20, 20, 60, 0.15);
      speckle(c, S, S, rnd, 300, '#6a5030', 1, 0.2);
      break;
    case 'bone':
    default: {
      c.fillStyle = c1;
      c.fillRect(0, 0, S, S);
      mottle(c, S, S, rnd, [c2, shade(c1, 0.15)], 26, 15, 60, 0.22);
      for (let i = 0; i < 25; i++) {
        c.strokeStyle = rgb(...hexToRgb(c2), 0.12 + rnd() * 0.12);
        c.lineWidth = 0.6 + rnd();
        const x = rnd() * S;
        c.beginPath();
        c.moveTo(x, 0);
        c.bezierCurveTo(x + (rnd() - 0.5) * 30, S * 0.3, x + (rnd() - 0.5) * 30, S * 0.6, x + (rnd() - 0.5) * 20, S);
        c.stroke();
      }
      speckle(c, S, S, rnd, 500, '#5a4a30', 1.2, 0.35);
      speckle(b, S, S, rnd, 700, '#000000', 1.4, 0.3);
    }
  }
}

// ---------- 覆盖纹饰 ----------
function drawOverlay(L, kind, style, rnd, value) {
  const { c, b, e } = L;
  switch (kind) {
    case 'scratches':
      for (let i = 0; i < 22; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const a = rnd() * Math.PI;
        const len = 10 + rnd() * 40;
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        c.stroke();
        b.strokeStyle = 'rgba(40,40,40,0.5)';
        b.beginPath();
        b.moveTo(x, y);
        b.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        b.stroke();
      }
      break;
    case 'crumbs':
      speckle(c, S, S, rnd, 120, '#f6dc9a', 2.5, 0.8);
      speckle(c, S, S, rnd, 80, '#5a2a0a', 2.5, 0.6);
      break;
    case 'flowers':
      for (const [fx, fy] of [[34, 34], [S - 34, 34], [34, S - 34], [S - 34, S - 34], [C, 30], [C, S - 30], [30, C], [S - 30, C]]) {
        const fr = 8 + rnd() * 3;
        const hue = ['#c94a6a', '#e08a3a', '#5a7fc4', '#b0243a'][Math.floor(rnd() * 4)];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + rnd();
          c.fillStyle = hue;
          c.beginPath();
          c.ellipse(fx + Math.cos(a) * fr * 0.7, fy + Math.sin(a) * fr * 0.7, fr * 0.55, fr * 0.32, a, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#f2d14b';
        c.beginPath();
        c.arc(fx, fy, fr * 0.3, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#4c7a3a';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(fx + fr, fy);
        c.quadraticCurveTo(fx + fr * 2, fy + fr, fx + fr * 2.2, fy - fr * 0.5);
        c.stroke();
      }
      break;
    case 'runes':
      c.strokeStyle = style.trim || '#e0c069';
      c.lineWidth = 2;
      for (let side = 0; side < 4; side++) {
        c.save();
        c.translate(C, C);
        c.rotate((side * Math.PI) / 2);
        c.translate(-C, -C);
        c.beginPath();
        for (let x = 40; x <= S - 40; x += 12) {
          c.lineTo(x, 22 + ((x / 12) % 2 ? 0 : 8));
        }
        c.stroke();
        c.restore();
      }
      break;
    case 'lace':
      c.fillStyle = 'rgba(255,250,245,0.85)';
      for (let side = 0; side < 4; side++) {
        c.save();
        c.translate(C, C);
        c.rotate((side * Math.PI) / 2);
        c.translate(-C, -C);
        for (let x = 30; x <= S - 30; x += 14) {
          c.beginPath();
          c.arc(x, 26, 6, 0, Math.PI);
          c.fill();
          c.beginPath();
          c.fillStyle = 'rgba(200,120,130,0.6)';
          c.arc(x, 27, 1.6, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(255,250,245,0.85)';
        }
        c.restore();
      }
      break;
    case 'engrave':
      c.strokeStyle = 'rgba(40,30,20,0.5)';
      b.strokeStyle = 'rgba(30,30,30,0.8)';
      for (const [cx, cy, rot] of [[30, 30, 0], [S - 30, 30, Math.PI / 2], [S - 30, S - 30, Math.PI], [30, S - 30, -Math.PI / 2]]) {
        for (const ctx of [c, b]) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, 30);
          ctx.bezierCurveTo(0, 5, 5, 0, 30, 0);
          ctx.moveTo(6, 22);
          ctx.bezierCurveTo(8, 12, 12, 8, 22, 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(10, 10, 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      break;
    case 'smear':
      for (let i = 0; i < 6; i++) {
        const g = c.createLinearGradient(0, 0, S, S);
        g.addColorStop(0, 'rgba(60,35,10,0)');
        g.addColorStop(0.5, 'rgba(60,35,10,0.25)');
        g.addColorStop(1, 'rgba(60,35,10,0)');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(rnd() * S, rnd() * S, 60 + rnd() * 40, 10 + rnd() * 10, rnd() * Math.PI, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'embers':
    case 'cracks': {
      const glow = kind === 'embers';
      for (let k = 0; k < (glow ? 5 : 4); k++) {
        let x = rnd() * S;
        let y = rnd() < 0.5 ? 0 : S * rnd();
        const pts = [[x, y]];
        for (let i = 0; i < 9; i++) {
          x += (rnd() - 0.5) * 50;
          y += 10 + rnd() * 25;
          pts.push([x, y]);
        }
        const path = (ctx) => {
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.stroke();
        };
        c.strokeStyle = glow ? '#3a1408' : 'rgba(20,20,15,0.8)';
        c.lineWidth = glow ? 3.5 : 1.8;
        path(c);
        if (glow) {
          c.strokeStyle = '#ff7a1a';
          c.lineWidth = 1.4;
          path(c);
          e.strokeStyle = '#ff6a10';
          e.lineWidth = 3;
          e.shadowColor = '#ff4000';
          e.shadowBlur = 8;
          path(e);
          e.shadowBlur = 0;
          L.usesEmi = true;
        }
        b.strokeStyle = '#101010';
        b.lineWidth = 2.5;
        path(b);
      }
      break;
    }
    case 'rust':
      mottle(c, S, S, rnd, ['#8a4a1e', '#a8602a', '#5a2e12'], 26, 6, 30, 0.45);
      mottle(L.m, S, S, rnd, ['#303030'], 26, 6, 30, 0.6);
      L.usesMet = true;
      break;
    case 'chips':
      for (let i = 0; i < 10; i++) {
        const edge = Math.floor(rnd() * 4);
        const t = 20 + rnd() * (S - 40);
        const [x, y] = [[t, 14], [S - 14, t], [t, S - 14], [14, t]][edge];
        c.fillStyle = 'rgba(60,40,20,0.5)';
        c.beginPath();
        c.ellipse(x, y, 6 + rnd() * 8, 3 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
        c.fill();
        b.fillStyle = '#202020';
        b.beginPath();
        b.ellipse(x, y, 6 + rnd() * 8, 3 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
        b.fill();
      }
      break;
    case 'splatter': {
      const cols = ['#2a52be', '#2e8b3e', '#c0392b', '#e0b020', '#7a3fa0'];
      for (let i = 0; i < 18; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const r = 2 + rnd() * 9;
        c.fillStyle = cols[Math.floor(rnd() * cols.length)];
        c.globalAlpha = 0.85;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        for (let d = 0; d < 5; d++) {
          c.beginPath();
          c.arc(x + (rnd() - 0.5) * r * 5, y + (rnd() - 0.5) * r * 5, r * 0.2 + rnd() * 2, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
      }
      break;
    }
    case 'grime':
      mottle(c, S, S, rnd, ['#1a1408', '#3a2e18'], 30, 4, 22, 0.55);
      speckle(c, S, S, rnd, 600, '#0a0804', 2.5, 0.6);
      break;
    case 'formulas': {
      const words = ['a+b', 'x²', '∑', 'π', '3·4', '√2', '÷', '½', '7=7', '∞', 'n+1', '∆'];
      c.fillStyle = 'rgba(60,40,20,0.35)';
      for (let i = 0; i < 14; i++) {
        c.font = `${10 + rnd() * 8}px Georgia, serif`;
        c.save();
        c.translate(20 + rnd() * (S - 40), 20 + rnd() * (S - 40));
        c.rotate((rnd() - 0.5) * 0.6);
        c.fillText(words[Math.floor(rnd() * words.length)], 0, 0);
        c.restore();
      }
      break;
    }
  }
}

// ---------- 点 ----------
function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.35);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.closePath();
}
function starPath(ctx, x, y, r, points = 5, inner = 0.45, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
function crossPath(ctx, x, y, r) {
  const w = r * 0.38;
  ctx.beginPath();
  ctx.moveTo(x - w, y - r);
  ctx.lineTo(x + w, y - r);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + r, y - w);
  ctx.lineTo(x + r, y + w);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x + w, y + r);
  ctx.lineTo(x - w, y + r);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - r, y + w);
  ctx.lineTo(x - r, y - w);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
}
function triPath(ctx, x, y, r, up = true) {
  ctx.beginPath();
  const s = up ? 1 : -1;
  ctx.moveTo(x, y - r * s);
  ctx.lineTo(x + r * 0.95, y + r * 0.7 * s);
  ctx.lineTo(x - r * 0.95, y + r * 0.7 * s);
  ctx.closePath();
}

function metalFill(ctx, x, y, r, color) {
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.35));
  return g;
}

// 在所有图层上画一个形状。raised=凸起（宝石等），否则凹陷
function stampShape(L, pathFn, color, opts = {}) {
  const { c, b, m, e } = L;
  const { metal = false, raised = false, glow = null, x = C, y = C, r = 20, flat = false } = opts;
  // 颜色
  pathFn(c);
  if (metal) c.fillStyle = metalFill(c, x, y, r, color);
  else if (flat) c.fillStyle = color;
  else {
    const g = c.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, raised ? shade(color, 0.35) : shade(color, -0.25));
    g.addColorStop(0.75, color);
    g.addColorStop(1, raised ? shade(color, -0.3) : shade(color, 0.25));
    c.fillStyle = g;
  }
  c.fill();
  // 凹凸
  pathFn(b);
  b.fillStyle = raised ? '#f0f0f0' : '#2a2a2a';
  b.fill();
  // 金属度
  pathFn(m);
  const mv = metal ? 255 : L.baseMet > 100 ? 30 : L.baseMet;
  m.fillStyle = rgb(mv, mv, mv);
  m.fill();
  if (glow) {
    pathFn(e);
    e.shadowColor = glow;
    e.shadowBlur = r * 0.8;
    e.fillStyle = glow;
    e.fill();
    e.shadowBlur = 0;
    L.usesEmi = true;
  }
  if (metal) L.usesMet = true;
}

function drawPip(L, style, x, y, r, value, rnd) {
  const color = style.pipColors?.[value] ?? style.pipColor;
  const metal = !!style.pipMetal;
  const glow = style.pipGlow || null;
  const opt = { metal, glow, x, y, r };
  switch (style.pip) {
    case 'cross':
      stampShape(L, (ctx) => crossPath(ctx, x, y, r * 1.05), color, { ...opt, flat: true });
      break;
    case 'tri':
      stampShape(L, (ctx) => triPath(ctx, x, y, r * 1.15), color, opt);
      break;
    case 'heart':
      stampShape(L, (ctx) => heartPath(ctx, x, y + 2, r * 1.05), color, opt);
      break;
    case 'star':
      stampShape(L, (ctx) => starPath(ctx, x, y, r * 1.2, 5, 0.45), color, { ...opt, raised: true });
      break;
    case 'gem': {
      stampShape(L, (ctx) => starPath(ctx, x, y, r * 1.05, 8, 0.92, Math.PI / 8), color, { ...opt, raised: true });
      // 镶座 + 高光
      L.c.strokeStyle = '#f6dc7a';
      L.c.lineWidth = 3;
      starPath(L.c, x, y, r * 1.1, 8, 0.92, Math.PI / 8);
      L.c.stroke();
      L.c.fillStyle = 'rgba(255,255,255,0.85)';
      L.c.beginPath();
      L.c.ellipse(x - r * 0.35, y - r * 0.35, r * 0.28, r * 0.14, -0.7, 0, Math.PI * 2);
      L.c.fill();
      L.m.strokeStyle = '#ffffff';
      L.m.lineWidth = 3;
      starPath(L.m, x, y, r * 1.1, 8, 0.92, Math.PI / 8);
      L.m.stroke();
      break;
    }
    case 'berry':
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, color, { ...opt, raised: true });
      L.c.fillStyle = 'rgba(255,220,230,0.7)';
      L.c.beginPath();
      L.c.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
      L.c.fill();
      L.c.fillStyle = '#3f6b2a';
      L.c.beginPath();
      L.c.ellipse(x + r * 0.5, y - r * 0.95, r * 0.45, r * 0.18, -0.6, 0, Math.PI * 2);
      L.c.fill();
      break;
    case 'crude': {
      const pts = [];
      const n = 9;
      for (let i = 0; i < n; i++) pts.push(r * (0.75 + rnd() * 0.45));
      stampShape(L, (ctx) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const px = x + Math.cos(a) * pts[i];
          const py = y + Math.sin(a) * pts[i];
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
      }, color, opt);
      break;
    }
    case 'dot':
    default:
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, color, opt);
  }
}

function drawNumeral(L, style, value) {
  const color = style.pipColors?.[value] ?? style.pipColor;
  for (const [ctx, fill] of [[L.c, color], [L.b, '#2a2a2a']]) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.font = 'bold 150px "Palatino Linotype", "Book Antiqua", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), C, C + 8);
    if (value === 6 || value === 9) {
      ctx.fillRect(C - 34, C + 78, 68, 6); // 下划线区分 6
    }
    ctx.restore();
  }
}

// ---------- 特殊面图案 ----------
function drawSpecial(L, kind, style, value, rnd) {
  const { c, b, e } = L;
  const gold = '#d9ad45';
  switch (kind) {
    case 'bigdot':
      drawPip(L, { ...style, pip: 'dot' }, C, C, 36, value, rnd);
      return true;
    case 'cross':
      stampShape(L, (ctx) => {
        ctx.beginPath();
        ctx.rect(C - 11, C - 62, 22, 124);
        ctx.rect(C - 44, C - 34, 88, 22);
      }, style.pipColor, { x: C, y: C, r: 60, flat: true });
      return true;
    case 'holy6': {
      // 金色光环 + 六颗金点
      const rays = 24;
      c.save();
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        c.strokeStyle = 'rgba(214,170,70,0.55)';
        c.lineWidth = i % 2 ? 1.5 : 3;
        c.beginPath();
        c.moveTo(C + Math.cos(a) * 26, C + Math.sin(a) * 26);
        c.lineTo(C + Math.cos(a) * (i % 2 ? 50 : 62), C + Math.sin(a) * (i % 2 ? 50 : 62));
        c.stroke();
      }
      c.restore();
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C, C, 20, 0, Math.PI * 2); }, gold, { metal: true, raised: true, x: C, y: C, r: 20 });
      stampShape(L, (ctx) => crossPath(ctx, C, C, 13), '#f8f1de', { x: C, y: C, r: 13, flat: true });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = C + Math.cos(a) * 82;
        const y = C + Math.sin(a) * 82;
        stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); }, gold, { metal: true, raised: true, x, y, r: 16 });
      }
      return true;
    }
    case 'clover': {
      const col = style.pipColor;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        stampShape(L, (ctx) => {
          ctx.save();
          ctx.translate(C, C);
          ctx.rotate(a + Math.PI / 2);
          heartPath(ctx, 0, -26, 26);
          ctx.restore();
        }, col, { metal: true, raised: true, x: C, y: C, r: 40 });
      }
      c.strokeStyle = style.pipColor;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(C, C);
      c.quadraticCurveTo(C + 20, C + 50, C + 8, C + 80);
      c.stroke();
      return true;
    }
    case 'sun': {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        stampShape(L, (ctx) => {
          ctx.beginPath();
          ctx.moveTo(C + Math.cos(a - 0.14) * 34, C + Math.sin(a - 0.14) * 34);
          ctx.lineTo(C + Math.cos(a) * 66, C + Math.sin(a) * 66);
          ctx.lineTo(C + Math.cos(a + 0.14) * 34, C + Math.sin(a + 0.14) * 34);
          ctx.closePath();
        }, style.pipColor, { metal: true, x: C, y: C, r: 60 });
      }
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C, C, 30, 0, Math.PI * 2); }, style.pipColor, { metal: true, raised: true, x: C, y: C, r: 30 });
      return true;
    }
    case 'horseshoe': {
      const col = style.pipColor;
      stampShape(L, (ctx) => {
        ctx.beginPath();
        ctx.arc(C, C - 6, 48, Math.PI * 0.85, Math.PI * 2.15, false);
        ctx.arc(C, C - 6, 28, Math.PI * 2.15, Math.PI * 0.85, true);
        ctx.closePath();
      }, col, { x: C, y: C, r: 48 });
      c.fillStyle = shade(style.c1, 0.1);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.95 + (i / 5) * Math.PI * 1.1;
        c.beginPath();
        c.arc(C + Math.cos(a) * 38, C - 6 + Math.sin(a) * 38, 3.5, 0, Math.PI * 2);
        c.fill();
      }
      return true;
    }
    case 'sadface': {
      const col = style.pipColor;
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C, C, 58, 0, Math.PI * 2); ctx.arc(C, C, 50, 0, Math.PI * 2, true); }, col, { x: C, y: C, r: 58, flat: true });
      for (const dx of [-20, 20]) {
        stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C + dx, C - 14, 8, 0, Math.PI * 2); }, col, { x: C + dx, y: C - 14, r: 8 });
      }
      for (const ctx of [c, b]) {
        ctx.strokeStyle = ctx === c ? col : '#2a2a2a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(C, C + 38, 22, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      c.fillStyle = '#5a7fb0';
      c.beginPath();
      c.ellipse(C + 22, C + 4, 4, 7, 0, 0, Math.PI * 2);
      c.fill();
      return true;
    }
    case 'heart':
      stampShape(L, (ctx) => heartPath(ctx, C, C + 6, 52), style.pipColor, { x: C, y: C, r: 52, raised: true });
      return true;
    case 'trinity3': {
      // 三个蓝点组成三角，外围金色三一结
      const pts = [0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        return [C + Math.cos(a) * 52, C + Math.sin(a) * 52];
      });
      c.strokeStyle = '#c9a03c';
      c.lineWidth = 5;
      for (const [x, y] of pts) {
        c.beginPath();
        c.arc(x * 0.55 + C * 0.45, y * 0.55 + C * 0.45, 46, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.arc(C, C, 74, 0, Math.PI * 2);
      c.stroke();
      L.m.strokeStyle = '#ffffff';
      L.m.lineWidth = 5;
      for (const [x, y] of pts) {
        L.m.beginPath();
        L.m.arc(x * 0.55 + C * 0.45, y * 0.55 + C * 0.45, 46, 0, Math.PI * 2);
        L.m.stroke();
      }
      L.usesMet = true;
      for (const [x, y] of pts) drawPip(L, style, x, y, 19, value, rnd);
      return true;
    }
    case 'tri3': {
      const pts = [[C, C - 50], [C - 52, C + 40], [C + 52, C + 40]];
      c.strokeStyle = style.trim || '#b8954f';
      c.lineWidth = 3;
      triPath(c, C, C, 100);
      c.stroke();
      for (const [x, y] of pts) drawPip(L, style, x, y, 22, value, rnd);
      return true;
    }
    case 'halo': {
      c.strokeStyle = '#d9ad45';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(C + Math.cos(a) * 46, C + Math.sin(a) * 46);
        c.lineTo(C + Math.cos(a) * 64, C + Math.sin(a) * 64);
        c.stroke();
      }
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C, C, 42, 0, Math.PI * 2); ctx.arc(C, C, 32, 0, Math.PI * 2, true); }, '#d9ad45', { metal: true, raised: true, x: C, y: C, r: 42 });
      drawPip(L, style, C, C, 20, value, rnd);
      return true;
    }
    case 'devil': {
      const red = '#c0161c';
      // 犄角
      stampShape(L, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(C - 34, C - 22);
        ctx.quadraticCurveTo(C - 70, C - 50, C - 52, C - 92);
        ctx.quadraticCurveTo(C - 40, C - 52, C - 14, C - 38);
        ctx.closePath();
        ctx.moveTo(C + 34, C - 22);
        ctx.quadraticCurveTo(C + 70, C - 50, C + 52, C - 92);
        ctx.quadraticCurveTo(C + 40, C - 52, C + 14, C - 38);
        ctx.closePath();
      }, '#d8cfc0', { x: C, y: C - 50, r: 50, raised: true });
      // 头
      stampShape(L, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(C - 46, C - 30);
        ctx.quadraticCurveTo(C, C - 56, C + 46, C - 30);
        ctx.quadraticCurveTo(C + 52, C + 20, C + 20, C + 54);
        ctx.lineTo(C, C + 74);
        ctx.lineTo(C - 20, C + 54);
        ctx.quadraticCurveTo(C - 52, C + 20, C - 46, C - 30);
        ctx.closePath();
      }, red, { x: C, y: C + 5, r: 60, raised: true });
      // 眼睛（发光）
      for (const s of [-1, 1]) {
        stampShape(L, (ctx) => {
          ctx.beginPath();
          ctx.moveTo(C + s * 8, C - 8);
          ctx.lineTo(C + s * 34, C - 18);
          ctx.lineTo(C + s * 28, C - 2);
          ctx.closePath();
        }, '#ffd23a', { x: C + s * 22, y: C - 10, r: 14, glow: '#ffb000', flat: true });
      }
      // 獠牙笑
      c.fillStyle = '#1a0606';
      c.beginPath();
      c.moveTo(C - 26, C + 22);
      c.quadraticCurveTo(C, C + 44, C + 26, C + 22);
      c.quadraticCurveTo(C, C + 32, C - 26, C + 22);
      c.fill();
      c.fillStyle = '#f2ead8';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(C + s * 16, C + 25);
        c.lineTo(C + s * 11, C + 36);
        c.lineTo(C + s * 6, C + 27);
        c.fill();
      }
      return true;
    }
    case 'crown': {
      const goldc = '#f3d27a';
      stampShape(L, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(C - 62, C + 40);
        ctx.lineTo(C - 66, C - 30);
        ctx.lineTo(C - 32, C + 2);
        ctx.lineTo(C, C - 50);
        ctx.lineTo(C + 32, C + 2);
        ctx.lineTo(C + 66, C - 30);
        ctx.lineTo(C + 62, C + 40);
        ctx.closePath();
      }, goldc, { metal: true, raised: true, x: C, y: C, r: 66 });
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.rect(C - 64, C + 38, 128, 18); }, goldc, { metal: true, raised: true, x: C, y: C + 46, r: 64 });
      for (const [x, y, r] of [[C - 66, C - 34, 8], [C, C - 54, 9], [C + 66, C - 34, 8]]) {
        stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, '#fff2c0', { metal: true, raised: true, x, y, r });
      }
      for (const [x, col] of [[C - 34, '#b3122a'], [C, '#2a5fb3'], [C + 34, '#b3122a']]) {
        stampShape(L, (ctx) => starPath(ctx, x, C + 47, 8, 6, 0.9), col, { raised: true, x, y: C + 47, r: 8 });
      }
      return true;
    }
    case 'skull': {
      const bone = style.pipColor;
      stampShape(L, (ctx) => {
        ctx.beginPath();
        ctx.arc(C, C - 12, 50, Math.PI * 0.82, Math.PI * 2.18);
        ctx.lineTo(C + 30, C + 44);
        ctx.lineTo(C - 30, C + 44);
        ctx.closePath();
      }, bone, { x: C, y: C, r: 55, raised: true });
      c.fillStyle = '#121214';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(C + s * 20, C - 10, 14, 16, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.beginPath();
      c.moveTo(C, C + 10);
      c.lineTo(C - 7, C + 24);
      c.lineTo(C + 7, C + 24);
      c.fill();
      c.strokeStyle = '#121214';
      c.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(C + i * 10, C + 32);
        c.lineTo(C + i * 10, C + 44);
        c.stroke();
      }
      for (const ctx of [b]) {
        ctx.fillStyle = '#202020';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(C + s * 20, C - 10, 14, 16, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return true;
    }
    case 'wheel': {
      const col = style.pipColor;
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C, C, 62, 0, Math.PI * 2); ctx.arc(C, C, 50, 0, Math.PI * 2, true); }, col, { x: C, y: C, r: 62, flat: true });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        stampShape(L, (ctx) => {
          ctx.save();
          ctx.translate(C, C);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.rect(-3.5, 10, 7, 42);
          ctx.restore();
        }, col, { x: C, y: C, r: 50, flat: true });
      }
      stampShape(L, (ctx) => { ctx.beginPath(); ctx.arc(C, C, 14, 0, Math.PI * 2); }, col, { x: C, y: C, r: 14 });
      return true;
    }
  }
  return false;
}

function drawTrim(L, style) {
  if (!style.trim) return;
  const { c, m } = L;
  const inset = 30;
  c.save();
  c.strokeStyle = style.trim;
  c.lineWidth = 4;
  c.beginPath();
  roundRectPath(c, inset, inset, S - inset * 2, S - inset * 2, 16);
  c.stroke();
  c.lineWidth = 1.5;
  c.beginPath();
  roundRectPath(c, inset + 7, inset + 7, S - (inset + 7) * 2, S - (inset + 7) * 2, 12);
  c.stroke();
  c.restore();
  if (['#c9a03c', '#d4b25a', '#e0c069', '#b8954f'].includes(style.trim)) {
    m.strokeStyle = '#ffffff';
    m.lineWidth = 4;
    m.beginPath();
    roundRectPath(m, inset, inset, S - inset * 2, S - inset * 2, 16);
    m.stroke();
    L.usesMet = true;
  }
}

function drawFace(style, value, seed) {
  const rnd = mulberry32(seed);
  const L = newLayers(style);
  drawBase(L, style, rnd, value);
  for (const o of style.overlay || []) if (o !== 'embers' && o !== 'cracks') drawOverlay(L, o, style, rnd, value);
  drawTrim(L, style);
  const special = style.special?.[value];
  if (!(special && drawSpecial(L, special, style, value, rnd))) {
    if (style.pip === 'num') drawNumeral(L, style, value);
    else {
      const r = style.pip === 'gem' ? 19 : 20;
      for (const [dx, dy] of LAYOUT[value]) drawPip(L, style, C + dx * D, C + dy * D, r, value, rnd);
    }
  }
  for (const o of style.overlay || []) if (o === 'embers' || o === 'cracks') drawOverlay(L, o, style, rnd, value);
  if (style.marks?.includes(value)) {
    // 骗子的暗记：角落一个小刻痕
    L.c.fillStyle = 'rgba(60,40,20,0.55)';
    L.c.beginPath();
    L.c.arc(S - 44, 44, 3, 0, Math.PI * 2);
    L.c.fill();
  }
  if (style.pipGlow) {
    // 魔鬼骰子的红点在暗处发光
    L.usesEmi = true;
  }
  return L;
}

// BoxGeometry 分组顺序：+X, -X, +Y, -Y, +Z, -Z
export const FACE_VALUES = [2, 5, 1, 6, 3, 4];
export const VALUE_NORMALS = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(1, 0, 0),
  5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 0, 1),
  4: new THREE.Vector3(0, 0, -1),
};

function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

let black = null;
function blackTex() {
  if (!black) {
    black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.colorSpace = THREE.SRGBColorSpace;
    black.needsUpdate = true;
  }
  return black;
}

const matCache = new Map();
// 返回 6 个材质（按 BoxGeometry 分组顺序）
export function getDieMaterials(def, variant = 0) {
  const key = def.id + ':' + variant;
  if (matCache.has(key)) return matCache.get(key);
  let style = def.style;
  if (def.variants) style = { ...style, pipColor: def.variants[variant % def.variants.length] };
  const mats = [];
  let seedBase = 0;
  for (const ch of def.id) seedBase = (seedBase * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < 6; i++) {
    const value = FACE_VALUES[i];
    const L = drawFace(style, value, seedBase + value * 101 + variant * 7);
    const mp = style.mat || {};
    const m = new THREE.MeshPhysicalMaterial({
      map: tex(L.col, true),
      bumpMap: tex(L.bump, false),
      bumpScale: mp.bump ?? 1.6,
      roughness: mp.roughness ?? 0.5,
      metalness: 1,
      metalnessMap: tex(L.met, false),
      // 所有骰子用同一套着色器特性（数值极小的项看不出差别），
      // 这样只需编译一次着色器，加载快很多
      clearcoat: Math.max(0.02, mp.clearcoat ?? 0),
      clearcoatRoughness: 0.15,
      envMapIntensity: (mp.metalness ?? 0) > 0.5 ? 2.8 : 1.3,
      emissiveMap: L.usesEmi ? tex(L.emi, true) : blackTex(),
      emissive: new THREE.Color(L.usesEmi ? '#ffffff' : '#000000'),
      emissiveIntensity: L.usesEmi ? 1.6 : 0,
    });
    mats.push(m);
  }
  matCache.set(key, mats);
  return mats;
}

// 2D 小图标（UI 用的平面骰面）
export function faceCanvasForUI(def, value, variant = 0) {
  let style = def.style;
  if (def.variants) style = { ...style, pipColor: def.variants[variant % def.variants.length] };
  let seedBase = 0;
  for (const ch of def.id) seedBase = (seedBase * 31 + ch.charCodeAt(0)) >>> 0;
  return drawFace(style, value, seedBase + value * 101 + variant * 7).col;
}
