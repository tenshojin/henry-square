// 打包辅助：用无头 Chrome 打开打包好的游戏，生成骰子缩略图（WebP），写入 src/generated/thumbs.js
// 用法：node tools/make_thumbs.mjs <游戏html> <hash>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [htmlFile, hash] = process.argv.slice(2);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const exe = chromes.find((p) => fs.existsSync(p));
if (!exe) {
  console.log('thumbs: no Chrome/Edge found, the game will draw thumbnails at startup');
  process.exit(0);
}
const port = 9533 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'henry-thumbs-'));
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=800,600', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch (e) {
    /* 等待浏览器启动 */
  }
}
const finish = async (code) => {
  try {
    proc.kill();
  } catch (e) {
    /* ignore */
  }
  await sleep(400);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
  process.exit(code);
};
if (!target) {
  console.log('thumbs: browser did not start');
  await finish(0);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
await send('Page.enable');
await send('Page.navigate', { url: pathToFileURL(htmlFile).href + '?rethumb' });
const script = `(async () => {
  const t0 = Date.now();
  while (!(window.__game && window.__game.ui && Object.keys(window.__game.ui.thumbs).length > 30)) {
    if (Date.now() - t0 > 120000) return null;
    await new Promise((r) => setTimeout(r, 200));
  }
  const out = {};
  for (const [k, src] of Object.entries(window.__game.ui.thumbs)) {
    if (k === 'painter') continue;
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    out[k] = c.toDataURL('image/webp', 0.86);
  }
  return out;
})()`;
const res = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
const images = res.result?.result?.value;
if (!images) {
  console.log('thumbs: failed to capture');
  await finish(0);
}
const file = path.join(root, 'src', 'generated', 'thumbs.js');
fs.writeFileSync(file, '// 自动生成：骰子缩略图（WebP）\nexport default ' + JSON.stringify({ hash, images }) + ';\n');
console.log('thumbs:', Object.keys(images).length, 'images,', (fs.statSync(file).size / 1024).toFixed(0), 'KB');
ws.close();
await finish(0);
