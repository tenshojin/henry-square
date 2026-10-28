// 角色组装：骨骼 + 各层衣服（蒙皮）+ 头（表情、眨眼）+ 手 + 随身物件，以及动画用的姿势、IK、看向
import * as THREE from 'three';
import { B, BN, jointPositions, createSkeleton, torsoLayer, limbLayer, armProfile, legProfile, bootLayer, skirtLayer, cloakLayer, collarLayer, beltLayer, handGeometry, tubeAlong, folds, merge, shellMaterials, addShells, torsoProfile } from './charBody.js';
import { buildHead, headFrame } from './charHead.js';
import { clothDetail, leatherDetail, furTexture, hairTexture, pbr, tex, colorCanvas, normalCanvas } from './ptex.js';

// ---------- 共用材质 ----------
const cache = new Map();
const once = (k, fn) => {
  if (!cache.has(k)) cache.set(k, fn());
  return cache.get(k);
};
const clothTex = () =>
  once('clothTex', () => {
    const t = pbr(clothDetail({ size: 256, seed: 41, threads: 48 }), { normal: 3, repeat: [0.55, 0.55] });
    return t;
  });
const leatherTex = () => once('leatherTex', () => pbr(leatherDetail({ size: 256, seed: 51 }), { normal: 2.5, repeat: [0.7, 0.7] }));
const hairTex = () =>
  once('hairTex', () => {
    const { b, alpha } = hairTexture({ w: 256, h: 512, seed: 71 });
    return { map: tex(colorCanvas(b.col, b.w, b.h), { repeat: [1, 1] }), normalMap: tex(normalCanvas(b.hgt, b.w, b.h, 3), { srgb: false }), alphaMap: tex(colorCanvas(expand(alpha), b.w, b.h), { srgb: false }) };
  });
function expand(a) {
  const o = new Float32Array(a.length * 3);
  for (let i = 0; i < a.length; i++) o[i * 3] = o[i * 3 + 1] = o[i * 3 + 2] = a[i];
  return o;
}
export const M = {
  cloth: (color, rough = 0.93) =>
    once('cloth' + color + rough, () => {
      const t = clothTex();
      return new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: rough });
    }),
  clothDS: (color) =>
    once('clothDS' + color, () => {
      const m = M.cloth(color).clone();
      m.side = THREE.DoubleSide;
      return m;
    }),
  leather: (color) =>
    once('leather' + color, () => {
      const t = leatherTex();
      return new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0 });
    }),
  leatherDS: (color) =>
    once('leatherDS' + color, () => {
      const m = M.leather(color).clone();
      m.side = THREE.DoubleSide;
      return m;
    }),
  skin: (color) => once('skin' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#c0503a'), sheenRoughness: 0.6 })),
  hair: (color) =>
    once('hair' + color, () => {
      const t = hairTex();
      return new THREE.MeshStandardMaterial({ color, map: t.map, normalMap: t.normalMap, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    }),
  hairEdge: (color) =>
    once('hairEdge' + color, () => {
      const m = M.hair(color).clone();
      m.vertexColors = true;
      m.alphaHash = true;
      return m;
    }),
  hairCard: (color) =>
    once('hairCard' + color, () => {
      const t = hairTex();
      return new THREE.MeshStandardMaterial({ color, map: t.map, alphaMap: t.alphaMap, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.62 });
    }),
  metal: (color, rough = 0.45) => once('metal' + color + rough, () => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: rough })),
  mouth: once('mouth', () => new THREE.MeshStandardMaterial({ color: '#3a1410', roughness: 0.9 })),
  teeth: once('teeth', () => new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: 0.4 })),
};
const furMats = new Map();
export function furShellMats(key, opts) {
  if (furMats.has(key)) return furMats.get(key);
  const { b, alpha } = furTexture(opts);
  const map = tex(colorCanvas(b.col, b.w, b.h), { repeat: opts.repeat || [3, 3] });
  const alphaMap = tex(colorCanvas(expand(alpha), b.w, b.h), { srgb: false, repeat: opts.repeat || [3, 3] });
  const base = new THREE.MeshStandardMaterial({ map, roughness: 0.95, color: new THREE.Color().setScalar(0.42) });
  const shells = shellMaterials({ map, alphaMap, layers: opts.layers || 12, repeat: opts.repeat || [3, 3] });
  const r = { base, shells };
  furMats.set(key, r);
  return r;
}

