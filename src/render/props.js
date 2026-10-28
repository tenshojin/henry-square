// 酒馆道具（精细化版）：搁架桌、长凳、三脚凳、木杯/锡杯、陶罐、面包奶酪、烛台、酒桶与酒架、
// 木箱、麻袋、铁吊灯、壁炉用具、楼梯、带合页的木门、酒馆招牌
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCanvas, mulberry32, woodGrain, speckle, mottle } from './canvasTex.js';
import { createCandle } from './fire.js';

const geoCache = new Map();
// 带倒角的木板（比纯方块更像手工木件）
export function plank(w, h, d, mat, r = 0.35) {
  const key = [w, h, d, r].map((v) => v.toFixed(2)).join(',');
  let g = geoCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
    geoCache.set(key, g);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function at(obj, x, y, z, rx = 0, ry = 0, rz = 0) {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
}
function cyl(rt, rb, h, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- 家具 ----------
// 搁架桌：几块桌板拼成，两头是 X 形支架，中间一根横撑和木楔
export function trestleTable({ length = 44, width = 22, height = 37, mats, seed = 1 }) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const boards = width > 24 ? 4 : 3;
  const bw = width / boards;
  for (let i = 0; i < boards; i++) {
    const p = plank(length + (rnd() - 0.5) * 1.2, 2.6, bw - 0.25, mats.top, 0.45);
    at(p, (rnd() - 0.5) * 0.6, height - 1.3 + (rnd() - 0.5) * 0.08, -width / 2 + bw * (i + 0.5));
    g.add(p);
  }
  for (const sx of [-1, 1]) {
    const x = sx * (length / 2 - 6);
    g.add(at(plank(3, 2.4, width - 2, mats.frame, 0.3), x, height - 3.8, 0));
    const legLen = Math.hypot(height - 5, width * 0.62);
    const ang = Math.atan2(width * 0.62, height - 5);
    for (const s of [-1, 1]) g.add(at(plank(2.6, legLen, 3.2, mats.frame, 0.4), x, (height - 5) / 2 + 0.6, 0, s * ang));
    g.add(at(plank(3.4, 2.2, width * 0.75, mats.frame, 0.4), x, 1.1, 0));
  }
  g.add(at(plank(length - 10, 2.6, 2.6, mats.frame, 0.4), 0, height * 0.42, 0));
  for (const sx of [-1, 1]) g.add(at(plank(1.2, 4.2, 1.5, mats.frame, 0.2), sx * (length / 2 - 3.2), height * 0.42, 0));
  return g;
}

// 长凳：一块厚坐板 + 两块外斜的板腿 + 横撑
export function bench({ length = 40, height = 22, mats }) {
  const g = new THREE.Group();
  g.add(at(plank(length, 2.6, 9, mats.top, 0.45), 0, height - 1.3, 0));
  for (const sx of [-1, 1]) {
    const leg = plank(2.4, height - 2.4, 8, mats.frame, 0.35);
    at(leg, sx * (length / 2 - 4.5), (height - 2.4) / 2, 0, 0, 0, sx * 0.12);
    g.add(leg);
  }
  g.add(at(plank(length - 12, 2, 2, mats.frame, 0.3), 0, height * 0.35, 0));
  return g;
}

// 三脚凳
export function stool({ height = 22, mats, seed = 1 }) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  const seat = cyl(6.5, 6.2, 2.4, mats.top, 20);
  seat.position.y = height - 1.2;
  g.add(seat);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rnd() * 0.3;
    const leg = cyl(0.9, 1.2, height - 1, mats.frame, 8);
    leg.position.set(Math.cos(a) * 3.8, (height - 1) / 2, Math.sin(a) * 3.8);
    leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
    g.add(leg);
  }
  return g;
}

