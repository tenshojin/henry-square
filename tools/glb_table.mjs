// 网页版用的模型：只留牌桌这几块，其余的墙、吧台、壁炉连同贴图都从文件里删掉。
// 实时画面只看得到牌桌，整间酒馆 4 MB 里绝大部分下载了也用不上（手机上尤其不划算）。
// 离线的单文件还是完整模型。keep(name) 返回 false 的 B_ 节点被删掉；别的节点（标记点之类）留着。
const walkTextures = (o, fn) => {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (/Texture$/.test(k) && v && typeof v.index === 'number') fn(v);
    else if (typeof v === 'object') walkTextures(v, fn);
  }
};

export function tableOnlyGLB(buf, keep = (n) => /^B_(table|tabletop|tableprops)$/.test(n)) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binAt = 20 + jsonLen;
  const bin = buf.subarray(binAt + 8, binAt + 8 + buf.readUInt32LE(binAt));

  // 节点：从场景根往下走，碰到要删的就不进去
  const gone = (i) => /^B_/.test(json.nodes[i].name || '') && !keep(json.nodes[i].name);
  const usedNodes = [];
  const walk = (i) => {
    if (gone(i)) return;
    usedNodes.push(i);
    (json.nodes[i].children || []).forEach(walk);
  };
  json.scenes.forEach((s) => s.nodes.forEach(walk));

  const remap = (list) => new Map(list.map((old, i) => [old, i]));
  const unique = (a) => [...new Set(a)].sort((x, y) => x - y);
  const nodeMap = remap(usedNodes);
  const usedMeshes = unique(usedNodes.map((i) => json.nodes[i].mesh).filter((m) => m !== undefined));
  const meshMap = remap(usedMeshes);
  const prims = usedMeshes.flatMap((m) => json.meshes[m].primitives);
  const usedMaterials = unique(prims.map((p) => p.material).filter((m) => m !== undefined));
  const materialMap = remap(usedMaterials);
  const usedAccessors = unique(prims.flatMap((p) => [...Object.values(p.attributes), ...(p.indices === undefined ? [] : [p.indices])]));
  const accessorMap = remap(usedAccessors);
  const texRefs = [];
  usedMaterials.forEach((m) => walkTextures(json.materials[m], (t) => texRefs.push(t)));
  const usedTextures = unique(texRefs.map((t) => t.index));
  const textureMap = remap(usedTextures);
  const imageOf = (t) => t.extensions?.EXT_texture_webp?.source ?? t.source;
  const usedImages = unique(usedTextures.map((t) => imageOf(json.textures[t])));
  const imageMap = remap(usedImages);
  const usedViews = unique([...usedAccessors.map((a) => json.accessors[a].bufferView), ...usedImages.map((i) => json.images[i].bufferView)]);
  const viewMap = remap(usedViews);

  // 新的二进制块：只拷用到的部分，4 字节对齐
  const parts = [];
  let size = 0;
  const copy = (offset, length) => {
    const at = size;
    parts.push(bin.subarray(offset, offset + length));
    size += length;
    const pad = (4 - (size % 4)) % 4;
    if (pad) {
      parts.push(Buffer.alloc(pad));
      size += pad;
    }
    return at;
  };
  const views = usedViews.map((v) => {
    const view = structuredClone(json.bufferViews[v]);
    const mo = view.extensions?.EXT_meshopt_compression;
    if (mo) mo.byteOffset = copy(mo.byteOffset || 0, mo.byteLength);
    else view.byteOffset = copy(view.byteOffset || 0, view.byteLength);
    return view;
  });

  const out = { ...json };
  out.scenes = json.scenes.map((s) => ({ ...s, nodes: s.nodes.filter((i) => nodeMap.has(i)).map((i) => nodeMap.get(i)) }));
  out.nodes = usedNodes.map((i) => {
    const n = { ...json.nodes[i] };
    if (n.children) {
      n.children = n.children.filter((c) => nodeMap.has(c)).map((c) => nodeMap.get(c));
      if (!n.children.length) delete n.children;
    }
    if (n.mesh !== undefined) n.mesh = meshMap.get(n.mesh);
    return n;
  });
  out.meshes = usedMeshes.map((m) => {
    const mesh = structuredClone(json.meshes[m]);
    for (const p of mesh.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = accessorMap.get(p.attributes[k]);
      if (p.indices !== undefined) p.indices = accessorMap.get(p.indices);
      if (p.material !== undefined) p.material = materialMap.get(p.material);
    }
    return mesh;
  });
  out.materials = usedMaterials.map((m) => {
    const mat = structuredClone(json.materials[m]);
    walkTextures(mat, (t) => { t.index = textureMap.get(t.index); });
    return mat;
  });
  out.textures = usedTextures.map((t) => {
    const tex = structuredClone(json.textures[t]);
    if (tex.extensions?.EXT_texture_webp) tex.extensions.EXT_texture_webp.source = imageMap.get(tex.extensions.EXT_texture_webp.source);
    if (tex.source !== undefined) tex.source = imageMap.get(tex.source);
    return tex;
  });
  out.images = usedImages.map((i) => ({ ...json.images[i], bufferView: viewMap.get(json.images[i].bufferView) }));
  out.accessors = usedAccessors.map((a) => ({ ...json.accessors[a], bufferView: viewMap.get(json.accessors[a].bufferView) }));
  out.bufferViews = views;
  out.buffers = json.buffers.map((b, i) => (i === 0 ? { ...b, byteLength: size } : b));

  // 拼回 GLB
  let text = Buffer.from(JSON.stringify(out), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const data = Buffer.concat(parts);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + 8 + data.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(data.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, text, binHead, data]);
}
