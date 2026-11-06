// 酒馆场景（v3）：Blender 里建模、Cycles 烘焙好光照的整间酒馆（tavern.glb），
// 这里只负责：还原光照贴图、给人物和骰子打光（全景环境光 + 吊灯主光 + 壁炉火光）、
// 在标记点上放会动的火焰、搭骰盘、摆钱币、开场时转动大门。
import * as THREE from 'three';
import { COIN_STACKS, LOOSE_COINS, PURSES, CANDLE, MUG } from './coinLayout.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { loadGLB, assetBuffer, assetJSON } from './assets.js';
import { LITE } from './device.js';
import { createHearthFire, makeCandleFlameMaterial, createDust, createCandle, softDot } from './fire.js';
import { canvasTexture, leatherTexture } from './canvasTex.js';
import { beamWood, pbr } from './ptex.js';
import * as P from './props.js';
import { loadGroschen, groschenStack, groschenPurse, makeGroschen, G_REST } from './groschen.js';

export const UNIT = 50; // 1 米 = 50 个游戏单位（骰子、骰盘、物理都按这个尺度）
export const FLOOR_Y = -38;
export const TABLE_Y = -0.3; // 桌面高 0.754 米
export const ROOM = { minX: -170, maxX: 170, minZ: -190, maxZ: 130, ceil: 112 };

// 光照贴图是 s = L / (L + k) 编码的，解码 L = k·s / (1 - s)；exposure 统一调亮暗
function lightmapMaterial(map, uniforms) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLM = uniforms.uLM;
    sh.fragmentShader = 'uniform float uLM;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec3 lmS = min(texture2D(map, vMapUv).rgb, vec3(0.992));
        diffuseColor.rgb *= uLM * lmS / (1.0 - lmS);
      #endif`
    );
  };
  return m;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 骰盘：深色木框 + 压花皮革底（尺寸不能变，物理和摆位都依赖它）
function buildTray(scene) {
  const trayW = 16;
  const trayD = 10.6;
  const leather = leatherTexture({ size: 1024, seed: 42, c1: '#6a2818', c2: '#30100a' });
  const floorMat = new THREE.MeshStandardMaterial({ map: canvasTexture(leather.col), bumpMap: canvasTexture(leather.bump, { srgb: false }), bumpScale: 2.5, roughness: 0.75 });
  const trayFloor = new THREE.Mesh(new THREE.PlaneGeometry(trayW, trayD), floorMat);
  trayFloor.rotation.x = -Math.PI / 2;
  trayFloor.position.y = TABLE_Y + 0.31;
  trayFloor.receiveShadow = true;
  scene.add(trayFloor);
  const t = pbr(beamWood({ size: 256, seed: 35, c1: '#5e3e24', c2: '#2c1c10' }), { normal: 2.5 });
  const frameMat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, color: '#8a6a4c' });
  const brass = new THREE.MeshStandardMaterial({ color: '#b48a3e', metalness: 1, roughness: 0.38 });
  const fw = 0.9;
  const fh = 1.1;
  scene.add(box(trayW + fw * 2, 0.3, trayD + fw * 2, frameMat, 0, TABLE_Y + 0.15, 0));
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
}