// ---------- 器皿 ----------
export function woodTankard(mats, scale = 1) {
  const g = new THREE.Group();
  const pts = [[0, 0], [1.22, 0], [1.25, 0.2], [1.12, 2.8], [1.0, 2.8], [1.0, 0.35], [0, 0.35]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mats.stave);
  body.castShadow = true;
  g.add(body);
  for (const [y, r] of [[0.45, 1.24], [1.45, 1.19], [2.4, 1.14]]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 24), mats.iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.17, 8, 16, Math.PI), mats.stave);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(1.15, 1.45, 0);
  handle.castShadow = true;
  g.add(handle);
  const foam = new THREE.Mesh(new THREE.SphereGeometry(1.02, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), mats.foam);
  foam.scale.y = 0.45;
  foam.position.y = 2.62;
  g.add(foam);
  g.scale.setScalar(scale);
  return g;
}

// 带翻盖的锡杯
export function pewterTankard(mats, scale = 1) {
  const g = new THREE.Group();
  const pts = [[0, 0], [1.3, 0], [1.35, 0.15], [1.1, 0.5], [1.05, 2.6], [1.15, 2.85], [1.08, 2.9], [0.95, 2.6], [0.95, 0.45], [0, 0.45]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mats.pewter);
  body.castShadow = true;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.13, 8, 16, Math.PI * 1.1), mats.pewter);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(1.15, 1.55, 0);
  g.add(handle);
  // 设定图里的金属杯是敞口的：杯里一层麦酒
  const ale = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshStandardMaterial({ color: '#6a3a14', roughness: 0.25 }));
  ale.rotation.x = -Math.PI / 2;
  ale.position.y = 2.3;
  g.add(ale);
  g.scale.setScalar(scale);
  return g;
}

export function jug(mat, h = 9, w = 3) {
  const pts = [
    [0, 0], [w * 0.62, 0], [w * 0.7, 0.2], [w * 0.98, h * 0.25], [w, h * 0.42], [w * 0.88, h * 0.62],
    [w * 0.5, h * 0.8], [w * 0.42, h * 0.9], [w * 0.5, h], [w * 0.44, h], [w * 0.36, h * 0.9], [0, h * 0.88],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), mat);
  m.castShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.2, w * 0.1, 6, 12, Math.PI * 1.15), mat);
  handle.rotation.z = -Math.PI / 2 - 0.1;
  handle.position.set(w * 0.8, h * 0.62, 0);
  m.add(handle);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(w * 0.16, w * 0.5, 8, 1, true), mat);
  spout.rotation.z = Math.PI / 2.4;
  spout.position.set(-w * 0.5, h * 0.98, 0);
  m.add(spout);
  return m;
}

export function bowl(mat, r = 3) {
  const pts = [[0, 0], [r * 0.5, 0], [r * 0.55, r * 0.1], [r, r * 0.45], [r * 0.95, r * 0.5], [r * 0.5, r * 0.16], [0, r * 0.14]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function bottle(color, h = 9) {
  const pts = [[0, 0], [1.6, 0], [1.7, 0.3], [1.72, h * 0.5], [1.5, h * 0.62], [0.5, h * 0.78], [0.45, h * 0.96], [0.62, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 1 }));
  m.castShadow = true;
  return m;
}

// 面包：带刀口的圆面包
const breadMatCache = {};
function breadMat() {
  if (breadMatCache.m) return breadMatCache.m;
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(5);
  const g = ctx.createRadialGradient(128, 110, 10, 128, 128, 160);
  g.addColorStop(0, '#d89a4a');
  g.addColorStop(0.6, '#b8742e');
  g.addColorStop(1, '#7a4818');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  mottle(ctx, 256, 256, rnd, ['#f0c070', '#6a3a10'], 30, 6, 26, 0.3);
  speckle(ctx, 256, 256, rnd, 800, '#f6e2b0', 1.4, 0.5);
  ctx.strokeStyle = 'rgba(240,210,150,0.9)';
  ctx.lineWidth = 6;
  for (const x of [80, 128, 176]) {
    ctx.beginPath();
    ctx.moveTo(x - 20, 60);
    ctx.quadraticCurveTo(x, 128, x - 20, 196);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  breadMatCache.m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
  return breadMatCache.m;
}
export function breadLoaf(scale = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), breadMat());
  m.scale.set(1.35 * scale, 0.62 * scale, 1 * scale);
  m.castShadow = true;
  return m;
}
export function cheese(scale = 1) {
  const g = new THREE.Group();
  const rind = new THREE.MeshStandardMaterial({ color: '#c88a2a', roughness: 0.6 });
  const inside = new THREE.MeshStandardMaterial({ color: '#f2d27a', roughness: 0.7 });
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.6, 28, 1, false, 0, Math.PI * 1.6), [rind, inside, inside]);
  wheel.castShadow = true;
  g.add(wheel);
  for (const a of [0, Math.PI * 1.6]) {
    const cut = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), inside);
    cut.position.set(Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2);
    cut.rotation.y = a - Math.PI / 2;
    g.add(cut);
  }
  g.scale.setScalar(scale);
  return g;
}
export function apple(color = '#a8321e') {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
  a.scale.y = 0.9;
  a.castShadow = true;
  g.add(a);
  const stem = cyl(0.06, 0.08, 0.5, new THREE.MeshStandardMaterial({ color: '#4a3018' }), 5);
  stem.position.y = 0.9;
  g.add(stem);
  return g;
}
// 木托盘（切面包用的板子）
export function trencher(mats, w = 7, d = 5) {
  return plank(w, 0.6, d, mats.top, 0.25);
}