// ---------- 组装 ----------
/**
 * P: 外貌与服装，见 patrons.js 里的角色表
 */
export function createCharacter(P) {
  const J = jointPositions(P.sw ?? 1, P.sex === 'f');
  const { bones, skeleton } = createSkeleton(J);
  const root = new THREE.Group();
  root.name = P.name || 'npc';
  root.add(bones[0]);
  const parts = new Map();
  const add = (mat, g) => {
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat).push(g);
  };
  const O = P.outfit || {};
  const skin = M.skin(P.skin);
  const fem = P.sex === 'f';
  const arm = armProfile(P);
  const leg = legProfile(P);
  const by = Object.fromEntries(BN.map((n, i) => [n, bones[i]]));

  // 脖子
  add(skin, torsoLayer(P, { y0: 71.8, y1: 80.5, off: -0.45, step: 1.2, segs: 18 }));

  // 裤子（腰臀 + 两条腿）
  if (!O.skirt) {
    const tm = M.cloth(O.trousers?.color || '#3a3228');
    add(tm, torsoLayer(P, { y0: 40.5, y1: 51, off: 0.15, step: 1.4, segs: 30, capStart: true }));
    for (const s of ['L', 'R']) add(tm, limbLayer(J, s, 'leg', leg, { off: 0.25, wobble: folds(0.025, 5) }));
  } else {
    // 裙子底下的腿（只露脚踝时看得到一点）
    const tm = M.cloth('#2e2620');
    for (const s of ['L', 'R']) add(tm, limbLayer(J, s, 'leg', leg, { off: -0.4 }));
  }

  // 衬衫 / 内衣：躯干 + 袖子
  const sh = O.shirt || { color: '#d8ccb0' };
  const shm = M.cloth(sh.color);
  add(shm, torsoLayer(P, { y0: fem ? 46 : 44.5, y1: sh.neck === 'scoop' ? 71.2 : 73.4, off: 0.35, step: 1.3, segs: 30, wobble: folds(0.012, 7) }));
  const sleeve = sh.sleeve || 'long';
  for (const s of ['L', 'R']) {
    const puff = sleeve === 'puff';
    const prof = arm.map(([t, r, zr]) => [t, r + (puff ? 1.1 * Math.sin(Math.min(1, Math.max(0, t / 1.6)) * Math.PI) + 0.4 : 0.45), zr]);
    let p2 = prof;
    if (sleeve === 'rolled') p2 = prof.filter(([t]) => t <= 1.5).concat([[1.52, prof.find((q) => q[0] >= 1.5)[1] + 0.6]]);
    if (sleeve === 'puffShort') {
      // 短泡泡袖：上臂鼓起，在手肘上方收成一圈褶边，下面露出小臂
      p2 = arm.filter(([t]) => t <= 0.78).map(([t, r, zr]) => [t, r + 0.5 + 1.5 * Math.sin(Math.min(1, Math.max(0, (t + 0.2) / 0.95)) * Math.PI), zr]);
      p2.push([0.8, arm[6][1] + 0.9], [0.84, arm[6][1] + 0.5]);
      add(skin, limbLayer(J, s, 'arm', arm.filter(([t]) => t >= 0.7), { off: -0.05 }));
    }
    add(shm, limbLayer(J, s, 'arm', p2, { wobble: folds(puff || sleeve === 'puffShort' ? 0.07 : 0.04, 6, 1.3) }));
    if (sleeve === 'puffShort') continue;
    if (sleeve === 'rolled') {
      // 卷起的袖口 + 露出的小臂
      add(shm, limbLayer(J, s, 'arm', [[1.44, 2.95], [1.5, 3.15], [1.56, 2.9]], { segs: 16 }));
      add(skin, limbLayer(J, s, 'arm', arm.filter(([t]) => t >= 1.45), { off: -0.05 }));
    } else {
      add(shm, limbLayer(J, s, 'arm', [[1.86, 2.1], [1.9, 2.25], [1.95, 2.05]], { segs: 14 }));
    }
  }

  // 外层：马甲 / 皮甲 / 束腰
  if (O.vest) {
    const vm = O.vest.leather ? M.leatherDS(O.vest.color) : M.clothDS(O.vest.color);
    const open = O.vest.open ? 0.38 : 0;
    const a0 = Math.PI / 2 + open;
    add(vm, torsoLayer(P, { y0: O.vest.y0 ?? 44, y1: O.vest.y1 ?? 71.6, off: 1.05, step: 1.3, segs: 30, arc: open ? [a0, a0 + Math.PI * 2 - 2 * open] : null, flare: (y) => Math.max(0, (48 - y) * 0.12) }));
    if (O.vest.sleeves) for (const s of ['L', 'R']) add(vm, limbLayer(J, s, 'arm', arm.filter(([t]) => t <= 0.95).map(([t, r]) => [t, r + 1.05]), { wobble: folds(0.03, 5) }));
  }
  // 长外套：上身 + 长袖 + 下摆到膝盖（坐着时下摆改成包住大腿的两片）
  if (O.coat) {
    const cm = O.coat.leather ? M.leatherDS(O.coat.color) : M.clothDS(O.coat.color);
    add(cm, torsoLayer(P, { y0: 43.5, y1: 72, off: 1.25, step: 1.3, segs: 32, arc: [Math.PI / 2 + 0.16, Math.PI / 2 + Math.PI * 2 - 0.16], wobble: folds(0.025, 6) }));
    for (const s of ['L', 'R']) add(cm, limbLayer(J, s, 'arm', arm.filter(([t]) => t <= 1.62).map(([t, r, zr]) => [t, r + 1.0 + (t > 1.45 ? 0.5 : 0), zr]), { wobble: folds(0.05, 5, 1.1) }));
    if (P.seated) {
      add(cm, torsoLayer(P, { y0: 39, y1: 44.5, off: 2.0, step: 1.4, segs: 32 }));
      for (const s of ['L', 'R']) add(cm, limbLayer(J, s, 'leg', leg.filter(([t]) => t <= 0.95).map(([t, r]) => [t, r + 1.8 + t * 0.6]), { wobble: folds(0.06, 5) }));
    } else {
      add(cm, skirtLayer(P, J, { y0: 47, y1: 3, flare: 11.5, yStop: 22, arc: [Math.PI / 2 + 0.22, Math.PI / 2 + Math.PI * 2 - 0.22], wobble: folds(0.05, 8), off: 0.9 }));
    }
  }
  // 系扣的马甲：前襟一排小扣带
  if (O.vest?.buckles) {
    const keys = torsoProfile(P);
    for (const y of [51, 55.5, 60, 64.5, 69]) {
      const k = keys.reduce((a, b) => (Math.abs(b[0] - y) < Math.abs(a[0] - y) ? b : a));
      const z = k[3] + k[2] + 1.35;
      const strap = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.35), M.leather('#2a1a10'));
      strap.position.set(0, y - 61, z + 0.8);
      by.chest.add(strap);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.4), M.metal('#9a8a6a', 0.4));
      buckle.position.set(1.4, y - 61, z + 1.0);
      by.chest.add(buckle);
    }
  }
  if (O.bodice) {
    const bm = M.leatherDS(O.bodice.color);
    add(bm, torsoLayer(P, { y0: 49.5, y1: 66, off: 0.9, step: 1.1, segs: 30, arc: [Math.PI / 2 + 0.09, Math.PI / 2 + Math.PI * 2 - 0.09] }));
    // 前襟的交叉系带
    const laces = [];
    const keys = torsoProfile(P);
    for (let i = 0; i <= 8; i++) {
      const y = 51 + i * 1.8;
      const k = keys.reduce((a, b) => (Math.abs(b[0] - y) < Math.abs(a[0] - y) ? b : a));
      laces.push(new THREE.Vector3((i % 2 ? 1 : -1) * 0.75, y, k[3] + k[2] + 1.25));
    }
    const lg = tubeAlong(laces, laces.map(() => 0.16), 6);
    lg.deleteAttribute('skinIndex');
    lg.deleteAttribute('skinWeight');
    const lace = new THREE.Mesh(lg, M.cloth('#e8dcc0'));
    lace.position.set(0, -61, 0.8);
    by.chest.add(lace);
  }

  // 裙子与围裙
  if (O.skirt && P.seated) {
    // 坐着的女子：裙子做成搭在腿上的宽布筒（直接套在腿上，坐姿下不会被大腿撑破）
    const sm = M.clothDS(O.skirt.color);
    add(sm, torsoLayer(P, { y0: 40.5, y1: 52, off: 1.3, step: 1.4, segs: 30, capStart: true }));
    for (const s of ['L', 'R']) add(sm, limbLayer(J, s, 'leg', leg.map(([t, r]) => [t, r + 2.6 - Math.max(0, t - 1) * 0.6]), { wobble: folds(0.05, 6) }));
  } else if (O.skirt) add(M.clothDS(O.skirt.color), skirtLayer(P, J, { y0: 51.5, y1: 2.5, flare: O.skirt.flare || 13.5, wobble: folds(0.035, 9) }));
  if (O.apron && !P.seated) add(M.clothDS(O.apron.color), skirtLayer(P, J, { y0: 51.5, y1: 2.5, flare: O.skirt?.flare || 13.5, off: 0.55, yStop: 15, arc: [Math.PI / 2 - 1.05, Math.PI / 2 + 1.05], segs: 18, wobble: folds(0.03, 9) }));

  // 围巾 / 放下的兜帽 / 斗篷
  if (O.scarf) add(M.cloth(O.scarf.color), collarLayer(P, { y: 72.2, h: 3.6, r: 5.2, thick: 2.3 }));
  if (O.hood) {
    const hm = M.clothDS(O.hood.color);
    add(hm, collarLayer(P, { y: 72.4, h: 3.2, r: 5.4, thick: 2.0 }));
    add(hm, cloakLayer(P, { y0: 74.5, y1: 60, open: 1.25, off: 1.3, flare: 1.2, wobble: folds(0.05, 5) }));
  }
  let cloakG = null;
  if (O.cloak) {
    const cm = O.cloak.fur ? null : M.clothDS(O.cloak.color);
    cloakG = cloakLayer(P, { y0: 75, y1: O.cloak.y1 ?? 42, open: O.cloak.open ?? 0.85, off: O.cloak.fur ? 1.8 : 1.4, flare: O.cloak.fur ? 2.2 : 3.2, wobble: folds(O.cloak.fur ? 0.02 : 0.05, 7) });
    if (cm) add(cm, cloakG);
  }

  // 腰带、护腕
  if (O.belt) {
    const bm = M.leather(O.belt.color || '#3a2414');
    add(bm, beltLayer(P, { y: fem ? 51 : 48.8, h: 2.0, off: O.vest ? 1.45 : 0.75 }));
  }
  if (O.bracers) {
    const bm = M.leather(O.bracers.color || '#4a2e1a');
    for (const s of ['L', 'R']) add(bm, limbLayer(J, s, 'arm', arm.filter(([t]) => t >= 1.28 && t <= 1.9).map(([t, r, zr]) => [t, r + 0.75, zr]), { segs: 16 }));
  }

  // 靴子
  const bootM = M.leather(O.boots?.color || '#2e2016');
  for (const s of ['L', 'R']) add(bootM, bootLayer(J, s, { top: O.boots?.top ?? 1.42 }));

  // 合并成蒙皮网格
  const meshes = [];
  for (const [mat, list] of parts) {
    const g = merge(list);
    const m = new THREE.SkinnedMesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.bind(skeleton, new THREE.Matrix4());
    root.add(m);
    meshes.push(m);
  }
  // 毛皮斗篷：底层 + 外壳
  if (O.cloak?.fur) {
    const fm = furShellMats('cloak' + O.cloak.fur.c1, { size: 128, seed: 63, pattern: 'mottled', c1: O.cloak.fur.c1, c2: O.cloak.fur.c2, c3: O.cloak.fur.c3, repeat: [0.45, 0.45], layers: 14, density: 0.7 });
    const base = new THREE.SkinnedMesh(cloakG, fm.base);
    base.bind(skeleton, new THREE.Matrix4());
    base.castShadow = true;
    base.frustumCulled = false;
    root.add(base);
    addShells(root, cloakG, fm.shells, O.cloak.fur.len || 1.4, skeleton);
  }

  // 头
  const head = buildHead(P, { skin, mouth: M.mouth, teeth: M.teeth, hair: M.hair, hairEdge: M.hairEdge, hairCard: M.hairCard, cloth: M.cloth, leather: M.leather }, { hiRes: P.hiRes !== false });
  by.head.add(head.group);

  // 手
  const hands = {};
  for (const s of ['L', 'R']) {
    const h = new THREE.Mesh(handGeometry(s, { curl: P.hands?.[s] ?? 0.35, size: fem ? 0.9 : 1 }), skin);
    h.castShadow = true;
    by['hd' + s].add(h);
    hands[s] = h;
  }

  // 皮带扣、钱袋、武器、交叉背带
  if (O.belt) {
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 0.5), M.metal('#a8884a', 0.4));
    const keys = torsoProfile(P);
    const k = keys.find((q) => q[0] >= 48.8) || keys[2];
    buckle.position.set(0, (fem ? 51 : 48.8) - 46, k[2] + k[3] + (O.vest ? 1.7 : 1.0));
    by.hips.add(buckle);
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, 1.6), M.leather('#5a3a20'));
    pouch.position.set(-6.4, -0.8, 4.2);
    pouch.rotation.y = 0.55;
    pouch.castShadow = true;
    by.hips.add(pouch);
  }
  // 第二条腰带上挂的东西：小皮袋、短匕首、葫芦
  for (const [i, it] of (O.gear || []).entries()) {
    const side = i % 2 ? -1 : 1;
    if (it === 'pouch') {
      const pg = new THREE.SphereGeometry(1.7, 12, 10);
      pg.scale(0.9, 1.15, 0.6);
      const p2 = new THREE.Mesh(pg, M.leather('#4a2c16'));
      p2.position.set(side * 7.4, -3.2, 3.2);
      p2.rotation.y = side * 0.7;
      p2.castShadow = true;
      by.hips.add(p2);
    } else if (it === 'dagger') {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.5), M.leather('#2a1a10')));
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.2, 6), M.leather('#3a2414'));
      hilt.position.y = 6;
      d.add(hilt);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.6), M.metal('#7a7468', 0.35));
      guard.position.y = 4.5;
      d.add(guard);
      d.position.set(side * 8.2, -4.5, -1.5);
      d.rotation.set(0.25, 0, side * 0.12);
      by.hips.add(d);
    } else if (it === 'gourd') {
      const gg = new THREE.LatheGeometry([[0.01, 0], [1.9, 0.5], [2.2, 2.0], [1.4, 3.6], [1.0, 4.4], [1.35, 5.4], [0.9, 6.4], [0.5, 6.7], [0.01, 6.8]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
      const gourd = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: '#8a5a24', roughness: 0.5 }));
      gourd.position.set(side * 8.4, -9.5, 1.5);
      gourd.rotation.z = side * 0.15;
      gourd.castShadow = true;
      by.hips.add(gourd);
    }
  }
  if (O.weapon === 'sword') by.hips.add(swordProp());
  if (O.weapon === 'axe') by.hips.add(axeProp());
  if (O.strap) {
    const keys = torsoProfile(P);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = 70 - t * 22;
      const k = keys.reduce((a, b) => (Math.abs(b[0] - y) < Math.abs(a[0] - y) ? b : a));
      const ang = Math.PI / 2 + lerp(-0.9, 0.9, t);
      pts.push(new THREE.Vector3(Math.cos(ang) * (k[1] + 1.3), y - 61, Math.sin(ang) * (k[2] + 1.3) + k[3] + 0.8));
    }
    const g = tubeAlong(pts, pts.map(() => 0.55), 6);
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    const strap = new THREE.Mesh(g, M.leather(O.strap.color || '#3a2414'));
    strap.scale.set(1, 1, 1);
    strap.castShadow = true;
    by.chest.add(strap);
  }

  root.scale.setScalar(P.scale ?? (fem ? 0.95 : 1));
  const ch = { root, bones: by, skeleton, meshes, head, hands, P, J, state: { blinkT: 1 + Math.random() * 3, blink: 0, look: new THREE.Vector2(), smile: P.smile ?? 0, jaw: 0 } };
  setSmile(ch, ch.state.smile);
  return ch;
}
const lerp = (a, b, t) => a + (b - a) * t;

