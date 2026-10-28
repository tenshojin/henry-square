// 自测用：用无头 Chrome 打开游戏，按步骤执行脚本并截图（不依赖窗口是否可见）
// 用法：node tools/shot.mjs steps.json 输出目录
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [stepsFile, outDir = '.'] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'henry-shot-'));
const width = steps.width || 1440;
const height = steps.height || 900;
const proc = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  '--autoplay-policy=no-user-gesture-required',
  '--ignore-gpu-blocklist',
  '--enable-gpu',
  '--use-angle=d3d11',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch (e) {
    /* 等浏览器启动 */
  }
}
if (!target) {
  console.error('chrome did not start');
  proc.kill();
  process.exit(1);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: steps.url });
for (const s of steps.steps) {
  if (s.wait) await sleep(s.wait);
  if (s.eval) {
    const res = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true });
    const v = res.result?.result?.value;
    if (res.result?.exceptionDetails) console.log('eval error:', res.result.exceptionDetails.exception?.description);
    else if (v !== undefined) console.log('eval:', JSON.stringify(v).slice(0, 600));
  }
  if (s.click) {
    // 真实鼠标点击（屏幕坐标）
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: s.click[0], y: s.click[1], button: 'left', clickCount: 1 });
    }
  }
  if (s.key) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: s.key, key: s.key === 'Space' ? ' ' : s.key, windowsVirtualKeyCode: s.key === 'Space' ? 32 : 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: s.key, key: s.key === 'Space' ? ' ' : s.key, windowsVirtualKeyCode: s.key === 'Space' ? 32 : 13 });
  }
  if (s.shot) {
    // clip: [x, y, 宽, 高, 放大倍数] 只截一块并放大，看细节用
    const opt = { format: 'jpeg', quality: 82 };
    if (s.clip) opt.clip = { x: s.clip[0], y: s.clip[1], width: s.clip[2], height: s.clip[3], scale: s.clip[4] || 2 };
    const res = await send('Page.captureScreenshot', opt);
    fs.writeFileSync(path.join(outDir, s.shot), Buffer.from(res.result.data, 'base64'));
    console.log('shot', s.shot);
  }
}
if (logs.length) console.log(logs.slice(-30).join('\n'));
ws.close();
proc.kill();
await sleep(500);
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch (e) {
  /* 忽略 */
}
