// 构建：把代码、样式、字体、语音、缩略图打包成一个可以双击打开的 HTML 文件
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(root, ...p);
const outFile = r('亨利广场.html');

// 1. 语音：去掉首尾静音后转 base64
function trimWav(buf) {
  let off = 12;
  let fmt = null;
  let data = null;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) return buf;
  const samples = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
  const th = 400;
  let a = 0;
  let b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < th) a++;
  while (b > a && Math.abs(samples[b]) < th) b--;
  const pad = Math.floor(fmt.rate * 0.03);
  a = Math.max(0, a - pad);
  b = Math.min(samples.length - 1, b + pad * 3);
  const out = samples.slice(a, b + 1);
  // 末尾淡出，避免爆音
  const fade = Math.min(out.length, Math.floor(fmt.rate * 0.02));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] = Math.round(out[out.length - 1 - i] * (i / fade));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + out.length * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.rate, 24);
  header.writeUInt32LE(fmt.rate * fmt.channels * 2, 28);
  header.writeUInt16LE(fmt.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(out.length * 2, 40);
  return Buffer.concat([header, Buffer.from(out.buffer)]);
}

const voiceDir = r('assets', 'voices');
const voices = {};
if (fs.existsSync(voiceDir)) {
  for (const f of fs.readdirSync(voiceDir).filter((x) => x.endsWith('.wav')).sort()) {
    voices[path.basename(f, '.wav')] = trimWav(fs.readFileSync(path.join(voiceDir, f))).toString('base64');
  }
}
fs.mkdirSync(r('src', 'generated'), { recursive: true });
fs.writeFileSync(r('src', 'generated', 'voices.js'), '// 自动生成：观众语音（英语）\nexport default ' + JSON.stringify(voices) + ';\n');
console.log('voices:', Object.keys(voices).length);

// 2. 缩略图：骰子外观相关的源码变了就重新生成
const thumbsFile = r('src', 'generated', 'thumbs.js');
const thumbHash = crypto
  .createHash('sha1')
  .update(['src/data/dice.js', 'src/render/diceFaces.js', 'src/render/diceModel.js', 'src/render/canvasTex.js'].map((f) => fs.readFileSync(r(f), 'utf8')).join('\n'))
  .digest('hex')
  .slice(0, 12);
let thumbsOk = false;
if (fs.existsSync(thumbsFile)) thumbsOk = fs.readFileSync(thumbsFile, 'utf8').includes(`"hash":"${thumbHash}"`);
if (!thumbsOk) fs.writeFileSync(thumbsFile, '// 自动生成：骰子缩略图（WebP）\nexport default {"hash":"","images":{}};\n');

// 3. 字体
const font = (pkg, file, family, style = 'normal', weight = 400) => {
  const p = r('node_modules', '@fontsource', pkg, 'files', file);
  if (!fs.existsSync(p)) return '';
  const b64 = fs.readFileSync(p).toString('base64');
  return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
};
const fontFaces = [
  font('grenze-gotisch', 'grenze-gotisch-latin-400-normal.woff2', 'Grenze Gotisch', 'normal', 400),
  font('grenze-gotisch', 'grenze-gotisch-latin-600-normal.woff2', 'Grenze Gotisch', 'normal', 600),
  font('grenze-gotisch', 'grenze-gotisch-latin-700-normal.woff2', 'Grenze Gotisch', 'normal', 700),
  font('alegreya', 'alegreya-latin-400-normal.woff2', 'Alegreya', 'normal', 400),
  font('alegreya', 'alegreya-latin-500-normal.woff2', 'Alegreya', 'normal', 500),
  font('alegreya', 'alegreya-latin-700-normal.woff2', 'Alegreya', 'normal', 700),
  font('alegreya', 'alegreya-latin-400-italic.woff2', 'Alegreya', 'italic', 400),
];
// 中文标题字体：思源宋体（可变字重），只保留游戏里用到的字，体积很小
const cjkSource = r('tools', 'fonts', 'NotoSerifSC-VF.ttf');
if (fs.existsSync(cjkSource)) {
  const { default: subsetFont } = await import('subset-font');
  const texts = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name !== 'generated') walk(p);
      } else if (/\.(js|html)$/.test(f.name)) texts.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(r('src'));
  const chars = new Set(texts.join('').match(/[· -⁯⺀-鿿＀-￯]/g) || []);
  const subset = await subsetFont(fs.readFileSync(cjkSource), [...chars].join(''), { targetFormat: 'woff2' });
  fontFaces.push(`@font-face{font-family:'Henry Serif SC';font-style:normal;font-weight:200 900;font-display:swap;src:url(data:font/woff2;base64,${subset.toString('base64')}) format('woff2');}`);
  console.log('cjk title font:', chars.size, 'chars,', (subset.length / 1024).toFixed(0), 'KB');
}
const fonts = fontFaces.join('\n');

// 4. 打包脚本并拼装成单个 HTML
async function buildHtml() {
  const result = await esbuild.build({
    entryPoints: [r('src', 'main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['es2020'],
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const js = result.outputFiles[0].text;
  const css = fs.readFileSync(r('src', 'ui', 'style.css'), 'utf8');
  let html = fs.readFileSync(r('src', 'index.html'), 'utf8');
  html = html.replace('/*__FONTS__*/', () => fonts);
  html = html.replace('/*__STYLE__*/', () => css);
  html = html.replace('/*__SCRIPT__*/', () => js.replace(/<\/script/gi, '<\\/script'));
  fs.writeFileSync(outFile, html);
}

await buildHtml();
if (!thumbsOk) {
  // 用无头浏览器跑一遍游戏，把缩略图存下来，再打包一次
  spawnSync(process.execPath, [r('tools', 'make_thumbs.mjs'), outFile, thumbHash], { stdio: 'inherit' });
  if (fs.readFileSync(thumbsFile, 'utf8').includes(`"hash":"${thumbHash}"`)) await buildHtml();
}
// 旧版文件名（v1.0）
const oldFile = r('骰子酒馆.html');
if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
console.log('built', outFile, (fs.statSync(outFile).size / 1024 / 1024).toFixed(2) + ' MB');
