// 用无头 Chrome 的 canvas 画场景里的图案贴图：纹章旗、盾牌、黑板字、地毯、招牌
// 用法：tools/node/node.exe tools/blender/paint_textures.mjs [输出目录]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const outDir = process.argv[2] || 'C:/blender/henry_square/textures';
fs.mkdirSync(outDir, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const font = (pkg, file) => fs.readFileSync(path.join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const fonts = `
@font-face{font-family:'Grenze Gotisch';font-weight:700;src:url(data:font/woff2;base64,${font('grenze-gotisch', 'grenze-gotisch-latin-700-normal.woff2')}) format('woff2');}
@font-face{font-family:'Alegreya';font-weight:500;src:url(data:font/woff2;base64,${font('alegreya', 'alegreya-latin-500-normal.woff2')}) format('woff2');}
@font-face{font-family:'Alegreya';font-style:italic;font-weight:400;src:url(data:font/woff2;base64,${font('alegreya', 'alegreya-latin-400-italic.woff2')}) format('woff2');}`;

const page = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}</style></head><body>
<div style="font-family:'Grenze Gotisch';font-weight:700">x</div><div style="font-family:'Alegreya'">x</div><div style="font-family:'Alegreya';font-style:italic">x</div>
<script>
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function noise(ctx, w, h, a, n = 9000, size = 2) {
  for (let i = 0; i < n; i++) { const v = rnd() < 0.5 ? 0 : 255; ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (a * rnd()) + ')'; ctx.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd())); }
}
function weave(ctx, w, h, a) {
  ctx.save(); ctx.globalAlpha = a;
  for (let y = 0; y < h; y += 3) { ctx.fillStyle = y % 6 ? '#000' : '#fff'; ctx.fillRect(0, y, w, 1); }
  for (let x = 0; x < w; x += 3) { ctx.fillStyle = x % 6 ? '#000' : '#fff'; ctx.fillRect(x, 0, 1, h); }
  ctx.restore();
}
// 纹章狮子（直立狮），金色，带描边
function lion(ctx, cx, cy, s, fill, line) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const P = new Path2D('M-8,-60 C-20,-66 -34,-58 -36,-44 C-44,-46 -50,-40 -46,-34 C-54,-30 -52,-20 -44,-20 C-46,-12 -38,-6 -30,-10 C-28,-2 -20,0 -14,-4 L-10,6 C-22,10 -30,20 -26,30 C-36,34 -40,44 -34,50 L-20,48 C-18,40 -12,34 -4,32 L-2,44 C-10,52 -12,62 -4,66 L10,62 C8,54 12,46 18,42 C26,46 36,44 40,36 C50,40 60,34 62,22 C66,10 58,-2 48,-2 C50,8 46,16 38,16 C36,6 28,-2 18,-6 L16,-18 C26,-14 34,-20 32,-30 C42,-30 48,-40 42,-48 L30,-42 C28,-50 20,-54 12,-50 L8,-40 C2,-46 2,-56 -8,-60 Z');
  ctx.fillStyle = fill; ctx.fill(P); ctx.lineWidth = 2.2; ctx.strokeStyle = line; ctx.stroke(P);
  // 爪子与尾巴卷
  ctx.beginPath(); ctx.moveTo(-36, -44); ctx.lineTo(-52, -54); ctx.moveTo(-44, -34); ctx.lineTo(-60, -38); ctx.moveTo(-44, -20); ctx.lineTo(-58, -16);
  ctx.moveTo(42, -48); ctx.lineTo(56, -60); ctx.moveTo(62, 22); ctx.quadraticCurveTo(78, 6, 70, -10); ctx.quadraticCurveTo(64, -20, 74, -24);
  ctx.lineWidth = 5; ctx.strokeStyle = fill; ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = line; ctx.stroke();
  // 眼睛和鬃毛线条
  ctx.fillStyle = line; ctx.beginPath(); ctx.arc(-24, -46, 2.2, 0, 7); ctx.fill();
  ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(-4 + i * 3, -48 + i * 4); ctx.quadraticCurveTo(4 + i * 3, -44 + i * 4, 2 + i * 3, -38 + i * 4); }
  ctx.lineWidth = 1.4; ctx.stroke();
  // 王冠
  ctx.beginPath(); ctx.moveTo(-26, -62); ctx.lineTo(-28, -76); ctx.lineTo(-20, -68); ctx.lineTo(-14, -80); ctx.lineTo(-8, -68); ctx.lineTo(0, -76); ctx.lineTo(-2, -62); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
}
function banner(field, dark, gold) {
  const [c, x] = cv(1024, 2048);
  const g = x.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, dark); g.addColorStop(0.18, field); g.addColorStop(0.5, field); g.addColorStop(0.82, field); g.addColorStop(1, dark);
  x.fillStyle = g; x.fillRect(0, 0, 1024, 2048);
  weave(x, 1024, 2048, 0.05); noise(x, 1024, 2048, 0.06, 26000, 3);
  // 金边
  x.strokeStyle = gold; x.lineWidth = 26; x.strokeRect(46, 40, 932, 1960);
  x.lineWidth = 6; x.strokeRect(96, 92, 832, 1856);
  // 上方横杆套
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 1024, 30);
  lion(x, 512, 980, 5.4, gold, '#3a2004');
  // 下方小纹饰
  x.fillStyle = gold;
  for (let i = 0; i < 3; i++) { x.beginPath(); const cx = 362 + i * 150, cy = 1700; x.moveTo(cx, cy - 34); x.lineTo(cx + 22, cy); x.lineTo(cx, cy + 34); x.lineTo(cx - 22, cy); x.fill(); }
  return c;
}
function shield() {
  const [c, x] = cv(1024, 1024);
  x.fillStyle = '#1f2a4a'; x.fillRect(0, 0, 1024, 1024);
  noise(x, 1024, 1024, 0.08, 20000, 3);
  // 金色斜带 + 三朵百合
  x.save(); x.translate(512, 512); x.rotate(-0.78);
  x.fillStyle = '#c9a046'; x.fillRect(-900, -95, 1800, 190);
  x.fillStyle = 'rgba(80,50,10,0.5)'; x.fillRect(-900, -95, 1800, 10); x.fillRect(-900, 85, 1800, 10);
  x.restore();
  const fleur = (cx, cy, s) => {
    x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = '#d8b25a'; x.strokeStyle = '#4a3008'; x.lineWidth = 2;
    const p = new Path2D('M0,-60 C14,-40 14,-20 4,-6 L4,6 C22,-6 44,-10 50,8 C40,0 28,6 22,18 L6,18 L6,30 L20,30 L20,40 L-20,40 L-20,30 L-6,30 L-6,18 L-22,18 C-28,6 -40,0 -50,8 C-44,-10 -22,-6 -4,6 L-4,-6 C-14,-20 -14,-40 0,-60 Z');
    x.fill(p); x.stroke(p); x.restore();
  };
  fleur(260, 260, 1.7); fleur(770, 770, 1.7);
  return c;
}
function chalkboard() {
  const [c, x] = cv(1024, 768);
  x.fillStyle = '#1d211e'; x.fillRect(0, 0, 1024, 768);
  for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(220,220,210,' + (0.012 + rnd() * 0.02) + ')'; x.beginPath(); x.ellipse(rnd() * 1024, rnd() * 768, 60 + rnd() * 180, 20 + rnd() * 60, rnd() * 3, 0, 7); x.fill(); }
  noise(x, 1024, 768, 0.05, 20000, 2);
  const chalk = (txt, y, size, font) => {
    x.font = font.replace('SIZE', size + 'px'); x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let k = 0; k < 7; k++) { x.fillStyle = 'rgba(236,232,220,' + (0.16 + rnd() * 0.08) + ')'; x.fillText(txt, 512 + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3); }
  };
  chalk('Good Ale', 170, 132, "italic 400 SIZE 'Alegreya'");
  chalk('Good Company', 345, 112, "italic 400 SIZE 'Alegreya'");
  chalk('Brighter Days', 515, 112, "italic 400 SIZE 'Alegreya'");
  x.strokeStyle = 'rgba(236,232,220,0.55)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(380, 640); x.quadraticCurveTo(450, 600, 512, 640); x.quadraticCurveTo(574, 680, 644, 640); x.stroke();
  x.beginPath(); x.moveTo(512, 612); x.lineTo(530, 640); x.lineTo(512, 668); x.lineTo(494, 640); x.closePath(); x.stroke();
  return c;
}
function rug() {
  const W = 2048, H = 1536;
  const [c, x] = cv(W, H);
  const red = '#7a1a14', navy = '#1c2440', cream = '#d8c8a0', gold = '#b88a3a', rust = '#9a3a1a';
  x.fillStyle = red; x.fillRect(0, 0, W, H);
  const band = (inset, w, col) => { x.fillStyle = col; x.fillRect(inset, inset, W - inset * 2, w); x.fillRect(inset, H - inset - w, W - inset * 2, w); x.fillRect(inset, inset, w, H - inset * 2); x.fillRect(W - inset - w, inset, w, H - inset * 2); };
  band(30, 200, navy); band(30, 14, cream); band(216, 12, cream); band(250, 30, gold);
  // 边带里的菱形和小花
  for (let i = 0; i < 22; i++) {
    for (const [px, py, horiz] of [[80 + i * 90, 130, 1], [80 + i * 90, H - 130, 1]]) { dia(px, py, 34, 50, i % 2 ? rust : gold); }
  }
  for (let i = 0; i < 16; i++) { dia(130, 80 + i * 90, 50, 34, i % 2 ? rust : gold); dia(W - 130, 80 + i * 90, 50, 34, i % 2 ? rust : gold); }
  function dia(cx, cy, rx, ry, col) { x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy - ry); x.lineTo(cx + rx, cy); x.lineTo(cx, cy + ry); x.lineTo(cx - rx, cy); x.closePath(); x.fill(); x.fillStyle = cream; x.beginPath(); x.arc(cx, cy, Math.min(rx, ry) * 0.25, 0, 7); x.fill(); }
  // 中心大菱形纹章
  const cx = W / 2, cy = H / 2;
  x.fillStyle = navy; x.beginPath(); x.moveTo(cx, cy - 430); x.lineTo(cx + 620, cy); x.lineTo(cx, cy + 430); x.lineTo(cx - 620, cy); x.closePath(); x.fill();
  x.strokeStyle = cream; x.lineWidth = 12; x.stroke();
  x.fillStyle = rust; x.beginPath(); x.moveTo(cx, cy - 300); x.lineTo(cx + 430, cy); x.lineTo(cx, cy + 300); x.lineTo(cx - 430, cy); x.closePath(); x.fill();
  x.fillStyle = gold; x.beginPath(); x.moveTo(cx, cy - 170); x.lineTo(cx + 240, cy); x.lineTo(cx, cy + 170); x.lineTo(cx - 240, cy); x.closePath(); x.fill();
  x.fillStyle = navy; x.beginPath(); x.arc(cx, cy, 80, 0, 7); x.fill();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; dia(cx + Math.cos(a) * 120, cy + Math.sin(a) * 85, 16, 16, cream); }
  // 四角小花
  for (const [qx, qy] of [[420, 420], [W - 420, 420], [420, H - 420], [W - 420, H - 420]]) { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; dia(qx + Math.cos(a) * 46, qy + Math.sin(a) * 46, 22, 22, k % 2 ? gold : cream); } x.fillStyle = navy; x.beginPath(); x.arc(qx, qy, 24, 0, 7); x.fill(); }
  // 磨损、编织纹
  weave(x, W, H, 0.06); noise(x, W, H, 0.12, 90000, 4);
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(30,15,8,' + (0.03 + rnd() * 0.05) + ')'; x.beginPath(); x.ellipse(rnd() * W, rnd() * H, 80 + rnd() * 260, 50 + rnd() * 140, rnd() * 3, 0, 7); x.fill(); }
  return c;
}
function sign() {
  const [c, x] = cv(1024, 512);
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#4a2c16'); g.addColorStop(1, '#2e1a0c');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 70; i++) { x.strokeStyle = 'rgba(0,0,0,' + (0.08 + rnd() * 0.12) + ')'; x.lineWidth = 1 + rnd() * 3; x.beginPath(); const y0 = rnd() * 512; x.moveTo(0, y0); x.bezierCurveTo(300, y0 + (rnd() - 0.5) * 40, 700, y0 + (rnd() - 0.5) * 40, 1024, y0 + (rnd() - 0.5) * 30); x.stroke(); }
  x.strokeStyle = '#c9a046'; x.lineWidth = 10; x.strokeRect(26, 26, 972, 460);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = "bold 170px 'KaiTi','STKaiti','SimSun',serif"; x.fillStyle = '#e8c870'; x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 6; x.shadowOffsetY = 4;
  x.fillText('亨利广场', 512, 215);
  x.font = "700 64px 'Grenze Gotisch'"; x.fillText('HENRY SQUARE', 512, 385);
  return c;
}
window.paintAll = async () => {
  await document.fonts.ready;
  const out = {};
  out.banner_red = banner('#8e1e16', '#4e0c08', '#d4a848').toDataURL('image/png');
  out.banner_blue = banner('#1e2c56', '#0c1430', '#d4a848').toDataURL('image/png');
  out.shield = shield().toDataURL('image/png');
  out.chalkboard = chalkboard().toDataURL('image/png');
  out.rug = rug().toDataURL('image/png');
  out.sign = sign().toDataURL('image/png');
  return out;
};
</script></body></html>`;

const htmlPath = path.join(os.tmpdir(), 'henry_paint.html');
fs.writeFileSync(htmlPath, page);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9533 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'henry-paint-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) { /* 等浏览器 */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
await sleep(1500);
const res = await send('Runtime.evaluate', { expression: 'window.paintAll()', awaitPromise: true, returnByValue: true });
const imgs = res.result?.result?.value || {};
for (const [name, url] of Object.entries(imgs)) {
  fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
if (res.result?.exceptionDetails) console.log('error', res.result.exceptionDetails.exception?.description);
ws.close();
proc.kill();
