// 酒馆场景（v2 / 第四版布局）：照着参考图和设定图重做
// 从正门进来：左边是高吧台（后面两层大酒桶、一墙酒瓶、黑板、梁上挂的香草和大蒜），
// 正对面后墙是石砌尖拱窗（冷色天光）、红底金狮旗和盾牌，右墙是大石壁炉（上面挂鹿头、吊着铁锅）。
// 中间铺着红地毯的搁架长桌就是游戏桌：对面坐着掷骰的年轻人（你的对手），
// 桌角两侧是举杯的中年汉子和戴布帽的白胡子老人，女招待端着托盘来回招呼；后面还有两桌客人。
import * as THREE from 'three';
import { planksTexture, canvasTexture, leatherTexture, mulberry32, warmEnvCanvas } from './canvasTex.js';
import { strawTexture, shaftTexture, windowPatchTexture } from './sceneTex.js';
import { woodFloor, stoneWall, beamWood, ironDetail, pbr, normalFromCanvas, tex } from './ptex.js';
import { createHearthFire, createCandle, createDust } from './fire.js';
import * as P from './props.js';
import * as Q from './props2.js';
import { coinStack, coinPurse, makeCoin } from './coins.js';
import { buildCrowd } from './crowd.js';
import { createCat } from './cat.js';

export const FLOOR_Y = -38;
export const TABLE_Y = -0.3; // 游戏桌面高度
export const ROOM = { minX: -165, maxX: 165, minZ: -180, maxZ: 120, ceil: 100 };
export const DOOR = { x0: -26, x1: 26, top: 62 }; // 正门（前墙上的世界 x 范围；门顶高度）

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
// 按世界尺寸铺贴图：重算 UV（墙、地面、街道用）
function worldUV(geo, axisU, axisV, scale) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p['get' + axisU](i) / scale, p['get' + axisV](i) / scale);
  return geo;
}
function pbrMat(b, { repeat = [1, 1], normal = 2, color = '#ffffff', roughness = 1, metalness = 0 } = {}) {
  const t = pbr(b, { normal, repeat });
  return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness, metalness, color });
}
// 尖拱轮廓（窗户、窗洞上方的石墙填充共用）
function archShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w * 0.55);
  s.quadraticCurveTo(-w / 2, h - w * 0.08, 0, h);
  s.quadraticCurveTo(w / 2, h - w * 0.08, w / 2, h - w * 0.55);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

// ---------- 梁上挂的东西 ----------
function hangString(len, mat) {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 5), mat);
  s.position.y = -len / 2;
  return s;
}
function makeGarlic(m) {
  const g = new THREE.Group();
  g.add(hangString(3, m.rope));
  const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 14, 6), m.rope);
  braid.position.y = -10;
  g.add(braid);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), m.garlic);
    const a = i * 2.2;
    b.position.set(Math.cos(a) * 0.9, -4.5 - i * 1.05, Math.sin(a) * 0.9);
    b.scale.y = 0.85;
    b.castShadow = true;
    g.add(b);
  }
  return g;
}
function makeHerbs(m, seed) {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  g.add(hangString(3.5, m.rope));
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 + rnd() * 0.5, 8 + rnd() * 3, 5), [m.herb, m.herb2, m.flower][i % 3]);
    c.position.set((rnd() - 0.5) * 2.4, -8, (rnd() - 0.5) * 2.4);
    c.rotation.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4);
    c.castShadow = true;
    g.add(c);
  }
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 8), m.rope);
  tie.position.y = -3.9;
  g.add(tie);
  return g;
}
function makeSausages(m) {
  const g = new THREE.Group();
  g.add(hangString(4, m.rope));
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.4, 4, 8), m.sausage);
    const side = i % 2 ? 1 : -1;
    s.position.set(side * (0.4 + i * 0.22), -5 - i * 1.6, 0);
    s.rotation.z = side * 0.35;
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