// 桌上的蜡烛：牌桌机位里唯一的活光源。火苗会被风吹歪（gust），可以吹灭再点上
function buildTableCandle(scene, updaters) {
  const g = new THREE.Group();
  g.position.set(CANDLE.x, TABLE_Y, CANDLE.z);
  const metal = new THREE.MeshStandardMaterial({ color: '#7a5a30', metalness: 1, roughness: 0.46 });
  const dish = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.05, 0], [1.2, 0.1], [1.24, 0.26], [1.14, 0.22], [0.72, 0.1], [0.5, 0.14], [0.46, 0.34], [0, 0.34]].map(([r, y]) => new THREE.Vector2(r, y)), 40), metal);
  dish.castShadow = true;
  dish.receiveShadow = true;
  g.add(dish);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 10, 28), metal);
  ring.position.set(1.34, 0.16, 0);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  g.add(ring);
  const candle = createCandle({ height: 1.25, radius: 0.4, color: '#d9c49a', seed: 3, flameScale: 0.74 });
  candle.position.y = 0.3;
  g.add(candle);
  scene.add(g);
  const top = new THREE.Vector3(CANDLE.x, TABLE_Y + 2.3, CANDLE.z);
  const light = new THREE.PointLight('#ffb36b', 42, 0, 2);
  light.position.copy(top);
  scene.add(light);
  // 烘焙的桌面不受实时光影响：贴一片柔光当烛光在桌上的光晕
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: softDot(), color: '#ff9a4e', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(CANDLE.x, TABLE_Y + 0.03, CANDLE.z);
  glow.renderOrder = 1;
  glow.userData.noAO = true;
  scene.add(glow);
  const flame = candle.userData.flame;
  const state = { lit: true, level: 1, gust: 0, devil: 0, top };
  const warm = new THREE.Color('#ffb36b');
  const cold = new THREE.Color('#5de08a');
  updaters.push((dt, t, cam) => {
    candle.userData.update(dt, t, cam);
    state.gust *= Math.exp(-dt * 3.2);
    state.devil *= Math.exp(-dt * 0.9);
    light.color.lerpColors(warm, cold, Math.min(1, state.devil * 1.4));
    flame.material.uniforms.uTint.value = Math.min(1, state.devil * 1.4);
    state.level += ((state.lit ? 1 : 0) - state.level) * Math.min(1, dt * (state.lit ? 5 : 16));
    const f = state.level * (0.84 + Math.sin(t * 11.3) * 0.07 + Math.sin(t * 7.1 + 1.3) * 0.06 + Math.sin(t * 23.7) * 0.03 - state.gust * 0.42);
    light.intensity = 42 * Math.max(0, f);
    glow.material.opacity = 0.1 * Math.max(0, f);
    flame.visible = state.level > 0.04;
    flame.scale.set(state.level * (1 - state.gust * 0.35), state.level * (1 + Math.sin(t * 11 + 3) * 0.05 - state.gust * 0.4), 1);
    flame.rotation.z = Math.sin(t * 17) * state.gust * 0.5;
  });
  return state;
}

