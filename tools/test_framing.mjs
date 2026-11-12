// 牌桌机位：各种屏幕上骰盘和两排骰子都要落在界面留出来的地方，而且比原来放大视角硬塞的时候大得多
// 用法：node tools/test_framing.mjs
import * as THREE from 'three';
import { fitView, freeRect, tableLayout, tablePoints, TRAY_HALF } from '../src/render/framing.js';

const Y = -0.3;
let failed = 0;
const check = (bad, name, detail = '') => {
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${name}${detail ? ' — ' + detail : ''}`);
};
const project = (view, aspect, p) => {
  const cam = new THREE.PerspectiveCamera(view.fov, aspect, 0.3, 1500);
  cam.position.copy(view.pos);
  cam.lookAt(view.look);
  cam.updateMatrixWorld();
  return p.clone().project(cam);
};

// 以前窄屏的做法：相机不动，放大视角直到桌子塞进去
const oldTray = (w, h) => {
  const aspect = w / h;
  const fov = 2 * Math.atan(Math.tan((42 * Math.PI) / 360) * Math.max(1, 1.6 / aspect)) * 180 / Math.PI;
  const view = { pos: new THREE.Vector3(0, 21.5, 15.8), look: new THREE.Vector3(0, -1.6, 1), fov };
  const a = project(view, aspect, new THREE.Vector3(-8, Y, 0));
  const b = project(view, aspect, new THREE.Vector3(8, Y, 0));
  return ((b.x - a.x) / 2) * w;
};

const sizes = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [568, 320], [640, 360], [667, 375], [844, 390], [932, 430], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [900, 900], [500, 800]];
for (const [w, h] of sizes) {
  const layout = tableLayout(w, h);
  if (!layout) {
    check(true, `${w}×${h} 该有手机摆法`);
    continue;
  }
  const aspect = w / h;
  const rect = freeRect(w, h, layout.insets);
  const view = fitView(tablePoints(Y), { aspect, pitch: layout.pitch, fov: layout.fov, rect, y: Y });
  let out = 0;
  for (const p of tablePoints(Y)) {
    const v = project(view, aspect, p);
    const x = ((v.x + 1) / 2) * w;
    const y = ((1 - v.y) / 2) * h;
    out = Math.max(out, rect.l * w - x, x - rect.r * w, rect.t * h - y, y - rect.b * h);
  }
  const a = project(view, aspect, new THREE.Vector3(-8, Y, 0));
  const b = project(view, aspect, new THREE.Vector3(8, Y, 0));
  const tray = ((b.x - a.x) / 2) * w;
  const before = oldTray(w, h);
  check(out > 2, `${w}×${h} ${layout.kind} 框得住`, `超出 ${Math.max(0, out).toFixed(1)} 像素`);
  check(tray < before * 1.1, `${w}×${h} 骰盘变大了`, `${before.toFixed(0)} → ${tray.toFixed(0)} 像素宽`);
}
check(tableLayout(1920, 1080) !== null, '1920×1080 还是原来的机位');
check(tableLayout(1440, 810) !== null, '1440×810 还是原来的机位');
check(tableLayout(2560, 1080) !== null, '2560×1080 还是原来的机位');
check(TRAY_HALF.x < 9, '骰盘范围包住木框');
console.log(failed ? `\n${failed} 项没过` : '\n全部通过');
process.exitCode = failed ? 1 : 0;
