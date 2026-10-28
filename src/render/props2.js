// 第二批道具（v2 酒馆）：厚木桌、哥特拱板吧台、圆凳、酒架、黑板、鹿头、盾牌、狮子旗、拱窗、地毯、毛皮、吊锅、灯笼、壁烛台
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { plank, antlers } from './props.js';
import { drawLion } from './coins.js';
import { makeCanvas, mulberry32 } from './canvasTex.js';
import { rugCanvas, tex } from './ptex.js';
import { createCandle } from './fire.js';
import { furShellMats } from './char.js';
import { addShells } from './charBody.js';

const at = (o, x, y, z) => {
  o.position.set(x, y, z);
  return o;
};
const shadowed = (g) => {
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
};

// ---------- 厚木桌：三块厚板拼的桌面 + 方腿 + 横档 ----------
export function heavyTable({ length = 52, width = 32, height = 37, mats, seed = 1 }) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const n = 3;
  const bw = width / n;
  for (let i = 0; i < n; i++) {
    const p = plank(length + (rnd() - 0.5) * 1.2, 3.2, bw - 0.35, mats.top, 0.5);
    p.position.set((rnd() - 0.5) * 0.8, height - 1.6 + (rnd() - 0.5) * 0.25, -width / 2 + bw * (i + 0.5));
    p.rotation.z = (rnd() - 0.5) * 0.006;
    g.add(p);
  }
  const lx = length / 2 - 5;
  const lz = width / 2 - 4.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(at(plank(4.6, height - 3.2, 4.6, mats.frame, 0.6), sx * lx, (height - 3.2) / 2, sz * lz));
    }
    g.add(at(plank(3.2, 4.2, width - 9, mats.frame, 0.4), sx * lx, height - 5.4, 0));
    g.add(at(plank(3, 3, width - 9, mats.frame, 0.4), sx * lx, 7, 0));
  }
  for (const sz of [-1, 1]) g.add(at(plank(length - 10, 4.2, 3.2, mats.frame, 0.4), 0, height - 5.4, sz * lz));
  g.add(at(plank(length - 10, 3, 3, mats.frame, 0.4), 0, 7, 0));
  return shadowed(g);
}

// ---------- 长凳（比 props.bench 更粗壮） ----------
export function heavyBench({ length = 40, height = 22, mats }) {
  const g = new THREE.Group();
  g.add(at(plank(length, 3, 10, mats.top, 0.5), 0, height - 1.5, 0));
  for (const s of [-1, 1]) {
    const leg = plank(3.4, height - 3, 8, mats.frame, 0.5);
    leg.position.set(s * (length / 2 - 4), (height - 3) / 2, 0);
    g.add(leg);
  }
  g.add(at(plank(length - 8, 2.4, 2.4, mats.frame, 0.3), 0, 5, 0));
  return shadowed(g);
}

// ---------- 圆凳 ----------
export function roundStool({ height = 22, r = 6.2, mats, seed = 1 }) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 2.6, 28), mats.top);
  seat.position.y = height - 1.3;
  g.add(seat);
  const legs = 3 + (rnd() < 0.5 ? 1 : 0);
  const a0 = rnd() * 6;
  for (let i = 0; i < legs; i++) {
    const a = a0 + (i / legs) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, height, 10), mats.frame);
    const top = new THREE.Vector3(Math.cos(a) * r * 0.55, height - 2.4, Math.sin(a) * r * 0.55);
    const bot = new THREE.Vector3(Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95);
    leg.position.copy(top).add(bot).multiplyScalar(0.5);
    leg.lookAt(top);
    leg.rotateX(Math.PI / 2);
    g.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, 0.45, 6, 24), mats.frame);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = height * 0.32;
  g.add(ring);
  return shadowed(g);
}

