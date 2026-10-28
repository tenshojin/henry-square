// 吧台边凳子上蹲着的虎斑猫：身体、头、耳朵、眼睛、尾巴都带短毛（毛皮外壳）
// 会慢慢转头张望、眨眼、抖耳朵、尾巴尖来回甩，呼吸起伏
import * as THREE from 'three';
import { furShellMats } from './char.js';
import { addShells } from './charBody.js';
import { makeCanvas } from './canvasTex.js';

function lathe(pts, seg = 22) {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}
function catEyeTexture() {
  const c = makeCanvas(128, 64);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 64);
  for (let row = 0; row < 64; row++) {
    const th = (row / 64) * Math.PI;
    for (let col = 0; col < 128; col++) {
      const ph = (col / 128) * Math.PI * 2;
      const x = -Math.cos(ph) * Math.sin(th);
      const y = Math.cos(th);
      const z = Math.sin(ph) * Math.sin(th);
      const a = Math.acos(Math.max(-1, Math.min(1, z)));
      const o = (row * 128 + col) * 4;
      let r = 150;
      let g = 170;
      let b = 60;
      const ring = Math.max(0, 1 - a / 0.9);
      r = 110 + ring * 90;
      g = 150 + ring * 60;
      b = 40;
      // 竖瞳
      if (Math.abs(x) < 0.07 * (1 - Math.abs(y) * 0.6) && a < 0.75) {
        r = 8;
        g = 8;
        b = 6;
      }
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCat() {
  const root = new THREE.Group();
  const fm = furShellMats('tabby', { size: 128, seed: 33, pattern: 'tabby', c1: '#9a7a52', c2: '#3a2a1a', c3: '#d8c09a', repeat: [1.6, 1.6], layers: 8, density: 0.92 });
  const furry = (geo, parent, len = 0.32) => {
    const m = new THREE.Mesh(geo, fm.base);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    addShells(m, geo, fm.shells, len);
    return m;
  };
  // 身体：梨形，略向前倾
  const body = new THREE.Group();
  root.add(body);
  const bodyG = lathe([[0.01, 0], [3.3, 0.35], [3.9, 2.0], [3.5, 4.3], [2.8, 6.4], [2.2, 7.9], [1.5, 8.9], [0.01, 9.3]]);
  bodyG.scale(1, 1, 1.2);
  const torso = furry(bodyG, body);
  torso.rotation.x = 0.12;
  // 后腿（臀部两侧的鼓包）
  for (const s of [-1, 1]) {
    const hg = new THREE.SphereGeometry(2.3, 16, 12);
    hg.scale(0.85, 1, 1.35);
    const h = furry(hg, body);
    h.position.set(s * 2.4, 1.8, -0.2);
  }
  // 前腿 + 爪
  for (const s of [-1, 1]) {
    const lg = new THREE.CylinderGeometry(0.62, 0.75, 6.5, 10);
    const leg = furry(lg, body, 0.22);
    leg.position.set(s * 1.25, 3.2, 3.1);
    leg.rotation.x = -0.08;
    const pg = new THREE.SphereGeometry(0.85, 12, 8);
    pg.scale(1, 0.6, 1.3);
    const paw = furry(pg, body, 0.15);
    paw.position.set(s * 1.25, 0.35, 3.55);
  }
  // 尾巴：沿凳面绕到身前，尾尖会动
  const tailPts = [];
  for (let i = 0; i <= 14; i++) {
    const a = -Math.PI * 0.55 + (i / 14) * Math.PI * 1.25;
    tailPts.push(new THREE.Vector3(Math.cos(a) * 4.3, 0.55 + Math.max(0, i - 10) * 0.25, -Math.sin(a) * 4.0 - 0.4));
  }
  const tailCurve = new THREE.CatmullRomCurve3(tailPts);
  const tailG = new THREE.TubeGeometry(tailCurve, 40, 0.62, 10, false);
  const tail = furry(tailG, body, 0.3);
  // 头
  const head = new THREE.Group();
  head.position.set(0, 9.6, 1.4);
  body.add(head);
  const skullG = new THREE.SphereGeometry(2.45, 22, 16);
  skullG.scale(1.08, 0.94, 1.0);
  furry(skullG, head);
  for (const s of [-1, 1]) {
    const cg = new THREE.SphereGeometry(1.25, 14, 10);
    cg.scale(1.1, 0.85, 1);
    const cheek = furry(cg, head, 0.25);
    cheek.position.set(s * 1.35, -0.8, 1.2);
  }
  const mg = new THREE.SphereGeometry(1.0, 14, 10);
  mg.scale(1.15, 0.75, 0.9);
  const muzzle = furry(mg, head, 0.15);
  muzzle.position.set(0, -0.85, 2.0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6), new THREE.MeshStandardMaterial({ color: '#c47a74', roughness: 0.4 }));
  nose.scale.set(1.2, 0.7, 0.8);
  nose.position.set(0, -0.35, 2.75);
  head.add(nose);
  // 耳朵（会抖）
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 1.45, 1.75, 0.2);
    ear.rotation.set(-0.15, 0, s * -0.32);
    head.add(ear);
    const eg = new THREE.ConeGeometry(0.95, 2.1, 4, 1);
    eg.scale(1, 1, 0.5);
    furry(eg, ear, 0.15).position.y = 0.9;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 4, 1), new THREE.MeshStandardMaterial({ color: '#c8988a', roughness: 0.8 }));
    inner.scale.set(1, 1, 0.3);
    inner.position.set(0, 0.8, 0.28);
    ear.add(inner);
    ears.push(ear);
  }
  // 眼睛 + 眼睑
  const eyeTex = catEyeTexture();
  const lids = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.1, clearcoat: 1 }));
    eye.position.set(s * 0.95, 0.35, 2.0);
    eye.rotation.y = s * 0.35;
    head.add(eye);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), fm.base);
    lid.position.copy(eye.position);
    lid.rotation.set(-0.9, s * 0.35, 0);
    head.add(lid);
    lids.push(lid);
  }
  // 胡须
  const wm = new THREE.LineBasicMaterial({ color: '#f0ece0', transparent: true, opacity: 0.75 });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * 0.6, -0.7 - k * 0.15, 2.5), new THREE.Vector3(s * 3.4, -0.4 - k * 0.45, 2.0 - k * 0.3)]);
      head.add(new THREE.Line(g, wm));
    }
  }
  // 动作
  let blinkT = 2;
  let blink = 0;
  const tailBase = tailG.attributes.position.array.slice();
  const update = (dt, t) => {
    // 慢慢张望：大部分时间朝前，偶尔转头看人
    const yaw = Math.sin(t * 0.23) * 0.55 + Math.sin(t * 0.61) * 0.15;
    head.rotation.set(Math.sin(t * 0.4) * 0.06 - 0.05, yaw, Math.sin(t * 0.3) * 0.05);
    body.scale.set(1, 1 + Math.sin(t * 2.4) * 0.012, 1);
    // 抖耳朵
    for (const [i, e] of ears.entries()) e.rotation.x = -0.15 + Math.max(0, Math.sin(t * 0.9 + i * 2.5) - 0.92) * 4;
    // 眨眼
    blinkT -= dt;
    if (blinkT < 0) {
      blink = 0.2;
      blinkT = 2.5 + Math.random() * 5;
    }
    if (blink > 0) blink -= dt;
    const close = blink > 0 ? Math.sin((blink / 0.2) * Math.PI) : 0;
    for (const l of lids) l.rotation.x = -0.9 + close * 1.35;
    // 尾尖摆动：越靠尾尖摆得越多
    const p = tailG.attributes.position;
    const n = p.count;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i / 11) / 40;
      const w = Math.max(0, k - 0.65) / 0.35;
      const sway = Math.sin(t * 2.1 - k * 4) * w * w * 1.1;
      p.setXYZ(i, tailBase[i * 3] + sway * 0.6, tailBase[i * 3 + 1] + Math.abs(sway) * 0.3, tailBase[i * 3 + 2] + sway);
    }
    p.needsUpdate = true;
  };
  // 尾巴外壳跟着底层一起动：外壳和底层共用同一份位置数据
  tail.children.forEach((sh) => {
    sh.geometry.dispose();
    sh.geometry = tailG;
    sh.scale.setScalar(1 + 0.04 * (tail.children.indexOf(sh) + 1));
  });
  root.userData.update = update;
  return root;
}
