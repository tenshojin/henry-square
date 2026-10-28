// 布拉格格罗申式硬币：正面王冠 + 双圈拉丁铭文，背面波希米亚双尾狮；手工打制的不规则币缘
import * as THREE from 'three';
import { makeCanvas, mulberry32, speckle } from './canvasTex.js';

export const COIN_R = 0.66;
export const COIN_H = 0.1;
const S = 256;
const C = S / 2;

const METALS = {
  silver: { base: '#c9c4b8', dark: '#6e6a62', light: '#f2eee4', edge: '#a8a398' },
  gold: { base: '#e2b452', dark: '#8a5e1c', light: '#fff0b8', edge: '#c8963a' },
};

// 沿圆周写字（顺时针，字头朝外）
function ringText(ctx, text, radius, size, start = -Math.PI / 2) {
  ctx.save();
  ctx.font = `bold ${size}px "Times New Roman", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const step = (Math.PI * 2) / (chars.length + 1);
  chars.forEach((ch, i) => {
    const a = start + (i + 1) * step;
    ctx.save();
    ctx.translate(C + Math.cos(a) * radius, C + Math.sin(a) * radius);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function dotRing(ctx, radius, n, r) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(C + Math.cos(a) * radius, C + Math.sin(a) * radius, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrown(ctx, s) {
  ctx.save();
  ctx.translate(C, C + 4);
  ctx.scale(s, s);
  ctx.beginPath();
  // 王冠：三朵百合尖 + 冠圈
  ctx.moveTo(-34, 18);
  ctx.lineTo(-38, -8);
  ctx.lineTo(-24, 2);
  ctx.lineTo(-18, -22);
  ctx.lineTo(-8, 0);
  ctx.lineTo(0, -30);
  ctx.lineTo(8, 0);
  ctx.lineTo(18, -22);
  ctx.lineTo(24, 2);
  ctx.lineTo(38, -8);
  ctx.lineTo(34, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-36, 20, 72, 9);
  for (const [x, y, r] of [[-38, -12, 4], [-18, -26, 4], [0, -35, 5], [18, -26, 4], [38, -12, 4]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 简化的立狮：头朝左、前爪扬起、双尾上翘，头戴小冠
function drawLion(ctx, s) {
  ctx.save();
  ctx.translate(C, C + 2);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 身体
  ctx.beginPath();
  ctx.ellipse(2, -2, 20, 10, -0.95, 0, Math.PI * 2);
  ctx.fill();
  // 头与鬃毛
  ctx.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = i % 2 ? 9 : 13;
    const x = -14 + Math.cos(a) * r;
    const y = -27 + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-22, -28);
  ctx.lineTo(-31, -24);
  ctx.lineTo(-22, -21);
  ctx.fill();
  // 小冠
  ctx.beginPath();
  ctx.moveTo(-21, -38);
  ctx.lineTo(-22, -47);
  ctx.lineTo(-17, -42);
  ctx.lineTo(-14, -49);
  ctx.lineTo(-11, -42);
  ctx.lineTo(-6, -47);
  ctx.lineTo(-7, -38);
  ctx.closePath();
  ctx.fill();
  // 四肢
  const limb = (pts, w) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  limb([[-8, -14], [-24, -16], [-32, -8]], 6);
  limb([[-6, -8], [-20, -4], [-26, 4]], 6);
  limb([[12, 8], [6, 22], [0, 34]], 7);
  limb([[16, 6], [22, 20], [18, 34]], 7);
  limb([[-6, 34], [4, 34]], 4);
  limb([[14, 35], [24, 35]], 4);
  // 双尾
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(18, 10);
  ctx.bezierCurveTo(36, 6, 30, -18, 40, -26);
  ctx.moveTo(19, 12);
  ctx.bezierCurveTo(42, 12, 40, -12, 48, -16);
  ctx.stroke();
  for (const [x, y] of [[40, -27], [48, -17]]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 画一个面：颜色贴图 + 凹凸贴图
function coinFace(side, metal, seed) {
  const m = METALS[metal];
  const rnd = mulberry32(seed);
  const col = makeCanvas(S);
  const bump = makeCanvas(S);
  const c = col.getContext('2d');
  const b = bump.getContext('2d');
  const g = c.createRadialGradient(C * 0.8, C * 0.75, 10, C, C, C);
  g.addColorStop(0, m.light);
  g.addColorStop(0.55, m.base);
  g.addColorStop(1, m.edge);
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  b.fillStyle = '#7a7a7a';
  b.fillRect(0, 0, S, S);
  // 打制留下的凹痕与锈色
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 4 + rnd() * 16;
    const gg = c.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, `rgba(60,50,30,${0.08 + rnd() * 0.1})`);
    gg.addColorStop(1, 'rgba(60,50,30,0)');
    c.fillStyle = gg;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 浮雕内容：在凹凸图上画亮色，在颜色图上画高光、四周压暗
  const relief = (fn) => {
    b.save();
    b.fillStyle = '#e8e8e8';
    b.strokeStyle = '#e8e8e8';
    fn(b);
    b.restore();
    c.save();
    c.shadowColor = 'rgba(30,20,8,0.55)';
    c.shadowBlur = 3;
    c.shadowOffsetX = 1;
    c.shadowOffsetY = 1.5;
    c.fillStyle = m.light;
    c.strokeStyle = m.light;
    fn(c);
    c.restore();
  };
  relief((ctx) => {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(C, C, 121, 0, Math.PI * 2);
    ctx.stroke();
    dotRing(ctx, 112, 64, 2.2);
  });
  if (side === 'crown') {
    relief((ctx) => {
      ringText(ctx, '+DEI·GRATIA·REX·BOEMIE', 97, 17);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(C, C, 84, 0, Math.PI * 2);
      ctx.stroke();
      ringText(ctx, '+WENCEZLAVS·SECVNDVS', 71, 13);
      ctx.beginPath();
      ctx.arc(C, C, 60, 0, Math.PI * 2);
      ctx.stroke();
      drawCrown(ctx, 1.05);
    });
  } else {
    relief((ctx) => {
      ringText(ctx, '+GROSSI·PRAGENSES', 97, 18);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(C, C, 84, 0, Math.PI * 2);
      ctx.stroke();
      drawLion(ctx, 1.3);
    });
  }
  speckle(c, S, S, rnd, 900, '#3a3020', 1.2, 0.25);
  speckle(b, S, S, rnd, 900, '#000000', 1.2, 0.25);
  return { col, bump };
}

const matCache = {};
function faceMat(side, metal) {
  const key = side + metal;
  if (matCache[key]) return matCache[key];
  const { col, bump } = coinFace(side, metal, side === 'crown' ? 3 : 7);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bump);
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 3, metalness: 0.88, roughness: 0.34, envMapIntensity: 2.3 });
  matCache[key] = mat;
  return mat;
}
function edgeMat(metal) {
  const key = 'edge' + metal;
  if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial({ color: METALS[metal].edge, metalness: 0.9, roughness: 0.42, envMapIntensity: 2.3 });
  return matCache[key];
}

// 几种略有不同的不规则外形（手工打制）
const geoCache = [];
function coinGeometry(variant) {
  if (geoCache[variant]) return geoCache[variant];
  const g = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, 40, 1);
  const pos = g.attributes.position;
  const rnd = mulberry32(100 + variant);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.035 * Math.sin(a * 3 + ph[0]) + 0.02 * Math.sin(a * 5 + ph[1]) + 0.012 * Math.sin(a * 9 + ph[2]);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  geoCache[variant] = g;
  return g;
}

export function makeCoin(metal = 'silver', variant = 0) {
  const mesh = new THREE.Mesh(coinGeometry(variant % 4), [edgeMat(metal), faceMat('crown', metal), faceMat('lion', metal)]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// 一摞硬币（略微错位，最上面那枚随机正反）
export function coinStack(n, metal, seed = 1) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    const c = makeCoin(metal, Math.floor(rnd() * 4));
    x += (rnd() - 0.5) * 0.09;
    z += (rnd() - 0.5) * 0.09;
    c.position.set(x, COIN_H / 2 + i * COIN_H * 1.02, z);
    c.rotation.y = rnd() * Math.PI * 2;
    c.rotation.x = (rnd() - 0.5) * 0.04 + (i === n - 1 && rnd() < 0.5 ? Math.PI : 0);
    g.add(c);
  }
  return g;
}

// 皮钱袋（收口系绳），旁边散落几枚硬币
export function coinPurse(seed = 1) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: '#6a4024', roughness: 0.7 });
  const pts = [[0, 0], [0.9, 0.08], [1.25, 0.5], [1.3, 1.0], [1.05, 1.5], [0.55, 1.85], [0.4, 2.0], [0.62, 2.35], [0.55, 2.5], [0, 2.45]].map(([a, b2]) => new THREE.Vector2(a, b2));
  const bag = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), leather);
  bag.scale.set(1, 1, 0.85);
  bag.castShadow = true;
  bag.receiveShadow = true;
  g.add(bag);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.07, 6, 16), new THREE.MeshStandardMaterial({ color: '#c8a870', roughness: 0.9 }));
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 1.95;
  g.add(tie);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), tie.material);
  string.position.set(0.55, 1.6, 0.3);
  string.rotation.z = 0.9;
  g.add(string);
  for (let i = 0; i < 3; i++) {
    const c = makeCoin(rnd() < 0.5 ? 'silver' : 'gold', i);
    c.position.set(1.6 + rnd() * 0.8, COIN_H / 2, (rnd() - 0.5) * 1.4);
    c.rotation.y = rnd() * 6;
    if (rnd() < 0.5) c.rotation.x = Math.PI;
    g.add(c);
  }
  return g;
}