// ---------- 吧台：沿 z 方向，正面一格格带尖拱的雕花板，台面厚木板外挑 ----------
export function barCounter({ length = 100, height = 50, depth = 18, mats }) {
  const g = new THREE.Group();
  // 正面朝 +x：框架、竖档、尖拱镶板
  const panels = Math.round(length / 16);
  const pw = length / panels;
  g.add(at(plank(2, height - 4, length, mats.frame, 0.4), depth / 2 - 1, (height - 4) / 2, 0));
  for (let i = 0; i <= panels; i++) g.add(at(plank(2.2, height - 4, 2.4, mats.frame, 0.5), depth / 2 + 0.6, (height - 4) / 2, -length / 2 + i * pw));
  for (const y of [4, height - 7]) g.add(at(plank(2.4, 2.6, length, mats.frame, 0.5), depth / 2 + 0.7, y, 0));
  // 尖拱板：挤出的形状，嵌在每一格里
  const arch = new THREE.Shape();
  const w = pw - 5;
  const h = height - 17;
  arch.moveTo(-w / 2, 0);
  arch.lineTo(-w / 2, h * 0.68);
  arch.quadraticCurveTo(-w / 2, h * 0.92, 0, h);
  arch.quadraticCurveTo(w / 2, h * 0.92, w / 2, h * 0.68);
  arch.lineTo(w / 2, 0);
  arch.closePath();
  const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 2 });
  ag.rotateY(Math.PI / 2);
  for (let i = 0; i < panels; i++) {
    const m = new THREE.Mesh(ag, mats.door);
    m.position.set(depth / 2 + 0.3, 7, -length / 2 + pw * (i + 0.5));
    g.add(m);
  }
  // 台面 + 后侧的工作台
  g.add(at(plank(depth + 6, 3.4, length + 4, mats.top, 0.6), 1.5, height - 1.7, 0));
  g.add(at(plank(depth - 6, 2, length - 4, mats.frame, 0.3), -3, height * 0.55, 0));
  g.add(at(plank(2, height - 4, length, mats.frame, 0.4), -depth / 2 + 1, (height - 4) / 2, 0));
  // 脚踏横杆
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, length - 4, 10), mats.iron);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(depth / 2 + 5, 6, 0);
  g.add(rail);
  for (let z = -length / 2 + 8; z <= length / 2 - 8; z += 24) g.add(at(plank(5, 1, 1, mats.iron, 0.1), depth / 2 + 3, 6, z));
  return shadowed(g);
}

// ---------- 墙上的搁板（带两个托架） ----------
export function wallShelf({ length = 40, depth = 8, mats }) {
  const g = new THREE.Group();
  g.add(at(plank(depth, 1.8, length, mats.frame, 0.3), depth / 2, 0, 0));
  for (const z of [-length / 2 + 4, length / 2 - 4]) {
    const br = new THREE.Shape();
    br.moveTo(0, 0);
    br.lineTo(depth - 1, 0);
    br.quadraticCurveTo(1.5, -1.5, 0, -depth + 1);
    br.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(br, { depth: 1.4, bevelEnabled: false }), mats.frame);
    m.position.set(0, -0.9, z - 0.7);
    g.add(m);
  }
  return shadowed(g);
}

// ---------- 黑板：木框 + 粉笔字 ----------
export function chalkboard({ lines = ['亨利广场', 'Good Ale · Fair Dice', 'Warm Hearth'], w = 34, h = 24, mats }) {
  const c = makeCanvas(1024, 720);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(5);
  ctx.fillStyle = '#1e2420';
  ctx.fillRect(0, 0, 1024, 720);
  // 擦过的粉笔灰
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(220,225,215,${0.015 + rnd() * 0.03})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 1024, rnd() * 720, 40 + rnd() * 160, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240,238,228,0.9)';
  ctx.font = '700 120px "Noto Serif SC", "Songti SC", serif';
  ctx.fillText(lines[0], 512, 190);
  ctx.font = 'italic 76px "IM Fell English", Georgia, serif';
  ctx.fillText(lines[1], 512, 380);
  ctx.fillText(lines[2], 512, 500);
  // 小花饰
  ctx.strokeStyle = 'rgba(240,238,228,0.75)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(260, 600);
  ctx.bezierCurveTo(400, 560, 420, 650, 512, 600);
  ctx.bezierCurveTo(604, 550, 624, 640, 764, 600);
  ctx.stroke();
  // 粉笔的颗粒感：随机擦掉一些像素
  const img = ctx.getImageData(0, 0, 1024, 720);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] > 120 && rnd() < 0.35) {
      const k = 0.45 + rnd() * 0.3;
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  board.position.z = 0.6;
  g.add(board);
  for (const [x, y, ww, hh] of [[0, h / 2 + 1, w + 4, 2.2], [0, -h / 2 - 1, w + 4, 2.2], [-w / 2 - 1, 0, 2.2, h + 4], [w / 2 + 1, 0, 2.2, h + 4]]) g.add(at(plank(ww, hh, 1.8, mats.frame, 0.3), x, y, 0.6));
  return shadowed(g);
}