// 铁烛台（带接蜡盘）+ 蜡烛
export function candlestick(mats, { height = 3.4, seed = 1, updaters } = {}) {
  const g = new THREE.Group();
  const pts = [[0, 0], [1.9, 0], [1.9, 0.25], [0.7, 0.5], [0.4, 1.0], [0.55, 1.4], [0.32, 2.0], [0.32, 3.1], [1.3, 3.25], [1.35, 3.55], [1.1, 3.6], [0, 3.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const stand = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mats.ironDark);
  stand.castShadow = true;
  g.add(stand);
  const candle = createCandle({ height, radius: 0.6, seed });
  candle.position.y = 3.6;
  g.add(candle);
  if (updaters) updaters.push((dt, t, cam) => candle.userData.update(dt, t, cam));
  return g;
}

// ---------- 酒桶 ----------
export function barrel(mats, { radius = 7, height = 16, tap = false } = {}) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push(new THREE.Vector2(radius * (0.84 + Math.sin(t * Math.PI) * 0.16), t * height));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mats.stave);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  for (const t of [0.08, 0.24, 0.76, 0.92]) {
    const r = radius * (0.84 + Math.sin(t * Math.PI) * 0.16) + 0.1;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.32, 6, 36), mats.iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.scale.z = 0.5;
    hoop.position.y = t * height;
    g.add(hoop);
  }
  for (const [y, s] of [[0.35, 1], [height - 0.35, -1]]) {
    const lid = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.84, 28), mats.lid);
    lid.rotation.x = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    lid.position.y = y;
    g.add(lid);
    const chime = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.84, 0.35, 6, 28), mats.stave);
    chime.rotation.x = Math.PI / 2;
    chime.position.y = s > 0 ? 0.2 : height - 0.2;
    g.add(chime);
  }
  if (tap) {
    // 酒桶横放（本地 +y 朝外、+x 朝下）时，龙头在桶头偏下的位置
    const sp = new THREE.Group();
    sp.position.set(radius * 0.5, height, 0);
    sp.add(at(cyl(0.45, 0.55, 3, mats.brass, 10), 0, 1.5, 0));
    sp.add(at(cyl(0.32, 0.36, 1.8, mats.brass, 8), 0.9, 2.8, 0, 0, 0, Math.PI / 2));
    sp.add(at(plank(0.5, 0.5, 2, mats.brass, 0.1), -0.7, 2.5, 0));
    g.add(sp);
  }
  return g;
}

// 横放酒桶的木架
export function stillage(mats, length = 70) {
  const g = new THREE.Group();
  for (const sz of [-1, 1]) {
    g.add(at(plank(length, 3.2, 3.2, mats.frame, 0.4), 0, 9, sz * 5));
    for (let x = -length / 2 + 3; x <= length / 2 - 3; x += (length - 6) / 3) g.add(at(plank(3.2, 9, 3.2, mats.frame, 0.4), x, 4.5, sz * 5));
  }
  for (let x = -length / 2 + 3; x <= length / 2 - 3; x += (length - 6) / 3) g.add(at(plank(2.6, 2.6, 13, mats.frame, 0.3), x, 9.5, 0));
  return g;
}

