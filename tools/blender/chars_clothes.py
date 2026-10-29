# 人物服装工具：
#  · shell：复制身体某些区域的面，沿法线外扩（衬衫、马甲、裤子、靴子这类贴身的衣服）
#  · loft：沿一条轴线取一圈圈截面，截面半径由向身体表面打射线得到，再加上松量（袖口、腰带、护腕、裙子、斗篷）
#  · 蒙皮：从身体按最近点复制骨骼权重；UV 按米为单位，配合可平铺的布料/皮革贴图
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

TEX = r'C:\blender\henry_square\textures'


# ---------------- 基础 ----------------
def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def deform_bone_names(rig):
    return [b.name for b in rig.data.bones if b.use_deform]


def weights_matrix(obj, bones):
    """每个顶点对每根骨骼的权重 (N, B)。"""
    gi = {g.name: g.index for g in obj.vertex_groups}
    idx = {gi[b]: k for k, b in enumerate(bones) if b in gi}
    W = np.zeros((len(obj.data.vertices), len(bones)), dtype=np.float32)
    for v in obj.data.vertices:
        for g in v.groups:
            k = idx.get(g.group)
            if k is not None:
                W[v.index, k] = g.weight
    return W


def body_info(body, rig):
    bones = deform_bone_names(rig)
    W = weights_matrix(body, bones)
    co = np.array([v.co[:] for v in body.data.vertices], dtype=np.float32)
    no = np.array([v.normal[:] for v in body.data.vertices], dtype=np.float32)
    dom = np.array(bones)[W.argmax(1)]
    dom[W.max(1) < 1e-4] = ''
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get(), deform=False)
    # 分区域的碰撞面：腰带、斜挎带只打躯干；袖口、护腕只打手臂
    groups = {
        'torso': {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01'},
        'arm_l': {'upperarm_l', 'lowerarm_l', 'hand_l'}, 'arm_r': {'upperarm_r', 'lowerarm_r', 'hand_r'},
        'leg_l': {'thigh_l', 'calf_l', 'foot_l', 'ball_l'}, 'leg_r': {'thigh_r', 'calf_r', 'foot_r', 'ball_r'},
        'head': {'head', 'neck_01'},
        'lower': {'pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'},
        'body': {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'},
    }
    polys = [list(p.vertices) for p in body.data.polygons]
    vlist = [Vector(c) for c in co]
    region_bvh = {}
    for gname, gb in groups.items():
        sel = [pv for pv in polys if sum(1 for i in pv if dom[i] in gb) >= len(pv) - 1]
        region_bvh[gname] = BVHTree.FromPolygons(vlist, sel) if sel else bvh
    kd = KDTree(len(co))
    for i, c in enumerate(co):
        kd.insert(c, i)
    kd.balance()
    return dict(body=body, rig=rig, bones=bones, W=W, co=co, no=no, dom=dom, bvh=bvh, kd=kd, region_bvh=region_bvh)


def bone_param(info, name):
    """每个顶点在骨骼线段上的投影参数 t（头=0，尾=1）和到骨骼轴线的距离 r。"""
    h, t = bone_pts(info['rig'], name)
    h = np.array(h[:], dtype=np.float32)
    d = np.array((t - Vector(h))[:], dtype=np.float32)
    L2 = float((d * d).sum())
    rel = info['co'] - h
    tt = rel @ d / L2
    proj = h + tt[:, None] * d
    r = np.linalg.norm(info['co'] - proj, axis=1)
    return tt, r


def in_set(info, names):
    return np.isin(info['dom'], list(names))


def wsum(info, verts_mask, names):
    k = [info['bones'].index(n) for n in names if n in info['bones']]
    return info['W'][:, k].sum(1)


def bone_mat(rig, name):
    return rig.data.bones[name].matrix_local  # 骨架空间（静止姿势）


def bone_pts(rig, name):
    b = rig.data.bones[name]
    return Vector(b.head_local), Vector(b.tail_local)


def copy_weights(info, obj, k=4, restrict=None):
    """给新衣服按最近的几个身体顶点复制权重。restrict: 只从这些骨骼取权重（例如护腕只跟前臂和手）。"""
    bones = info['bones']
    W = info['W']
    for b in bones:
        if b not in obj.vertex_groups:
            obj.vertex_groups.new(name=b)
    groups = [obj.vertex_groups[b] for b in bones]
    for v in obj.data.vertices:
        hits = info['kd'].find_n(v.co, k)
        acc = np.zeros(len(bones), dtype=np.float32)
        tot = 0.0
        for (c, i, d) in hits:
            w = 1.0 / max(d, 1e-4) ** 2
            acc += W[i] * w
            tot += w
        acc /= max(tot, 1e-8)
        if restrict:
            mask = np.array([b in restrict for b in bones])
            acc = acc * mask
        s = acc.sum()
        if s <= 1e-6:
            continue
        acc /= s
        for j in np.nonzero(acc > 0.01)[0]:
            groups[j].add([v.index], float(acc[j]), 'REPLACE')


def add_armature(obj, rig):
    obj.parent = rig
    m = obj.modifiers.get('Armature') or obj.modifiers.new('Armature', 'ARMATURE')
    m.object = rig
    return obj


# ---------------- shell：复制身体区域外扩 ----------------
def shell(info, name, keep, offset, mat=None, cuts=(), solid=0.004, smooth=1, folds=None, relax=24, blob=None, snap=False, field=None):
    """keep(i) → bool 选顶点；offset(i, co, no) → 外扩距离（米）；cuts: [(点, 法线)] 平面，法线指向要删掉的一侧。
    snap: 边缘顺完后贴回身体表面（胸口这种凸面上，顺直的边会陷进身体里，被里层衣服穿出来）。
    field: 每个顶点一个数，< 0 的地方要。给了它就沿 0 等值线裁边（像等高线一样顺），不再沿网格走出锯齿。"""
    body = info['body']
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    orig = bm.verts.layers.int.new('orig')
    for v in bm.verts:
        v[orig] = v.index
    if field is not None:
        phi = np.asarray(field, dtype=np.float64)
        inside = phi < 0
        # 多留一圈面（和要的顶点共面的都留），再把这一圈的外缘顶点滑到等值线上
        keepv = inside.copy()
        for f in bm.faces:
            ids = [v.index for v in f.verts]
            if inside[ids].any():
                keepv[ids] = True
    else:
        keepv = np.array([keep(i) for i in range(len(bm.verts))], dtype=bool)
    # 只留下所有顶点都入选的面
    dead = [f for f in bm.faces if not all(keepv[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    if field is not None:
        new = {}
        for v in bm.verts:
            pv = phi[v[orig]]
            if not v.is_boundary or pv < 0:
                continue
            nbs = [e.other_vert(v) for e in v.link_edges if phi[e.other_vert(v)[orig]] < 0]
            if not nbs:
                nbs = [u for fc in v.link_faces for u in fc.verts if phi[u[orig]] < 0]
            if nbs:
                acc = Vector((0, 0, 0))
                for u in nbs:
                    pu = phi[u[orig]]
                    acc += u.co.lerp(v.co, pu / (pu - pv))
                new[v] = acc / len(nbs)
        for v, c in new.items():
            v.co = c
    # 边缘顺一顺：沿边界做几次拉普拉斯平滑，锯齿状的领口、袖窿变成顺滑的线
    for _ in range(relax):
        new = {}
        for v in bm.verts:
            if not v.is_boundary:
                continue
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = v.co.lerp((nb[0].co + nb[1].co) * 0.5, 0.5)
        for v, c in new.items():
            v.co = c
    if snap:
        for v in bm.verts:
            if v.is_boundary:
                loc = info['bvh'].find_nearest(v.co)[0]
                if loc is not None:
                    v.co = loc
    # 外扩
    bm.normal_update()
    for v in bm.verts:
        d = offset(v[orig], v.co, v.normal)
        v.co += v.normal * d
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if blob:
        # 局部大量平滑（比如靴子把脚趾抹平成一整块），然后再沿法线鼓一点
        sel_fn, iters, puff = blob
        sel = [v for v in bm.verts if sel_fn(v[orig], v.co)]
        for _ in range(iters):
            bmesh.ops.smooth_vert(bm, verts=sel, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.normal_update()
        for v in sel:
            v.co += v.normal * puff
    if folds:
        folds(bm)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    for g in body.vertex_groups:
        if g.name not in ob.vertex_groups:
            ob.vertex_groups.new(name=g.name)
    ob.shape_key_clear() if me.shape_keys else None
    if solid:
        s = ob.modifiers.new('Solidify', 'SOLIDIFY')
        s.thickness = solid
        s.offset = -1
        s.use_rim = True
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return ob


# ---------------- 截面射线 + 放样 ----------------
def ring(info, center, axis, n=24, offset=0.006, ref=None, rmin=0.01, rmax=0.6, flare=None, wobble=None, skip=None, region=None):
    """绕 axis 一圈打射线（从外向轴心），得到贴着身体的一圈点。ref: 角度 0 的方向。"""
    axis = Vector(axis).normalized()
    ref = Vector(ref or (0, -1, 0))
    u = (ref - axis * ref.dot(axis)).normalized()
    v = axis.cross(u)
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        d = (u * math.cos(a) + v * math.sin(a))
        # 从外面往里打，命中最外层表面
        origin = Vector(center) + d * rmax
        tree = info['region_bvh'][region] if region else info['bvh']
        hit = tree.ray_cast(origin, -d, rmax)
        r = (hit[0] - Vector(center)).length if hit[0] is not None else rmin
        r = max(r, rmin) + offset
        if flare:
            r = flare(a, r)
        if wobble:
            r += wobble(a)
        pts.append(Vector(center) + d * r)
    return pts


def loft(name, rings, mat=None, closed=True, cap_start=False, cap_end=False, uv_scale=1.0, open_sector=None):
    """把一串点环连成管子。UV：u = 周长（米），v = 沿轴累计长度（米）。"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    grid = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    # 每环的累计周长
    us = []
    for r in rings:
        acc = [0.0]
        for k in range(1, n + 1):
            acc.append(acc[-1] + (r[k % n] - r[k - 1]).length)
        us.append(acc)
    vs = [0.0]
    for j in range(1, len(rings)):
        c0 = sum(rings[j - 1], Vector()) / n
        c1 = sum(rings[j], Vector()) / n
        vs.append(vs[-1] + (c1 - c0).length)
    seg = n if closed else n - 1
    for j in range(len(rings) - 1):
        for k in range(seg):
            if open_sector and open_sector(k, n):
                continue
            k2 = (k + 1) % n
            f = bm.faces.new((grid[j][k], grid[j][k2], grid[j + 1][k2], grid[j + 1][k]))
            uvs = [(us[j][k], vs[j]), (us[j][k + 1], vs[j]), (us[j + 1][k + 1], vs[j + 1]), (us[j + 1][k], vs[j + 1])]
            for l, (uu, vv) in zip(f.loops, uvs):
                l[uvl].uv = (uu * uv_scale, vv * uv_scale)
    if cap_start:
        bm.faces.new(list(reversed(grid[0])))
    if cap_end:
        bm.faces.new(grid[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def along_bone(rig, name, t0, t1, steps):
    h, t = bone_pts(rig, name)
    return [h.lerp(t, t0 + (t1 - t0) * i / max(1, steps - 1)) for i in range(steps)], (t - h).normalized()


def solidify(ob, thick=0.003, offset=-1):
    s = ob.modifiers.new('Solidify', 'SOLIDIFY')
    s.thickness = thick
    s.offset = offset
    s.use_rim = True
    return s


def apply_modifiers(ob, keep=('Armature',)):
    """把除骨架以外的修改器应用掉（导出前）。"""
    dg = bpy.context.evaluated_depsgraph_get()
    mods = [m for m in ob.modifiers if m.name not in keep]
    if not mods:
        return
    saved = [(m.name, m.show_viewport) for m in ob.modifiers if m.name in keep]
    for m in ob.modifiers:
        if m.name in keep:
            m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.data = me
    for m in mods:
        ob.modifiers.remove(m)
    for name, vis in saved:
        ob.modifiers[name].show_viewport = vis
    if old.users == 0:
        bpy.data.meshes.remove(old)


# ---------------- 布料褶皱（沿某个方向的正弦 + 噪声） ----------------
def fold_noise(amount=0.004, freq=28.0, axis=(0, 0, 1), seed=1):
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 6.28, 4)
    ax = Vector(axis).normalized()
    def f(bm):
        for v in bm.verts:
            p = v.co
            s = math.sin(p.dot(ax) * freq + ph[0] + math.sin(p.x * 13 + ph[1]) * 1.4) * 0.6 + math.sin(p.x * 41 + p.y * 37 + p.z * 23 + ph[2]) * 0.4
            v.co += v.normal * amount * s
    return f


# ---------------- 可平铺贴图（numpy，周期性） ----------------
def _periodic_noise(n, beta, rng):
    w = rng.standard_normal((n, n))
    F = np.fft.fft2(w)
    fx = np.fft.fftfreq(n)[:, None]
    fy = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    F = F / f ** beta
    F[0, 0] = 0
    r = np.real(np.fft.ifft2(F))
    r = (r - r.mean()) / (r.std() + 1e-8)
    return r


def _normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    return np.stack([(-dx / l) * 0.5 + 0.5, (-dy / l) * 0.5 + 0.5, (nz / l) * 0.5 + 0.5], -1)


def _save(name, rgb, alpha=None):
    h, w = rgb.shape[:2]
    a = np.ones((h, w, 1), dtype=np.float32) if alpha is None else alpha[..., None]
    arr = np.concatenate([rgb.astype(np.float32), a], -1)
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True)
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())  # Blender 原点在左下
    img.filepath_raw = os.path.join(TEX, name + '.png')
    img.file_format = 'PNG'
    img.save()
    return img


def make_fabric(kind, n=512, seed=3):
    """返回 (颜色图, 法线图) —— 灰度为主的可平铺材质，颜色在材质里再乘。"""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / n
    if kind == 'linen':
        warp = np.sin(x * 2 * np.pi * 96) * 0.5 + 0.5
        weft = np.sin(y * 2 * np.pi * 96) * 0.5 + 0.5
        slub = _periodic_noise(n, 1.6, rng)
        h = np.where(((x * 96).astype(int) + (y * 96).astype(int)) % 2 == 0, warp, weft) * 0.7 + slub * 0.08
        alb = 0.82 + 0.07 * _periodic_noise(n, 1.8, rng) + 0.05 * (h - 0.5)
        nrm = _normal_from_height(h, 1.6)
    elif kind == 'wool':
        a = _periodic_noise(n, 1.2, rng)
        b = _periodic_noise(n, 2.2, rng)
        h = a * 0.5 + b * 0.5
        twill = np.sin((x + y) * 2 * np.pi * 64) * 0.5
        h = h * 0.6 + twill * 0.4
        alb = 0.78 + 0.06 * b + 0.04 * a
        nrm = _normal_from_height(h, 2.2)
    elif kind == 'canvas':
        warp = np.abs(np.sin(x * 2 * np.pi * 60))
        weft = np.abs(np.sin(y * 2 * np.pi * 60))
        h = warp * 0.5 + weft * 0.5 + 0.15 * _periodic_noise(n, 1.5, rng)
        alb = 0.8 + 0.06 * _periodic_noise(n, 2.0, rng)
        nrm = _normal_from_height(h, 1.4)
    else:
        raise ValueError(kind)
    alb = np.clip(alb, 0, 1)
    rgb = np.stack([alb, alb, alb], -1)
    return _save('fab_' + kind, rgb), _save('fab_' + kind + '_n', nrm)


def worley(n, g, rng):
    """周期性 Worley 噪声：每格一个抖动点，只查 3x3 邻格。返回 (F1, F2)，单位是像素。"""
    jit = rng.uniform(0, 1, (g, g, 2))
    y, x = np.mgrid[0:n, 0:n] * (g / n)
    cx, cy = np.floor(x).astype(int), np.floor(y).astype(int)
    f1 = np.full((n, n), 9.0)
    f2 = np.full((n, n), 9.0)
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            gx, gy = cx + ox, cy + oy
            j = jit[gy % g, gx % g]
            px, py = gx + j[..., 0], gy + j[..., 1]
            d = np.sqrt((x - px) ** 2 + (y - py) ** 2)
            m = d < f1
            f2 = np.where(m, f1, np.minimum(f2, d))
            f1 = np.where(m, d, f1)
    return f1 * n / g, f2 * n / g


def make_leather(n=512, seed=5, g=64):
    """皮革：Worley 细纹（F2-F1 小的地方是沟）+ 斑驳。"""
    rng = np.random.default_rng(seed)
    f1, f2 = worley(n, g, rng)
    crack = np.clip((f2 - f1) / 3.0, 0, 1)
    mott = _periodic_noise(n, 1.4, rng)
    fine = _periodic_noise(n, 0.6, rng)
    h = crack * 0.45 + 0.05 * fine + 0.2 * mott
    alb = 0.74 + 0.07 * crack + 0.1 * mott
    rgb = np.stack([alb, alb, alb], -1)
    return _save("fab_leather", np.clip(rgb, 0, 1)), _save("fab_leather_n", _normal_from_height(h, 1.6))


def fabric_material(name, kind, color, rough=0.8, scale=6.0, metallic=0.0, nstr=0.6):
    """可平铺材质：贴图（灰）× 颜色。scale = 每米重复几次（UV 以米为单位）。"""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    col = bpy.data.images.get('fab_' + kind)
    nrm = bpy.data.images.get('fab_' + kind + '_n')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, 1)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    if col:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = col
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['B'].default_value = color
        nt.links.new(t.outputs['Color'], mix.inputs['A'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = color
    if nrm:
        nrm.colorspace_settings.name = 'Non-Color'
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = nrm
        nt.links.new(mp.outputs['Vector'], tn.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = nstr
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


def plain_material(name, color, rough=0.5, metallic=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    return m


def meter_uvs(ob, scale=1.0):
    """Smart UV 展开，再把 UV 缩放成“1 = 1 米”，好让平铺贴图密度一致。"""
    me = ob.data
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # 3D 面积 / UV 面积
    uv = me.uv_layers.active.data
    a3 = sum(p.area for p in me.polygons)
    a2 = 0.0
    for p in me.polygons:
        pts = [uv[l].uv for l in p.loop_indices]
        s = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            s += x1 * y2 - x2 * y1
        a2 += abs(s) * 0.5
    k = math.sqrt(a3 / max(a2, 1e-9)) * scale
    for d in uv:
        d.uv = (d.uv[0] * k, d.uv[1] * k)


# ---------------- 小物件：旋转体、布袋、绳圈 ----------------
def lathe(name, profile, mat, n=24, center=(0, 0, 0), axis_rot=None):
    """profile: [(半径, 高度)]，绕 Z 旋转一周。"""
    rings = []
    for (r, zz) in profile:
        rings.append([Vector((math.cos(2 * math.pi * k / n) * r, math.sin(2 * math.pi * k / n) * r, zz)) for k in range(n)])
    ob = loft(name, rings, mat, closed=True, cap_start=True, cap_end=True)
    if axis_rot:
        ob.rotation_euler = axis_rot
    ob.location = center
    return ob


def sack(name, center, size, mat, seed=1, neck=0.35):
    """抽绳布袋：压扁的球，上面收口。"""
    rng = np.random.default_rng(seed)
    prof = []
    for k in range(9):
        t = k / 8
        r = math.sin(math.pi * (0.08 + 0.84 * t)) * (1 - neck * max(0, t - 0.75) / 0.25)
        prof.append((max(0.05, r) * 0.5, t - 0.5))
    ob = lathe(name, prof, mat, n=16)
    me = ob.data
    for v in me.vertices:
        v.co = Vector((v.co.x * size[0] * (1 + 0.08 * rng.standard_normal()), v.co.y * size[1], v.co.z * size[2]))
    ob.location = center
    return ob


def bake_object_transform(ob):
    """把物体的位置/旋转/缩放写进顶点（之后好复制权重、挂骨架）。"""
    M = Matrix.LocRotScale(ob.location, ob.rotation_euler, ob.scale)
    ob.data.transform(M)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)


def erode(body, mask, steps=1):
    """把顶点蒙版向内缩几圈（用于“外层衣服盖住的部分，内层就不要了”）。"""
    me = body.data
    E = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', E)
    E = E.reshape(-1, 2)
    m = mask.copy()
    for _ in range(steps):
        a, b = E[:, 0], E[:, 1]
        edge_cut = m[a] != m[b]
        border = np.zeros_like(m)
        border[a[edge_cut]] = True
        border[b[edge_cut]] = True
        m = m & ~border
    return m
