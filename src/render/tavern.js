// 酒馆场景（第三版）：按中世纪小酒馆重新布局
// 后墙中央是大壁炉，左墙是柜台、酒桶架和通往二楼的楼梯，右墙是圆片玻璃窗和临街的大门。
// 屋里有喝酒、掷骰、打盹、弹琴、端盘子的平民；门外是傍晚的街道。
import * as THREE from 'three';
import { planksTexture, stoneTexture, leatherTexture, canvasTexture, makeCanvas, mulberry32, woodGrain, mottle, speckle, warmEnvCanvas } from './canvasTex.js';
import { flagstoneTexture, limewashTexture, bullseyeTexture, strawTexture, windowPatchTexture, shaftTexture, burlapTexture } from './sceneTex.js';
import { createHearthFire, createCandle, createDust } from './fire.js';
import * as P from './props.js';
import * as N from './npc.js';
import { coinStack, coinPurse, makeCoin } from './coins.js';
import { Die3D } from './diceModel.js';

export const FLOOR_Y = -38;
export const TABLE_Y = -0.3; // 游戏桌面高度
export const ROOM = { minX: -150, maxX: 150, minZ: -150, maxZ: 110, ceil: 112 };
export const DOOR = { z0: 39, z1: 91, top: 100 }; // 右墙上的大门（世界 z 范围，门高）

const SUN_DIR = new THREE.Vector3(-1, -0.72, 0.28).normalize();
const TOP_H = 37; // 普通桌面高度
const SEAT_H = 22; // 凳面高度

function box(w, h, d, mat, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.rx) m.rotation.x = opts.rx;
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
function place(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}
function texMat(canvasPair, repeat, opts = {}) {
  const map = canvasTexture(canvasPair.col, { repeat });
  const bumpMap = canvasPair.bump ? canvasTexture(canvasPair.bump, { repeat, srgb: false }) : null;
  return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: opts.bump ?? 1.5, roughness: opts.roughness ?? 0.85, color: opts.color ?? '#ffffff' });
}
function grainCanvas(seed, c1, c2) {
  const c = makeCanvas(512, 128);
  const ctx = c.getContext('2d');
  woodGrain(ctx, 0, 0, 512, 128, mulberry32(seed), c1, c2, { lines: 30, amp: 2, knots: 2 });
  speckle(ctx, 512, 128, mulberry32(seed + 1), 1500, '#000000', 1.5, 0.3);
  return c;
}
function woodMat(seed, c1, c2, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ map: canvasTexture(grainCanvas(seed, c1, c2)), roughness });
}

function bannerTexture(seed, field, charge) {
  const c = makeCanvas(256, 512);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, 256, 512);
  mottle(ctx, 256, 512, rnd, ['#000000', '#ffffff'], 30, 20, 80, 0.06);
  ctx.strokeStyle = charge;
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 228, 440);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, 512);
  ctx.lineTo(128, 440);
  ctx.lineTo(256, 512);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(128, 210);
  ctx.fillStyle = charge;
  ctx.beginPath();
  ctx.moveTo(-70, -80);
  ctx.lineTo(70, -80);
  ctx.lineTo(70, 10);
  ctx.quadraticCurveTo(70, 80, 0, 110);
  ctx.quadraticCurveTo(-70, 80, -70, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.moveTo(-58, -68);
  ctx.lineTo(58, -68);
  ctx.lineTo(58, 8);
  ctx.quadraticCurveTo(58, 68, 0, 96);
  ctx.quadraticCurveTo(-58, 68, -58, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = charge;
  ctx.fillRect(-28, -28, 56, 56);
  ctx.fillStyle = field;
  for (const [x, y] of [[-14, -14], [14, -14], [0, 0], [-14, 14], [14, 14]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  speckle(ctx, 256, 512, rnd, 2000, '#000000', 1.2, 0.2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 梁上挂的食物 ----------
function hangString(len, mat) {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 5), mat);
  s.position.y = -len / 2;
  return s;
}
function makeHam(m) {
  const g = new THREE.Group();
  const pts = [[0, 0], [1.3, 0.6], [2.6, 2.6], [3.0, 5.2], [2.4, 7.6], [1.2, 9.2], [0.45, 10], [0.4, 11.6], [0, 11.8]].map(([x, y]) => new THREE.Vector2(x, y));
  const ham = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), m.ham);
  ham.rotation.x = Math.PI;
  ham.position.y = -6;
  ham.scale.set(1, 1, 0.8);
  ham.castShadow = true;
  g.add(hangString(6, m.rope));
  g.add(ham);
  return g;
}
function makeSausages(m) {
  const g = new THREE.Group();
  g.add(hangString(4, m.rope));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 4, 8), m.sausage);
    const side = i % 2 ? 1 : -1;
    s.position.set(side * (0.4 + i * 0.25), -5 - i * 1.7, 0);
    s.rotation.z = side * 0.35;
    s.castShadow = true;
    g.add(s);
  }
  return g;
}
function makeGarlic(m) {
  const g = new THREE.Group();
  g.add(hangString(3, m.rope));
  const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 12, 6), m.rope);
  braid.position.y = -9;
  g.add(braid);
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), m.garlic);
    const a = i * 2.2;
    b.position.set(Math.cos(a) * 0.9, -4.5 - i * 1.1, Math.sin(a) * 0.9);
    b.scale.y = 0.85;
    b.castShadow = true;
    g.add(b);
  }
  return g;
}
function makeHerbs(m) {
  const g = new THREE.Group();
  g.add(hangString(3.5, m.rope));
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 6), i % 2 ? m.herb : m.herb2);
    c.position.set((i - 2) * 0.6, -7.2, (i % 2) * 0.5);
    c.rotation.z = (i - 2) * 0.12;
    c.castShadow = true;
    g.add(c);
  }
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.8, 8), m.rope);
  tie.position.y = -3.9;
  g.add(tie);
  return g;
}

