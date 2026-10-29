// 查看 GLB 内容：网格、形态键、动画、扩展、贴图大小
import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const j = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const out = {
  bytes: buf.length,
  extensionsUsed: j.extensionsUsed,
  meshes: (j.meshes || []).map((m) => ({ name: m.name, prims: m.primitives.length, targets: m.extras?.targetNames || (m.primitives[0].targets ? m.primitives[0].targets.length : 0), mat: m.primitives.map((p) => j.materials?.[p.material]?.name) })),
  animations: (j.animations || []).map((a) => ({ name: a.name, channels: a.channels.length })),
  skins: (j.skins || []).map((s) => s.joints.length),
  images: (j.images || []).map((im) => ({ name: im.name, mime: im.mimeType, kb: Math.round((j.bufferViews[im.bufferView]?.byteLength || 0) / 1024) })),
  materials: (j.materials || []).map((m) => ({ name: m.name, alpha: m.alphaMode, factor: m.pbrMetallicRoughness?.baseColorFactor, tex: m.pbrMetallicRoughness?.baseColorTexture?.index, ext: Object.keys(m.extensions || {}) })),
};
console.log(JSON.stringify(out, null, 1).slice(0, +(process.argv[3] || 6000)));
