# 投影贴图：把设定图里去掉背景的 正面 / 侧面 / 背面（侧面再左右镜像当另一侧）按正交投影投到衣服上，烘成一张贴图。
# 做法：衣服合成一个物体、重新展 UV → 用 Cycles 把每个贴图像素对应的位置/法线烘出来（摆成设定图里的站姿）
#      → 每个视图：算出投到图上的哪一点、是否被挡住（向相机方向打射线）、朝向权重 → 加权混合 → 没看到的地方从周围推过来补上。
import bpy, math, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import chars_clothes as C
import chars_motion as A

REF = r'C:\blender\henry_square\reference\views'
TEX = r'C:\blender\henry_square\textures'
SIDE = {'dicer': 'right', 'drinker': 'right', 'elder': 'left', 'barmaid': 'left'}
DIRS = {'front': Vector((0, 1, 0)), 'back': Vector((0, -1, 0)), 'right': Vector((1, 0, 0)), 'left': Vector((-1, 0, 0))}
# 设定图里的站姿：手臂离开身体多少、肘弯多少；adj：每个视图的微调（左右像素, 上下像素, 缩放）
REF_POSE = {
    'dicer': dict(out=0.2, bend=0.12),
    'drinker': dict(out=0.16, bend=0.16),
    'elder': dict(out=0.17, bend=0.16),
    'barmaid': dict(out=0.16, bend=0.18),
}
ADJ = {}
# 轮廓拟合时横向最多放大多少（中年人的披肩、外套本来就厚，少放一点）
FIT_HI = {'drinker': 1.12, 'dicer': 1.18}
# 金属件、系带、头上戴的保留自己的材质（脸附近投影容易错位）
KEEP = ('medal', 'pin', 'lace', 'cap', 'capband', 'kerchief', 'kerchief_knot', 'bun')


def keep_part(ob):
    short = ob.name.split('.')[1] if '.' in ob.name else ob.name
    return 'buckle' in short or short in KEEP or short.startswith('lace')


GAIN = 1.0                                  # 颜色照设定图原样


def hcoord(view, p):
    if view == 'front':
        return p[..., 0]
    if view == 'back':
        return -p[..., 0]
    if view == 'right':
        return -p[..., 1]
    return p[..., 1]


def load_rgba(path, flip=False):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    a = px.reshape(h, w, 4)[::-1].copy()   # 左上角为原点
    return a[:, ::-1].copy() if flip else a


def bilinear(img, x, y):
    h, w = img.shape[:2]
    x = np.clip(x, 0, w - 1.001)
    y = np.clip(y, 0, h - 1.001)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    a, b, c, d = img[y0, x0], img[y0, x0 + 1], img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def pose_ref(rig, name):
    A.reset(rig)
    rp = REF_POSE[name]
    A.arms_down(rig, out=rp['out'], bend=rp['bend'])
    A.fingers(rig, 0.6)
    A.upd()