// ---------- 鹿头标本：木盾底板 + 脖子 + 头 + 鹿角，头和脖子带短毛 ----------
export function stagHead(mats, { fur = false } = {}) {
  const g = new THREE.Group();
  // 底板（盾形）
  const sh = new THREE.Shape();
  sh.moveTo(-9, 10);
  sh.lineTo(9, 10);
  sh.quadraticCurveTo(10, -4, 0, -13);
  sh.quadraticCurveTo(-10, -4, -9, 10);
  const plaque = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.8, bevelSegments: 2 }), mats.plaque);
  g.add(plaque);
  // 脖子 + 头：一串截面放样
  const coat = new THREE.MeshStandardMaterial({ color: '#4e3622', roughness: 0.85 });
  // 鹿头：宽脑门、往下收的长吻（竖向比横向厚），整体微微低头
  const pts = [
    [0, -2, 3, 6.4, 7.2],
    [0, -0.5, 7, 5.6, 6.4],
    [0, 1.2, 10.5, 4.8, 5.4],
    [0, 2.8, 13.5, 4.4, 4.8],
    [0, 3.2, 16, 4.0, 4.4],
    [0, 2.2, 18.5, 3.0, 3.8],
    [0, 0.8, 21, 2.3, 3.0],
    [0, -0.6, 23.2, 1.9, 2.4],
    [0, -1.4, 24.6, 1.5, 1.8],
    [0, -1.8, 25.3, 0.9, 1.1],
  ];
  const geo = loftPath(pts);
  const neck = new THREE.Mesh(geo, coat);
  g.add(neck);
  if (fur) {
    const fm = furShellMats('stag', { size: 128, seed: 91, pattern: 'mottled', c1: '#8a6844', c2: '#5a3e24', c3: '#c0a07a', repeat: [1.2, 1.2], layers: 6, density: 0.9 });
    neck.material = fm.base;
    addShells(g, geo, fm.shells, 0.35);
  }
  // 鼻子、眼睛、耳朵
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.3 }));
  nose.position.set(0, -1.7, 25.5);
  g.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshStandardMaterial({ color: '#0e0a08', roughness: 0.1, metalness: 0.2 }));
    eye.position.set(s * 3.85, 3.6, 16.4);
    g.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.7), coat);
    ear.scale.set(1.2, 3.2, 0.6);
    ear.position.set(s * 4.4, 6.4, 12.6);
    ear.rotation.set(-0.5, 0, s * -1.0);
    g.add(ear);
  }
  // 鹿角
  // 鹿角是浅褐色的，尖端才发白
  const antlerMat = new THREE.MeshStandardMaterial({ color: '#a88d66', roughness: 0.75 });
  const ant = antlers({ plaque: mats.plaque, bone: antlerMat });
  ant.traverse((o) => {
    if (o.isMesh && o.material === mats.plaque) o.visible = false;
  });
  ant.position.set(0, 6.6, 13.2);
  ant.scale.setScalar(1.3);
  g.add(ant);
  return shadowed(g);
}
// 沿 z 的放样（截面是椭圆）：[x, y, z, 半宽, 半高]
function loftPath(pts, segs = 18) {
  const pos = [];
  const uv = [];
  const idx = [];
  pts.forEach(([x, y, z, rx, ry], k) => {
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry, z);
      uv.push(j / segs * 3, k / pts.length * 3);
      if (k && j < segs) {
        const a0 = (k - 1) * (segs + 1) + j;
        const a1 = k * (segs + 1) + j;
        idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 法线朝外
  const p0 = new THREE.Vector3().fromBufferAttribute(g.attributes.position, segs + 1);
  const n0 = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, segs + 1);
  if (n0.dot(p0.sub(new THREE.Vector3(pts[1][0], pts[1][1], pts[1][2]))) < 0) {
    const ix = g.index.array;
    for (let t = 0; t < ix.length; t += 3) [ix[t + 1], ix[t + 2]] = [ix[t + 2], ix[t + 1]];
    g.computeVertexNormals();
  }
  return g;
}

// ---------- 鸢形盾：画好的盾面 + 铁边 ----------
export function heaterShield({ field = '#1e3a6a', charge = '#d8b050', w = 22, h = 28, mats }) {
  const c = makeCanvas(512, 640);
  const ctx = c.getContext('2d');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, 512, 640);
  // 斜带 + 三颗骰点（亨利广场的纹章）
  ctx.save();
  ctx.translate(256, 300);
  ctx.rotate(-0.62);
  ctx.fillStyle = charge;
  ctx.fillRect(-420, -46, 840, 92);
  ctx.restore();
  ctx.fillStyle = charge;
  for (const [x, y] of [[150, 170], [362, 430], [380, 160]]) {
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  const rnd = mulberry32(17);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
    ctx.fillRect(rnd() * 512, rnd() * 640, 2 + rnd() * 6, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, h / 2);
  sh.lineTo(w / 2, h / 2);
  sh.lineTo(w / 2, h * 0.05);
  sh.quadraticCurveTo(w / 2, -h * 0.32, 0, -h / 2);
  sh.quadraticCurveTo(-w / 2, -h * 0.32, -w / 2, h * 0.05);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.7, bevelSegments: 2 });
  // UV 按盾面范围重新算
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.05 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, [face, mats.iron]));
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sh.getSpacedPoints(60).map((q) => new THREE.Vector3(q.x, q.y, 1.9)), true), 80, 0.55, 6, true), mats.iron);
  g.add(rim);
  return shadowed(g);
}

