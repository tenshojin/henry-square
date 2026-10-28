// 打包角色实验台：node tools/lab/build.mjs <输出 html>
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const r = await esbuild.build({ entryPoints: [path.join(here, 'charlab.js')], bundle: true, format: 'iife', write: false, minify: false, logLevel: 'warning' });
fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${r.outputFiles[0].text.replace(/<\/script/gi, '<\/script')}</script></body></html>`);
console.log('lab built', out);