function swordProp() {
  const g = new THREE.Group();
  const scab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 30, 0.7), M.leather('#2a1a10'));
  scab.position.y = -15;
  const chape = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.9), M.metal('#8a8478', 0.4));
  chape.position.y = -29.5;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.7, 0.9), M.metal('#7a7468', 0.35));
  guard.position.y = 0.6;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.6, 8), M.leather('#3a2414'));
  grip.position.y = 3.3;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), M.metal('#7a7468', 0.35));
  pommel.position.y = 6.1;
  g.add(scab, chape, guard, grip, pommel);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  g.position.set(9.6, 1.5, -1.5);
  g.rotation.set(0.42, 0, -0.12);
  return g;
}
function axeProp() {
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 22, 8), new THREE.MeshStandardMaterial({ color: '#5a3c22', roughness: 0.8 }));
  haft.position.y = -8;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(4.6, 1.6);
  shape.quadraticCurveTo(5.6, -2.4, 4.4, -5.6);
  shape.lineTo(0, -2.2);
  shape.lineTo(0, 0);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.12, bevelSegments: 1 }), M.metal('#8c8a84', 0.38));
  head.position.set(0.3, 2.6, -0.22);
  g.add(haft, head);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  g.position.set(-9.8, -1, 2.5);
  g.rotation.set(-0.25, 0.3, 0.12);
  return g;
}