export function buildTavern(scene, renderer) {
  const updaters = [];
  const lights = {};

  scene.background = new THREE.Color('#5a4030');
  scene.fog = new THREE.FogExp2('#6a4a30', 0.0015);
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = new THREE.CanvasTexture(warmEnvCanvas());
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pm.fromEquirectangular(envTex).texture;
  scene.environmentIntensity = 0.75;
  envTex.dispose();
  pm.dispose();

  // ---------- 材质 ----------
  const flag = flagstoneTexture({ size: 1024, seed: 21 });
  const floorMat = texMat(flag, [6, 5], { roughness: 0.9, bump: 2.4 });
  const streetMat = texMat(flag, [5, 5], { roughness: 0.95, bump: 2.4, color: '#a89880' });
  const ceilMat = texMat(planksTexture({ size: 512, planks: 6, c1: '#5a4030', c2: '#2e2014', seed: 22 }), [6, 6], { roughness: 1 });
  const stoneWall = texMat(stoneTexture({ size: 1024, seed: 23, c1: '#a49886', c2: '#7a7060', mortar: '#4e463c' }), [1, 1], { roughness: 0.95, bump: 3 });
  const hearthStone = texMat(stoneTexture({ size: 1024, seed: 24, rows: 6, c1: '#9a8e7c', c2: '#6a6052', mortar: '#3e3830' }), [1, 1], { roughness: 0.95, bump: 3.2 });
  const lime = limewashTexture({ size: 512, seed: 25 });
  const limeWall = texMat(lime, [1, 1], { roughness: 1, bump: 1.2 });
  const limePlain = new THREE.MeshStandardMaterial({ map: canvasTexture(lime.col), roughness: 1 });
  const beamH = woodMat(26, '#4a3220', '#22160c', 0.85);
  const beamVT = canvasTexture(grainCanvas(26, '#4a3220', '#22160c'));
  beamVT.rotation = Math.PI / 2;
  beamVT.center.set(0.5, 0.5);
  const beamV = new THREE.MeshStandardMaterial({ map: beamVT, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: '#2e2c2a', metalness: 0.85, roughness: 0.55 });
  const ironDark = new THREE.MeshStandardMaterial({ color: '#222020', metalness: 0.8, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b48a3e', metalness: 1, roughness: 0.35 });
  const pewter = new THREE.MeshStandardMaterial({ color: '#a8a49a', metalness: 0.75, roughness: 0.38 });
  const terracotta = new THREE.MeshStandardMaterial({ color: '#a25a32', roughness: 0.75 });
  const glazed = new THREE.MeshStandardMaterial({ color: '#4e6a3a', roughness: 0.35 });
  const mats = {
    top: woodMat(30, '#9a7048', '#5a3c20', 0.75),
    frame: woodMat(31, '#6e4a2a', '#3a2614', 0.8),
    stave: texMat(planksTexture({ size: 512, planks: 10, c1: '#8a6238', c2: '#54371c', seed: 28, vertical: true }), [3, 1], { roughness: 0.8 }),
    iron,
    ironDark,
    brass,
    pewter,
    lid: new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.9 }),
    foam: new THREE.MeshStandardMaterial({ color: '#d8ccac', roughness: 0.95 }),
    crate: woodMat(32, '#a07a4c', '#5e4022', 0.85),
    bark: new THREE.MeshStandardMaterial({ color: '#3e2a18', roughness: 1 }),
    endGrain: new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 0.9 }),
    door: woodMat(33, '#6a4626', '#3a2410', 0.85),
    plaque: woodMat(34, '#5a3a20', '#2e1c0e', 0.7),
    bone: new THREE.MeshStandardMaterial({ color: '#e0d4b8', roughness: 0.7 }),
  };
  const food = {
    rope: new THREE.MeshStandardMaterial({ color: '#8a7048', roughness: 1 }),
    ham: new THREE.MeshStandardMaterial({ color: '#8a4426', roughness: 0.55 }),
    sausage: new THREE.MeshStandardMaterial({ color: '#7a3020', roughness: 0.5 }),
    garlic: new THREE.MeshStandardMaterial({ color: '#ece0ca', roughness: 0.8 }),
    herb: new THREE.MeshStandardMaterial({ color: '#6e7a3c', roughness: 1 }),
    herb2: new THREE.MeshStandardMaterial({ color: '#8a7a40', roughness: 1 }),
  };
  const burlap = new THREE.CanvasTexture(burlapTexture());
  burlap.colorSpace = THREE.SRGBColorSpace;
  const sackMat = new THREE.MeshStandardMaterial({ map: burlap, roughness: 1 });

  const W = ROOM.maxX - ROOM.minX;
  const Dp = ROOM.maxZ - ROOM.minZ;
  const H = ROOM.ceil - FLOOR_Y;
  const cx = (ROOM.minX + ROOM.maxX) / 2;
  const cz = (ROOM.minZ + ROOM.maxZ) / 2;

  // ---------- 地面 / 天花板 ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, FLOOR_Y, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, ROOM.ceil, cz);
  scene.add(ceil);
  const beamXs = [];
  for (let x = ROOM.minX + 30; x < ROOM.maxX; x += 45) {
    scene.add(box(8, 9, Dp, beamH, x, ROOM.ceil - 4.5, cz));
    beamXs.push(x);
  }
  // 次梁（小搁栅），用实例化一次画完
  const stair = { x0: ROOM.minX, x1: ROOM.minX + 28, z0: 76, z1: 108 };
  const joistSpots = [];
  const edges = [ROOM.minX, ...beamXs, ROOM.maxX];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i] + 4;
    const b = edges[i + 1] - 4;
    for (let z = ROOM.minZ + 8; z < ROOM.maxZ - 4; z += 15) {
      if ((a + b) / 2 < stair.x1 && z > stair.z0 && z < stair.z1) continue;
      joistSpots.push([(a + b) / 2, z, b - a]);
    }
  }
  const joists = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 4, 4.5), beamH, joistSpots.length);
  const jm = new THREE.Matrix4();
  joistSpots.forEach(([x, z, len], i) => {
    jm.makeScale(len, 1, 1);
    jm.setPosition(x, ROOM.ceil - 2, z);
    joists.setMatrixAt(i, jm);
  });
  joists.castShadow = true;
  scene.add(joists);
  // 楼梯口：天花板上的暗洞
  const well = new THREE.Mesh(new THREE.PlaneGeometry(stair.x1 - stair.x0, stair.z1 - stair.z0), new THREE.MeshBasicMaterial({ color: '#120c08' }));
  well.rotation.x = Math.PI / 2;
  well.position.set((stair.x0 + stair.x1) / 2, ROOM.ceil - 0.5, (stair.z0 + stair.z1) / 2);
  scene.add(well);
  scene.add(box(stair.x1 - stair.x0 + 4, 6, 4, beamH, (stair.x0 + stair.x1) / 2, ROOM.ceil - 3, stair.z0));
  scene.add(box(4, 6, stair.z1 - stair.z0, beamH, stair.x1, ROOM.ceil - 3, (stair.z0 + stair.z1) / 2));

  // ---------- 墙体：下半石砌，上半石灰白墙 + 深色木构架；门洞是真正挖空的 ----------
  const stoneH = 34;
  // 按世界坐标铺 UV，墙面分段后纹理也能对得上
  const wallRect = (g, x0, x1, y0, y1, mat, tw, th) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2) / tw, (pos.getY(i) + (y0 + y1) / 2) / th);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.receiveShadow = true;
    g.add(m);
  };
  const addWall = ({ len, at: [px, pz], ry, openings = [], door = null, height = H }) => {
    const g = new THREE.Group();
    g.position.set(px, FLOOR_Y, pz);
    g.rotation.y = ry;
    const L = len / 2;
    const segs = door ? [[-L, door.x0], [door.x1, L]] : [[-L, L]];
    for (const [a, b] of segs) {
      wallRect(g, a, b, 0, stoneH, stoneWall, 50, 34);
      wallRect(g, a, b, stoneH, height, limeWall, 75, 77);
    }
    if (door) wallRect(g, door.x0, door.x1, door.top, height, limeWall, 75, 77);
    const blocked = (x0, x1) => openings.some(([a, b]) => x1 > a && x0 < b) || (door && x1 > door.x0 - 3 && x0 < door.x1 + 3);
    const hBeam = (y, h) => {
      const parts = door && y < door.top ? segs : [[-L, L]];
      for (const [a, b] of parts) g.add(box(b - a, h, 3, beamH, (a + b) / 2, y, 1.2));
    };
    hBeam(stoneH + 1.5, 5);
    hBeam(stoneH + 52, 4);
    hBeam(1.2, 2.4);
    for (let x = -L + 20; x < L - 10; x += 40) {
      if (!blocked(x - 3, x + 3)) g.add(box(5, height - stoneH, 3, beamV, x, stoneH + (height - stoneH) / 2, 1.3));
      if (Math.round(x / 40) % 2 === 0 && !blocked(x, x + 40)) g.add(box(3, 58, 2.4, beamV, x + 20, stoneH + 27, 1.1, { rz: 0.62 }));
    }
    if (door) {
      for (const x of [door.x0 - 2.5, door.x1 + 2.5]) g.add(box(5, door.top + 6, 6, beamV, x, (door.top + 6) / 2, 0.5));
      g.add(box(door.x1 - door.x0 + 12, 7, 6.5, beamH, (door.x0 + door.x1) / 2, door.top + 3.5, 0.5));
    }
    scene.add(g);
    return g;
  };
  addWall({ len: W, at: [cx, ROOM.minZ], ry: 0 }); // 后墙
  addWall({ len: W, at: [cx, ROOM.maxZ], ry: Math.PI }); // 前墙
  addWall({ len: Dp, at: [ROOM.minX, cz], ry: Math.PI / 2 }); // 左墙
  // 右墙（朝屋内）：本地 x = 世界 z - cz
  const winZs = [-80, -10];
  addWall({
    len: Dp,
    at: [ROOM.maxX, cz],
    ry: -Math.PI / 2,
    openings: winZs.map((z) => [z - 15 - cz, z + 15 - cz]),
    door: { x0: DOOR.z0 - cz, x1: DOOR.z1 - cz, top: DOOR.top },
  });
  // 外立面（朝街）：本地 x = -(世界 z - 中心)
  const fz = 55;
  addWall({ len: 240, at: [ROOM.maxX + 4, fz], ry: Math.PI / 2, door: { x0: -(DOOR.z1 - fz), x1: -(DOOR.z0 - fz), top: DOOR.top }, height: H + 30 });
  // 墙体厚度：门洞两侧的侧壁
  for (const z of [DOOR.z0, DOOR.z1]) scene.add(box(4, DOOR.top, 0.6, limePlain, ROOM.maxX + 2, FLOOR_Y + DOOR.top / 2, z));
  scene.add(box(4, 0.6, DOOR.z1 - DOOR.z0, limePlain, ROOM.maxX + 2, FLOOR_Y + DOOR.top, (DOOR.z0 + DOOR.z1) / 2));

  // 门外：街道、门前石阶、灯笼、招牌
  const street = new THREE.Mesh(new THREE.PlaneGeometry(220, 300), streetMat);
  street.rotation.x = -Math.PI / 2;
  street.position.set(ROOM.maxX + 114, FLOOR_Y - 0.2, 60);
  street.receiveShadow = true;
  scene.add(street);
  scene.add(P.plank(14, 3, DOOR.z1 - DOOR.z0 + 12, hearthStone, 0.6).translateX(ROOM.maxX + 11).translateY(FLOOR_Y + 1.2).translateZ((DOOR.z0 + DOOR.z1) / 2));
  const sign = P.tavernSign(mats);
  sign.position.set(ROOM.maxX + 4, FLOOR_Y + 76, DOOR.z1 + 26);
  scene.add(sign);
  // 门边的灯笼：挑得离墙远一些、光弱一些，墙面不会被照得发白
  const outLamp = new THREE.Group();
  outLamp.add(box(4.5, 7, 4.5, new THREE.MeshStandardMaterial({ color: '#ffc070', emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 1.5 }), 0, 0, 0, { cast: false }));
  for (const [x, z] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) outLamp.add(box(0.5, 7.6, 0.5, ironDark, x, 0, z));
  outLamp.add(box(6, 0.8, 6, ironDark, 0, 3.8, 0));
  outLamp.add(box(15, 0.8, 0.8, ironDark, -7.5, 6, 0));
  outLamp.add(box(0.7, 10, 0.7, ironDark, -10.6, 2, 0, { rz: -0.7 }));
  outLamp.position.set(ROOM.maxX + 18, FLOOR_Y + 82, DOOR.z0 - 10);
  scene.add(outLamp);
  const outLight = new THREE.PointLight('#ffa050', 1300, 0, 2);
  outLight.position.set(ROOM.maxX + 19, FLOOR_Y + 80, DOOR.z0 - 10);
  scene.add(outLight);
  for (const [z, s] of [[DOOR.z0 - 30, 1], [DOOR.z1 + 52, 1.1]]) {
    const b = P.barrel(mats, { radius: 7 * s, height: 16 * s });
    b.position.set(ROOM.maxX + 14, FLOOR_Y, z);
    scene.add(b);
  }

  // 门（合页在 z1 一侧，向屋里开）：开门后门板贴在镜头身后那一侧，不挡视线。
  // 外面套一层沿 z 镜像的父节点，门本身仍按 rotation.y = -1.5 × 开度 来开
  const doorHinge = new THREE.Group();
  doorHinge.position.set(ROOM.maxX + 1, FLOOR_Y, DOOR.z1);
  doorHinge.scale.z = -1;
  scene.add(doorHinge);
  const door = P.plankDoor(mats, { width: DOOR.z1 - DOOR.z0, height: DOOR.top });
  doorHinge.add(door);

  // ---------- 壁炉（后墙中央） ----------
  const fx = -20;
  const hearth = new THREE.Group();
  hearth.position.set(fx, FLOOR_Y, ROOM.minZ);
  scene.add(hearth);
  const openW = 56;
  const openH = 50;
  for (const s of [-1, 1]) hearth.add(P.plank(20, openH, 30, hearthStone, 1.2).translateX(s * (openW / 2 + 10)).translateY(openH / 2).translateZ(15));
  // 锥形烟罩
  const hoodGeo = new THREE.CylinderGeometry(1, 1, H - openH - 9, 4, 1);
  hoodGeo.rotateY(Math.PI / 4);
  const hp = hoodGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const top = hp.getY(i) > 0;
    const w = top ? 74 : 108;
    const d = top ? 24 : 32;
    hp.setX(i, Math.sign(hp.getX(i)) * w / 2);
    hp.setZ(i, Math.sign(hp.getZ(i)) * d / 2);
  }
  hoodGeo.computeVertexNormals();
  const hood = new THREE.Mesh(hoodGeo, hearthStone);
  hood.position.set(0, openH + 9 + (H - openH - 9) / 2, 16);
  hood.castShadow = true;
  hood.receiveShadow = true;
  hearth.add(hood);
  const soot = new THREE.MeshStandardMaterial({ color: '#1c140e', roughness: 1 });
  hearth.add(box(openW, openH, 1, soot, 0, openH / 2, 1, { cast: false }));
  for (const s of [-1, 1]) hearth.add(box(1, openH, 28, soot, s * openW / 2, openH / 2, 14, { cast: false }));
  hearth.add(box(openW, 1, 28, soot, 0, openH - 0.5, 14, { cast: false }));
  hearth.add(P.plank(114, 9, 16, beamH, 1).translateY(openH + 4.5).translateZ(25));
  hearth.add(P.plank(120, 2.4, 20, mats.plaque, 0.6).translateY(openH + 10).translateZ(26));
  hearth.add(P.plank(124, 2, 26, hearthStone, 0.6).translateY(1).translateZ(40));
  const logs = P.logPile(mats, { count: 3, length: 24, seed: 9 });
  logs.position.set(0, 2, 14);
  logs.rotation.y = 0;
  hearth.add(logs);
  const andi = P.andirons(mats);
  andi.position.set(0, 0, 14);
  hearth.add(andi);
  const ember = new THREE.Mesh(new THREE.CircleGeometry(16, 24), new THREE.MeshBasicMaterial({ color: '#ff6a18', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ember.rotation.x = -Math.PI / 2;
  ember.position.set(0, 1.2, 14);
  hearth.add(ember);
  const fire = createHearthFire(34, 30);
  fire.position.set(0, 4, 14);
  hearth.add(fire);
  updaters.push((dt, t, cam) => fire.userData.update(dt, t, cam));
  const spit = P.spitRoast(mats, updaters);
  spit.position.set(0, 2, 30);
  hearth.add(spit);
  // 吊锅支架
  const crane = new THREE.Group();
  crane.position.set(-openW / 2 + 2, 0, 12);
  crane.add(P.plank(1.4, 42, 1.4, ironDark, 0.2).translateY(21));
  crane.add(P.plank(20, 1.4, 1.4, ironDark, 0.2).translateY(40).translateX(10));
  crane.add(P.plank(1, 14, 1, ironDark, 0.15).translateY(34).translateX(6).rotateZ(-0.75));
  crane.add(P.plank(0.5, 10, 0.5, ironDark, 0.1).translateY(35).translateX(18));
  const potPts = [[0, 0], [3, 0.4], [4.8, 2.4], [5.2, 5], [4.8, 7], [5.1, 7.4], [4.9, 7.6]].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(potPts, 24), ironDark);
  pot.position.set(18, 22.5, 0);
  pot.castShadow = true;
  crane.add(pot);
  hearth.add(crane);
  const ant = P.antlers({ plaque: mats.plaque, bone: mats.bone });
  ant.position.set(0, openH + 34, 31.5);
  ant.rotation.x = -0.12;
  hearth.add(ant);
  for (const x of [-48, 48]) {
    const cs = P.candlestick(mats, { seed: x, updaters });
    cs.position.set(x, openH + 11.2, 28);
    hearth.add(cs);
  }
  const jg = P.jug(terracotta, 9, 3.2);
  jg.position.set(-26, openH + 11.2, 27);
  hearth.add(jg);
  const jg2 = P.jug(glazed, 7, 2.6);
  jg2.position.set(30, openH + 11.2, 28);
  jg2.rotation.y = 2.2;
  hearth.add(jg2);
  for (const x of [-12, 14]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 24), pewter);
    plate.rotation.x = Math.PI / 2 - 0.25;
    plate.position.set(x, openH + 14.6, 20);
    hearth.add(plate);
  }
  const pile = P.logPile(mats, { count: 9, length: 18, seed: 4 });
  pile.position.set(70, 0, 18);
  pile.rotation.y = Math.PI / 2;
  hearth.add(pile);
  const fireLight = new THREE.PointLight('#ff8a3a', 30000, 0, 2);
  fireLight.position.set(fx, FLOOR_Y + 18, ROOM.minZ + 48);
  scene.add(fireLight);
  lights.fire = fireLight;

  // ---------- 左墙：柜台、酒桶架、货架 ----------
  const counterX = -96; // 柜台正面
  for (let z = -118; z < -40; z += 9.4) scene.add(P.plank(1.6, 35, 9.2, mats.door, 0.3).translateX(counterX).translateY(FLOOR_Y + 17.5).translateZ(z + 4.6));
  scene.add(P.plank(20, 3, 86, mats.top, 0.8).translateX(counterX - 9).translateY(FLOOR_Y + 36.5).translateZ(-79));
  scene.add(P.plank(16, 2, 80, mats.frame, 0.3).translateX(counterX - 10).translateY(FLOOR_Y + 15).translateZ(-79));
  for (const z of [-121, -37]) scene.add(P.plank(18, 35, 2, mats.door, 0.3).translateX(counterX - 9).translateY(FLOOR_Y + 17.5).translateZ(z));
  const counterTop = FLOOR_Y + 38;
  const ct = [
    [P.woodTankard(mats, 1.3), counterX - 3, -112, 0.4],
    [P.woodTankard(mats, 1.3), counterX - 5, -104, 2.0],
    [P.pewterTankard(mats, 1.3), counterX - 4, -50, 1.1],
    [P.jug(terracotta, 8, 2.8), counterX - 9, -96, 0.5],
    [P.trencher(mats, 9, 6), counterX - 7, -66, 0.2],
  ];
  for (const [o, x, z, ry] of ct) scene.add(place(o, x, counterTop, z, ry));
  scene.add(place(P.breadLoaf(1), counterX - 7, counterTop + 1.6, -67, 0.3));
  scene.add(place(P.cheese(1), counterX - 6, counterTop + 1.4, -61, 1.2));
  // 酒桶架 + 横放的带龙头酒桶
  const still = P.stillage(mats, 72);
  still.position.set(-140, FLOOR_Y, -86);
  still.rotation.y = Math.PI / 2;
  scene.add(still);
  for (const z of [-114, -92, -70]) {
    const b = P.barrel(mats, { radius: 8, height: 16, tap: true });
    b.rotation.z = -Math.PI / 2;
    b.position.set(-149, FLOOR_Y + 18.6, z);
    scene.add(b);
  }
  // 货架
  const bottleColors = ['#3f6a34', '#6a3a22', '#34466a', '#7a6a32', '#4a3420', '#8a8070'];
  const shelfRnd = mulberry32(12);
  for (const sy of [62, 80]) {
    scene.add(P.plank(8, 1.8, 90, mats.frame, 0.3).translateX(ROOM.minX + 5).translateY(FLOOR_Y + sy).translateZ(-80));
    for (const z of [-118, -42]) scene.add(P.plank(5, 1.2, 1.2, ironDark, 0.1).translateX(ROOM.minX + 3).translateY(FLOOR_Y + sy - 2).translateZ(z));
    for (let z = -122; z < -40; z += 5 + shelfRnd() * 4) {
      let o;
      const r = shelfRnd();
      if (r < 0.25) o = P.jug(shelfRnd() < 0.5 ? terracotta : glazed, 6 + shelfRnd() * 3, 2.2);
      else if (r < 0.35) o = P.bowl(pewter, 2.6);
      else o = P.bottle(bottleColors[Math.floor(shelfRnd() * bottleColors.length)], 7 + shelfRnd() * 4);
      o.position.set(ROOM.minX + 5 + (shelfRnd() - 0.5) * 2, FLOOR_Y + sy + 0.9, z);
      o.rotation.y = shelfRnd() * 6;
      scene.add(o);
    }
  }
  const lantern = new THREE.Group();
  lantern.add(box(4, 6, 4, new THREE.MeshStandardMaterial({ color: '#ffc070', emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 2.5, transparent: true, opacity: 0.9 }), 0, 0, 0, { cast: false }));
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) lantern.add(box(0.4, 6.6, 0.4, ironDark, x, 0, z));
  lantern.add(box(5, 0.6, 5, ironDark, 0, 3.3, 0));
  lantern.add(box(5, 0.6, 5, ironDark, 0, -3.3, 0));
  lantern.add(box(0.3, 46, 0.3, ironDark, 0, 26, 0));
  lantern.position.set(-110, 60, -80);
  scene.add(lantern);
  const lanternLight = new THREE.PointLight('#ffa050', 5200, 0, 2);
  lanternLight.position.copy(lantern.position);
  scene.add(lanternLight);
  lights.lantern = lanternLight;

  // ---------- 左墙前段：通往二楼的楼梯，楼梯下堆着杂物 ----------
  const stairs = P.staircase(mats, { steps: 22, rise: 6.8, run: 4.3, width: 26 });
  stairs.position.set(ROOM.minX + 13, FLOOR_Y, 12);
  scene.add(stairs);
  for (const [x, z, s] of [[ROOM.minX + 10, 70, 10], [ROOM.minX + 20, 84, 8]]) scene.add(place(P.crate(mats, s), x, FLOOR_Y, z, 0.2));
  for (const [x, z] of [[ROOM.minX + 12, 96], [ROOM.minX + 22, 100]]) scene.add(place(P.sack(sackMat, food.rope, x), x, FLOOR_Y, z, x * 0.1));
  const ub = P.barrel(mats, { radius: 7, height: 16 });
  ub.position.set(ROOM.minX + 12, FLOOR_Y, 50);
  scene.add(ub);

  // ---------- 右墙：圆片玻璃窗、夕阳光柱与地面光斑 ----------
  const glassTex = new THREE.CanvasTexture(bullseyeTexture());
  glassTex.colorSpace = THREE.SRGBColorSpace;
  const glassMat = new THREE.MeshStandardMaterial({ map: glassTex, emissiveMap: glassTex, emissive: new THREE.Color('#ffd8a0'), emissiveIntensity: 2.4, roughness: 0.3 });
  const shaftT = new THREE.CanvasTexture(shaftTexture());
  shaftT.colorSpace = THREE.SRGBColorSpace;
  const patchT = new THREE.CanvasTexture(windowPatchTexture());
  patchT.colorSpace = THREE.SRGBColorSpace;
  const winW = 24;
  const winH = 32;
  const winY = FLOOR_Y + 66;
  const shaftMats = [];
  for (const z of winZs) {
    const g = new THREE.Group();
    g.position.set(ROOM.maxX, 0, z);
    scene.add(g);
    g.add(box(8, 2.5, winW + 5, limePlain, -4, winY + winH / 2 + 1.25, 0));
    g.add(P.plank(10, 2.5, winW + 6, mats.frame, 0.4).translateX(-5).translateY(winY - winH / 2 - 1.25));
    g.add(box(8, winH + 5, 2.5, limePlain, -4, winY, -winW / 2 - 1.25));
    g.add(box(8, winH + 5, 2.5, limePlain, -4, winY, winW / 2 + 1.25));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(-1, winY, 0);
    g.add(glass);
    g.add(box(1.4, winH, 1.6, beamV, -1.6, winY, 0));
    g.add(box(1.4, 1.6, winW, beamH, -1.6, winY + 4, 0));
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(-8, winY, s * (winW / 2 + 2.5));
      sh.rotation.y = s * 1.15;
      sh.add(P.plank(1.2, winH + 2, winW / 2, mats.door, 0.3).translateZ(s * (winW / 4)));
      for (const dy of [-winH / 3, winH / 3]) sh.add(box(1.5, 1.2, winW / 2 - 1, ironDark, -0.2, dy, s * (winW / 4)));
      g.add(sh);
    }
    const corners = [
      new THREE.Vector3(ROOM.maxX - 2, winY + winH / 2, z - winW / 2),
      new THREE.Vector3(ROOM.maxX - 2, winY + winH / 2, z + winW / 2),
      new THREE.Vector3(ROOM.maxX - 2, winY - winH / 2, z + winW / 2),
      new THREE.Vector3(ROOM.maxX - 2, winY - winH / 2, z - winW / 2),
    ];
    const proj = corners.map((c) => c.clone().addScaledVector(SUN_DIR, (c.y - (FLOOR_Y + 0.2)) / -SUN_DIR.y));
    const pos = [];
    const uv = [];
    for (let k = 0; k < 4; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % 4];
      const pa = proj[k];
      const pb = proj[(k + 1) % 4];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, pb.x, pb.y, pb.z, a.x, a.y, a.z, pb.x, pb.y, pb.z, pa.x, pa.y, pa.z);
      uv.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const sm = new THREE.MeshBasicMaterial({ map: shaftT, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    shaftMats.push(sm);
    const shaft = new THREE.Mesh(sg, sm);
    shaft.renderOrder = 3;
    scene.add(shaft);
    const pg = new THREE.BufferGeometry();
    const p = proj;
    pg.setAttribute('position', new THREE.Float32BufferAttribute([p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z, p[2].x, p[2].y, p[2].z, p[0].x, p[0].y, p[0].z, p[2].x, p[2].y, p[2].z, p[3].x, p[3].y, p[3].z], 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    const patch = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: patchT, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    patch.renderOrder = 2;
    scene.add(patch);
  }
  updaters.push((dt, t) => shaftMats.forEach((m, i) => (m.opacity = 0.13 + Math.sin(t * 0.4 + i * 2) * 0.02)));

  // ---------- 旗帜 ----------
  const bannerMat = (seed, f, c) => new THREE.MeshStandardMaterial({ map: bannerTexture(seed, f, c), side: THREE.DoubleSide, roughness: 0.95, transparent: true, alphaTest: 0.5 });
  for (const [x, z, ry, f, c] of [[58, ROOM.minZ + 3, 0, '#7a1a16', '#e0b44e'], [-98, ROOM.minZ + 3, 0, '#1a3a72', '#e8d8a8'], [ROOM.maxX - 3, -45, -Math.PI / 2, '#225a28', '#e0b44e'], [40, ROOM.maxZ - 3, Math.PI, '#62185a', '#ecd078']]) {
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(16, 32, 1, 8), bannerMat(Math.floor(x + z), f, c));
    bn.position.set(x, FLOOR_Y + 84, z);
    bn.rotation.y = ry;
    bn.castShadow = true;
    scene.add(bn);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 20, 8), brass);
    pole.rotation.z = Math.PI / 2;
    pole.position.set(0, 16.5, 0.3);
    bn.add(pole);
  }

  // ---------- 后墙右侧：陶器架 ----------
  const shelfX = 104;
  for (const sy of [56, 74]) {
    scene.add(P.plank(46, 1.8, 8, mats.frame, 0.3).translateX(shelfX).translateY(FLOOR_Y + sy).translateZ(ROOM.minZ + 4.5));
    for (const bx of [-20, 20]) scene.add(box(1.2, 5, 6, ironDark, shelfX + bx, FLOOR_Y + sy - 3, ROOM.minZ + 3.5));
  }
  [[-17, 56, 'jug', terracotta], [-10, 56, 'bowl', pewter], [-3, 56, 'jug', glazed], [6, 56, 'bowl', terracotta], [15, 56, 'jug', terracotta], [-16, 74, 'bowl', glazed], [-6, 74, 'jug', terracotta], [5, 74, 'jug', glazed], [16, 74, 'bowl', pewter]].forEach(([dx, sy, kind, m], i) => {
    const o = kind === 'jug' ? P.jug(m, 6 + (i % 3), 2.2) : P.bowl(m, 2.6);
    o.position.set(shelfX + dx, FLOOR_Y + sy + 0.9, ROOM.minZ + 4.5);
    o.rotation.y = i * 1.3;
    scene.add(o);
  });

  // ---------- 壁灯 ----------
  const sconceLights = [];
  const addSconce = (x, y, z, ry) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.add(P.plank(3, 7, 0.6, ironDark, 0.2).translateZ(0.3));
    g.add(P.plank(0.6, 0.6, 5, ironDark, 0.1).translateY(-1).translateZ(2.8));
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.8, 1, 12), ironDark);
    cup.position.set(0, -0.4, 5.2);
    g.add(cup);
    const cnd = createCandle({ height: 3.4, radius: 0.65, seed: x + z, flameScale: 1.3 });
    cnd.position.set(0, 0.1, 5.2);
    g.add(cnd);
    updaters.push((dt, t, cam) => cnd.userData.update(dt, t, cam));
    scene.add(g);
    const l = new THREE.PointLight('#ffb064', 2400, 0, 2);
    l.position.copy(g.localToWorld(new THREE.Vector3(0, 6, 7)));
    scene.add(l);
    sconceLights.push(l);
  };
  addSconce(76, FLOOR_Y + 62, ROOM.minZ + 1, 0);
  addSconce(134, FLOOR_Y + 62, ROOM.minZ + 1, 0);
  addSconce(ROOM.minX + 1, FLOOR_Y + 62, 0, Math.PI / 2);
  addSconce(ROOM.maxX - 1, FLOOR_Y + 62, 24, -Math.PI / 2);

  // ---------- 梁上挂的食物 ----------
  const hangers = [makeHam, makeGarlic, makeHerbs, makeSausages];
  const hangRnd = mulberry32(91);
  [
    [beamXs[0], -110], [beamXs[0], -92], [beamXs[0], -74], [beamXs[0], -50], [beamXs[0], -26], [beamXs[0], 20],
    [beamXs[1], -100], [beamXs[1], -66], [beamXs[1], 74],
    [beamXs[4], -120], [beamXs[5], 92], [beamXs[5], -30],
  ].forEach(([x, z], i) => {
    const o = hangers[i % hangers.length](food);
    o.position.set(x + (hangRnd() - 0.5) * 3, ROOM.ceil - 9, z);
    o.rotation.y = hangRnd() * 6;
    scene.add(o);
    const ph = hangRnd() * 6;
    updaters.push((dt, t) => (o.rotation.z = Math.sin(t * 0.6 + ph) * 0.02));
  });

  // ---------- 地上的稻草 ----------
  const strawT = new THREE.CanvasTexture(strawTexture());
  strawT.colorSpace = THREE.SRGBColorSpace;
  const strawMat = new THREE.MeshStandardMaterial({ map: strawT, transparent: true, alphaTest: 0.25, depthWrite: false, roughness: 1 });
  for (const [x, z, s] of [[128, 30, 40], [125, -118, 34], [-96, -10, 46], [-118, 40, 36], [40, -60, 30], [-50, 40, 32], [20, 86, 34], [96, 6, 28], [178, 70, 40], [200, 30, 36]]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(s, s), strawMat);
    st.rotation.x = -Math.PI / 2;
    st.rotation.z = x * 0.07;
    st.position.set(x, FLOOR_Y + 0.15, z);
    st.receiveShadow = true;
    st.renderOrder = 1;
    scene.add(st);
  }

  // ---------- 桌椅与客人 ----------
  const npcs = [];
  const addNPC = (rig, x, z, ry, behavior) => {
    rig.root.position.set(x, FLOOR_Y, z);
    rig.root.rotation.y = ry;
    scene.add(rig.root);
    updaters.push(behavior);
    npcs.push(rig);
    return rig;
  };
  const mug = () => P.woodTankard(mats, 1.15);

  // 1. 掷骰的一桌：靠右墙窗下，掷骰的两人面朝门口；门到游戏桌之间留出走道
  const diceT = { x: 70, z: -25 };
  scene.add(place(P.trestleTable({ length: 40, width: 22, height: TOP_H, mats, seed: 3 }), diceT.x, FLOOR_Y, diceT.z));
  for (const dz of [-16, 16]) scene.add(place(P.bench({ length: 36, height: SEAT_H, mats }), diceT.x, FLOOR_Y, diceT.z + dz));
  const tableTopY = FLOOR_Y + TOP_H;
  const smallDice = [0, 1, 2].map((i) => {
    const d = new Die3D('normal');
    d.group.position.set(diceT.x - 4 + i * 3, tableTopY + 0.5, diceT.z - 1);
    d.setRest(1 + i * 2, i);
    scene.add(d.group);
    return d;
  });
  const diceCup = P.woodTankard(mats, 1.0);
  diceCup.children.forEach((c) => c.material === mats.foam && (c.visible = false));
  scene.add(place(diceCup, diceT.x - 12, tableTopY, diceT.z - 6, 0.4));
  scene.add(place(coinStack(5, 'silver', 41), diceT.x + 10, tableTopY, diceT.z + 5));
  scene.add(place(coinStack(3, 'gold', 42), diceT.x - 10, tableTopY, diceT.z + 4));
  scene.add(place(mug(), diceT.x + 14, tableTopY, diceT.z - 7, 2));
  scene.add(place(mug(), diceT.x - 16, tableTopY, diceT.z + 7, 1));
  let rollAnim = null;
  const throwDice = () => {
    const rnd = Math.random;
    rollAnim = { t: 0, from: smallDice.map((d) => d.group.position.clone()), to: smallDice.map(() => new THREE.Vector3(diceT.x - 6 + rnd() * 12, tableTopY + 0.5, diceT.z - 2 + rnd() * 6)), spin: smallDice.map(() => new THREE.Vector3(rnd() * 12, rnd() * 12, rnd() * 12)), faces: smallDice.map(() => 1 + Math.floor(rnd() * 6)) };
  };
  updaters.push((dt) => {
    if (!rollAnim) return;
    rollAnim.t += dt;
    const k = Math.min(1, rollAnim.t / 0.7);
    smallDice.forEach((d, i) => {
      const p = rollAnim.from[i].clone().lerp(rollAnim.to[i], 1 - (1 - k) * (1 - k));
      p.y += Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * 2.5;
      d.group.position.copy(p);
      if (k < 1) d.group.rotation.set(rollAnim.spin[i].x * k, rollAnim.spin[i].y * k, rollAnim.spin[i].z * k);
      else d.setRest(rollAnim.faces[i], i * 0.7);
    });
    if (k >= 1) rollAnim = null;
  });
  const A = N.createNPC({ tunic: '#7a3a24', hose: '#4a3a2a', headwear: 'cap', hood: '#5a4a30', hair: '#3a2a1a', beard: true, skin: '#d8a888' });
  N.seat(A, SEAT_H);
  addNPC(A, diceT.x - 8, diceT.z - 16, 0, N.behaviorDiceThrower(A, { period: 6.5, offset: 1.5, onThrow: throwDice }));
  const B = N.createNPC({ tunic: '#4f5a32', hose: '#3a3a3a', headwear: 'hood', hood: '#6a3020', hair: '#2a2018', skin: '#e2b896' });
  N.seat(B, SEAT_H);
  addNPC(B, diceT.x + 9, diceT.z - 16, 0, N.behaviorWatcher(B, { offset: 0.7, lookAt: -0.35 }));
  const C = N.createNPC({ tunic: '#5a6a7a', hose: '#4a3a2a', headwear: 'hair', hair: '#8a6a3a', beard: true, skin: '#eac2a0' });
  N.seat(C, SEAT_H);
  addNPC(C, diceT.x, diceT.z + 16, Math.PI, N.behaviorWatcher(C, { offset: 2.4, lookAt: 0.2 }));

  // 2. 靠窗的长桌：两个喝酒聊天的人
  const longT = { x: 98, z: -82 };
  scene.add(place(P.trestleTable({ length: 56, width: 22, height: TOP_H, mats, seed: 5 }), longT.x, FLOOR_Y, longT.z, Math.PI / 2));
  for (const dx of [-16, 16]) scene.add(place(P.bench({ length: 50, height: SEAT_H, mats }), longT.x + dx, FLOOR_Y, longT.z, Math.PI / 2));
  const D = N.createNPC({ tunic: '#6b4f33', hose: '#5a4a3a', headwear: 'hat', hood: '#3a3a2a', beard: true, hair: '#4a3420', skin: '#d4a582' });
  N.seat(D, SEAT_H);
  N.holdInHand(D, 1, mug());
  addNPC(D, longT.x - 16, longT.z - 12, Math.PI / 2, N.behaviorDrinker(D, { period: 7.5, offset: 0, talkTo: -0.3 }));
  const E = N.createNPC({ tunic: '#3a4a5a', hose: '#4a3a2a', headwear: 'coif', hair: '#2a2018', skin: '#e0b896' });
  N.seat(E, SEAT_H);
  addNPC(E, longT.x + 16, longT.z + 8, -Math.PI / 2, N.behaviorTalker(E, { offset: 1.2, talkTo: 0.35 }));
  scene.add(place(mug(), longT.x + 8, tableTopY, longT.z + 8, 0.5));
  scene.add(place(P.pewterTankard(mats, 1.1), longT.x - 2, tableTopY, longT.z + 18, 2));
  scene.add(place(P.trencher(mats), longT.x, tableTopY, longT.z - 2, 0.1));
  scene.add(place(P.breadLoaf(0.9), longT.x, tableTopY + 1.5, longT.z - 2, 0.3));
  scene.add(place(P.apple('#a8321e'), longT.x + 3, tableTopY + 0.85, longT.z - 6));
  scene.add(place(P.apple('#8a9a2a'), longT.x + 4.5, tableTopY + 0.85, longT.z - 5));
  scene.add(place(P.candlestick(mats, { seed: 21, updaters }), longT.x - 4, tableTopY, longT.z + 20));

  // 3. 女招待端着托盘在柜台和长桌之间来回走
  const F = N.createNPC({ female: true, tunic: '#8a3a2a', hose: '#4a3a2a', headwear: 'veil', apron: '#e8e0cc', skin: '#e8c0a0', hair: '#6a4a2a', width: 0.9, scale: 0.95 });
  const trayG = N.tray(mats.frame);
  trayG.add(place(mug(), -2, 0.3, 0));
  trayG.add(place(mug(), 2.4, 0.3, 1));
  N.holdInHand(F, 0, trayG, new THREE.Vector3(0, -1.5, 1.6));
  addNPC(F, -84, -30, 0, N.behaviorWalker(F, { a: new THREE.Vector3(-84, 0, -30), b: new THREE.Vector3(50, 0, -62), speed: 32, offset: 4 }));

  // 4. 柜台后的掌柜，和柜台前聊天的妇人
  const G = N.createNPC({ tunic: '#8a7a5a', hose: '#4a3a2a', headwear: 'hair', hair: '#2a2018', beard: true, apron: '#ddd4be', width: 1.15, skin: '#dcae8a' });
  N.holdInHand(G, 0, P.pewterTankard(mats, 1.1), new THREE.Vector3(0, -1.8, 1.4));
  addNPC(G, -124, -84, Math.PI / 2, N.behaviorInnkeeper(G, { offset: 0.5 }));
  const K = N.createNPC({ female: true, tunic: '#3e5a3a', hose: '#3a2a1a', headwear: 'veil', skin: '#e2b896', hair: '#3a2a1a', width: 0.92, scale: 0.95 });
  addNPC(K, -84, -58, -Math.PI / 2 - 0.3, N.behaviorTalker(K, { offset: 2.1, talkTo: 0.2 }));

  // 5. 炉边烤火的老人
  scene.add(place(P.stool({ height: SEAT_H, mats, seed: 2 }), -8, FLOOR_Y, -90));
  const Hh = N.createNPC({ tunic: '#5a4a30', hose: '#3a3a3a', headwear: 'hood', hood: '#2e3a4a', beard: true, hair: '#9a9a90', skin: '#d8a888' });
  N.seat(Hh, SEAT_H);
  addNPC(Hh, -8, -90, Math.PI, N.behaviorWarmer(Hh, { offset: 0.3 }));

  // 6. 趴在桌上打盹的醉汉：凳子离桌沿远一些，上身才能伏到桌上而不穿进桌子
  const sleepT = { x: -64, z: -58, ry: 0.25 };
  scene.add(place(P.trestleTable({ length: 30, width: 18, height: TOP_H, mats, seed: 7 }), sleepT.x, FLOOR_Y, sleepT.z, sleepT.ry));
  const sleepD = 34; // 凳子到桌子中线的距离
  const sleepX = sleepT.x - Math.sin(sleepT.ry) * sleepD;
  const sleepZ = sleepT.z - Math.cos(sleepT.ry) * sleepD;
  scene.add(place(P.stool({ height: SEAT_H, mats, seed: 3 }), sleepX, FLOOR_Y, sleepZ));
  const I = N.createNPC({ tunic: '#6a2a2a', hose: '#4a3a2a', headwear: 'hair', hair: '#6a4a2a', skin: '#e0a888' });
  N.seat(I, SEAT_H);
  addNPC(I, sleepX, sleepZ, sleepT.ry, N.behaviorSleeper(I, { offset: 0.8 }));
  const tipped = mug();
  tipped.rotation.z = Math.PI / 2;
  scene.add(place(tipped, sleepT.x + 8, tableTopY + 1.3, sleepT.z + 2, 0.6));
  scene.add(place(P.stool({ height: SEAT_H, mats, seed: 5 }), sleepT.x + 28, FLOOR_Y, sleepT.z - 8));

  // 7. 楼梯边坐在酒桶上弹琴的乐手
  const seatBarrel = P.barrel(mats, { radius: 6.5, height: 18 });
  seatBarrel.position.set(-108, FLOOR_Y, 24);
  scene.add(seatBarrel);
  const J = N.createNPC({ tunic: '#2e4a6a', hose: '#6a2a1a', headwear: 'hat', hood: '#7a1e1a', hair: '#3a2a1a', skin: '#e2b896' });
  N.seat(J, 18);
  addNPC(J, -108, 24, Math.PI / 2, N.behaviorBard(J, { offset: 0, lute: N.holdLute(J) }));

  // 8. 游戏桌对面等着你的陌生人
  const S = N.createNPC({ tunic: '#2a2420', hose: '#2a2420', headwear: 'hood', hood: '#1e1a16', beard: true, hair: '#2a2018', skin: '#d4a582' });
  N.seat(S, SEAT_H);
  addNPC(S, 0, -25.5, 0, N.behaviorIdleSeated(S, { offset: 0.2 }));

  // ---------- 游戏桌（搁架桌结构，桌面保留刻痕） ----------
  const tableTex = planksTexture({ size: 1024, planks: 6, c1: '#8a6238', c2: '#4a3018', seed: 41, stains: 9 });
  {
    const ctx = tableTex.col.getContext('2d');
    ctx.font = '40px serif';
    ctx.fillStyle = 'rgba(30,15,5,0.35)';
    ctx.fillText('IIII  IIII  II', 120, 960);
    ctx.fillText('H + K', 820, 90);
  }
  const tableMat = texMat(tableTex, [1, 1], { roughness: 0.72, bump: 2.2 });
  scene.add(P.plank(38, 1.8, 28, tableMat, 0.5).translateY(TABLE_Y - 0.9));
  const gameH = TABLE_Y - 1.8 - FLOOR_Y;
  for (const sx of [-1, 1]) {
    const x = sx * 13;
    scene.add(P.plank(3.4, 2.6, 26, mats.frame, 0.4).translateX(x).translateY(FLOOR_Y + gameH - 1.3));
    const legLen = Math.hypot(gameH - 3, 17);
    const ang = Math.atan2(17, gameH - 3);
    for (const s of [-1, 1]) scene.add(P.plank(3, legLen, 3.6, mats.frame, 0.45).translateX(x).translateY(FLOOR_Y + (gameH - 3) / 2 + 0.6).rotateX(s * ang));
    scene.add(P.plank(3.8, 2.4, 20, mats.frame, 0.4).translateX(x).translateY(FLOOR_Y + 1.2));
  }
  scene.add(P.plank(26, 2.8, 2.8, mats.frame, 0.4).translateY(FLOOR_Y + gameH * 0.42));
  for (const z of [24, -24]) scene.add(place(P.bench({ length: 34, height: SEAT_H, mats }), 0, FLOOR_Y, z));

  // 骰盘：深色木框 + 压花皮革底
  const trayW = 16;
  const trayD = 10.6;
  const leather = leatherTexture({ size: 1024, seed: 42, c1: '#6a2818', c2: '#30100a' });
  const trayFloorMat = new THREE.MeshStandardMaterial({ map: canvasTexture(leather.col), bumpMap: canvasTexture(leather.bump, { srgb: false }), bumpScale: 2.5, roughness: 0.75 });
  const trayFloor = new THREE.Mesh(new THREE.PlaneGeometry(trayW, trayD), trayFloorMat);
  trayFloor.rotation.x = -Math.PI / 2;
  trayFloor.position.y = 0.002;
  trayFloor.receiveShadow = true;
  scene.add(trayFloor);
  const frameMat = woodMat(43, '#4a2e18', '#22120a', 0.55);
  const fw = 0.9;
  const fh = 1.1;
  scene.add(box(trayW + fw * 2, 0.3, trayD + fw * 2, frameMat, 0, -0.15, 0));
  scene.add(P.plank(trayW + fw * 2, fh, fw, frameMat, 0.2).translateY(TABLE_Y + fh / 2).translateZ(-trayD / 2 - fw / 2));
  scene.add(P.plank(trayW + fw * 2, fh, fw, frameMat, 0.2).translateY(TABLE_Y + fh / 2).translateZ(trayD / 2 + fw / 2));
  scene.add(P.plank(fw, fh, trayD, frameMat, 0.2).translateX(-trayW / 2 - fw / 2).translateY(TABLE_Y + fh / 2));
  scene.add(P.plank(fw, fh, trayD, frameMat, 0.2).translateX(trayW / 2 + fw / 2).translateY(TABLE_Y + fh / 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    scene.add(P.plank(1.6, fh + 0.12, 1.6, brass, 0.2).translateX(sx * (trayW / 2 + fw / 2)).translateY(TABLE_Y + fh / 2 + 0.03).translateZ(sz * (trayD / 2 + fw / 2)));
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), brass);
    stud.position.set(sx * (trayW / 2 + fw / 2), TABLE_Y + fh + 0.12, sz * (trayD / 2 + fw / 2));
    scene.add(stud);
  }
  for (let x = -trayW / 2 + 1.5; x <= trayW / 2 - 1.5; x += 2.2) {
    for (const sz of [-1, 1]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6), brass);
      stud.position.set(x, TABLE_Y + fh + 0.02, sz * (trayD / 2 + fw / 2));
      scene.add(stud);
    }
  }
  // 桌上道具：酒杯、烛台、钱袋与格罗申
  scene.add(place(P.woodTankard(mats, 1.05), 14.2, TABLE_Y, -8.4, 2.6));
  scene.add(place(P.woodTankard(mats, 1.05), -14.2, TABLE_Y, 8.4, -0.5));
  const stick = P.candlestick(mats, { seed: 7, updaters });
  stick.position.set(-15.6, TABLE_Y, -2.5);
  scene.add(stick);
  const candleLight = new THREE.PointLight('#ffb070', 45, 0, 2);
  candleLight.position.set(-15.6, TABLE_Y + 9, -2.5);
  scene.add(candleLight);
  lights.tableCandle = candleLight;
  const board = new THREE.Group();
  board.add(P.trencher(mats, 5.5, 3.6));
  board.add(place(P.breadLoaf(0.6), -1.1, 1.0, 0));
  board.add(place(P.cheese(0.55), 1.4, 0.75, 0.2));
  board.position.set(15.6, TABLE_Y + 0.3, 2.2);
  board.rotation.y = 0.3;
  scene.add(board);
  scene.add(place(coinStack(7, 'gold', 11), -9.4, TABLE_Y, 8.6));
  scene.add(place(coinStack(5, 'silver', 12), -8.0, TABLE_Y, 9.5));
  scene.add(place(coinPurse(13), -12.8, TABLE_Y, 11.2, 0.5));
  scene.add(place(coinStack(6, 'gold', 14), 9.4, TABLE_Y, -8.6));
  scene.add(place(coinStack(5, 'silver', 15), 8.0, TABLE_Y, -9.5));
  scene.add(place(coinPurse(16), 12.8, TABLE_Y, -11.4, 3.4));
  const loose = makeCoin('silver', 1);
  loose.position.set(-6.2, TABLE_Y + 0.05, 10.6);
  scene.add(loose);

  // ---------- 吊灯 ----------
  const chand = P.ironChandelier({ ironDark }, { radius: 10, candles: 8, updaters });
  chand.position.set(0, 50, 0);
  scene.add(chand);
  updaters.push((dt, t) => (chand.rotation.y = Math.sin(t * 0.3) * 0.03));
  const chand2 = P.ironChandelier({ ironDark }, { radius: 7, candles: 6, updaters });
  chand2.position.set(diceT.x, 58, diceT.z);
  scene.add(chand2);
  const chand2Light = new THREE.PointLight('#ffb36b', 2600, 0, 2);
  chand2Light.position.set(diceT.x, 54, diceT.z);
  scene.add(chand2Light);
  const spot = new THREE.SpotLight('#ffcf98', 3300, 0, 0.44, 0.75, 2);
  spot.position.set(0, 48, 6);
  spot.target.position.set(0, 0, 0.5);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 25;
  spot.shadow.camera.far = 90;
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 4;
  scene.add(spot);
  scene.add(spot.target);
  lights.spot = spot;
  const chandLight = new THREE.PointLight('#ffb36b', 6000, 0, 2);
  chandLight.position.set(0, 52, 0);
  scene.add(chandLight);
  lights.chand = chandLight;

  // ---------- 天光与夕阳 ----------
  const hemi = new THREE.HemisphereLight('#ffdcb0', '#6a4a30', 1.05);
  scene.add(hemi);
  lights.hemi = hemi;
  const sun = new THREE.DirectionalLight('#ffb470', 1.1);
  sun.position.copy(SUN_DIR).multiplyScalar(-400);
  sun.target.position.set(0, FLOOR_Y, 0);
  scene.add(sun);
  scene.add(sun.target);
  lights.sun = sun;

  const dust = createDust({ minX: -80, maxX: 145, minY: -36, maxY: 70, minZ: -120, maxZ: 40 }, 1100);
  scene.add(dust);
  updaters.push((dt, t, cam) => dust.userData.update(dt, t, cam));

  updaters.push((dt, t) => {
    const n = 0.82 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1) * 0.05 + Math.sin(t * 2.1) * 0.07;
    fireLight.intensity = 30000 * n;
    chandLight.intensity = 6000 * (0.95 + Math.sin(t * 11) * 0.03 + Math.sin(t * 5.3) * 0.02);
    chand2Light.intensity = 2600 * (0.94 + Math.sin(t * 10) * 0.04);
    spot.intensity = 3300 * (0.96 + Math.sin(t * 9.7) * 0.02 + Math.sin(t * 4.1) * 0.02);
    candleLight.intensity = 45 * (0.85 + Math.sin(t * 12) * 0.1);
    sconceLights.forEach((l, i) => (l.intensity = 2400 * (0.9 + Math.sin(t * 10 + i * 3) * 0.05 + Math.sin(t * 17 + i) * 0.04)));
  });

  return { updaters, lights, door, npcs };
}
