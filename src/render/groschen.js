// 亨利酒馆的格罗申（v3.4）：正面亚历山大大帝头像，背面十字 + 王冠 + 骰子（贴图由 tools/coin/make_coin.py 生成）。
// 几何体：两个面是极坐标网格（平面 UV），外圈凸起的边和圆角、币边都是真的几何；手工打制的币，外圈略微不圆。
// 材质：银（金属度、粗糙度、包浆都在贴图里），环境光是酒馆全景，所以转起来会闪。
// 平放、头像朝上时，头像的“上”朝 -Z（远离镜头），从牌桌机位看是正的；绕 X 轴翻过来就是背面朝上，也是正的。
import * as THREE from 'three';

export const G_R = 0.7; // 半径：28 毫米（1 米 = 50 单位）
export const G_H = 0.075; // 厚度：1.5 毫米（不算凸边）
const RIM = 0.17; // 凸边高出平面多少（相对厚度的一半）
export const G_REST = G_H * (0.5 + RIM / 2); // 平放时币心离桌面的高度
export const G_STEP = G_H * (1 + RIM); // 摞起来每枚的间距

// 截面（半径比例, 高度）：中间的平面 → 外圈凸边（斜坡、平顶、圆角）→ 币边 → 背面对称
function profile() {
  const h = G_H / 2;
  const e = h * RIM;
  const top = [
    [[0, h], [0.915, h]],
    [[0.915, h], [0.929, h + e * 0.55], [0.944, h + e], [0.982, h + e], [0.993, h + e * 0.7], [1, h + e * 0.1]],
  ];
  const side = [[1, h + e * 0.1], [1, -h - e * 0.1]];
  const bottom = top.map((pl) => pl.map(([r, y]) => [r, -y]).reverse()).reverse();
  return { top, side, bottom };
}

const geoCache = new Map();
// seg：一圈分几段；variant：外圈不圆的样子（几种略有不同）
export function groschenGeometry(seg = 128, variant = 0) {
  const key = seg + ':' + variant;
  if (geoCache.has(key)) return geoCache.get(key);
  const { top, side, bottom } = profile();
  let s = variant * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  // 外圈（半径比例 > 0.93 的点）跟着打制出来的不规则外形走，图案区不变形
  const wob = (a, r) => (r > 0.93 ? 1 + ((r - 0.93) / 0.07) * (0.011 * Math.sin(3 * a + ph[0]) + 0.006 * Math.sin(5 * a + ph[1]) + 0.004 * Math.sin(9 * a + ph[2])) : 1);
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const groups = [];
  // 一条截面折线绕一圈成一段带子；折线内部的点共用平滑法线，折线之间是硬边
  const strip = (pl, face, material) => {
    const start = idx.length;
    const n = pl.length;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const [r, y] = pl[i];
      // 截面法线：沿折线前进方向 (dr, dy) 转 90°：(-dy, dr)，在折线中间取前后两段的平均
      const a = pl[Math.max(0, i - 1)];
      const b = pl[Math.min(n - 1, i + 1)];
      let nr = -(b[1] - a[1]);
      let ny = b[0] - a[0];
      const l = Math.hypot(nr, ny) || 1;
      nr /= l;
      ny /= l;
      for (let j = 0; j <= seg; j++) {
        const ang = (j / seg) * Math.PI * 2;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const k = wob(ang, r) * G_R;
        pos.push(c * r * k, y, sn * r * k);
        nrm.push(c * nr, ny, sn * nr);
        if (face === 'top') uv.push(0.5 + (c * r) / 2, 0.5 - (sn * r) / 2);
        else if (face === 'bottom') uv.push(0.5 + (c * r) / 2, 0.5 + (sn * r) / 2);
        else uv.push(j / seg * 3, (y / G_H) + 0.5);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < seg; j++) {
        const a = base + i * (seg + 1) + j;
        const b = a + seg + 1;
        // 顶面从中心往外、绕 +Y 逆时针：正面朝外的三角形顺序
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    groups.push([start, idx.length - start, material]);
  };
  for (const pl of top) strip(pl, 'top', 1);
  strip(side, 'side', 0);
  for (const pl of bottom) strip(pl, 'bottom', 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // 同一种材质的段合并成一组（少几次绘制）
  groups.sort((x, y) => x[2] - y[2] || x[0] - y[0]);
  for (const [start, count, m] of groups) g.addGroup(start, count, m);
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

// ---------- 材质 ----------
let mats = null;
let icons = null;

function texFrom(id, srgb) {
  const el = document.getElementById('asset-coin-' + id);
  if (!el) return Promise.resolve(null);
  return new THREE.TextureLoader().loadAsync('data:image/webp;base64,' + el.textContent.trim()).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

// 银币反光用的小“影棚”：暗的屋子里几块暖色柔光板。酒馆全景从桌面往上看几乎全黑，平放的币面只照出黑屋顶、发褐；
// 换成这个，浮雕的一侧照出光板、另一侧是暗的，才像擦亮的银子。从牌桌机位看平放的币，反射的是“上方偏远处”：
// 那里一大片暗的暖光打底（中间调），中间一小块亮灯——浮雕、凸边和稍微斜一点的币才会有亮有暗，不会一片白
function coinStudio() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.1, 0.078, 0.06);
  const panel = (w, h, color, k, dir, dist = 10) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...dir).normalize().multiplyScalar(dist);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(14, 9, '#ffe0b8', 0.5, [0, 0.8, -0.6]);
  panel(4.5, 3, '#fff0d6', 2.0, [0.15, 0.78, -0.62], 9.5);
  panel(6, 6, '#fff0dc', 1.0, [0, 1, 0]);
  panel(5, 5, '#ffcf96', 1.2, [-0.9, 0.3, 0.3]);
  panel(4, 7, '#ffe0b4', 0.9, [0.9, 0.35, -0.2]);
  panel(8, 5, '#ffe2bc', 1.0, [0, 0.55, 0.85]); // 镜头背后：币正对镜头翻转时也是亮的
  return scene;
}

// 打包时内嵌的贴图解码成材质（只做一次）；没有贴图（开发时没跑 make_coin.py）就用纯银色。颜色压一点暖色，和烛光对得上
const WARM = '#ece0cc';
export async function loadGroschen(renderer) {
  if (mats) return mats;
  let envMap = null;
  if (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    envMap = pm.fromScene(coinStudio(), 0.03).texture;
    pm.dispose();
  }
  const face = async (side) => {
    const [map, normalMap, orm] = await Promise.all([texFrom(side + '_color', true), texFrom(side + '_normal', false), texFrom(side + '_orm', false)]);
    return new THREE.MeshStandardMaterial({
      color: map ? WARM : '#cfcac0',
      map,
      normalMap,
      aoMap: orm,
      roughnessMap: orm,
      metalnessMap: orm,
      metalness: 1,
      roughness: orm ? 1 : 0.3,
      envMap,
      envMapIntensity: envMap ? 1 : 2.1,
    });
  };
  const edgeN = await texFrom('edge_normal', false);
  if (edgeN) edgeN.wrapS = THREE.RepeatWrapping;
  const edge = new THREE.MeshStandardMaterial({ color: '#d9cdb6', normalMap: edgeN, metalness: 1, roughness: 0.34, envMap, envMapIntensity: envMap ? 1 : 2.1 });
  mats = [edge, await face('obverse'), await face('reverse')];
  // 亮度封顶：掷币时币离镜头很近、正好把吊灯反射进镜头，原来会被泛光放大成一大团光；
  // 输出（线性 HDR）压在泛光阈值 1.7 以下，闪光交给可控的星芒（coinToss.js）
  for (const m of mats) {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(1.45));');
    };
  }
  const url = (id) => {
    const el = document.getElementById('asset-coin-' + id);
    return el ? 'data:image/webp;base64,' + el.textContent.trim() : '';
  };
  icons = { heads: url('icon_heads'), cross: url('icon_cross') };
  return mats;
}