// ---------- 姿势与动画工具 ----------
// 坐下：座面高 seatH（相对人物脚下的地面）
export function seat(ch, seatH) {
  const b = ch.bones;
  b.hips.position.y = seatH + 6.4;
  b.thL.rotation.x = b.thR.rotation.x = -Math.PI / 2;
  b.snL.rotation.x = b.snR.rotation.x = Math.PI / 2;
  ch.seated = true;
}
export function stand(ch) {
  const b = ch.bones;
  b.hips.position.y = 46;
  b.thL.rotation.set(0, 0, 0);
  b.thR.rotation.set(0, 0, 0);
  b.snL.rotation.set(0, 0, 0);
  b.snR.rotation.set(0, 0, 0);
  ch.seated = false;
}

const _m = new THREE.Matrix4();
const _mb = new THREE.Matrix4();
const _mt = new THREE.Matrix4();
const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const HINGE = new THREE.Vector3(-1, 0, 0);
function frame(m, d, h) {
  const x = d.clone().normalize();
  const y = h.clone().sub(x.clone().multiplyScalar(h.dot(x))).normalize();
  const z = x.clone().cross(y);
  return m.makeBasis(x, y, z);
}
/**
 * 两节手臂 IK：把 side 侧手腕放到世界坐标 target，肘尖朝世界方向 pole；w 为与当前姿势的混合
 */
