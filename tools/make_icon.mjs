// 把 src/ui/icon.js 里的图标导出成文件：assets/icon.svg、assets/icon-512.png、assets/icon-180.png（苹果设备桌面图标）
// 用法：node tools/make_icon.mjs   （需要电脑上有 Chrome 或 Edge）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { iconSVG } = await import(pathToFileURL(path.join(root, 'src', 'ui', 'icon.js')).href);
const svg = iconSVG();
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'icon.svg'), svg);

const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const exe = chromes.find((p) => fs.existsSync(p));
if (!exe) {
  console.log('icon: wrote assets/icon.svg; no Chrome/Edge found, PNGs skipped');
  process.exit(0);
}
const port = 9833 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'henry-icon-'));
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=600,600', 'about:blank'], { stdio: 'ignore' });
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
  console.log('icon: browser did not start');
  await finish(1);
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

await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const size of [512, 180]) {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const page = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(page) });
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  fs.writeFileSync(path.join(root, 'assets', `icon-${size}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log(`icon: assets/icon-${size}.png`);
}
await finish(0);
