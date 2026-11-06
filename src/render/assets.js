// 内嵌资源：打包时把 GLB / HDR 以 base64 放进 <script type="text/plain" id="asset-名字">，这里读出来
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const cache = new Map();

// data: 地址交给浏览器原生解码 base64，比 atob 逐字节转快得多，而且双击打开的本地文件也能用
export async function assetBuffer(name) {
  if (cache.has(name)) return cache.get(name);
  const el = document.getElementById('asset-' + name);
  if (!el) throw new Error('missing asset ' + name);
  const p = fetch('data:application/octet-stream;base64,' + el.textContent.trim()).then((r) => r.arrayBuffer());
  cache.set(name, p);
  const buf = await p;
  el.textContent = '';
  return buf;
}

export function assetJSON(name) {
  const el = document.getElementById('asset-' + name);
  return el ? JSON.parse(el.textContent) : null;
}

// 改一下 GLB 的目录，去掉不要的节点：没人引用的贴图根本不会解码（手机上省下几百兆）
function pruneGLB(buf, drop) {
  const head = new DataView(buf);
  const jsonLen = head.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const gone = new Set();
  json.nodes.forEach((n, i) => { if (n.name && drop(n.name)) gone.add(i); });
  for (const s of json.scenes) s.nodes = s.nodes.filter((i) => !gone.has(i));
  for (const n of json.nodes) if (n.children) n.children = n.children.filter((i) => !gone.has(i));
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(text.length / 4) * 4;
  const rest = new Uint8Array(buf, 20 + jsonLen);
  const out = new Uint8Array(20 + padded + rest.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, head.getUint32(0, true), true);
  dv.setUint32(4, head.getUint32(4, true), true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, padded, true);
  dv.setUint32(16, head.getUint32(16, true), true);
  out.fill(0x20, 20, 20 + padded);
  out.set(text, 20);
  out.set(rest, 20 + padded);
  return out.buffer;
}

let loader = null;
export async function loadGLB(name, { drop } = {}) {
  if (!loader) {
    await MeshoptDecoder.ready;
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  let buf = await assetBuffer(name);
  if (drop) buf = pruneGLB(buf, drop);
  return new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
}
