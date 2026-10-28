// 骰盅：压花皮革筒身 + 黄铜箍 + 铜钉 + 骰子纹章
import * as THREE from 'three';
import { makeCanvas, mulberry32, mottle, speckle, shade } from './canvasTex.js';

const H = 3.4; // 筒高
export const CUP_HEIGHT = H;

function bodyRadius(t) {
  return 1.32 + t * 0.14 + Math.sin(t * Math.PI) * 0.035;
}

function leatherCupTexture(seed, base) {
  const W = 1024;
  const Hh = 512;
  const rnd = mulberry32(seed);
  const col = makeCanvas(W, Hh);
  const bump = makeCanvas(W, Hh);
  const c = col.getContext('2d');
  const b = bump.getContext('2d');
  c.fillStyle = base;
  c.fillRect(0, 0, W, Hh);
  mottle(c, W, Hh, rnd, [shade(base, -0.35), shade(base, 0.15), '#120804'], 160, 10, 60, 0.18);
  speckle(c, W, Hh, rnd, 9000, '#000000', 1.6, 0.25);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 9000; i++) {
    b.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.16)';
    b.beginPath();
    b.arc(rnd() * W, rnd() * Hh, 0.8 + rnd() * 2, 0, Math.PI * 2);
    b.fill();
  }
  const gold = '#b8903e';
  // 上下压花带：交织藤纹
  const band = (y0, h) => {
    for (const [ctx, stroke, a] of [[c, shade(base, -0.5), 0.8], [b, '#303030', 1]]) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.lineTo(W, y0);
      ctx.moveTo(0, y0 + h);
      ctx.lineTo(W, y0 + h);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const y = y0 + h / 2 + Math.sin((x / W) * Math.PI * 32 + k * Math.PI) * (h * 0.32);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // 镀金点缀
    for (let i = 0; i < 32; i++) {
      const x = ((i + 0.25) / 32) * W;
      c.fillStyle = gold;
      c.globalAlpha = 0.75;
      c.beginPath();
      c.arc(x, y0 + h / 2, 3.2, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
  };
  band(Hh * 0.06, 44);
  band(Hh * 0.78, 44);
  // 中部：菱格 + 百合花纹
  const y1 = Hh * 0.06 + 60;
  const y2 = Hh * 0.78 - 16;
  const cells = 12;
  const cw = W / cells;
  for (const [ctx, stroke] of [[c, shade(base, -0.45)], [b, '#3a3a3a']]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y1, W, y2 - y1);
    ctx.clip();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    for (let i = -cells; i <= cells * 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cw, y1);
      ctx.lineTo(i * cw + (y2 - y1), y2);
      ctx.moveTo(i * cw, y1);
      ctx.lineTo(i * cw - (y2 - y1), y2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 百合花（压花 + 金箔）
  const fleur = (ctx, x, y, s, fill) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.bezierCurveTo(8, -12, 8, -2, 0, 6);
    ctx.bezierCurveTo(-8, -2, -8, -12, 0, -22);
    ctx.moveTo(-2, 2);
    ctx.bezierCurveTo(-14, -12, -26, -2, -18, 8);
    ctx.bezierCurveTo(-14, 2, -8, 4, -2, 8);
    ctx.moveTo(2, 2);
    ctx.bezierCurveTo(14, -12, 26, -2, 18, 8);
    ctx.bezierCurveTo(14, 2, 8, 4, 2, 8);
    ctx.fill();
    ctx.fillRect(-10, 8, 20, 4);
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.lineTo(4, 12);
    ctx.lineTo(0, 22);
    ctx.fill();
    ctx.restore();
  };
  const midY = (y1 + y2) / 2;
  for (let i = 0; i < cells; i++) {
    const x = (i + 0.5) * cw;
    fleur(b, x, midY, 1.2, '#d0d0d0');
    fleur(c, x, midY, 1.2, gold);
    c.fillStyle = 'rgba(0,0,0,0.25)';
  }
  // 竖向缝线
  for (let y = 10; y < Hh - 10; y += 14) {
    c.strokeStyle = '#d8c39a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(6, y);
    c.lineTo(10, y + 8);
    c.stroke();
    b.strokeStyle = '#e0e0e0';
    b.beginPath();
    b.moveTo(6, y);
    b.lineTo(10, y + 8);
    b.stroke();
  }
  // 磨损：边缘发亮
  const g = c.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, 'rgba(255,220,170,0.08)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, Hh);
  return { col, bump };
}

function medallionTexture() {
  const s = 256;
  const col = makeCanvas(s);
  const c = col.getContext('2d');
  const g = c.createRadialGradient(s * 0.4, s * 0.4, 10, s / 2, s / 2, s / 2);
  g.addColorStop(0, '#f2d68a');
  g.addColorStop(0.7, '#b08a3a');
  g.addColorStop(1, '#6a4e1c');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);
  c.strokeStyle = '#5a3f14';
  c.lineWidth = 6;
  c.beginPath();
  c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
  c.stroke();
  // 中间一颗菱形放置的骰子
  c.save();
  c.translate(s / 2, s / 2);
  c.rotate(Math.PI / 4);
  c.fillStyle = '#7a5a20';
  c.fillRect(-48, -48, 96, 96);
  c.fillStyle = '#e8c86a';
  c.fillRect(-42, -42, 84, 84);
  c.fillStyle = '#4a3410';
  for (const [x, y] of [[-22, -22], [22, -22], [0, 0], [-22, 22], [22, 22]]) {
    c.beginPath();
    c.arc(x, y, 8, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  const t = new THREE.CanvasTexture(col);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCup({ leather = '#4a2414', seed = 9 } = {}) {
  const group = new THREE.Group();
  const { col, bump } = leatherCupTexture(seed, leather);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const bmap = new THREE.CanvasTexture(bump);
  bmap.wrapS = THREE.RepeatWrapping;
  const leatherMat = new THREE.MeshPhysicalMaterial({ map, bumpMap: bmap, bumpScale: 2.2, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color('#8a5a3a') });
  const innerMat = new THREE.MeshStandardMaterial({ color: '#6a4428', roughness: 0.9, side: THREE.BackSide });
  // 粗糙度别太低：骰盅摇的时候正好在主光正下方，太亮的高光会被泛光放大成一圈发光的环
  const brass = new THREE.MeshStandardMaterial({ color: '#c39a45', metalness: 1, roughness: 0.48 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: '#8a6a2a', metalness: 1, roughness: 0.55 });

  // 外筒
  const pts = [];
  const y0 = 0.3;
  const y1 = H - 0.25;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(bodyRadius(t), y0 + t * (y1 - y0)));
  }
  const outer = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), leatherMat);
  outer.castShadow = true;
  outer.receiveShadow = true;
  group.add(outer);
  // 内壁
  const ipts = pts.map((p) => new THREE.Vector2(p.x - 0.1, p.y));
  ipts[0].y = 0.45;
  const inner = new THREE.Mesh(new THREE.LatheGeometry(ipts, 72), innerMat);
  group.add(inner);
  const innerBottom = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshStandardMaterial({ color: '#5a3820', roughness: 0.95 }));
  innerBottom.rotation.x = -Math.PI / 2;
  innerBottom.position.y = 0.46;
  group.add(innerBottom);
  // 口沿：卷边皮革 + 黄铜箍
  const topR = bodyRadius(1);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(topR - 0.04, 0.09, 16, 72), brass);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = y1 + 0.04;
  lip.castShadow = true;
  group.add(lip);
  const lip2 = new THREE.Mesh(new THREE.CylinderGeometry(topR + 0.03, topR + 0.02, 0.32, 72, 1, true), brass);
  lip2.position.y = y1 - 0.14;
  group.add(lip2);
  const lip3 = new THREE.Mesh(new THREE.TorusGeometry(topR + 0.02, 0.035, 10, 72), darkBrass);
  lip3.rotation.x = Math.PI / 2;
  lip3.position.y = y1 - 0.32;
  group.add(lip3);
  // 底座
  const footPts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1.36, 0),
    new THREE.Vector2(1.42, 0.06),
    new THREE.Vector2(1.42, 0.24),
    new THREE.Vector2(1.34, 0.34),
    new THREE.Vector2(1.3, 0.34),
  ];
  const foot = new THREE.Mesh(new THREE.LatheGeometry(footPts, 72), brass);
  foot.castShadow = true;
  foot.receiveShadow = true;
  group.add(foot);
  const footRing = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.045, 10, 72), darkBrass);
  footRing.rotation.x = Math.PI / 2;
  footRing.position.y = 0.4;
  group.add(footRing);
  // 铜钉
  const studGeo = new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const studY = [0.62, H - 0.62];
  for (const sy of studY) {
    const t = (sy - y0) / (y1 - y0);
    const r = bodyRadius(t);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.1;
      const s = new THREE.Mesh(studGeo, brass);
      s.position.set(Math.sin(a) * r, sy, Math.cos(a) * r);
      s.lookAt(Math.sin(a) * r * 2, sy, Math.cos(a) * r * 2);
      s.rotateX(Math.PI / 2);
      group.add(s);
    }
  }
  // 纹章
  const medT = (H * 0.5 - y0) / (y1 - y0);
  const medR = bodyRadius(medT);
  const med = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 40), [darkBrass, new THREE.MeshStandardMaterial({ map: medallionTexture(), metalness: 1, roughness: 0.35 }), darkBrass]);
  med.rotation.x = Math.PI / 2;
  med.position.set(0, H * 0.5, medR + 0.02);
  med.castShadow = true;
  group.add(med);
  const medRim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 10, 40), brass);
  medRim.position.set(0, H * 0.5, medR + 0.06);
  group.add(medRim);

  // 方便动画：mouth 为口沿中心的本地坐标
  group.userData.mouth = new THREE.Vector3(0, H - 0.1, 0);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return group;
}
