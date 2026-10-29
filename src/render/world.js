// 酒馆场景（v3）：Blender 里建模、Cycles 烘焙好光照的整间酒馆（tavern.glb），
// 这里只负责：还原光照贴图、给人物和骰子打光（全景环境光 + 吊灯主光 + 壁炉火光）、
// 在标记点上放会动的火焰、搭骰盘、摆钱币、开场时转动大门。
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { loadGLB, assetBuffer, assetJSON } from './assets.js';
import { createHearthFire, makeCandleFlameMaterial, createDust } from './fire.js';
import { canvasTexture, leatherTexture } from './canvasTex.js';
import { beamWood, pbr } from './ptex.js';
import * as P from './props.js';
import { coinStack, coinPurse, makeCoin } from './coins.js';

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
  const lm = { uLM: { value: meta.k * 1.35 } };
  const gltf = await loadGLB('tavern');
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
    if (name.startsWith('FX_candle')) {
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
    const fire = createHearthFire(30, 26);
    fire.position.copy(at(markers.FX_hearth));
    fire.rotation.y = -Math.PI / 2;
    scene.add(fire);
    updaters.push((dt, t, cam) => fire.userData.update(dt, t, cam));
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
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.camera.near = 30;
  spot.shadow.camera.far = 140;
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 4;
  scene.add(spot, spot.target);
  lights.spot = spot;
  const candle = Object.entries(markers).find(([n]) => n.includes('table_candle'));
  if (candle) {
    const cl = new THREE.PointLight('#ffa860', 70, 0, 2);
    cl.position.copy(at(candle[1])).add(new THREE.Vector3(0, 1.5, 0));
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
    spot.intensity = 16000 * (0.96 + Math.sin(t * 9.7) * 0.02 + Math.sin(t * 4.1) * 0.02);
    if (lights.tableCandle) lights.tableCandle.intensity = 70 * (0.85 + Math.sin(t * 12) * 0.1);
  });

  // ---------- 骰盘和钱币 ----------
  buildTray(scene);
  scene.add(place(coinStack(7, 'gold', 11), -8.4, TABLE_Y, 9.4));
  scene.add(place(coinStack(5, 'silver', 12), -6.8, TABLE_Y, 10.4));
  scene.add(place(coinPurse(13), -12.4, TABLE_Y, 13.2, 0.5));
  scene.add(place(coinStack(6, 'gold', 14), 8.4, TABLE_Y, -9.4));
  scene.add(place(coinStack(5, 'silver', 15), 6.8, TABLE_Y, -10.4));
  scene.add(place(coinPurse(16), 12.4, TABLE_Y, -13.4, 3.4));
  const loose = makeCoin('silver', 1);
  loose.position.set(-4.6, TABLE_Y + 0.05, 11.6);
  scene.add(loose);

  const dust = createDust({ minX: -150, maxX: 150, minY: -34, maxY: 100, minZ: -180, maxZ: 110 }, 1100);
  scene.add(dust);
  updaters.push((dt, t, cam) => dust.userData.update(dt, t, cam));

  return { updaters, lights, door, markers, root, lightmap: lm };
}