// 桌面的烘焙贴图看近了是糊的：叠一层细木纹、划痕、杯底印子和蜡滴（只会变暗的“正片叠底”）
function buildTableDetail() {
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  let s = 2024;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  // 木纹：顺着木板方向的细线（贴图的 x 是桌子的 z 方向）
  for (let i = 0; i < 2600; i++) {
    const y = rnd() * H;
    const x = rnd() * W;
    const len = 90 + rnd() * 460;
    const a = 0.04 + rnd() * 0.14;
    g.strokeStyle = `rgba(30,14,6,${a})`;
    g.lineWidth = 0.5 + rnd() * 1.7;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * 7, x + len * 0.7, y + (rnd() - 0.5) * 7, x + len, y + (rnd() - 0.5) * 5);
    g.stroke();
  }
  // 木节
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(26,12,5,${0.2 - k * 0.018})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, 7 + k * 8, 3 + k * 3.2, (rnd() - 0.5) * 0.2, 0, 6.3);
      g.stroke();
    }
  }
  // 刀痕、划痕
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = rnd() * 6.3;
    const l = 14 + rnd() * 90;
    g.strokeStyle = `rgba(20,9,4,${0.14 + rnd() * 0.22})`;
    g.lineWidth = 0.6 + rnd() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // 酒杯底的水印
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 36 + rnd() * 16;
    g.strokeStyle = `rgba(26,12,6,${0.12 + rnd() * 0.12})`;
    g.lineWidth = 2.4 + rnd() * 2.6;
    g.beginPath();
    g.arc(x, y, r, rnd() * 6, rnd() * 6 + 3.6 + rnd() * 2.6);
    g.stroke();
  }
  // 深色污渍
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 40 + rnd() * 150;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(24,10,4,${0.05 + rnd() * 0.1})`);
    gr.addColorStop(1, 'rgba(24,10,4,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI / 2;
  m.position.set(0, TABLE_Y + 0.012, -1);
  m.renderOrder = 0;
  m.userData.noAO = true;
  return m;
}

function place(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

async function loadProbe(renderer, scene) {
  const buf = await assetBuffer('probe');
  const hdr = new RGBELoader().setDataType(THREE.HalfFloatType).parse(buf);
  const tex = new THREE.DataTexture(hdr.data, hdr.width, hdr.height, THREE.RGBAFormat, hdr.type);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(tex).texture;
  pm.dispose();
  tex.dispose();
}

export async function buildWorld(scene, renderer, { camera } = {}) {
  const updaters = [];
  const lights = {};
  scene.background = new THREE.Color('#070910');
  scene.fog = new THREE.FogExp2('#120c08', 0.0012);

  const meta = assetJSON('tavern-meta') || { k: 0.25 };
  const lm = { uLM: { value: meta.k * 0.86 } }; // v3.4 从 1.35 调暗（桌面木头太红太亮；第二轮 1.08 → 0.86）
  // 实时画面只看得到牌桌：手机上别的部分（墙、吧台、壁炉……十来张 2048 的大贴图）一概不装，不然内存超了页面会被系统杀掉
  const gltf = await loadGLB('tavern', LITE ? { drop: (n) => /^B_/.test(n) && !/^B_(table|tabletop|tableprops)$/.test(n) } : {});
  const root = gltf.scene;
  root.scale.setScalar(UNIT);
  root.position.y = FLOOR_Y;
  const markers = {};
  let door = null;
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = lightmapMaterial(o.material.map, lm);
      o.matrixAutoUpdate = false;
    }
    if (/^(FX_|SEAT_|CHAIR_|PATH_|TRAY)/.test(o.name)) markers[o.name] = o;
    if (o.name === 'B_door' || o.name === 'door') door = o;
  });
  if (door) door.matrixAutoUpdate = true;
  scene.add(root);
  root.updateMatrixWorld(true);
  root.traverse((o) => o.isMesh && o !== door && o.updateMatrix());
  const at = (o) => o.getWorldPosition(new THREE.Vector3());

  await loadProbe(renderer, scene);
  scene.environmentIntensity = 1.8;
  // 人物脸上的补光：吊灯那一圈蜡烛（不投影）
  const fill = new THREE.PointLight('#ffc890', 5200, 0, 2);
  fill.position.set(0, 60, 16);
  scene.add(fill);
  lights.fill = fill;

  // ---------- 会动的火 ----------
  const flames = [];
  for (const [name, m] of Object.entries(markers)) {
    if (name.startsWith('FX_candle') && !LITE) {
      const mat = makeCandleFlameMaterial(flames.length * 1.7);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7), mat);
      f.position.copy(at(m)).add(new THREE.Vector3(0, 0.6, 0));
      f.renderOrder = 6;
      scene.add(f);
      flames.push({ f, mat, seed: flames.length });
    }
  }
  updaters.push((dt, t, cam) => {
    for (const { f, mat, seed } of flames) {
      mat.uniforms.uTime.value = t;
      f.rotation.y = Math.atan2(cam.position.x - f.position.x, cam.position.z - f.position.z);
      f.scale.y = 1 + Math.sin(t * 11 + seed) * 0.05;
    }
  });
  if (markers.FX_hearth) {
    if (!LITE) {
      const fire = createHearthFire(30, 26);
      fire.position.copy(at(markers.FX_hearth));
      fire.rotation.y = -Math.PI / 2;
      scene.add(fire);
      updaters.push((dt, t, cam) => fire.userData.update(dt, t, cam));
    }
    const fl = new THREE.PointLight('#ff8a3a', 26000, 0, 2);
    fl.position.copy(at(markers.FX_hearth)).add(new THREE.Vector3(-14, 18, 0));
    scene.add(fl);
    lights.fire = fl;
  }

  // ---------- 动态物体的光：吊灯主光（投影）+ 桌上蜡烛 ----------
  const spot = new THREE.SpotLight('#ffd6a8', 16000, 0, 0.62, 0.7, 2);
  spot.position.set(0, 69, 20);
  spot.target.position.set(0, TABLE_Y, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.setScalar(LITE ? 1024 : 2048);
  spot.shadow.camera.near = 30;
  spot.shadow.camera.far = 140;
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 4;
  spot.userData.base = 12000;
  scene.add(spot, spot.target);
  lights.spot = spot;
  const tableCandle = Object.entries(markers).find(([n]) => n.includes('table_candle'));
  if (tableCandle) {
    const cl = new THREE.PointLight('#ffa860', 70, 0, 2);
    cl.position.copy(at(tableCandle[1])).add(new THREE.Vector3(0, 1.5, 0));
    scene.add(cl);
    lights.tableCandle = cl;
  }
  // 桌面是烘焙好的，看不到实时影子：盖一层只显示影子的透明面（骰子、骰盅、人的手）
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(54, 90), new THREE.ShadowMaterial({ opacity: 0.42 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, TABLE_Y + 0.02, 21);
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  updaters.push((dt, t) => {
    if (lights.fire) lights.fire.intensity = 26000 * (0.82 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1) * 0.05 + Math.sin(t * 2.1) * 0.07);
    spot.intensity = spot.userData.base * (0.96 + Math.sin(t * 9.7) * 0.02 + Math.sin(t * 4.1) * 0.02);
    if (lights.tableCandle) lights.tableCandle.intensity = 70 * (0.85 + Math.sin(t * 12) * 0.1);
  });

  // ---------- 骰盘与金、银、铜钱币；大金币在先手一侧单独平放 ----------
  buildTray(scene);
  await loadGroschen(renderer);
  const stacks = COIN_STACKS.map(({ metal, n, seed, x, z }) => place(groschenStack(n, seed, metal), x, TABLE_Y, z));
  scene.add(...stacks);
  for (const p of PURSES) scene.add(place(groschenPurse(p.seed), p.x, TABLE_Y, p.z, p.yaw));
  for (const [i, spec] of LOOSE_COINS.entries()) {
    const loose = makeGroschen({ seg: 48, variant: i, metal: spec.metal });
    loose.position.set(spec.x, TABLE_Y + G_REST * loose.scale.x, spec.z);
    loose.rotation.y = spec.yaw;
    scene.add(loose);
  }

  const dust = createDust({ minX: -150, maxX: 150, minY: -34, maxY: 100, minZ: -180, maxZ: 110 }, 1100);
  scene.add(dust);
  updaters.push((dt, t, cam) => dust.userData.update(dt, t, cam));

  // 桌角的锡酒杯：过场动画里“低头看向牌桌”的最后一帧（tools/anim 的 table 关键帧）有它，实时画面也摆在同一个地方
  const props = await loadGLB('props');
  const mug = props.scene.getObjectByName('mug_pewter').clone();
  mug.scale.setScalar(UNIT);
  mug.position.set(MUG.x, TABLE_Y, MUG.z);
  mug.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    // 这个角落吊灯照不到：金属度太高的杯子只反射四周的黑暗，看着是一团黑影。调成哑光的旧锡，靠下面的侧光显形
    if (o.name === 'mug_pewter_1') {
      o.material.metalness = 0.5;
      o.material.roughness = 0.42;
      o.material.envMapIntensity = 2.6;
      o.material.color.setScalar(2);
    }
  });
  scene.add(mug);
  // 给酒杯一点侧光（烛光从桌子中间过来），不然只剩一团黑影
  const mugLight = new THREE.PointLight('#ffb878', 170, 20, 2);
  mugLight.position.set(MUG.x - 5.2, TABLE_Y + 5.9, MUG.z + 4.5);
  scene.add(mugLight);

  const candle = buildTableCandle(scene, updaters);
  scene.add(buildTableDetail());

  return { updaters, lights, door, markers, root, lightmap: lm, stacks, candle, mug };
}