export function reach(ch, side, target, pole, w = 1) {
  if (w <= 0.001) return;
  const ua = ch.bones['ua' + side];
  const fa = ch.bones['fa' + side];
  const hd = ch.bones['hd' + side];
  const parent = ua.parent;
  parent.updateWorldMatrix(true, false);
  _m.copy(parent.matrixWorld).invert();
  const [T, S, Pd, e, p, u, f] = _v;
  T.copy(target).applyMatrix4(_m);
  S.copy(ua.position);
  Pd.copy(pole).transformDirection(_m);
  const l1 = fa.position.length();
  const l2 = hd.position.length();
  e.subVectors(T, S);
  const d = THREE.MathUtils.clamp(e.length(), Math.abs(l1 - l2) + 0.05, l1 + l2 - 0.05);
  e.normalize();
  p.copy(Pd).addScaledVector(e, -Pd.dot(e)).normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  u.copy(e).multiplyScalar(cosA).addScaledVector(p, Math.sqrt(1 - cosA * cosA));
  f.copy(e).multiplyScalar(d).addScaledVector(u, -l1).normalize();
  // 肘的转轴：上臂 × 前臂（与绑定时“向前弯”的转轴 HINGE 对应）
  const h = u.clone().cross(f);
  if (h.lengthSq() < 1e-6) h.copy(p).cross(u);
  h.normalize();
  // 上臂：把（绑定方向, 绑定转轴）对齐到（u, h）
  const d1 = fa.position.clone().normalize();
  const h0 = d1.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
  frame(_mb, d1, h0);
  frame(_mt, u, h);
  _q1.setFromRotationMatrix(_mt.multiply(_mb.transpose()));
  // 前臂：父空间里的目标朝向，再换算成相对上臂的局部旋转
  const d2 = hd.position.clone().normalize();
  frame(_mb, d2, h0);
  frame(_mt, f, h);
  _q2.setFromRotationMatrix(_mt.multiply(_mb.transpose()));
  _q3.copy(_q1).invert().multiply(_q2);
  ua.quaternion.slerp(_q1, w);
  fa.quaternion.slerp(_q3, w);
}