// ---------- 狮子旗：布面轻微起伏、底边燕尾、流苏 ----------
export function lionBanner({ field = '#7a1a18', gold = '#d8a844', w = 20, h = 40 } = {}) {
  const c = makeCanvas(400, 800);
  const ctx = c.getContext('2d');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, 400, 800);
  const rnd = mulberry32(31);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,220,200'},${rnd() * 0.05})`;
    ctx.fillRect(0, rnd() * 800, 400, 1 + rnd() * 3);
  }
  ctx.strokeStyle = gold;
  ctx.lineWidth = 10;
  ctx.strokeRect(22, 22, 356, 690);
  ctx.fillStyle = gold;
  ctx.strokeStyle = gold;
  drawLion(ctx, 3.6, 205, 380);
  // 燕尾
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, 800);
  ctx.lineTo(200, 700);
  ctx.lineTo(400, 800);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(w, h, 10, 20);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, Math.sin(x * 0.45 + y * 0.08) * 0.6 * (0.5 - y / h) + Math.sin(y * 0.3) * 0.2);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5, roughness: 0.95 }));
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, w + 4, 10), new THREE.MeshStandardMaterial({ color: '#b48a3e', metalness: 1, roughness: 0.35 }));
  pole.rotation.z = Math.PI / 2;
  pole.position.y = h / 2 + 0.6;
  g.add(pole);
  for (const s of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), pole.material);
    knob.position.set(s * (w / 2 + 2.3), h / 2 + 0.6, 0);
    g.add(knob);
  }
  return g;
}

// ---------- 地毯 ----------
export function rug({ w = 90, d = 58, seed = 81, field = '#7c1c1a' } = {}) {
  const t = new THREE.CanvasTexture(rugCanvas({ w: 1024, h: 660, seed, field }));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1, transparent: true, alphaTest: 0.5 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

// ---------- 毛皮：不规则的一张，搭在凳子 / 长凳上（下垂两边） ----------
export function furPelt({ w = 26, d = 16, drop = 7, seed = 5, c1 = '#8a7a64', c2 = '#4a3c2c', c3 = '#c8b89a', layers = 10 } = {}) {
  const rnd = mulberry32(seed);
  const geo = new THREE.PlaneGeometry(w, d + drop * 2, 24, 18);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // 中间平搭在凳面上，两侧往下垂
    const over = Math.max(0, Math.abs(y) - d / 2);
    // 平面的 y 变成水平的 -z（这样正面朝上，毛往上长），垂下的部分变成高度
    p.setXYZ(i, x * (1 - over * 0.02) + (rnd() - 0.5) * 0.4, -over * 0.95 - (Math.abs(x) / w) * 0.6, -(y - Math.sign(y) * over * 0.75));
  }
  geo.computeVertexNormals();
  const fm = furShellMats('pelt' + c1, { size: 128, seed: 93 + seed, pattern: 'mottled', c1, c2, c3, repeat: [1.4, 1.4], layers, density: 0.82 });
  const g = new THREE.Group();
  const base = new THREE.Mesh(geo, fm.base);
  base.receiveShadow = true;
  g.add(base);
  addShells(g, geo, fm.shells, 1.3);
  return g;
}

