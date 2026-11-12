// 构建：把代码、样式、字体、语音、缩略图打包成一个可以双击打开的 HTML 文件
import { tableOnlyGLB } from './tools/glb_table.mjs';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(root, ...p);
const outFile = r('亨利酒馆.html');
const webFile = r('play.html'); // 手机走的网页版：不内嵌视频，用到再下载，页面小将近一半

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
    // 有压好的 MP3 就用它（tools/compress_voices.py），WAV 打进页面太大
    const mp3 = path.join(voiceDir, path.basename(f, '.wav') + '.mp3');
    voices[path.basename(f, '.wav')] = (fs.existsSync(mp3) ? fs.readFileSync(mp3) : trimWav(fs.readFileSync(path.join(voiceDir, f)))).toString('base64');
  }
}
fs.mkdirSync(r('src', 'generated'), { recursive: true });
fs.writeFileSync(r('src', 'generated', 'voices.js'), '// 自动生成：观众语音（英语）\nexport default ' + JSON.stringify(voices) + ';\n');
console.log('voices:', Object.keys(voices).length);

// 2. 缩略图：骰子外观相关的源码变了就重新生成
const thumbsFile = r('src', 'generated', 'thumbs.js');
const thumbHash = crypto
  .createHash('sha1')
  .update(['src/data/dice.js', 'src/render/diceFaces.js', 'src/render/diceModel.js', 'src/render/canvasTex.js'].map((f) => fs.readFileSync(r(f), 'utf8').replace(/\r\n/g, '\n')).join('\n'))
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
// v3.4 中世纪风：标题 Cinzel（罗马碑刻大写），正文 IM Fell English（17 世纪活字），火漆上的字母 Grenze Gotisch（哥特体）
const fontFaces = [
  font('grenze-gotisch', 'grenze-gotisch-latin-700-normal.woff2', 'Grenze Gotisch', 'normal', 700),
  font('cinzel', 'cinzel-latin-700-normal.woff2', 'Cinzel', 'normal', 700),
  font('cinzel', 'cinzel-latin-900-normal.woff2', 'Cinzel', 'normal', 900),
  font('im-fell-english', 'im-fell-english-latin-400-normal.woff2', 'IM Fell English', 'normal', 400),
  font('im-fell-english', 'im-fell-english-latin-400-italic.woff2', 'IM Fell English', 'italic', 400),
];
// 数字统一用 Cinzel 的罗马碑刻数字（IM Fell 的老式数字 1 像 ı、0 像 o，计分不好认）：只覆盖 0-9
for (const [file, w] of [['cinzel-latin-500-normal.woff2', 400], ['cinzel-latin-700-normal.woff2', 700]]) {
  const f = font('cinzel', file, 'Henry Digits', 'normal', w);
  if (f) fontFaces.push(f.replace("format('woff2');}", "format('woff2');unicode-range:U+0030-0039;}"));
}
// 中文、日文字体：思源宋体（可变字重），只保留游戏里用到的字，体积很小。
// 日文另用一份日本字形的思源宋体（同一个汉字中日写法不同，比如“直”“骨”“今”），日文的字都在 src/lang/ja.js：
// 中文那份不收日文独有的字（假名、日本汉字），日文那份只收 ja.js 里的字。
// 只数代码里字符串用到的字（先去掉注释），注释里的中文不进字体。
// unicode-range 只写这几段：英文字母、数字、空格照样落到后面的拉丁字体，行高和基线跟原来一样
const CJK_RANGE = 'U+00B7,U+2000-206F,U+2E80-9FFF,U+FF00-FFEF';
const CJK_RE = /[· -⁯⺀-鿿＀-￯]/g;
const codeText = async (file) => (await esbuild.transform(fs.readFileSync(file, 'utf8'), { loader: 'js', minify: true, charset: 'utf8', legalComments: 'none' })).code;
async function cjkFace(source, family, text) {
  if (!fs.existsSync(source)) {
    console.warn(`缺少字体 ${source}：${family} 的字会用系统字体显示（恢复方法见 README）`);
    return null;
  }
  const { default: subsetFont } = await import('subset-font');
  const chars = new Set(text.match(CJK_RE) || []);
  const subset = await subsetFont(fs.readFileSync(source), [...chars].join(''), { targetFormat: 'woff2' });
  console.log(`${family}:`, chars.size, 'chars,', (subset.length / 1024).toFixed(0), 'KB');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:200 900;font-display:swap;unicode-range:${CJK_RANGE};src:url(data:font/woff2;base64,${subset.toString('base64')}) format('woff2');}`;
}
{
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name !== 'generated') walk(p);
      } else if (/\.js$/.test(f.name)) files.push(p);
    }
  };
  walk(r('src'));
  const jaFile = r('src', 'lang', 'ja.js');
  const zhText = (await Promise.all(files.filter((f) => f !== jaFile).map(codeText))).join('') + fs.readFileSync(r('src', 'index.html'), 'utf8');
  // 日文界面里也会出现的共用符号（拼接用的“·”、省略号、破折号、跳过的“›”），再加上语言按钮上的“日本語”
  const jaText = (await codeText(jaFile)) + '·…—–›日本語';
  for (const face of [
    await cjkFace(r('tools', 'fonts', 'NotoSerifSC-VF.ttf'), 'Henry Serif SC', zhText),
    await cjkFace(r('tools', 'fonts', 'NotoSerifJP-VF.ttf'), 'Henry Serif JP', jaText),
  ]) if (face) fontFaces.push(face);
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
  // 加载画面：脚本还没下完就要按语言显示（规则和 src/i18n.js 的 detect() 一样）
  const { BOOT } = await import(pathToFileURL(r('src', 'i18n.js')).href + '?t=' + Date.now());
  html = html.replace('/*__BOOT__*/', () => `(function(){var T=${JSON.stringify(BOOT)},l;try{l=localStorage.getItem('tavern-dice-lang')}catch(e){}`
    + `if(!T[l]){l='en';var n=navigator,a=n.languages&&n.languages.length?n.languages:[n.language||''];for(var i=0;i<a.length;i++){var c=String(a[i]).slice(0,2).toLowerCase();if(T[c]){l=c;break}}}`
    + `var t=T[l],d=document,b=d.querySelector('#boot b'),s=d.querySelector('#boot small');d.documentElement.lang=t.html;d.title=t.doc;if(b)b.textContent=t.title;if(s)s.textContent=t.text})();`);
  html = html.replace('/*__STYLE__*/', () => css);
  // 界面材质（tools/ui/make_textures.py 生成的羊皮纸、皮革、金箔）写成 CSS 变量
  const uiDir = r('assets', 'ui');
  const tex = fs.existsSync(uiDir) ? fs.readdirSync(uiDir).filter((x) => x.endsWith('.webp')).sort().map((f) => `--tex-${path.basename(f, '.webp')}:url(data:image/webp;base64,${fs.readFileSync(path.join(uiDir, f)).toString('base64')});`) : [];
  html = html.replace('/*__UITEX__*/', () => `:root{${tex.join('')}}`);
  // 图标：标签页用 SVG，苹果设备桌面图标用 tools/make_icon.mjs 导出的 PNG
  const { ICON_DATA_URI } = await import(pathToFileURL(r('src', 'ui', 'icon.js')).href + '?t=' + Date.now());
  html = html.replace('__ICON_SVG__', () => ICON_DATA_URI);
  const png = r('assets', 'icon-180.png');
  html = html.replace('__ICON_PNG__', () => (fs.existsSync(png) ? 'data:image/png;base64,' + fs.readFileSync(png).toString('base64') : ICON_DATA_URI));
  html = html.replace('/*__SCRIPT__*/', () => js.replace(/<\/script/gi, '<\\/script'));
  // 模型（Blender 导出的 GLB、全景 HDR）和过场动画（AV1 视频）以 base64 内嵌，双击打开的本地文件也能直接读
  const modelDir = r('assets', 'models');
  const tags = [];
  const videos = [];
  let webMeta = '';
  for (const [id, file] of [['tavern', 'tavern.glb'], ['props', 'props.glb'], ['probe', 'probe.hdr']]) {
    const p = path.join(modelDir, file);
    if (fs.existsSync(p)) tags.push(`<script type="text/plain" id="asset-${id}">${fs.readFileSync(p).toString('base64')}</script>`);
  }
  const meta = path.join(modelDir, 'tavern.json');
  if (fs.existsSync(meta)) tags.push(`<script type="application/json" id="asset-tavern-meta">${fs.readFileSync(meta, 'utf8')}</script>`);
  // 格罗申的贴图（tools/coin/make_coin.py 生成的 WebP）
  const coinDir = r('assets', 'coin');
  if (fs.existsSync(coinDir)) {
    for (const f of fs.readdirSync(coinDir).filter((x) => x.endsWith('.webp')).sort()) tags.push(`<script type="text/plain" id="asset-coin-${path.basename(f, '.webp')}">${fs.readFileSync(path.join(coinDir, f)).toString('base64')}</script>`);
  }
  // 过场动画由 tools/anim/finish_clips.py 生成（cutscenes.json 列出每一段）
  const csDir = r('assets', 'cutscenes');
  const csMeta = path.join(csDir, 'cutscenes.json');
  if (fs.existsSync(csMeta)) {
    const cs = JSON.parse(fs.readFileSync(csMeta, 'utf8'));
    for (const name of Object.keys(cs.clips)) videos.push(`<script type="text/plain" id="asset-cs-${name}">${fs.readFileSync(path.join(csDir, name + '.mp4')).toString('base64')}</script>`);
    videos.push(`<script type="application/json" id="asset-cutscenes-meta">${JSON.stringify(cs)}</script>`);
    webMeta = `<script type="application/json" id="asset-cutscenes-meta">${JSON.stringify({ ...cs, external: true })}</script>`;
  }
  // 素材之间夹一小段脚本更新进度条：下载到哪、进度条就走到哪
  const pack = (list) => {
    const total = list.reduce((a, t) => a + t.length, 0);
    let sum = 0;
    return list.map((t) => {
      sum += t.length;
      return t.length > 150000 ? t + `<script>__boot(${(sum / total).toFixed(3)})</script>` : t;
    }).join('\n');
  };
  const page = (list, base = html) => base.replace('<div id="app"></div>', () => pack(list) + '\n<div id="app"></div>');
  fs.writeFileSync(outFile, page([...tags, ...videos]));
  // 网页版：视频用到再下载，模型只留牌桌（tools/glb_table.mjs），比离线的单文件小一半还多
  const tavernTag = tags.findIndex((t) => t.includes('id="asset-tavern"'));
  const webTags = tags.slice();
  if (tavernTag >= 0) webTags[tavernTag] = `<script type="text/plain" id="asset-tavern">${tableOnlyGLB(fs.readFileSync(path.join(modelDir, 'tavern.glb'))).toString('base64')}</script>`;
  fs.writeFileSync(webFile, page(webMeta ? [...webTags, webMeta] : webTags, html.replace('<meta name="theme-color"', '<meta name="table-only" content="1">\n<meta name="theme-color"')));
}

await buildHtml();
if (!thumbsOk) {
  // 用无头浏览器跑一遍游戏，把缩略图存下来，再打包一次
  spawnSync(process.execPath, [r('tools', 'make_thumbs.mjs'), outFile, thumbHash], { stdio: 'inherit' });
  if (fs.readFileSync(thumbsFile, 'utf8').includes(`"hash":"${thumbHash}"`)) await buildHtml();
}
// 旧版文件名：v1.0 的「骰子酒馆.html」删掉；v1.1–v3.3 的「亨利广场.html」留一个跳转页，旧的网址和收藏还能打开
const oldFile = r('骰子酒馆.html');
if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
fs.writeFileSync(r('亨利广场.html'), fs.readFileSync(r('index.html'), 'utf8'));
console.log('built', outFile, (fs.statSync(outFile).size / 1024 / 1024).toFixed(2) + ' MB;', path.basename(webFile), (fs.statSync(webFile).size / 1024 / 1024).toFixed(2) + ' MB');