// 木条箱
export function crate(mats, s = 10) {
  const g = new THREE.Group();
  const t = 0.9;
  for (const [x, z, w, d] of [[0, s / 2 - t / 2, s, t], [0, -s / 2 + t / 2, s, t], [s / 2 - t / 2, 0, t, s - t * 2], [-s / 2 + t / 2, 0, t, s - t * 2]]) {
    for (let k = 0; k < 3; k++) g.add(at(plank(w, s / 3 - 0.5, d, mats.crate, 0.15), x, (k + 0.5) * (s / 3), z));
  }
  g.add(at(plank(s - 0.2, 0.8, s - 0.2, mats.crate, 0.15), 0, 0.4, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(plank(1.4, s, 1.4, mats.frame, 0.2), sx * (s / 2 - 0.7), s / 2, sz * (s / 2 - 0.7)));
  return g;
}

export function sack(mat, ropeMat, seed = 1) {
  const rnd = mulberry32(seed);
  const pts = [[0, 0], [4.2, 0.3], [5.2, 2.5], [5.4, 6], [4.7, 9], [2.8, 11.2], [1.4, 12], [1.5, 12.6], [2.5, 13.7], [2.1, 14.3], [0, 14.1]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), mat);
  m.scale.set(1, 0.95 + rnd() * 0.1, 0.82);
  m.castShadow = m.receiveShadow = true;
  const tie = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.28, 6, 14), ropeMat);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 12.2;
  m.add(tie);
  return m;
}

// ---------- 铁艺吊灯（车轮式，带烛钎） ----------
export function ironChandelier(mats, { radius = 10, candles = 8, updaters }) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.45, 8, 56), mats.ironDark);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.45, 0.3, 6, 32), mats.ironDark);
  inner.rotation.x = Math.PI / 2;
  g.add(inner);
  for (let i = 0; i < candles / 2; i++) {
    const a = (i / (candles / 2)) * Math.PI;
    const spoke = plank(radius * 2, 0.5, 0.5, mats.ironDark, 0.1);
    spoke.rotation.y = a;
    g.add(spoke);
  }
  const hub = cyl(1.2, 1.6, 2.4, mats.ironDark, 10);
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const len = 62;
    const chain = cyl(0.13, 0.13, len, mats.ironDark, 4);
    const top = new THREE.Vector3(0, len, 0);
    const bot = new THREE.Vector3(Math.cos(a) * radius * 0.95, 0, Math.sin(a) * radius * 0.95);
    chain.position.copy(top).add(bot).multiplyScalar(0.5);
    chain.lookAt(top);
    chain.rotateX(Math.PI / 2);
    g.add(chain);
  }
  const list = [];
  for (let i = 0; i < candles; i++) {
    const a = (i / candles) * Math.PI * 2;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.6, 0.6, 12), mats.ironDark);
    cup.position.set(Math.cos(a) * radius, 0.55, Math.sin(a) * radius);
    g.add(cup);
    const cnd = createCandle({ height: 3, radius: 0.6, seed: i * 3.1, flameScale: 1.4 });
    cnd.position.set(Math.cos(a) * radius, 0.85, Math.sin(a) * radius);
    g.add(cnd);
    list.push(cnd);
  }
  if (updaters) updaters.push((dt, t, cam) => list.forEach((c) => c.userData.update(dt, t, cam)));
  return g;
}