// ---------- 吊锅：铁链 + 铸铁锅 ----------
export function cauldron(mats, { r = 7, chain = 18 } = {}) {
  const g = new THREE.Group();
  const pts = [[0, 0], [r * 0.55, 0.3], [r * 0.92, r * 0.35], [r, r * 0.75], [r * 0.9, r * 1.05], [r * 0.95, r * 1.12], [r * 0.88, r * 1.12]].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mats.ironDark);
  g.add(pot);
  const soup = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 24), new THREE.MeshStandardMaterial({ color: '#5a3a1a', roughness: 0.35 }));
  soup.rotation.x = -Math.PI / 2;
  soup.position.y = r * 0.95;
  g.add(soup);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.3, 6, 24, Math.PI), mats.ironDark);
  bail.position.y = r * 1.1;
  g.add(bail);
  for (let i = 0; i < chain; i += 1.6) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 5, 10), mats.ironDark);
    link.position.y = r * 2.05 + i;
    link.rotation.y = (i / 1.6) % 2 ? Math.PI / 2 : 0;
    g.add(link);
  }
  return shadowed(g);
}

// ---------- 吊灯笼（铁框 + 玻璃 + 蜡烛） ----------
export function hangingLantern(mats, updaters, { chain = 16 } = {}) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 1.6, transparent: true, opacity: 0.55, roughness: 0.2 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 6, 6, 1, true), glass));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(at(plank(0.35, 6.6, 0.35, mats.ironDark, 0.05), Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
  }
  const capTop = new THREE.Mesh(new THREE.ConeGeometry(3.3, 2.6, 6), mats.ironDark);
  capTop.position.y = 4.3;
  g.add(capTop);
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.6, 6), mats.ironDark), 0, -3.2, 0));
  const cnd = createCandle({ height: 2.6, radius: 0.55, seed: 7, flameScale: 1.1 });
  cnd.position.y = -2.8;
  g.add(cnd);
  updaters.push((dt, t, cam) => cnd.userData.update(dt, t, cam));
  for (let i = 0; i < chain; i += 1.4) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.13, 5, 8), mats.ironDark);
    link.position.y = 6 + i;
    link.rotation.y = (i / 1.4) % 2 ? Math.PI / 2 : 0;
    g.add(link);
  }
  return g;
}

// ---------- 壁烛台：铁托 + 蜡烛（返回组和光源挂点） ----------
export function wallSconce(mats, updaters, seed = 1) {
  const g = new THREE.Group();
  g.add(at(plank(3.4, 8, 0.6, mats.ironDark, 0.2), 0, 0, 0.3));
  g.add(at(plank(0.6, 0.6, 5.6, mats.ironDark, 0.1), 0, -1.2, 3.1));
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.9, 1, 12), mats.ironDark);
  cup.position.set(0, -0.6, 5.6);
  g.add(cup);
  const drip = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.7, 12), new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.6 }));
  drip.position.set(0, -0.05, 5.6);
  g.add(drip);
  const cnd = createCandle({ height: 4.2, radius: 0.7, seed, flameScale: 1.3 });
  cnd.position.set(0, 0.2, 5.6);
  g.add(cnd);
  updaters.push((dt, t, cam) => cnd.userData.update(dt, t, cam));
  return g;
}

