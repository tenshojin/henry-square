// 牌桌机位怎么按屏幕摆。电脑的宽屏一直用 GAME_CAM；手机和窄窗口要把骰盘撑满能用的那块屏幕：
// 以前是放大视角硬塞（竖屏垂直视角到 106°，骰盘只有屏幕一半宽、骰子十来个像素），现在视角不变，把相机挪到刚好框住的位置。
import * as THREE from 'three';

// 要框进画面的东西：骰盘（含木框）和两边摆骰子的排
export const TRAY_HALF = { x: 9.45, z: 6.75 };
export const ROW_HALF = { x: 11.35, zMin: -3.6, zMax: 4.9 };

export function tablePoints(y) {
  const p = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.push(new THREE.Vector3(sx * TRAY_HALF.x, y, sz * TRAY_HALF.z));
    for (const z of [ROW_HALF.zMin, ROW_HALF.zMax]) p.push(new THREE.Vector3(sx * ROW_HALF.x, y, z));
  }
  return p;
}

// 这块屏幕该用哪种摆法。insets 是界面占掉的边距（像素），返回 null 表示用 GAME_CAM
export function tableLayout(w, h, safe = {}) {
  const aspect = w / h;
  const top = safe.top || 0;
  const bottom = safe.bottom || 0;
  const side = Math.max(safe.left || 0, safe.right || 0);
  // 竖屏：宽度是瓶颈，相机抬高、更俯视，用长焦把两排骰子撑到屏幕边上；骰子落定后再凑近一倍多
  if (aspect < 0.9) {
    // 宽度超过 720 的（平板竖着拿、窄窗口）用的是电脑版的记分牌和操作区，留得多一些
    const insets = w > 720 ? { top: 196 + top, bottom: 340 + bottom, side: 12 } : { top: 100 + top, bottom: 170 + bottom, side: 5 };
    return { kind: 'portrait', pitch: 66, fov: 42, zoom: 2.2, insets };
  }
  // 横屏：高度是瓶颈，焦距放长一点，不然离得太近透视太夸张；凑近时避开顶上那一条（记分牌和新手提示）
  if (h < 540) {
    const bar = 58 + bottom;
    return { kind: 'landscape', pitch: 60, fov: 30, zoom: 1.5, insets: { top: 4, bottom: bar, side: 4 + side }, focus: { top: 54, bottom: bar + 4, side: 40 + side } };
  }
  // 平板和接近方形的窗口
  if (aspect < 1.6) return { kind: 'tablet', pitch: 60, fov: 42, zoom: 1.4, insets: { top: 26 + top, bottom: 256 + bottom, side: 12 } };
  return null;
}

// 相机朝向固定（俯角 pitch，正对 -z），找到刚好把 points 框进 rect 的位置。rect 是屏幕上的矩形（0–1）
// minDist：不能比这更近（凑近看骰子时别贴到脸上）
export function fitView(points, { aspect, pitch, fov, rect, y = 0, minDist = 0, start = 40 }) {
  const th = THREE.MathUtils.degToRad(pitch);
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const tanH = tanV * aspect;
  const L = rect.l * 2 - 1;
  const R = rect.r * 2 - 1;
  const T = 1 - rect.t * 2;
  const B = 1 - rect.b * 2;
  let D = start;
  let zc = 0;
  let xc = 0;
  for (let i = 0; i < 40; i++) {
    // 相机在看向点 (xc, y, zc) 的反方向 D 处
    const cy = y + sin * D;
    const cz = zc + cos * D;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      const dy = p.y - cy;
      const dz = p.z - cz;
      const depth = -dy * sin - dz * cos; // 沿视线的距离
      const up = dy * cos - dz * sin;
      const xn = (p.x - xc) / (depth * tanH);
      const yn = up / (depth * tanV);
      x0 = Math.min(x0, xn); x1 = Math.max(x1, xn);
      y0 = Math.min(y0, yn); y1 = Math.max(y1, yn);
    }
    const s = Math.max((x1 - x0) / (R - L), (y1 - y0) / (T - B));
    D = Math.max(minDist, D * (1 + (s - 1) * 0.8));
    zc += ((T + B) / 2 - (y0 + y1) / 2) * (D * tanV) / sin * 0.8;
    xc -= ((L + R) / 2 - (x0 + x1) / 2) * (D * tanH) * 0.8;
  }
  return {
    look: new THREE.Vector3(xc, y, zc),
    pos: new THREE.Vector3(xc, y + sin * D, zc + cos * D),
    fov,
    dist: D,
  };
}

// 屏幕上能用的矩形（0–1）
export function freeRect(w, h, insets) {
  return { l: insets.side / w, r: 1 - insets.side / w, t: insets.top / h, b: 1 - insets.bottom / h };
}