// ---------- 壁炉用具 ----------
export function andirons(mats) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const x = sx * 10;
    g.add(at(plank(1.2, 1.2, 18, mats.ironDark, 0.2), x, 2.2, 0));
    g.add(at(plank(1.2, 8, 1.2, mats.ironDark, 0.2), x, 4, 8));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mats.ironDark);
    knob.position.set(x, 8.6, 8);
    g.add(knob);
    for (const z of [-7, 7]) g.add(at(plank(1, 2.2, 1, mats.ironDark, 0.1), x, 1, z));
  }
  return g;
}
export function logPile(mats, { count = 9, length = 20, seed = 3 } = {}) {
  const rnd = mulberry32(seed);
  const g = new THREE.Group();
  let row = 0;
  let inRow = 4;
  let k = 0;
  while (k < count) {
    for (let i = 0; i < inRow && k < count; i++, k++) {
      const r = 1.7 + rnd() * 0.5;
      const log = cyl(r, r * 1.05, length + (rnd() - 0.5) * 3, mats.bark, 9);
      log.rotation.z = Math.PI / 2;
      log.rotation.x = rnd() * 6;
      log.position.set((rnd() - 0.5) * 1.5, 1.9 + row * 3.4, (i - (inRow - 1) / 2) * 4);
      g.add(log);
      for (const sx of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 9), mats.endGrain);
        end.position.set(log.position.x + sx * (length / 2 + 0.02), log.position.y, log.position.z);
        end.rotation.y = sx * Math.PI / 2;
        g.add(end);
      }
    }
    row++;
    inRow--;
    if (inRow < 1) break;
  }
  return g;
}
// 烤架上的烤鸡（慢慢转）
export function spitRoast(mats, updaters) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    g.add(at(plank(1, 16, 1, mats.ironDark, 0.15), sx * 15, 8, 0));
    g.add(at(plank(1, 4, 1, mats.ironDark, 0.15), sx * 15 - 1, 16.5, 0, 0, 0, 0.5));
    g.add(at(plank(1, 4, 1, mats.ironDark, 0.15), sx * 15 + 1, 16.5, 0, 0, 0, -0.5));
  }
  const rod = cyl(0.3, 0.3, 34, mats.ironDark, 6);
  rod.rotation.z = Math.PI / 2;
  rod.position.y = 16;
  g.add(rod);
  const roast = new THREE.Group();
  roast.position.y = 16;
  const meat = new THREE.MeshStandardMaterial({ color: '#8a4a1e', roughness: 0.42 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), meat);
  body.scale.set(1.5, 1, 1.05);
  body.castShadow = true;
  roast.add(body);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3, 4, 8), meat);
    leg.position.set(4.6, -1.5, s * 2);
    leg.rotation.z = -1.1;
    roast.add(leg);
  }
  g.add(roast);
  updaters.push((dt) => (roast.rotation.x += dt * 0.5));
  return g;
}
// 鹿角（挂在壁炉上方）
export function antlers(mat) {
  const g = new THREE.Group();
  const plaque = plank(10, 12, 1.6, mat.plaque, 0.4);
  g.add(plaque);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), mat.bone);
  skull.scale.set(1, 1.3, 0.9);
  skull.position.set(0, 0, 2);
  g.add(skull);
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(s * (2 + t * 14), 2 + t * 13 - t * t * 4, 2 + t * 4));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const beam = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.7, 6), mat.bone);
    beam.castShadow = true;
    g.add(beam);
    for (const t of [0.35, 0.6, 0.85]) {
      const p = curve.getPoint(t);
      const tine = new THREE.Mesh(new THREE.ConeGeometry(0.5, 6, 6), mat.bone);
      tine.position.copy(p).add(new THREE.Vector3(0, 2.6, 0.6));
      tine.rotation.z = -s * 0.25;
      g.add(tine);
    }
  }
  return g;
}

// ---------- 楼梯（通往二楼） ----------
export function staircase(mats, { steps = 22, rise = 6.8, run = 4.3, width = 26 }) {
  const g = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    g.add(at(plank(width, 1.8, run + 1.2, mats.top, 0.3), 0, (i + 1) * rise - 0.9, i * run + run / 2));
  }
  const len = Math.hypot(steps * rise, steps * run);
  const ang = Math.atan2(steps * rise, steps * run);
  for (const sx of [-1, 1]) {
    const s = plank(2.4, 7, len, mats.frame, 0.4);
    at(s, sx * (width / 2 + 1.2), (steps * rise) / 2 - 1.5, (steps * run) / 2, -ang);
    g.add(s);
  }
  // 扶手与栏杆（只在靠房间的一侧）
  const hx = width / 2 + 1.2;
  for (let i = 0; i <= steps; i += 3) {
    const h = 22;
    g.add(at(plank(1.6, h, 1.6, mats.frame, 0.3), hx, i * rise + h / 2, i * run));
  }
  const rail = plank(2, 2, len, mats.frame, 0.5);
  at(rail, hx, (steps * rise) / 2 + 22, (steps * run) / 2, -ang);
  g.add(rail);
  return g;
}