// 头看向世界坐标里的一点（分摊到脖子和头上，限制角度，平滑跟随）
export function lookAt(ch, target, dt, { speed = 4, maxYaw = 1.0, maxPitch = 0.55, w = 1 } = {}) {
  const nb = ch.bones.neck;
  const hb = ch.bones.head;
  const parent = nb.parent;
  parent.updateWorldMatrix(true, false);
  _m.copy(parent.matrixWorld).invert();
  const t = _v[0].copy(target).applyMatrix4(_m);
  const o = _v[1].copy(nb.position).add(_v[2].set(0, 9, 1.5));
  const dir = t.sub(o);
  let yaw = Math.atan2(dir.x, dir.z);
  let pitch = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
  yaw = THREE.MathUtils.clamp(yaw, -maxYaw, maxYaw) * w;
  pitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch) * w;
  const s = ch.state.look;
  const k = Math.min(1, dt * speed);
  s.x += (yaw - s.x) * k;
  s.y += (pitch - s.y) * k;
  nb.rotation.set(s.y * 0.4, s.x * 0.4, 0);
  hb.rotation.set(s.y * 0.6 + (ch.state.nod || 0), s.x * 0.6, ch.state.tilt || 0);
}

// 眨眼、呼吸、表情（每帧调用）
export function lifeUpdate(ch, dt, t) {
  const st = ch.state;
  st.blinkT -= dt;
  if (st.blinkT <= 0) {
    st.blink = 0.16;
    st.blinkT = 2.2 + Math.random() * 4;
  }
  let close = 0;
  if (st.blink > 0) {
    st.blink -= dt;
    close = Math.sin(Math.max(0, st.blink) / 0.16 * Math.PI);
  }
  for (const l of ch.head.lids) l.up.rotation.x = l.open + close * 1.05 + (st.squint || 0) * 0.25;
  ch.bones.chest.rotation.x = (ch.state.lean || 0) + Math.sin(t * 1.5 + (ch.P.seed || 0)) * 0.012;
  for (const m of ch.head.morphHeads) {
    m.morphTargetInfluences[0] = st.smile;
    m.morphTargetInfluences[1] = st.jaw;
  }
}
export function setSmile(ch, v) {
  ch.state.smile = v;
  for (const m of ch.head.morphHeads) if (m.morphTargetInfluences) m.morphTargetInfluences[0] = v;
}

// 把物件挂到手上（物件坐标里 +y 朝上；hold 给出相对手骨的位置和朝向）
export function holdInHand(ch, side, obj, pos = [0, -3.6, 1.2], rot = [0, 0, 0]) {
  obj.position.set(pos[0], pos[1], pos[2]);
  obj.rotation.set(rot[0], rot[1], rot[2]);
  ch.bones['hd' + side].add(obj);
  return obj;
}

// 世界坐标里某个骨骼的位置
export function boneWorld(ch, name, out = new THREE.Vector3()) {
  ch.bones[name].updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(ch.bones[name].matrixWorld);
}
export { headFrame };