// ---------- 拱窗：石砌窗洞 + 菱形铅条玻璃（冷色天光） ----------
export function leadedGlassTexture() {
  const c = makeCanvas(512, 1024);
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#9fb6d2');
  grd.addColorStop(0.6, '#c2c8cc');
  grd.addColorStop(1, '#e0c49a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 1024);
  const rnd = mulberry32(3);
  // 每块玻璃颜色略有不同、中间有气泡
  const s = 64;
  for (let y = -s; y < 1024 + s; y += s) {
    for (let x = -s; x < 512 + s; x += s) {
      const cx = x + ((y / s) % 2 ? s / 2 : 0);
      ctx.fillStyle = `rgba(${200 + rnd() * 40},${205 + rnd() * 40},${215 + rnd() * 30},${0.12 + rnd() * 0.18})`;
      ctx.beginPath();
      ctx.moveTo(cx, y - s / 2);
      ctx.lineTo(cx + s / 2, y);
      ctx.lineTo(cx, y + s / 2);
      ctx.lineTo(cx - s / 2, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#2a2a2c';
  ctx.lineWidth = 6;
  for (let k = -16; k <= 24; k++) {
    ctx.beginPath();
    ctx.moveTo(k * s, 0);
    ctx.lineTo(k * s + 1024, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k * s, 0);
    ctx.lineTo(k * s - 1024, 1024);
    ctx.stroke();
  }
  // 横向的铁条
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1e1e20';
  for (const y of [340, 680]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function archWindow({ w = 38, h = 66, depth = 14, stone }) {
  const g = new THREE.Group();
  // 玻璃（尖拱形）
  const arch = new THREE.Shape();
  arch.moveTo(-w / 2, 0);
  arch.lineTo(-w / 2, h - w * 0.55);
  arch.quadraticCurveTo(-w / 2, h - w * 0.08, 0, h);
  arch.quadraticCurveTo(w / 2, h - w * 0.08, w / 2, h - w * 0.55);
  arch.lineTo(w / 2, 0);
  arch.closePath();
  const gg = new THREE.ShapeGeometry(arch, 24);
  const p = gg.attributes.position;
  const uv = gg.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, p.getY(i) / h);
  const glassMat = new THREE.MeshStandardMaterial({ map: leadedGlassTexture(), emissiveMap: null, emissive: new THREE.Color('#9db4d6'), emissiveIntensity: 0.0, roughness: 0.3 });
  glassMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 1.8;');
  };
  const glass = new THREE.Mesh(gg, glassMat);
  glass.position.z = -depth + 1;
  g.add(glass);
  // 窗洞侧壁：沿拱形轮廓挤出的一圈石头
  const outline = arch.getSpacedPoints(70);
  const pos = [];
  const uvs = [];
  const idx = [];
  outline.forEach((q, i) => {
    pos.push(q.x, q.y, 0, q.x, q.y, -depth);
    uvs.push(i / 10, 0, i / 10, depth / 30);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const reveal = new THREE.Mesh(rg, stone.clone());
  reveal.material.side = THREE.DoubleSide;
  reveal.receiveShadow = true;
  g.add(reveal);
  // 窗台
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w + 8, 3, depth + 5), stone), 0, -1.5, -depth / 2 + 2.5));
  // 窗框外沿一圈石线脚
  const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch.getSpacedPoints(60).filter((q) => q.y > 0.5).map((q) => new THREE.Vector3(q.x * 1.06, q.y * 1.02 + 0.4, 0.6))), 80, 1.6, 8, false), stone);
  g.add(frame);
  return shadowed(g);
}

// ---------- 设定图里的搁架长桌：厚板桌面 + 两端“H”形桌腿（立柱、托木、宽脚）+ 下方贯穿的长横撑 ----------
export function trestleTable({ length = 54, width = 34, height = 37.7, mats, seed = 1 }) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const n = 4;
  const bw = width / n;
  for (let i = 0; i < n; i++) {
    const p = plank(length + (rnd() - 0.5) * 1.4, 3.2, bw - 0.4, mats.top, 0.55);
    p.position.set((rnd() - 0.5) * 0.9, height - 1.6 - rnd() * 0.12, -width / 2 + bw * (i + 0.5));
    g.add(p);
  }
  const ex = length / 2 - 8;
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    g.add(at(plank(4, 3.4, width - 3, mats.frame, 0.6), x, height - 4.9, 0)); // 桌面下的托木
    g.add(at(plank(5.5, 3.6, width - 4, mats.frame, 0.8), x, 1.8, 0)); // 宽脚
    for (const sz of [-1, 1]) g.add(at(plank(4.2, height - 10, 4.2, mats.frame, 0.6), x, (height - 6.6) / 2 + 1.7, sz * (width / 2 - 7.5)));
  }
  // 长横撑穿过两端，外面露出木楔
  g.add(at(plank(length - 8, 3.2, 3.2, mats.frame, 0.5), 0, 6.5, 0));
  for (const sx of [-1, 1]) g.add(at(plank(1.2, 4.6, 2.2, mats.top, 0.2), sx * (ex + 4.2), 6.5, 0));
  return shadowed(g);
}

