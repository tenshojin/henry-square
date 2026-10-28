// 骰子 3D 模型：圆角立方体 + 每种骰子独特的贴图/材质/附件
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DICE_BY_ID } from '../data/dice.js';
import { getDieMaterials, VALUE_NORMALS } from './diceFaces.js';
import { makeCanvas, warmEnvCanvas } from './canvasTex.js';

const geoCache = new Map();
function getGeometry(geo = {}) {
  const r = geo.r ?? 0.12;
  const distort = geo.distort ?? 0;
  const key = r + ':' + distort;
  if (geoCache.has(key)) return geoCache.get(key);
  const g = new RoundedBoxGeometry(1, 1, 1, 4, r);
  if (distort > 0) {
    // 按位置的平滑扰动（共享顶点位移一致，保持封闭）
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = distort;
      const dx = Math.sin(v.y * 3.1 + 0.7) * Math.cos(v.z * 2.3 + 1.1) * k;
      const dy = Math.sin(v.x * 2.7 + 1.9) * Math.cos(v.z * 3.3 + 0.3) * k * 0.8;
      const dz = Math.sin(v.x * 2.1 + 0.4) * Math.cos(v.y * 2.9 + 2.2) * k;
      pos.setXYZ(i, v.x + dx, v.y + dy, v.z + dz);
    }
    pos.needsUpdate = true;
  }
  geoCache.set(key, g);
  return g;
}

const cornerMats = {
  gold: new THREE.MeshStandardMaterial({ color: '#d4a63f', metalness: 1, roughness: 0.3 }),
  silver: new THREE.MeshStandardMaterial({ color: '#d8dce2', metalness: 1, roughness: 0.25 }),
  iron: new THREE.MeshStandardMaterial({ color: '#3a3a3c', metalness: 0.9, roughness: 0.5 }),
};
const cornerGeo = new THREE.SphereGeometry(0.1, 16, 12);
const rivetGeo = new THREE.SphereGeometry(0.055, 12, 8);

function addCorners(mesh, kind) {
  if (!kind) return;
  const mat = cornerMats[kind];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (kind === 'iron') {
      // 每个角三颗铆钉
      for (const axis of [0, 1, 2]) {
        const m = new THREE.Mesh(rivetGeo, mat);
        const p = [sx * 0.36, sy * 0.36, sz * 0.36];
        p[axis] = [sx, sy, sz][axis] * 0.5;
        m.position.set(...p);
        m.scale.setScalar(1);
        m.castShadow = true;
        mesh.add(m);
      }
    } else {
      const m = new THREE.Mesh(cornerGeo, mat);
      m.position.set(sx * 0.43, sy * 0.43, sz * 0.43);
      m.castShadow = true;
      mesh.add(m);
    }
  }
}

// 选中光环贴图
let ringTex = null;
function getRingTexture() {
  if (ringTex) return ringTex;
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 63);
  g.addColorStop(0, 'rgba(255,200,90,0)');
  g.addColorStop(0.55, 'rgba(255,200,90,0.15)');
  g.addColorStop(0.78, 'rgba(255,215,120,0.95)');
  g.addColorStop(0.86, 'rgba(255,190,80,0.6)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Die3D {
  constructor(typeId, variant = 0) {
    this.typeId = typeId;
    this.variant = variant;
    this.def = DICE_BY_ID[typeId];
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(getGeometry(this.def.style.geo), getDieMaterials(this.def, variant));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.die = this;
    addCorners(this.mesh, this.def.style.geo?.corners);
    this.mesh.traverse((o) => (o.userData.die = this));
    this.group.add(this.mesh);
    this.value = 1;
    this.selected = false;
    this.lift = 0; // 选中时抬起

    const ringMat = new THREE.MeshBasicMaterial({ map: getRingTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 2;
    this.ringTarget = 0;
  }

  get isJoker() {
    return !!this.def.joker && this.value === 1;
  }

  // 物理结果是 naturalTop 朝上，通过内层旋转让 target 面朝上
  setOffsetForTarget(naturalTop, target) {
    this.mesh.quaternion.setFromUnitVectors(VALUE_NORMALS[target], VALUE_NORMALS[naturalTop]);
    this.value = target;
  }

  // 把内层偏移合并进外层，便于后续直接对 group 做插值
  bakeOrientation() {
    this.group.quaternion.multiply(this.mesh.quaternion);
    this.mesh.quaternion.identity();
  }

  restQuaternion(value, yaw = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(VALUE_NORMALS[value], UP);
    const qy = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    return qy.multiply(q);
  }

  setRest(value, yaw = 0) {
    this.value = value;
    this.mesh.quaternion.identity();
    this.group.quaternion.copy(this.restQuaternion(value, yaw));
  }

  update(dt, t) {
    const target = this.ringTarget;
    const m = this.ring.material;
    m.opacity += (target - m.opacity) * Math.min(1, dt * 10);
    if (target > 0) m.opacity = target * (0.8 + 0.2 * Math.sin(t * 5));
    this.ring.visible = m.opacity > 0.01;
    this.ring.position.set(this.group.position.x, this.ringY ?? 0.02, this.group.position.z);
    const sel = this.selected ? 1 : 0;
    this.lift += (sel * 0.4 - this.lift) * Math.min(1, dt * 12);
    this.mesh.position.y = this.lift;
  }
}

// ---------- UI 缩略图 ----------
// 只创建一次离屏渲染器，分批渲染，避免反复初始化 WebGL
export function createThumbnailer(size = 160) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = new THREE.CanvasTexture(warmEnvCanvas());
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const env = pm.fromEquirectangular(envTex).texture;
  scene.environment = env;
  scene.environmentIntensity = 2.4;
  const key = new THREE.DirectionalLight('#ffe2b8', 3.0);
  key.position.set(2, 5, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#9ab0ff', 0.5);
  fill.position.set(-3, 1, 2);
  scene.add(fill);
  scene.add(new THREE.AmbientLight('#ffffff', 0.35));
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(2.3, 2.7, 3.0);
  cam.lookAt(0, -0.02, 0);
  return {
    // entries: [{key, typeId, variant}]
    render(entries) {
      const out = {};
      for (const e of entries) {
        const die = new Die3D(e.typeId, e.variant || 0);
        const sp = die.def.style.special ? Number(Object.keys(die.def.style.special)[0]) : 1;
        die.setRest(sp, -0.35);
        scene.add(die.group);
        renderer.render(scene, cam);
        out[e.key] = renderer.domElement.toDataURL('image/png');
        scene.remove(die.group);
        die.ring.geometry.dispose();
        die.ring.material.dispose();
      }
      return out;
    },
    dispose() {
      envTex.dispose();
      env.dispose();
      pm.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