export function buildTavern(scene, renderer, { camera } = {}) {
  const updaters = [];
  const lights = {};

  scene.background = new THREE.Color('#120c08');
  scene.fog = new THREE.FogExp2('#1e140c', 0.0022);
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = new THREE.CanvasTexture(warmEnvCanvas());
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pm.fromEquirectangular(envTex).texture;
  scene.environmentIntensity = 0.42;
  envTex.dispose();
  pm.dispose();

  // ---------- 材质 ----------
  const floorMat = pbrMat(woodFloor({ size: 512, rows: 5, seed: 11, c1: '#6e4a2e', c2: '#3a2616' }), { normal: 3 });
  const stoneMat = pbrMat(stoneWall({ size: 512, cols: 5, rows: 6, seed: 21, palette: ['#8a7d6c', '#6e6254', '#988a74', '#5e5446', '#827564', '#7a6a58', '#9a8e7e'], mortar: '#5e5446' }), { normal: 3 });
  const hearthStone = pbrMat(stoneWall({ size: 256, cols: 6, rows: 8, seed: 24, palette: ['#8c8070', '#7a6c5c', '#9a8c78', '#6c6052', '#5e5448'], mortar: '#3e362c' }), { normal: 3 });
  const beamB = beamWood({ size: 512, seed: 31, c1: '#4e3420', c2: '#22160c' });
  const beamMat = pbrMat(beamB, { normal: 3 });
  const beamV = pbrMat(beamB, { normal: 3 });
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    beamV[k] = beamV[k].clone();
    beamV[k].center.set(0.5, 0.5);
    beamV[k].rotation = Math.PI / 2;
  }
  const ironM = pbrMat(ironDetail({ size: 128, seed: 91 }), { metalness: 0.75, normal: 2 });
  const ironDark = ironM;
  const brass = new THREE.MeshStandardMaterial({ color: '#b48a3e', metalness: 1, roughness: 0.38 });
  const pewter = new THREE.MeshStandardMaterial({ color: '#a8a49a', metalness: 0.75, roughness: 0.4 });
  const terracotta = new THREE.MeshStandardMaterial({ color: '#9a5230', roughness: 0.75 });
  const glazed = new THREE.MeshStandardMaterial({ color: '#4e6a3a', roughness: 0.35 });
  const cream = new THREE.MeshStandardMaterial({ color: '#cfc2a0', roughness: 0.45 });
  const staveC = planksTexture({ size: 512, planks: 10, c1: '#8a6238', c2: '#4a301a', seed: 28, vertical: true });
  const staveMat = new THREE.MeshStandardMaterial({ map: canvasTexture(staveC.col, { repeat: [3, 1] }), normalMap: tex(normalFromCanvas(staveC.col, 3), { srgb: false, repeat: [3, 1] }), roughness: 0.8 });
  const mats = {
    top: pbrMat(beamWood({ size: 256, seed: 34, c1: '#8a6240', c2: '#4e3420' }), { normal: 2.5 }),
    frame: pbrMat(beamWood({ size: 256, seed: 35, c1: '#5e3e24', c2: '#2c1c10' }), { normal: 2.5 }),
    stave: staveMat,
    iron: ironM,
    ironDark,
    brass,
    pewter,
    lid: new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.9 }),
    foam: new THREE.MeshStandardMaterial({ color: '#e0d2b0', roughness: 0.95 }),
    crate: pbrMat(beamWood({ size: 128, seed: 36, c1: '#9a744a', c2: '#5a3e22' }), { normal: 2 }),
    bark: new THREE.MeshStandardMaterial({ color: '#3e2a18', roughness: 1 }),
    endGrain: new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 0.9 }),
    door: pbrMat(beamWood({ size: 256, seed: 33, c1: '#6a4626', c2: '#3a2410' }), { normal: 3 }),
    plaque: pbrMat(beamWood({ size: 128, seed: 37, c1: '#5a3a20', c2: '#2e1c0e' }), { normal: 2 }),
    bone: new THREE.MeshStandardMaterial({ color: '#e2d6ba', roughness: 0.65 }),
    terracotta,
    glazed,
    cream,
  };
  const food = {
    rope: new THREE.MeshStandardMaterial({ color: '#8a7048', roughness: 1 }),
    sausage: new THREE.MeshStandardMaterial({ color: '#7a3020', roughness: 0.5 }),
    garlic: new THREE.MeshStandardMaterial({ color: '#ece0ca', roughness: 0.8 }),
    herb: new THREE.MeshStandardMaterial({ color: '#6e7a3c', roughness: 1 }),
    herb2: new THREE.MeshStandardMaterial({ color: '#8a7a40', roughness: 1 }),
    flower: new THREE.MeshStandardMaterial({ color: '#9a4a3a', roughness: 1 }),
  };

  const W = ROOM.maxX - ROOM.minX;
  const Dp = ROOM.maxZ - ROOM.minZ;
  const H = ROOM.ceil - FLOOR_Y;
  const cz = (ROOM.minZ + ROOM.maxZ) / 2;

  // ---------- 地板 / 天花板 / 梁 ----------
  const floor = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(W, Dp), 'X', 'Y', 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  const ceilC = planksTexture({ size: 512, planks: 7, c1: '#4a3220', c2: '#24180e', seed: 22 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, Dp), new THREE.MeshStandardMaterial({ map: canvasTexture(ceilC.col, { repeat: [7, 6] }), normalMap: tex(normalFromCanvas(ceilC.col, 2), { srgb: false, repeat: [7, 6] }), roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, ROOM.ceil, cz);
  scene.add(ceil);
  const beamXs = [];
  for (let x = ROOM.minX + 35; x < ROOM.maxX - 10; x += 55) {
    scene.add(box(10, 11, Dp, beamV, x, ROOM.ceil - 5.5, cz));
    beamXs.push(x);
  }
  const joists = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 5, 5.5), beamMat, 200);
  const jm = new THREE.Matrix4();
  let jn = 0;
  const edges = [ROOM.minX, ...beamXs, ROOM.maxX];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i] + 5;
    const b = edges[i + 1] - 5;
    for (let z = ROOM.minZ + 10; z < ROOM.maxZ - 5; z += 17) {
      jm.makeScale(b - a, 1, 1);
      jm.setPosition((a + b) / 2, ROOM.ceil - 2.5, z);
      joists.setMatrixAt(jn++, jm);
    }
  }
  joists.count = jn;
  joists.castShadow = true;
  scene.add(joists);
  // 屋子中段一根横梁，两根立柱撑着
  for (const x of [-62, 62]) {
    scene.add(box(9, H - 11, 9, beamV, x, FLOOR_Y + (H - 11) / 2, -58));
    for (const s of [-1, 1]) scene.add(box(4, 14, 8, beamV, x + s * 7, ROOM.ceil - 16, -58, { rz: s * 0.7 }));
  }
  scene.add(box(W - 2, 10, 9, beamMat, 0, ROOM.ceil - 16, -58));

  // ---------- 墙（石墙），前墙挖门洞、后墙挖窗洞 ----------
  const wallPiece = (x0, x1, y0, y1, mat = stoneMat) => {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2) / 55, (p.getY(i) + (y0 + y1) / 2) / 55);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.receiveShadow = true;
    return m;
  };
  const wall = (len, px, pz, ry, holes = []) => {
    const g = new THREE.Group();
    g.position.set(px, FLOOR_Y, pz);
    g.rotation.y = ry;
    const L = len / 2;
    const cuts = [-L, ...holes.flatMap((h) => [h.x0, h.x1]), L].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      const hole = holes.find((h) => h.x0 <= a + 0.01 && h.x1 >= b - 0.01);
      if (!hole) g.add(wallPiece(a, b, 0, H));
      else {
        if (hole.y0 > 0) g.add(wallPiece(a, b, 0, hole.y0));
        g.add(wallPiece(a, b, hole.y1, H));
      }
    }
    g.add(box(len, 5, 3, beamMat, 0, H - 13, 1.5));
    g.add(box(len, 3, 2.4, beamMat, 0, 1.5, 1.2));
    scene.add(g);
    return g;
  };
  const WIN = { x: -8, w: 40, h: 70, y0: 40 };
  wall(W, 0, ROOM.minZ, 0, [{ x0: WIN.x - WIN.w / 2, x1: WIN.x + WIN.w / 2, y0: WIN.y0, y1: WIN.y0 + WIN.h }]);
  wall(W, 0, ROOM.maxZ, Math.PI, [{ x0: -DOOR.x1, x1: -DOOR.x0, y0: 0, y1: DOOR.top - FLOOR_Y }]);
  wall(Dp, ROOM.minX, cz, Math.PI / 2);
  wall(Dp, ROOM.maxX, cz, -Math.PI / 2);
  for (const x of [-120, -60, 60, 120]) scene.add(box(7, H, 5, beamV, x, FLOOR_Y + H / 2, ROOM.minZ + 2.5));
  for (const z of [-130, -10, 70]) scene.add(box(5, H, 7, beamV, ROOM.minX + 2.5, FLOOR_Y + H / 2, z));
  for (const z of [-140, 20, 80]) scene.add(box(5, H, 7, beamV, ROOM.maxX - 2.5, FLOOR_Y + H / 2, z));

  // ---------- 后墙尖拱窗 + 冷色天光 ----------
  const win = Q.archWindow({ w: WIN.w, h: WIN.h, depth: 16, stone: stoneMat });
  win.position.set(WIN.x, FLOOR_Y + WIN.y0, ROOM.minZ);
  scene.add(win);
  // 窗洞是矩形，尖拱以外的两个上角用石墙补上
  const spandrel = new THREE.Shape();
  spandrel.moveTo(-WIN.w / 2, 0);
  spandrel.lineTo(WIN.w / 2, 0);
  spandrel.lineTo(WIN.w / 2, WIN.h);
  spandrel.lineTo(-WIN.w / 2, WIN.h);
  spandrel.closePath();
  spandrel.holes.push(archShape(WIN.w, WIN.h));
  const spG = worldUV(new THREE.ShapeGeometry(spandrel, 24), 'X', 'Y', 55);
  const sp = new THREE.Mesh(spG, stoneMat);
  sp.position.set(WIN.x, FLOOR_Y + WIN.y0, ROOM.minZ + 0.05);
  scene.add(sp);
  const moon = new THREE.DirectionalLight('#9ab4e0', 0.5);
  moon.position.set(WIN.x - 60, FLOOR_Y + 220, ROOM.minZ - 260);
  moon.target.position.set(WIN.x + 10, FLOOR_Y, ROOM.minZ + 80);
  scene.add(moon, moon.target);
  lights.moon = moon;
  const winLight = new THREE.SpotLight('#a8c0e8', 9000, 320, 0.5, 0.8, 2);
  winLight.position.set(WIN.x, FLOOR_Y + WIN.y0 + WIN.h * 0.6, ROOM.minZ - 30);
  winLight.target.position.set(WIN.x + 5, FLOOR_Y, ROOM.minZ + 90);
  scene.add(winLight, winLight.target);
  lights.window = winLight;
  const shaftT = new THREE.CanvasTexture(shaftTexture());
  shaftT.colorSpace = THREE.SRGBColorSpace;
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftT, color: '#9fb4d8', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const [dx, sc] of [[0, 1], [-6, 0.75], [7, 0.8]]) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w * 0.8 * sc, 150), shaftMat);
    sh.position.set(WIN.x + dx, FLOOR_Y + 55, ROOM.minZ + 62);
    sh.rotation.set(-0.62, 0, 0);
    sh.renderOrder = 3;
    scene.add(sh);
  }
  const patchT = new THREE.CanvasTexture(windowPatchTexture());
  patchT.colorSpace = THREE.SRGBColorSpace;
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w * 1.1, 60), new THREE.MeshBasicMaterial({ map: patchT, color: '#a8bce0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(WIN.x + 4, FLOOR_Y + 0.25, ROOM.minZ + 95);
  scene.add(patch);
  updaters.push((dt, t) => (shaftMat.opacity = 0.09 + Math.sin(t * 0.37) * 0.015));

  // 旗与盾（后墙）
  const banner = Q.lionBanner({ w: 22, h: 46 });
  banner.position.set(52, FLOOR_Y + 82, ROOM.minZ + 3);
  scene.add(banner);
  const shield = Q.heaterShield({ mats, w: 20, h: 26 });
  shield.position.set(24, FLOOR_Y + 86, ROOM.minZ + 1.2);
  scene.add(shield);
  const banner2 = Q.lionBanner({ field: '#1e3062', gold: '#e2c27a', w: 18, h: 38 });
  banner2.position.set(-68, FLOOR_Y + 84, ROOM.minZ + 3);
  scene.add(banner2);

  // ---------- 右墙大壁炉 ----------
  const fz = -64;
  const hearth = new THREE.Group();
  hearth.position.set(ROOM.maxX, FLOOR_Y, fz);
  hearth.rotation.y = -Math.PI / 2;
  scene.add(hearth);
  const openW = 58;
  const openH = 50;
  for (const s of [-1, 1]) hearth.add(P.plank(22, openH, 32, hearthStone, 1.2).translateX(s * (openW / 2 + 11)).translateY(openH / 2).translateZ(16));
  const hoodGeo = new THREE.CylinderGeometry(1, 1, H - openH - 10, 4, 1);
  hoodGeo.rotateY(Math.PI / 4);
  const hp = hoodGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const top = hp.getY(i) > 0;
    hp.setX(i, (Math.sign(hp.getX(i)) * (top ? 78 : 112)) / 2);
    hp.setZ(i, (Math.sign(hp.getZ(i)) * (top ? 26 : 34)) / 2);
  }
  hoodGeo.computeVertexNormals();
  worldUV(hoodGeo, 'X', 'Y', 70);
  const hood = new THREE.Mesh(hoodGeo, hearthStone);
  hood.position.set(0, openH + 10 + (H - openH - 10) / 2, 17);
  hood.castShadow = true;
  hood.receiveShadow = true;
  hearth.add(hood);
  const soot = new THREE.MeshStandardMaterial({ color: '#160e08', roughness: 1 });
  hearth.add(box(openW, openH, 1, soot, 0, openH / 2, 1, { cast: false }));
  for (const s of [-1, 1]) hearth.add(box(1, openH, 30, soot, (s * openW) / 2, openH / 2, 15, { cast: false }));
  hearth.add(box(openW, 1, 30, soot, 0, openH - 0.5, 15, { cast: false }));
  hearth.add(P.plank(120, 10, 18, beamMat, 1).translateY(openH + 5).translateZ(26));
  hearth.add(P.plank(128, 2.6, 22, mats.plaque, 0.6).translateY(openH + 11).translateZ(27));
  hearth.add(P.plank(132, 2, 30, hearthStone, 0.6).translateY(1).translateZ(44));
  const logs = P.logPile(mats, { count: 3, length: 26, seed: 9 });
  logs.position.set(0, 2, 15);
  hearth.add(logs);
  const andi = P.andirons(mats);
  andi.position.set(0, 0, 15);
  hearth.add(andi);
  const ember = new THREE.Mesh(new THREE.CircleGeometry(17, 24), new THREE.MeshBasicMaterial({ color: '#ff6a18', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ember.rotation.x = -Math.PI / 2;
  ember.position.set(0, 1.2, 15);
  hearth.add(ember);
  const fire = createHearthFire(36, 32);
  fire.position.set(0, 4, 15);
  hearth.add(fire);
  updaters.push((dt, t, cam) => fire.userData.update(dt, t, cam));
  const crane = new THREE.Group();
  crane.position.set(-openW / 2 + 3, 0, 13);
  crane.add(P.plank(1.6, 44, 1.6, ironDark, 0.2).translateY(22));
  crane.add(P.plank(22, 1.6, 1.6, ironDark, 0.2).translateY(42).translateX(11));
  const pot = Q.cauldron(mats, { r: 6, chain: 12 });
  pot.position.set(20, 16, 0);
  crane.add(pot);
  hearth.add(crane);
  const stag = Q.stagHead(mats);
  stag.position.set(0, openH + 38, 22);
  stag.scale.setScalar(1.25);
  hearth.add(stag);
  for (const x of [-50, -36, 38, 52]) {
    const cs = P.candlestick(mats, { seed: x, updaters });
    cs.position.set(x, openH + 12.3, 30);
    hearth.add(cs);
  }
  hearth.add(place(P.jug(terracotta, 10, 3.4), -24, openH + 12.3, 29, 0.5));
  hearth.add(place(Q.wickerBottle(mats), 26, openH + 12.3, 29, 2.2));
  for (const x of [-12, 13]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.4, 24), pewter);
    plate.rotation.x = Math.PI / 2 - 0.25;
    plate.position.set(x, openH + 16, 22);
    hearth.add(plate);
  }
  const pile = P.logPile(mats, { count: 12, length: 20, seed: 4 });
  pile.position.set(72, 0, 18);
  pile.rotation.y = Math.PI / 2;
  hearth.add(pile);
  const fireLight = new THREE.PointLight('#ff8636', 42000, 0, 2);
  fireLight.position.set(ROOM.maxX - 48, FLOOR_Y + 20, fz);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.004;
  fireLight.shadow.camera.near = 4;
  fireLight.shadow.camera.far = 400;
  scene.add(fireLight);
  lights.fire = fireLight;

  // ---------- 左边：吧台、酒桶、酒架、黑板 ----------
  const barX = -100;
  const bar = Q.barCounter({ length: 104, height: 50, depth: 18, mats });
  bar.position.set(barX - 9, FLOOR_Y, -84);
  scene.add(bar);
  const barTop = FLOOR_Y + 50;
  [
    [P.woodTankard(mats, 1.3), barX - 4, -120, 0.4],
    [P.woodTankard(mats, 1.3), barX - 6, -111, 2.0],
    [P.pewterTankard(mats, 1.3), barX - 5, -48, 1.1],
    [P.jug(terracotta, 9, 3.0), barX - 10, -100, 0.5],
    [Q.wickerBottle(mats), barX - 9, -60, 1.5],
    [P.trencher(mats, 9, 6), barX - 8, -72, 0.2],
    [P.bowl(pewter, 3), barX - 5, -40, 0],
  ].forEach(([o, x, z, ry]) => scene.add(place(o, x, barTop, z, ry)));
  scene.add(place(P.breadLoaf(1), barX - 8, barTop + 1.6, -73, 0.3));
  scene.add(place(P.cheese(1), barX - 7, barTop + 1.4, -68, 1.2));
  const barCandle = Q.dishCandle(mats, updaters, 41);
  barCandle.position.set(barX - 4, barTop, -92);
  scene.add(barCandle);
  // 吧台后：两层大酒桶
  const still = P.stillage(mats, 70);
  still.position.set(ROOM.minX + 16, FLOOR_Y, -136);
  still.rotation.y = Math.PI / 2;
  scene.add(still);
  for (const [z, y, r] of [[-160, 0, 10], [-136, 0, 10], [-112, 0, 10], [-148, 1, 8.5], [-124, 1, 8.5]]) {
    const b = P.barrel(mats, { radius: r, height: 22, tap: y === 0 });
    b.rotation.z = -Math.PI / 2;
    b.position.set(ROOM.minX + 22, FLOOR_Y + 22 + y * 19.5, z);
    scene.add(b);
  }
  // 酒架：三层搁板，满是酒瓶、陶罐、碗和蜡烛
  const bottleColors = ['#2e5a2a', '#5a2e1a', '#2a3a5a', '#6a5a2a', '#3a2814', '#7a7262', '#1e3a22'];
  const shelfRnd = mulberry32(12);
  for (const sy of [58, 74, 90]) {
    const sh = Q.wallShelf({ length: 84, depth: 9, mats });
    sh.position.set(ROOM.minX + 0.5, FLOOR_Y + sy, -60);
    scene.add(sh);
    for (let z = -98; z < -22; z += 4.2 + shelfRnd() * 3) {
      let o;
      const r = shelfRnd();
      if (r < 0.18) o = P.jug(shelfRnd() < 0.5 ? terracotta : shelfRnd() < 0.5 ? glazed : cream, 6 + shelfRnd() * 4, 2.3);
      else if (r < 0.25) o = P.bowl(pewter, 2.6);
      else if (r < 0.32) o = Q.wickerBottle(mats, 0.85 + shelfRnd() * 0.2);
      else if (r < 0.36) {
        o = createCandle({ height: 3 + shelfRnd() * 3, radius: 0.7, seed: z * 3 + sy, flameScale: 1 });
        const c = o;
        updaters.push((dt, t, cam) => c.userData.update(dt, t, cam));
      } else o = P.bottle(bottleColors[Math.floor(shelfRnd() * bottleColors.length)], 8 + shelfRnd() * 5);
      o.position.set(ROOM.minX + 5 + (shelfRnd() - 0.5) * 2.4, FLOOR_Y + sy + 0.9, z);
      o.rotation.y = shelfRnd() * 6;
      scene.add(o);
    }
  }
  const board = Q.chalkboard({ mats, w: 34, h: 23 });
  board.position.set(ROOM.minX + 1, FLOOR_Y + 112, -60);
  board.rotation.y = Math.PI / 2;
  scene.add(board);
  // 吧台前的高凳、凳上的猫
  [[-88, -118], [-88, -96], [-88, -50], [-86, -26]].forEach(([x, z], i) => scene.add(place(Q.roundStool({ height: 32, mats, seed: 3 + i }), x, FLOOR_Y, z)));
  const cat = createCat();
  cat.position.set(-86, FLOOR_Y + 32, -26);
  cat.rotation.y = Math.PI / 2 + 0.5;
  scene.add(cat);
  updaters.push((dt, t) => cat.userData.update(dt, t));
  // 梁上挂的大蒜、香草、香肠
  const hangRnd = mulberry32(91);
  const hangers = [(m) => makeGarlic(m), (m) => makeHerbs(m, 3), (m) => makeHerbs(m, 7), (m) => makeSausages(m)];
  [[-122, -128], [-122, -112], [-122, -96], [-122, -78], [-122, -62], [-122, -46], [-122, -32], [-67, -120], [-12, -150], [43, -150], [98, -30], [-67, 50]].forEach(([x, z], i) => {
    const o = hangers[i % hangers.length](food);
    o.position.set(x + (hangRnd() - 0.5) * 3, ROOM.ceil - 11, z);
    o.rotation.y = hangRnd() * 6;
    scene.add(o);
    const ph = hangRnd() * 6;
    updaters.push((dt, t) => (o.rotation.z = Math.sin(t * 0.6 + ph) * 0.02));
  });
  const lantern = Q.hangingLantern(mats, updaters, { chain: 24 });
  lantern.position.set(barX + 2, ROOM.ceil - 36, -86);
  scene.add(lantern);
  const lanternLight = new THREE.PointLight('#ffa050', 5200, 0, 2);
  lanternLight.position.set(barX + 2, ROOM.ceil - 38, -86);
  scene.add(lanternLight);
  lights.lantern = lanternLight;

  // ---------- 壁烛台 ----------
  const sconceLights = [];
  const addSconce = (x, y, z, ry, seed) => {
    const s = Q.wallSconce(mats, updaters, seed);
    s.position.set(x, y, z);
    s.rotation.y = ry;
    scene.add(s);
    const l = new THREE.PointLight('#ffb064', 2600, 0, 2);
    l.position.copy(s.localToWorld(new THREE.Vector3(0, 6, 8)));
    scene.add(l);
    sconceLights.push(l);
  };
  addSconce(-104, FLOOR_Y + 70, ROOM.minZ + 1, 0, 1);
  addSconce(94, FLOOR_Y + 70, ROOM.minZ + 1, 0, 2);
  addSconce(ROOM.maxX - 1, FLOOR_Y + 70, 26, -Math.PI / 2, 3);
  addSconce(ROOM.maxX - 1, FLOOR_Y + 70, -140, -Math.PI / 2, 4);
  addSconce(ROOM.minX + 1, FLOOR_Y + 70, 40, Math.PI / 2, 5);
  addSconce(-44, FLOOR_Y + 70, ROOM.maxZ - 1, Math.PI, 6);
  addSconce(44, FLOOR_Y + 70, ROOM.maxZ - 1, Math.PI, 7);

  // ---------- 后面两桌 ----------
  const tB = { x: -36, z: -110 };
  const tC = { x: 78, z: -112 };
  for (const t of [tB, tC]) {
    scene.add(place(Q.trestleTable({ length: 50, width: 26, height: 37, mats, seed: t.x }), t.x, FLOOR_Y, t.z));
    scene.add(place(Q.heavyBench({ length: 40, height: 22, mats }), t.x, FLOOR_Y, t.z - 23));
    scene.add(place(Q.heavyBench({ length: 40, height: 22, mats }), t.x, FLOOR_Y, t.z + 23));
    const tt = FLOOR_Y + 37;
    scene.add(place(P.woodTankard(mats, 1.1), t.x + 9, tt, t.z + 5, 1));
    scene.add(place(P.pewterTankard(mats, 1.1), t.x - 12, tt, t.z - 4, 2));
    scene.add(place(Q.foodPlatter(mats, 0.85, t.x), t.x - 2, tt, t.z, 0.3));
    scene.add(place(Q.wickerBottle(mats), t.x + 16, tt, t.z - 3, 0.6));
    const cs = Q.dishCandle(mats, updaters, t.z);
    cs.position.set(t.x + 4, tt, t.z + 4);
    scene.add(cs);
    const cl = new THREE.PointLight('#ffb070', 300, 0, 2);
    cl.position.set(t.x + 4, tt + 8, t.z + 4);
    scene.add(cl);
  }
  scene.add(place(Q.rug({ w: 70, d: 50, seed: 82, field: '#5a1e1a' }), tB.x, FLOOR_Y + 0.2, tB.z));

  // ---------- 游戏桌：搁架长桌（设定图样式）+ 红地毯 + 骰盘 ----------
  scene.add(place(Q.rug({ w: 100, d: 70, seed: 81 }), 0, FLOOR_Y + 0.2, 2));
  const gameH = TABLE_Y - FLOOR_Y;
  scene.add(place(Q.trestleTable({ length: 54, width: 34, height: gameH, mats, seed: 41 }), 0, FLOOR_Y, 0));
  scene.add(place(Q.heavyBench({ length: 40, height: 22, mats }), 0, FLOOR_Y, 28));
  // 三把靠背椅：对手坐对面，两个看客坐在近处两角、斜对着桌子
  const seats = {
    dicer: { pos: [0, -27.5], ry: 0 },
    drinker: { pos: [-33, 10], ry: Math.atan2(33, -10) },
    elder: { pos: [33, 10], ry: Math.atan2(-33, -10) },
  };
  for (const s of Object.values(seats)) {
    const ch = Q.ladderChair({ mats });
    ch.position.set(s.pos[0], FLOOR_Y, s.pos[1]);
    ch.rotation.y = s.ry;
    ch.translateZ(-2.5);
    scene.add(ch);
  }
  const pelt = Q.furPelt({ w: 22, d: 10, drop: 6, seed: 8, c1: '#d8d0c0', c2: '#8a8070', c3: '#f0ece2' });
  pelt.position.set(14, FLOOR_Y + 22.2, 28);
  scene.add(pelt);

  // 骰盘：深色木框 + 压花皮革底（尺寸不能变，物理和摆位都依赖它）
  const trayW = 16;
  const trayD = 10.6;
  const leather = leatherTexture({ size: 1024, seed: 42, c1: '#6a2818', c2: '#30100a' });
  const trayFloorMat = new THREE.MeshStandardMaterial({ map: canvasTexture(leather.col), bumpMap: canvasTexture(leather.bump, { srgb: false }), bumpScale: 2.5, roughness: 0.75 });
  const trayFloor = new THREE.Mesh(new THREE.PlaneGeometry(trayW, trayD), trayFloorMat);
  trayFloor.rotation.x = -Math.PI / 2;
  trayFloor.position.y = 0.002;
  trayFloor.receiveShadow = true;
  scene.add(trayFloor);
  const frameMat = mats.frame.clone();
  frameMat.color.set('#8a6a4c');
  const fw = 0.9;
  const fh = 1.1;
  scene.add(box(trayW + fw * 2, 0.3, trayD + fw * 2, frameMat, 0, -0.15, 0));
  scene.add(P.plank(trayW + fw * 2, fh, fw, frameMat, 0.2).translateY(TABLE_Y + fh / 2).translateZ(-trayD / 2 - fw / 2));
  scene.add(P.plank(trayW + fw * 2, fh, fw, frameMat, 0.2).translateY(TABLE_Y + fh / 2).translateZ(trayD / 2 + fw / 2));
  scene.add(P.plank(fw, fh, trayD, frameMat, 0.2).translateX(-trayW / 2 - fw / 2).translateY(TABLE_Y + fh / 2));
  scene.add(P.plank(fw, fh, trayD, frameMat, 0.2).translateX(trayW / 2 + fw / 2).translateY(TABLE_Y + fh / 2));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      scene.add(P.plank(1.6, fh + 0.12, 1.6, brass, 0.2).translateX(sx * (trayW / 2 + fw / 2)).translateY(TABLE_Y + fh / 2 + 0.03).translateZ(sz * (trayD / 2 + fw / 2)));
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), brass);
      stud.position.set(sx * (trayW / 2 + fw / 2), TABLE_Y + fh + 0.12, sz * (trayD / 2 + fw / 2));
      scene.add(stud);
    }
  }
  for (let x = -trayW / 2 + 1.5; x <= trayW / 2 - 1.5; x += 2.2) {
    for (const sz of [-1, 1]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6), brass);
      stud.position.set(x, TABLE_Y + fh + 0.02, sz * (trayD / 2 + fw / 2));
      scene.add(stud);
    }
  }
  // 桌上的东西：避开两排骰子（x=±10.6）和两个骰盅 (±11.6, ±7.4)
  scene.add(place(P.woodTankard(mats, 1.05), 15.6, TABLE_Y, -9.6, 2.6));
  scene.add(place(P.pewterTankard(mats, 1.1), -21.5, TABLE_Y, -8.5, 1.2));
  const stick = Q.dishCandle(mats, updaters, 7);
  stick.position.set(-17.5, TABLE_Y, -2.5);
  scene.add(stick);
  const candleLight = new THREE.PointLight('#ffb070', 45, 0, 2);
  candleLight.position.set(-17.5, TABLE_Y + 9, -2.5);
  scene.add(candleLight);
  lights.tableCandle = candleLight;
  scene.add(place(Q.foodPlatter(mats, 0.72, 5), 18.5, TABLE_Y, 2.5, 0.3));
  scene.add(place(Q.dicePouch(mats), 19.5, TABLE_Y, -6.5, 0.8));
  scene.add(place(coinStack(7, 'gold', 11), -8.4, TABLE_Y, 9.4));
  scene.add(place(coinStack(5, 'silver', 12), -6.8, TABLE_Y, 10.4));
  scene.add(place(coinPurse(13), -12.4, TABLE_Y, 13.2, 0.5));
  scene.add(place(coinStack(6, 'gold', 14), 8.4, TABLE_Y, -9.4));
  scene.add(place(coinStack(5, 'silver', 15), 6.8, TABLE_Y, -10.4));
  scene.add(place(coinPurse(16), 12.4, TABLE_Y, -13.4, 3.4));
  const loose = makeCoin('silver', 1);
  loose.position.set(-4.6, TABLE_Y + 0.05, 11.6);
  scene.add(loose);

  // ---------- 前墙：正门、门外街道 ----------
  const doorHinge = new THREE.Group();
  doorHinge.position.set(DOOR.x1, FLOOR_Y, ROOM.maxZ + 0.5);
  doorHinge.rotation.y = -Math.PI / 2;
  scene.add(doorHinge);
  const door = P.plankDoor(mats, { width: DOOR.x1 - DOOR.x0, height: DOOR.top - FLOOR_Y });
  doorHinge.add(door);
  for (const x of [DOOR.x0 - 2.5, DOOR.x1 + 2.5]) scene.add(box(5, DOOR.top - FLOOR_Y + 6, 8, beamV, x, FLOOR_Y + (DOOR.top - FLOOR_Y + 6) / 2, ROOM.maxZ + 2));
  scene.add(box(DOOR.x1 - DOOR.x0 + 12, 7, 8.5, beamMat, 0, DOOR.top + 3.5, ROOM.maxZ + 2));
  const facade = new THREE.Group();
  facade.position.set(0, FLOOR_Y, ROOM.maxZ + 6);
  for (const [x0, x1] of [[-150, DOOR.x0 - 5], [DOOR.x1 + 5, 150]]) facade.add(wallPiece(x0, x1, 0, H + 30));
  facade.add(wallPiece(DOOR.x0 - 5, DOOR.x1 + 5, DOOR.top - FLOOR_Y + 7, H + 30));
  facade.add(box(300, 6, 3, beamMat, 0, H - 5, 1.5));
  for (const x of [-140, -90, -48, 48, 90, 140]) facade.add(box(6, H + 30, 3, beamV, x, (H + 30) / 2, 1.5));
  scene.add(facade);
  const streetMat = pbrMat(stoneWall({ size: 256, cols: 7, rows: 7, seed: 51, palette: ['#6a6258', '#5a5248', '#7a7064'], mortar: '#3a342c' }), { normal: 4, color: '#a09484' });
  const street = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(320, 220), 'X', 'Y', 70), streetMat);
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, FLOOR_Y - 0.2, ROOM.maxZ + 116);
  street.receiveShadow = true;
  scene.add(street);
  scene.add(P.plank(DOOR.x1 - DOOR.x0 + 14, 3, 16, hearthStone, 0.6).translateY(FLOOR_Y + 1.2).translateZ(ROOM.maxZ + 12));
  const sign = P.tavernSign(mats);
  sign.position.set(DOOR.x0 - 30, FLOOR_Y + 80, ROOM.maxZ + 10);
  sign.rotation.y = Math.PI / 2;
  scene.add(sign);
  const outLamp = Q.hangingLantern(mats, updaters, { chain: 4 });
  outLamp.position.set(DOOR.x1 + 16, FLOOR_Y + 84, ROOM.maxZ + 16);
  scene.add(outLamp);
  scene.add(box(1, 1, 12, ironDark, DOOR.x1 + 16, FLOOR_Y + 95, ROOM.maxZ + 11));
  const outLight = new THREE.PointLight('#ffa050', 1500, 0, 2);
  outLight.position.set(DOOR.x1 + 16, FLOOR_Y + 80, ROOM.maxZ + 22);
  scene.add(outLight);
  for (const [x, s] of [[DOOR.x1 + 40, 1], [DOOR.x0 - 46, 1.1]]) {
    const b = P.barrel(mats, { radius: 7 * s, height: 16 * s });
    b.position.set(x, FLOOR_Y, ROOM.maxZ + 18);
    scene.add(b);
  }
  scene.add(place(P.crate(mats, 11), 70, FLOOR_Y, ROOM.maxZ - 12, 0.2));
  scene.add(place(P.crate(mats, 9), 82, FLOOR_Y, ROOM.maxZ - 10, -0.3));

  // ---------- 吊灯 ----------
  const chand = P.ironChandelier({ ironDark }, { radius: 15, candles: 12, updaters });
  chand.position.set(0, 66, 0);
  scene.add(chand);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, ROOM.ceil - 70, 4), ironDark);
    c.position.set(Math.cos(a) * 7, 66 + (ROOM.ceil - 66) / 2, Math.sin(a) * 7);
    c.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
    scene.add(c);
  }
  updaters.push((dt, t) => (chand.rotation.y = Math.sin(t * 0.3) * 0.03));
  const chandLight = new THREE.PointLight('#ffb36b', 9000, 0, 2);
  chandLight.position.set(0, 60, 0);
  scene.add(chandLight);
  lights.chand = chandLight;
  for (const t of [tB, tC]) {
    const c2 = P.ironChandelier({ ironDark }, { radius: 9, candles: 7, updaters });
    c2.position.set(t.x, 70, t.z);
    scene.add(c2);
    const l2 = new THREE.PointLight('#ffb36b', 3600, 0, 2);
    l2.position.set(t.x, 64, t.z);
    scene.add(l2);
    sconceLights.push(l2);
  }
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

  const hemi = new THREE.HemisphereLight('#ffd6a8', '#3a2414', 0.55);
  scene.add(hemi);
  lights.hemi = hemi;

  const strawT = new THREE.CanvasTexture(strawTexture());
  strawT.colorSpace = THREE.SRGBColorSpace;
  const strawMat = new THREE.MeshStandardMaterial({ map: strawT, transparent: true, alphaTest: 0.25, depthWrite: false, roughness: 1 });
  for (const [x, z, s] of [[-80, 30, 40], [110, -20, 34], [-120, -10, 30], [40, 80, 36], [130, 60, 30], [-30, -150, 30]]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(s, s), strawMat);
    st.rotation.x = -Math.PI / 2;
    st.rotation.z = x * 0.07;
    st.position.set(x, FLOOR_Y + 0.15, z);
    st.renderOrder = 1;
    scene.add(st);
  }
  const dust = createDust({ minX: -120, maxX: 140, minY: -36, maxY: 80, minZ: -170, maxZ: 60 }, 1300);
  scene.add(dust);
  updaters.push((dt, t, cam) => dust.userData.update(dt, t, cam));

  // ---------- 人 ----------
  const T = FLOOR_Y + 37;
  const crowd = buildCrowd(scene, {
    FLOOR_Y,
    mats,
    updaters,
    camera,
    spots: {
      dicer: { pos: seats.dicer.pos, ry: seats.dicer.ry, seat: 22, tableY: TABLE_Y },
      drinker: { pos: seats.drinker.pos, ry: seats.drinker.ry, seat: 22, tableY: TABLE_Y },
      elder: { pos: seats.elder.pos, ry: seats.elder.ry, seat: 22, tableY: TABLE_Y },
      barmaid: { pos: [-110, -40], ry: 0, seat: null, path: [new THREE.Vector3(-108, 0, -40), new THREE.Vector3(26, 0, -36)] },
      graybeard: { cast: 'graybeard', pos: [tB.x - 6, tB.z - 23], ry: 0, seat: 22, tableY: T, partner: 'maiden', phase: 0.1, mug: true },
      maiden: { pos: [tB.x + 9, tB.z - 23], ry: 0, seat: 22, tableY: T, partner: 'graybeard', phase: 0.55 },
      traveler: { pos: [tB.x + 2, tB.z + 23], ry: Math.PI, seat: 22, tableY: T, partner: 'graybeard', phase: 0.8, mug: true },
      smith: { pos: [tC.x - 7, tC.z - 23], ry: 0, seat: 22, tableY: T, partner: 'youth', phase: 0.3, mug: true },
      youth: { pos: [tC.x + 9, tC.z - 23], ry: 0, seat: 22, tableY: T, partner: 'smith', phase: 0.7 },
      monk: { pos: [tC.x, tC.z + 23], ry: Math.PI, seat: 22, tableY: T, partner: 'smith', phase: 0.45, mug: true },
    },
  });

  updaters.push((dt, t) => {
    const n = 0.82 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1) * 0.05 + Math.sin(t * 2.1) * 0.07;
    fireLight.intensity = 42000 * n;
    chandLight.intensity = 9000 * (0.95 + Math.sin(t * 11) * 0.03 + Math.sin(t * 5.3) * 0.02);
    spot.intensity = 3300 * (0.96 + Math.sin(t * 9.7) * 0.02 + Math.sin(t * 4.1) * 0.02);
    candleLight.intensity = 45 * (0.85 + Math.sin(t * 12) * 0.1);
    lanternLight.intensity = 5200 * (0.9 + Math.sin(t * 9 + 1) * 0.06);
    sconceLights.forEach((l, i) => (l.intensity = l.userData.base * (0.9 + Math.sin(t * 10 + i * 3) * 0.05 + Math.sin(t * 17 + i) * 0.04)));
  });
  sconceLights.forEach((l) => (l.userData.base = l.intensity));

  return { updaters, lights, door, npcs: Object.values(crowd.chars), crowd };
}