// ---------- 设定图里的靠背椅：四条腿、横档，靠背是两根高立柱 + 上下横档 + 四根竖板 ----------
export function ladderChair({ height = 22, mats }) {
  const g = new THREE.Group();
  const sw = 15;
  const sd = 14;
  g.add(at(plank(sw, 2, sd, mats.top, 0.4), 0, height - 1, 0));
  for (const sx of [-1, 1]) {
    g.add(at(plank(2.2, height - 1.5, 2.2, mats.frame, 0.4), sx * (sw / 2 - 1.4), (height - 1.5) / 2, sd / 2 - 1.4));
    g.add(at(plank(2.4, height + 22, 2.4, mats.frame, 0.4), sx * (sw / 2 - 1.4), (height + 22) / 2, -sd / 2 + 1.4));
    g.add(at(plank(1.4, 1.4, sd - 2, mats.frame, 0.2), sx * (sw / 2 - 1.4), 7, 0));
  }
  g.add(at(plank(sw - 2, 1.4, 1.4, mats.frame, 0.2), 0, 8.5, sd / 2 - 1.4));
  const zb = -sd / 2 + 1.4;
  g.add(at(plank(sw - 1, 3.4, 1.8, mats.frame, 0.4), 0, height + 20, zb));
  g.add(at(plank(sw - 2, 2.2, 1.6, mats.frame, 0.3), 0, height + 6, zb));
  for (let i = 0; i < 4; i++) g.add(at(plank(1.8, 13, 1, mats.top, 0.2), -4.5 + i * 3, height + 12.8, zb));
  return shadowed(g);
}

// ---------- 食物拼盘：圆木盘上一只烤鸡、面包、奶酪、苹果 ----------
export function foodPlatter(mats, scale = 1, seed = 1) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const board = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.4, 0.8, 32), mats.top);
  board.position.y = 0.4;
  g.add(board);
  const roast = new THREE.MeshStandardMaterial({ color: '#8a4a1e', roughness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: '#5a2a10', roughness: 0.45 });
  const chicken = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), roast);
  body.scale.set(1.25, 0.8, 1);
  chicken.add(body);
  const breast = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 10), roast);
  breast.position.set(0.9, 0.8, 0);
  breast.scale.set(1.2, 0.8, 1.3);
  chicken.add(breast);
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 10), dark);
    thigh.position.set(-1.2, 0.4, s * 1.9);
    thigh.scale.set(1.3, 0.9, 1);
    chicken.add(thigh);
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 8), mats.bone);
    bone.position.set(-2.6, 1.0, s * 2.2);
    bone.rotation.z = 1.0;
    chicken.add(bone);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), dark);
    wing.position.set(1.4, 0.2, s * 2.1);
    wing.scale.set(1.4, 0.6, 0.8);
    chicken.add(wing);
  }
  chicken.position.set(0.4, 2.4, -0.6);
  chicken.rotation.y = 0.4;
  g.add(chicken);
  const bread = new THREE.Mesh(new THREE.SphereGeometry(2.0, 18, 12), new THREE.MeshStandardMaterial({ color: '#b07838', roughness: 0.75 }));
  bread.scale.set(1.5, 0.75, 1);
  bread.position.set(-3.4, 1.7, 2.6);
  bread.rotation.y = 0.6;
  g.add(bread);
  const cheeseM = new THREE.MeshStandardMaterial({ color: '#e8c060', roughness: 0.55 });
  for (let i = 0; i < 2; i++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.4, 3, 1, false, 0, Math.PI * 0.45), cheeseM);
    w.position.set(3.6 + i * 0.6, 1.5, 2.8 - i * 1.8);
    w.rotation.y = rnd() * 3;
    g.add(w);
  }
  for (const [x, z, c] of [[-4.6, -2.2, '#a8321e'], [-3.6, -3.8, '#8a9a2a'], [4.4, -3.4, '#b83a24']]) {
    const a = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
    a.position.set(x, 1.85, z);
    a.scale.y = 0.9;
    g.add(a);
  }
  g.scale.setScalar(scale);
  return shadowed(g);
}