// ---------- 木门（带铁合页与门环），pivot 在合页一侧 ----------
export function plankDoor(mats, { width = 52, height = 100 } = {}) {
  const pivot = new THREE.Group();
  const boards = 6;
  const bw = width / boards;
  for (let i = 0; i < boards; i++) {
    pivot.add(at(plank(3.2, height - 1, bw - 0.25, mats.door, 0.3), 0, height / 2, bw * (i + 0.5)));
  }
  // 内侧横档
  for (const y of [14, height / 2, height - 14]) pivot.add(at(plank(2, 5, width - 4, mats.door, 0.3), -2.2, y, width / 2));
  // 外侧铁合页（长条 + 卷尾）
  for (const y of [16, height - 16]) {
    pivot.add(at(plank(0.6, 2.6, width * 0.72, mats.ironDark, 0.15), 1.8, y, width * 0.36));
    const curl = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.4, 6, 12, Math.PI * 1.5), mats.ironDark);
    curl.position.set(1.9, y + 1, width * 0.72);
    curl.rotation.y = Math.PI / 2;
    pivot.add(curl);
    pivot.add(at(cyl(0.7, 0.7, 6, mats.ironDark, 8), 1.6, y, 0.5));
  }
  // 门环与锁板（两面都有）
  for (const sx of [1, -1]) {
    pivot.add(at(plank(0.5, 6, 4, mats.ironDark, 0.15), sx * 1.9, height * 0.5, width - 7));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 6, 16), mats.ironDark);
    ring.position.set(sx * 2.4, height * 0.5 - 2.4, width - 7);
    ring.rotation.y = Math.PI / 2;
    pivot.add(ring);
  }
  pivot.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return pivot;
}

// ---------- 酒馆招牌 ----------
export function tavernSign(mats, title = '亨利广场') {
  const g = new THREE.Group();
  const c = makeCanvas(512, 256);
  const ctx = c.getContext('2d');
  woodGrain(ctx, 0, 0, 512, 256, mulberry32(77), '#6a4626', '#3a2410', { lines: 30, amp: 2 });
  ctx.strokeStyle = '#d8b25c';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = '#f0dcae';
  ctx.font = 'bold 78px "Noto Serif SC", "Songti SC", "SimSun", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 104);
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillStyle = '#d8b25c';
  ctx.fillText('· HENRY SQUARE ·', 256, 186);
  // 两颗骰子
  for (const [x, rot] of [[64, -0.3], [448, 0.25]]) {
    ctx.save();
    ctx.translate(x, 104);
    ctx.rotate(rot);
    ctx.fillStyle = '#f2e8d2';
    ctx.fillRect(-30, -30, 60, 60);
    ctx.fillStyle = '#7a1a10';
    for (const [px, py] of [[-15, -15], [15, 15], [0, 0], [15, -15], [-15, 15]]) {
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 招牌沿 +x 伸出墙外，画面在两个大面上（±z）
  const painted = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(44, 22, 1.4), [mats.frame, mats.frame, mats.frame, mats.frame, painted, painted]);
  board.position.x = 26;
  board.castShadow = true;
  g.add(board);
  for (const x of [10, 42]) g.add(at(cyl(0.2, 0.2, 7, mats.ironDark, 4), x, 14.5, 0));
  g.add(at(plank(48, 1.2, 1.2, mats.ironDark, 0.2), 24, 18, 0));
  g.add(at(plank(1.2, 14, 1.2, mats.ironDark, 0.2), 4, 11, 0, 0, 0, -0.7));
  return g;
}
