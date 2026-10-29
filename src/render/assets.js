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

let loader = null;
export async function loadGLB(name) {
  if (!loader) {
    await MeshoptDecoder.ready;
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const buf = await assetBuffer(name);
  return new Promise((resolve, reject) => loader.parse(buf, '', resolve, reject));
}