// ---------- 骰子与皮袋：抽绳皮袋 + 撒出来的三颗骰子 ----------
export function dicePouch() {
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: '#5a3418', roughness: 0.6 });
  const pts = [[0.01, 0], [1.6, 0.15], [2.5, 1.1], [2.6, 2.4], [2.0, 3.4], [0.9, 3.9], [0.75, 4.3], [1.1, 4.9], [0.4, 5.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const bag = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), leather);
  bag.scale.set(1, 0.85, 0.9);
  bag.rotation.z = 0.35;
  g.add(bag);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 6, 16), new THREE.MeshStandardMaterial({ color: '#c8b48a', roughness: 0.9 }));
  cord.position.set(-1.25, 3.55, 0);
  cord.rotation.set(Math.PI / 2, 0.35, 0);
  g.add(cord);
  const dieMat = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.45 });
  const pipMat = new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.6 });
  const layouts = [[[0, 0]], [[-0.28, -0.28], [0, 0], [0.28, 0.28]], [[-0.28, -0.28], [0.28, -0.28], [0, 0], [-0.28, 0.28], [0.28, 0.28]]];
  [[3.6, 1.0, 0.3], [4.6, -1.0, 1.1], [2.8, -2.4, 2.0]].forEach(([x, z, r], k) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), dieMat);
    d.position.set(x, 0.6, z);
    d.rotation.y = r;
    for (const [a, b] of layouts[k]) {
      const pip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 8), pipMat);
      pip.position.set(a, 0.6, b);
      d.add(pip);
    }
    g.add(d);
  });
  return shadowed(g);
}

// ---------- 柳条包着的酒瓶 ----------
let wickerTexCache = null;
function wickerTex() {
  if (wickerTexCache) return wickerTexCache;
  const c = makeCanvas(256, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a7a46';
  ctx.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 256; x += 16) {
      const off = (y / 8) % 2 ? 8 : 0;
      ctx.fillStyle = `rgb(${150 + ((x * 7) % 30)},${115 + ((y * 3) % 20)},60)`;
      ctx.beginPath();
      ctx.ellipse(x + off + 8, y + 4, 7.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,25,10,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  wickerTexCache = new THREE.CanvasTexture(c);
  wickerTexCache.colorSpace = THREE.SRGBColorSpace;
  wickerTexCache.wrapS = wickerTexCache.wrapT = THREE.RepeatWrapping;
  wickerTexCache.repeat.set(3, 2);
  return wickerTexCache;
}
export function wickerBottle(mats, scale = 1) {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2a4a24', roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.88 });
  const pts = [[0.01, 0], [2.0, 0.2], [2.6, 1.6], [2.6, 3.6], [2.1, 5.4], [0.9, 6.6], [0.7, 9.6], [0.85, 9.9], [0.7, 10.1], [0.01, 10.1]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), glass));
  const wpts = [[2.15, 0.05], [2.75, 1.6], [2.75, 3.6], [2.3, 5.1], [1.6, 5.9]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(wpts, 24), new THREE.MeshStandardMaterial({ map: wickerTex(), roughness: 0.95 })));
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 1.1, 10), new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 0.9 }));
  cork.position.y = 10.4;
  g.add(cork);
  g.scale.setScalar(scale);
  return shadowed(g);
}

// ---------- 设定图里的烛台：宽盘 + 短烛插 + 指环把手 ----------
export function dishCandle(mats, updaters, seed = 1) {
  const g = new THREE.Group();
  const metal = mats.brass || mats.ironDark;
  const pts = [[0.01, 0], [2.6, 0], [2.8, 0.25], [2.7, 0.55], [2.4, 0.45], [0.75, 0.5], [0.7, 1.8], [0.95, 1.95], [0.01, 1.95]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), metal));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.2, 8, 16), metal);
  ring.position.set(3.3, 0.6, 0);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const cnd = createCandle({ height: 4.5, radius: 0.62, seed, flameScale: 1.05 });
  cnd.position.y = 1.95;
  g.add(cnd);
  if (updaters) updaters.push((dt, t, cam) => cnd.userData.update(dt, t, cam));
  return shadowed(g);
}