def join_parts(parts, name):
    for ob in parts:
        bpy.context.view_layer.objects.active = ob
        C.apply_modifiers(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


def unwrap(ob, margin=0.003):
    me = ob.data
    uv = me.uv_layers.new(name='proj')
    me.uv_layers.active = uv
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=margin, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for l in list(me.uv_layers):
        if l.name != 'proj':
            me.uv_layers.remove(l)
    me.uv_layers['proj'].active_render = True


def bake_attr(ob, which, size):
    """把每个贴图像素对应的位置（或法线）烘成浮点图。位置编码到 0..1（Cycles 发光不保留负数）。"""
    img = bpy.data.images.new('pj_' + which, size, size, float_buffer=True, alpha=True)
    mat = bpy.data.materials.new('pj_bake_' + which)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    vm = nt.nodes.new('ShaderNodeVectorMath')
    vm.operation = 'MULTIPLY_ADD'
    k = 0.25 if which == 'pos' else 0.5
    vm.inputs[1].default_value = (k, k, k)
    vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Position' if which == 'pos' else 'Normal'], vm.inputs[0])
    nt.links.new(vm.outputs['Vector'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    me = ob.data
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.material_index = 0
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    # 先填成全 0，不清空直接烘：没有面的像素保持 0，用来判断哪些像素有衣服
    img.pixels.foreach_set(np.zeros(size * size * 4, dtype=np.float32))
    bpy.ops.object.bake(type='EMIT', margin=0, use_clear=False, uv_layer='proj')
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(size, size, 4)
    bpy.data.images.remove(img)
    bpy.data.materials.remove(mat)
    v = (px[..., :3] - 0.5) / k
    return v, px[..., :3].sum(2) > 1e-5


def world_mesh(objs):
    """所有网格当前姿势下的世界坐标（顶点、面），用来挡光线和算轮廓。"""
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        M = o.matrix_world
        off = len(verts)
        verts.extend(M @ v.co for v in me.vertices)
        polys.extend([off + i for i in p.vertices] for p in me.polygons)
        ev.to_mesh_clear()
    return verts, polys


def align(view, alpha, V):
    """设定图上的人和模型对齐：竖直方向脚底和头顶对齐，水平方向按躯干那一段的中点对齐。返回 (缩放, 图上中线 x, 模型中线, 图上头顶行, 模型头顶)。"""
    h = hcoord(view, V)
    z = V[:, 2]
    fg = alpha > 0.5
    rows = np.nonzero(fg.any(1))[0]
    r0, r1 = rows[0], rows[-1]
    zt, zb = float(z.max()), float(max(0.0, z.min()))
    s = (r1 - r0) / (zt - zb)
    band = (z > zb + 0.45 * (zt - zb)) & (z < zb + 0.62 * (zt - zb))
    hc = 0.5 * (h[band].min() + h[band].max())
    br0, br1 = int(r0 + (zt - (zb + 0.62 * (zt - zb))) * s), int(r0 + (zt - (zb + 0.45 * (zt - zb))) * s)
    cols = np.nonzero(fg[br0:br1].any(0))[0]
    cx = 0.5 * (cols[0] + cols[-1])
    dx, dy, ds = ADJ.get(view, (0, 0, 1.0))
    return s * ds, cx + dx, hc, r0 + dy, zt


ARM_BONES = ('upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')


def char_meshes(name):
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.get('henry_char') == name]


def bone_weight(ob, test):
    gi = {g.index: g.name for g in ob.vertex_groups}
    w = np.zeros(len(ob.data.vertices), dtype=np.float32)
    for v in ob.data.vertices:
        for g in v.groups:
            n = gi.get(g.group)
            if n and test(n):
                w[v.index] += g.weight
    return np.clip(w, 0, 1)


def runs(row):
    out, k, n = [], 0, len(row)
    while k < n:
        if row[k]:
            j = k
            while j < n and row[j]:
                j += 1
            out.append((k, j))
            k = j
        else:
            k += 1
    return out


def smooth1d(a, r):
    k = np.ones(2 * r + 1) / (2 * r + 1)
    pad = np.pad(a, r, mode='edge')
    return np.convolve(pad, k, 'valid')


def fit_silhouette(name, objs, report=None, lo=0.85, hi=1.25, hi_y=1.15, shift=0.015):
    hi = FIT_HI.get(name, hi)
    hi_y = min(hi_y, hi)
    """按设定图正面的宽度、侧面的厚度，逐个高度把身体和衣服横向拉宽/收窄（手臂、头不动），让轮廓和设定图对上。"""
    meshes = char_meshes(name)
    data = []
    for ob in meshes:
        co = np.empty(len(ob.data.vertices) * 3, dtype=np.float32)
        ob.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        arm = bone_weight(ob, lambda n: n.startswith(ARM_BONES))
        head = bone_weight(ob, lambda n: n == 'head')
        data.append((ob, co, np.clip(1 - arm - head, 0, 1)))
    allv = np.concatenate([d[1] for d in data])
    # 沿每条边每隔约 1 厘米取点（裙子一圈圈的截面之间也有点），只取不属于手臂和头的部分
    pts = []
    for ob, co, f in data:
        E = np.empty(len(ob.data.edges) * 2, dtype=np.int64)
        ob.data.edges.foreach_get('vertices', E)
        E = E.reshape(-1, 2)
        E = E[(f[E[:, 0]] > 0.8) & (f[E[:, 1]] > 0.8)]
        if not len(E):
            continue
        a, b = co[E[:, 0]], co[E[:, 1]]
        for t in np.linspace(0, 1, 9):
            pts.append(a + (b - a) * t)
    core = np.concatenate(pts)
    zt = float(allv[:, 2].max())
    dz = 0.01
    nb = int(zt / dz) + 1
    zc = (np.arange(nb) + 0.5) * dz
    bi = np.clip((core[:, 2] / dz).astype(int), 0, nb - 1)
    xmin = np.full(nb, np.inf); xmax = np.full(nb, -np.inf); ymin = np.full(nb, np.inf); ymax = np.full(nb, -np.inf)
    np.minimum.at(xmin, bi, core[:, 0]); np.maximum.at(xmax, bi, core[:, 0])
    np.minimum.at(ymin, bi, core[:, 1]); np.maximum.at(ymax, bi, core[:, 1])
    have = np.isfinite(xmin)
    side = SIDE[name]
    res = {}
    for view, fname, lo_hi in (('front', 'front', (xmin, xmax)), (side, 'side', (ymin, ymax))):
        alpha = load_rgba(os.path.join(REF, '%s_%s.png' % (name, fname)))[..., 3] > 0.5
        rows = np.nonzero(alpha.any(1))[0]
        r0, r1 = rows[0], rows[-1]
        s = (r1 - r0) / zt
        mn, mx = lo_hi
        # 模型在这个视图里的水平坐标（侧视图：右侧视角 h = -y，左侧 h = y）
        if view == 'front':
            hmn, hmx = mn, mx
        elif view == 'right':
            hmn, hmx = -mx, -mn
        else:
            hmn, hmx = mn, mx
        # 水平对齐：用大腿那一段（手不会伸到那里）
        band = have & (zc > 0.2 * zt) & (zc < 0.42 * zt)
        hc = float(np.median(0.5 * (hmn[band] + hmx[band])))
        rr = (r0 + (zt - zc[band]) * s).astype(int)
        cs = []
        for r in rr:
            cols = np.nonzero(alpha[r])[0]
            if len(cols):
                cs.append(0.5 * (cols[0] + cols[-1]))
        cx = float(np.median(cs))
        ratio = np.ones(nb)
        cshift = np.zeros(nb)
        for b in np.nonzero(have)[0]:
            r = int(round(r0 + (zt - zc[b]) * s))
            if r < 0 or r >= alpha.shape[0]:
                continue
            mc = cx + (0.5 * (hmn[b] + hmx[b]) - hc) * s
            best = None
            for a0, a1 in runs(alpha[r]):
                if a0 - 2 <= mc <= a1 + 2:
                    best = (a0, a1)
            if best is None:
                continue
            wr = (best[1] - best[0]) / s
            wm = hmx[b] - hmn[b]
            if wm > 0.02:
                ratio[b] = wr / wm
                cshift[b] = ((0.5 * (best[0] + best[1]) - cx) / s + hc) - 0.5 * (hmn[b] + hmx[b])
        # 脖子以上、脚踝以下不动；平滑、限幅
        neck = Vector(objs['rig'].data.bones['neck_01'].head_local).z
        fade = np.clip((neck - 0.04 - zc) / 0.08, 0, 1) * np.clip((zc - 0.1) / 0.08, 0, 1)
        ratio = 1 + (smooth1d(np.clip(ratio, lo, hi if view == 'front' else hi_y), 14) - 1) * fade
        cshift = smooth1d(np.clip(cshift, -shift, shift), 14) * fade
        res[view] = (ratio, cshift)
    rx, _ = res['front']
    ry, sy = res[side]
    if side == 'right':
        sy = -sy
    cxm = np.where(have, 0.5 * (xmin + xmax), 0.0)
    cym = np.where(have, 0.5 * (ymin + ymax), 0.0)
    cxm = smooth1d(np.interp(np.arange(nb), np.nonzero(have)[0], cxm[have]), 4)
    cym = smooth1d(np.interp(np.arange(nb), np.nonzero(have)[0], cym[have]), 4)

    def warp(co, f):
        b = np.clip(co[:, 2] / dz - 0.5, 0, nb - 1)
        fx = np.interp(b, np.arange(nb), rx)
        fy = np.interp(b, np.arange(nb), ry)
        ox = np.interp(b, np.arange(nb), cxm)
        oy = np.interp(b, np.arange(nb), cym)
        sh = np.interp(b, np.arange(nb), sy)
        out = co.copy()
        out[:, 0] = co[:, 0] + ((ox + (co[:, 0] - ox) * fx) - co[:, 0]) * f
        out[:, 1] = co[:, 1] + ((oy + sh + (co[:, 1] - oy) * fy) - co[:, 1]) * f
        return out

    for ob, co, f in data:
        me = ob.data
        if me.shape_keys:
            for kb in me.shape_keys.key_blocks:
                kc = np.empty(len(kb.data) * 3, dtype=np.float32)
                kb.data.foreach_get('co', kc)
                kb.data.foreach_set('co', warp(kc.reshape(-1, 3), f).astype(np.float32).ravel())
        me.vertices.foreach_set('co', warp(co, f).astype(np.float32).ravel())
        me.update()
    if report is not None:
        sel = slice(int(0.15 * nb), int(0.85 * nb), max(1, nb // 12))
        report['fit'] = {'rx': np.round(rx[sel], 2).tolist(), 'ry': np.round(ry[sel], 2).tolist()}


def pull_push(col, w):
    """没颜色的地方用周围的颜色补（图像金字塔：先缩小求平均，再一层层放大填空）。"""
    levels = []
    c, m = col * w[..., None], w.copy()
    while min(c.shape[:2]) > 2:
        levels.append((c, m))
        hh, ww = c.shape[0] // 2 * 2, c.shape[1] // 2 * 2
        c = c[:hh:2, :ww:2] + c[1:hh:2, :ww:2] + c[:hh:2, 1:ww:2] + c[1:hh:2, 1:ww:2]
        m = m[:hh:2, :ww:2] + m[1:hh:2, :ww:2] + m[:hh:2, 1:ww:2] + m[1:hh:2, 1:ww:2]
    up = c / np.maximum(m, 1e-6)[..., None]
    for c, m in reversed(levels):
        big = np.repeat(np.repeat(up, 2, 0), 2, 1)
        big = np.pad(big, ((0, c.shape[0] - big.shape[0]), (0, c.shape[1] - big.shape[1]), (0, 0)), mode='edge')
        own = c / np.maximum(m, 1e-6)[..., None]
        k = np.clip(m, 0, 1)[..., None]
        up = own * k + big * (1 - k)
    return up


def save_image(name, rgb, size, alpha=None):
    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=True)
    a = np.ones(rgb.shape[:2] + (1,), dtype=np.float32) if alpha is None else alpha[..., None]
    img.pixels.foreach_set(np.ascontiguousarray(np.concatenate([np.clip(rgb, 0, 1), a], 2), dtype=np.float32).ravel())
    img.filepath_raw = os.path.join(TEX, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def height_normal(rgb, strength=3.0):
    """从颜色的明暗算一张细节法线（高通），让皮革纹、褶皱、缝线有一点凹凸。"""
    lum = rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11
    blur = lum.copy()
    for _ in range(6):
        blur = (blur + np.roll(blur, 1, 0) + np.roll(blur, -1, 0) + np.roll(blur, 1, 1) + np.roll(blur, -1, 1)) / 5
    hgt = lum - blur
    return C._normal_from_height(hgt, strength)


def outfit_material(name, col_img, nrm_img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Roughness'].default_value = 0.72
    b.inputs['Specular IOR Level'].default_value = 0.3
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'proj'
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = col_img
    nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = nrm_img
    nrm_img.colorspace_settings.name = 'Non-Color'
    nt.links.new(uvn.outputs['UV'], tn.inputs['Vector'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.uv_map = 'proj'
    nm.inputs['Strength'].default_value = 0.6
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


def project_outfit(name, objs, clothes, size=1024, report=None):
    """把衣服合并、投影上色。返回合并后的衣服物体（替换 clothes 里被合并的那些）。"""
    rig = objs['rig']
    parts = [ob for ob in clothes.values() if not keep_part(ob)]
    kept = {k: ob for k, ob in clothes.items() if keep_part(ob)}
    ob = join_parts(parts, name + '.outfit')
    unwrap(ob)
    pose_ref(rig, name)
    pos, cover = bake_attr(ob, 'pos', size)
    nrm, _ = bake_attr(ob, 'nrm', size)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-6)
    occluders = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('henry_char') == name or o is ob]
    verts, polys = world_mesh(set(occluders) | {ob, objs['body']})
    bvh = BVHTree.FromPolygons(verts, polys)
    V = np.array([v[:] for v in verts], dtype=np.float32)
    side = SIDE[name]
    other = 'left' if side == 'right' else 'right'
    views = [('front', 'front', False, 1.0), ('back', 'back', False, 1.0), (side, 'side', False, 1.0), (other, 'side', True, 0.6)]
    idx = np.nonzero(cover)
    P = pos[idx]
    N = nrm[idx]
    acc = np.zeros((len(P), 3), dtype=np.float64)
    wsum = np.zeros(len(P), dtype=np.float64)
    info = {}
    for view, fname, flip, vw in views:
        img = load_rgba(os.path.join(REF, '%s_%s.png' % (name, fname)), flip)
        s, cx, hc, r0, zt = align(view, img[..., 3], V)
        info[view] = [round(float(s), 2), round(float(cx), 1), round(float(hc), 4), round(float(r0), 1), round(float(zt), 4)]
        d = DIRS[view]
        facing = -(N @ np.array(d[:], dtype=np.float32))
        cand = np.nonzero(facing > 0.08)[0]
        vis = np.zeros(len(P), dtype=bool)
        toward = -d
        for i in cand:
            p = P[i]
            o = Vector((float(p[0]), float(p[1]), float(p[2]))) + toward * 0.006
            if bvh.ray_cast(o, toward, 5.0)[0] is None:
                vis[i] = True
        hx = hcoord(view, P)
        x = (hx - hc) * s + cx
        y = (zt - P[:, 2]) * s + r0
        smp = bilinear(img, x, y)
        a = smp[:, 3]
        w = vis * np.clip(facing, 0, 1) ** 3 * np.clip((a - 0.35) / 0.5, 0, 1) * vw
        acc += smp[:, :3] * w[:, None]
        wsum += w
    col = np.zeros((size, size, 3), dtype=np.float32)
    wt = np.zeros((size, size), dtype=np.float32)
    good = wsum > 1e-4
    col[idx[0][good], idx[1][good]] = (acc[good] / wsum[good][:, None] * GAIN).astype(np.float32)
    wt[idx[0][good], idx[1][good]] = 1.0
    filled = pull_push(col, wt)
    col_img = save_image(name + '_outfit', filled, size)
    nrm_img = save_image(name + '_outfit_n', height_normal(filled), size)
    mat = outfit_material(name + '.outfit', col_img, nrm_img)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.material_index = 0
    A.reset(rig)
    if report is not None:
        report['proj'] = dict(texels=int(len(P)), seen=round(float(good.mean()), 3), align=info)
    kept['outfit'] = ob
    return kept
