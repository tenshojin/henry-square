// 录屏：无头 Chrome 打开游戏，按步骤操作（和 tools/shot.mjs 同样的 steps 格式），用 CDP screencast 收每一帧，最后用 ffmpeg 拼成 30 帧/秒的 MP4
// 用法：node tools/record.mjs steps.json 输出.mp4（step 里 record: true 那一步开始录）
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [stepsFile, outFile] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
const FFMPEG = 'D:/tools/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9600 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'henry-rec-'));
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'henry-rec-frames-'));
const width = steps.width || 1280;
const height = steps.height || 720;
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  } catch (e) {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const frames = [];
const logs = [];
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Page.screencastFrame') {
    const f = path.join(frameDir, String(frames.length).padStart(6, '0') + '.jpg');
    fs.writeFileSync(f, Buffer.from(msg.params.data, 'base64'));
    frames.push({ f, t: msg.params.metadata.timestamp });
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId } }));
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: steps.url });
let recording = false;
for (const s of steps.steps) {
  if (s.wait) await sleep(s.wait);
  if (s.record && !recording) {
    recording = true;
    await send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  }
  if (s.eval) {
    const res = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true });
    const v = res.result?.result?.value;
    if (res.result?.exceptionDetails) console.log('eval error:', res.result.exceptionDetails.exception?.description);
    else if (v !== undefined) console.log('eval:', JSON.stringify(v).slice(0, 400));
  }
  if (s.click) for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: s.click[0], y: s.click[1], button: 'left', clickCount: 1 });
}
if (recording) await send('Page.stopScreencast');
await sleep(300);
if (logs.length) console.log(logs.slice(-20).join('\n'));
ws.close();
proc.kill();
// 帧的时间不均匀：按时间戳写 concat 列表（每帧显示到下一帧出现），再转成固定 30 帧/秒
const list = frames.map((fr, i) => `file '${fr.f.replace(/\\/g, '/')}'\nduration ${((frames[i + 1]?.t ?? fr.t + 1 / 30) - fr.t).toFixed(4)}`).join('\n');
const listFile = path.join(frameDir, 'list.txt');
fs.writeFileSync(listFile, list + `\nfile '${frames[frames.length - 1].f.replace(/\\/g, '/')}'\n`);
const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'fps=30,scale=out_color_matrix=bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
console.log('frames', frames.length, 'seconds', frames.length ? (frames[frames.length - 1].t - frames[0].t).toFixed(1) : 0, 'ffmpeg', r.status);
await sleep(500);
for (const d of [profile, frameDir]) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch (e) {}
}