export const groschenIcons = () => icons || { heads: '', cross: '' };
export const groschenMaterials = () => mats;

// 一枚格罗申（细节高的给掷币用，低的给成堆的、撒下来的用）
export function makeGroschen({ seg = 64, variant = 0 } = {}) {
  const m = new THREE.Mesh(groschenGeometry(seg, variant % 4), mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 一摞格罗申（略微错位，最上面那枚随机正反）
export function groschenStack(n, seed = 1) {
  let s = seed * 7919 + 13;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.Group();
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    const c = makeGroschen({ seg: 48, variant: Math.floor(rnd() * 4) });
    x += (rnd() - 0.5) * 0.08;
    z += (rnd() - 0.5) * 0.08;
    c.position.set(x, G_REST + i * G_STEP, z);
    c.rotation.y = rnd() * Math.PI * 2;
    c.rotation.x = (rnd() - 0.5) * 0.03 + (i === n - 1 && rnd() < 0.5 ? Math.PI : 0);
    g.add(c);
  }
  g.userData.top = G_REST + n * G_STEP; // 摞顶的高度（再放一枚就放在这里）
  return g;
}

// 皮钱袋（收口系绳），旁边散落几枚格罗申
export function groschenPurse(seed = 1) {
  let s = seed * 7919 + 13;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: '#6a4024', roughness: 0.7 });
  const pts = [[0, 0], [0.9, 0.08], [1.25, 0.5], [1.3, 1.0], [1.05, 1.5], [0.55, 1.85], [0.4, 2.0], [0.62, 2.35], [0.55, 2.5], [0, 2.45]].map(([a, b]) => new THREE.Vector2(a, b));
  const bag = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), leather);
  bag.scale.set(1, 1, 0.85);
  bag.castShadow = true;
  bag.receiveShadow = true;
  g.add(bag);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.07, 6, 16), new THREE.MeshStandardMaterial({ color: '#c8a870', roughness: 0.9 }));
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 1.95;
  g.add(tie);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), tie.material);
  string.position.set(0.55, 1.6, 0.3);
  string.rotation.z = 0.9;
  g.add(string);
  // 三枚散落的币，彼此不重叠
  [[1.7, -0.85], [3.05, 0], [1.75, 0.85]].forEach(([x, z], i) => {
    const c = makeGroschen({ seg: 48, variant: i });
    c.position.set(x + (rnd() - 0.5) * 0.08, G_REST, z + (rnd() - 0.5) * 0.08);
    c.rotation.y = rnd() * 6;
    if (rnd() < 0.5) c.rotation.x = Math.PI;
    g.add(c);
  });
  return g;
}
