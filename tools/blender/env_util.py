# 场景建模工具：几何体（倒角方块、旋转体、管子、平板）+ 程序材质（Cycles 用来烘焙）
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler

TEX = r'C:\blender\henry_square\textures'
COLL = {}


def coll(name):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c


def put(ob, group, collection=None):
    """记录烘焙分组（同一组共用一张光照贴图）。"""
    ob['bake'] = group
    (collection or coll('G_' + group)).objects.link(ob)
    return ob


def mesh_obj(name, bm, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    if mat:
        me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    ob.location = loc
    ob.rotation_euler = rot
    if scale:
        ob.scale = scale
    return ob


# ---------------- 几何体 ----------------
def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel=0.006, group='misc', jitter=0.0, seed=0):
    """倒角方块。size=(x,y,z)，长边请放在 x 上（木纹沿 x）。jitter：顶点随机扰动（做旧）。"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, min(size) * 0.45), segments=2, affect='EDGES', profile=0.5)
    if jitter > 0:
        rnd = random.Random(seed)
        for v in bm.verts:
            v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * jitter
    ob = mesh_obj(name, bm, mat)
    place(ob, loc, rot)
    return put(ob, group)


def lathe(name, profile, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, n=24, group='misc', cap_bottom=True, cap_top=False, smooth=True):
    """profile: [(半径, 高度)] 自下而上，绕 Z 一周。"""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k]))
    if cap_bottom and profile[0][0] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][0] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, mat, smooth)
    place(ob, loc, rot)
    return put(ob, group)


def cyl(name, r, h, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, n=16, group='misc', bevel=0.003):
    b = min(bevel, r * 0.3)
    prof = [(r - b, 0), (r, b), (r, h - b), (r - b, h)]
    ob = lathe(name, prof, loc, rot, mat, n, group, cap_bottom=True, cap_top=True)
    return ob


def tube(name, pts, radius, mat=None, group='misc', n=8, closed=False):
    """沿点列的圆管（铁链、绳子、铁环）。"""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1)
    sp.use_cyclic_u = closed
    cu.bevel_depth = radius
    cu.bevel_resolution = max(1, n // 4)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)
    o2 = bpy.data.objects.new(name, me)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return put(o2, group)


def ring_pts(c, r, n=24, axis='z', start=0.0):
    out = []
    for k in range(n):
        a = start + 2 * math.pi * k / n
        if axis == 'z':
            out.append((c[0] + math.cos(a) * r, c[1] + math.sin(a) * r, c[2]))
        elif axis == 'x':
            out.append((c[0], c[1] + math.cos(a) * r, c[2] + math.sin(a) * r))
        else:
            out.append((c[0] + math.cos(a) * r, c[1], c[2] + math.sin(a) * r))
    return out


def grid_plane(name, w, h, loc, rot, mat, cuts_x=1, cuts_y=1, group='misc'):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=cuts_x, y_segments=cuts_y, size=0.5)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * h, 0))
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / w + 0.5, l.vert.co.y / h + 0.5)
    ob = mesh_obj(name, bm, mat)
    place(ob, loc, rot)
    return put(ob, group)


def join(objs, name):
    """把一堆物体合并成一个（同组的小物件，减少物体数）。"""
    objs = [o for o in objs if o]
    if not objs:
        return None
    ctx = {'active_object': objs[0], 'selected_editable_objects': objs, 'selected_objects': objs}
    for o in bpy.context.selected_objects:
        o.select_set(False)
    with bpy.context.temp_override(**ctx):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# ---------------- 材质（Cycles 程序纹理） ----------------
def _lin(hexc):
    h = hexc.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c) + (1.0,)


def _mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m, None
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m, (nt, b, out)


def _ramp(nt, inp, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    cr = r.color_ramp
    cr.elements[0].position, cr.elements[0].color = stops[0][0], _lin(stops[0][1])
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], _lin(stops[-1][1])
    for p, c in stops[1:-1]:
        e = cr.elements.new(p)
        e.color = _lin(c)
    nt.links.new(inp, r.inputs['Fac'])
    return r


def mat_wood(name, c0='#2a170b', c1='#5a3a1f', c2='#7a5230', rough=0.62, scale=(1.0, 9.0, 9.0), per_object=0.25, worn=0.0, bump=0.35):
    """木头：纹理沿物体局部 X 方向（方块长边放 X）。per_object：每块木板颜色略有不同。"""
    m, t = _mat(name)
    if not t:
        return m
    nt, b, out = t
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    sc = nt.nodes.new('ShaderNodeVectorMath')
    sc.operation = 'SCALE'
    sc.inputs['Scale'].default_value = 37.0
    nt.links.new(oi.outputs['Random'], sc.inputs[0])
    nt.links.new(mp.outputs['Vector'], add.inputs[0])
    nt.links.new(sc.outputs['Vector'], add.inputs[1])
    # 纹理：拉长的噪声 + 年轮波纹
    n1 = nt.nodes.new('ShaderNodeTexNoise')
    n1.inputs['Scale'].default_value = 2.2
    n1.inputs['Detail'].default_value = 8
    n1.inputs['Roughness'].default_value = 0.6
    nt.links.new(add.outputs['Vector'], n1.inputs['Vector'])
    w = nt.nodes.new('ShaderNodeTexWave')
    w.wave_type = 'RINGS'
    w.rings_direction = 'X'
    w.inputs['Scale'].default_value = 1.4
    w.inputs['Distortion'].default_value = 9.0
    w.inputs['Detail'].default_value = 3
    nt.links.new(add.outputs['Vector'], w.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = 0.45
    nt.links.new(n1.outputs['Fac'], mix.inputs['A'])
    nt.links.new(w.outputs['Fac'], mix.inputs['B'])
    ramp = _ramp(nt, mix.outputs['Result'], [(0.15, c0), (0.5, c1), (0.85, c2)])
    # 每块木板的明暗
    hv = nt.nodes.new('ShaderNodeHueSaturation')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 1 - per_object
    mr.inputs['To Max'].default_value = 1 + per_object * 0.5
    nt.links.new(oi.outputs['Random'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], hv.inputs['Value'])
    nt.links.new(ramp.outputs['Color'], hv.inputs['Color'])
    # 磨损：大块噪声让局部发亮
    if worn > 0:
        n2 = nt.nodes.new('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = 0.8
        nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
        mx = nt.nodes.new('ShaderNodeMix')
        mx.data_type = 'RGBA'
        mx.blend_type = 'SCREEN'
        rr = _ramp(nt, n2.outputs['Fac'], [(0.55, '#000000'), (0.8, '#3a2a1a')])
        nt.links.new(hv.outputs['Color'], mx.inputs['A'])
        nt.links.new(rr.outputs['Color'], mx.inputs['B'])
        mx.inputs['Factor'].default_value = worn
        nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    else:
        nt.links.new(hv.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = bump
    bp.inputs['Distance'].default_value = 0.002
    nt.links.new(mix.outputs['Result'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_stone(name, mortar='#2e2820', s0='#4a4236', s1='#7a6c58', s2='#a8977a', brick=(0.38, 0.22), disp=0.055, rough=0.85, horizontal=False):
    """不规则毛石墙：Voronoi 细胞当石块（横向拉长），离边界近的地方是灰缝；
    每块石头颜色不同，表面有起伏，边缘圆润。灰缝凹下去（真置换，网格要细分）。"""
    m, t = _mat(name)
    if not t:
        return m
    nt, b, out = t
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ')
    if horizontal:
        nt.links.new(sep.outputs['X'], cmb.inputs['X'])
        nt.links.new(sep.outputs['Y'], cmb.inputs['Y'])
    else:
        hx = nt.nodes.new('ShaderNodeMath')
        hx.operation = 'ADD'
        nt.links.new(sep.outputs['X'], hx.inputs[0])
        nt.links.new(sep.outputs['Y'], hx.inputs[1])
        nt.links.new(hx.outputs['Value'], cmb.inputs['X'])
        nt.links.new(sep.outputs['Z'], cmb.inputs['Y'])
    sc = nt.nodes.new('ShaderNodeMapping')
    sc.inputs['Scale'].default_value = (1.0 / brick[0], 1.0 / brick[1], 1.0)
    nt.links.new(cmb.outputs['Vector'], sc.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.6
    nz.inputs['Detail'].default_value = 3
    nt.links.new(sc.outputs['Vector'], nz.inputs['Vector'])
    dv = nt.nodes.new('ShaderNodeVectorMath')
    dv.operation = 'MULTIPLY_ADD'
    dv.inputs[1].default_value = (0.22, 0.22, 0)
    nt.links.new(nz.outputs['Color'], dv.inputs[0])
    nt.links.new(sc.outputs['Vector'], dv.inputs[2])
    v_edge = nt.nodes.new('ShaderNodeTexVoronoi')
    v_edge.feature = 'DISTANCE_TO_EDGE'
    v_edge.inputs['Randomness'].default_value = 0.85
    v_edge.inputs['Scale'].default_value = 1.0
    nt.links.new(dv.outputs['Vector'], v_edge.inputs['Vector'])
    v_col = nt.nodes.new('ShaderNodeTexVoronoi')
    v_col.feature = 'F1'
    v_col.inputs['Randomness'].default_value = 0.85
    v_col.inputs['Scale'].default_value = 1.0
    nt.links.new(dv.outputs['Vector'], v_col.inputs['Vector'])
    # 灰缝：离边界 0.03 以内
    mort = nt.nodes.new('ShaderNodeMapRange')
    mort.inputs['From Min'].default_value = 0.035
    mort.inputs['From Max'].default_value = 0.09
    mort.inputs['To Min'].default_value = 1.0
    mort.inputs['To Max'].default_value = 0.0
    nt.links.new(v_edge.outputs['Distance'], mort.inputs['Value'])
    # 石块圆鼓鼓的高度
    dome = nt.nodes.new('ShaderNodeMapRange')
    dome.inputs['From Min'].default_value = 0.02
    dome.inputs['From Max'].default_value = 0.28
    dome.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(v_edge.outputs['Distance'], dome.inputs['Value'])
    n3 = nt.nodes.new('ShaderNodeTexNoise')
    n3.inputs['Scale'].default_value = 6.0
    n3.inputs['Detail'].default_value = 10
    n3.inputs['Roughness'].default_value = 0.65
    nt.links.new(sc.outputs['Vector'], n3.inputs['Vector'])
    # 每块石头的颜色：细胞随机色的明度 + 表面噪声
    sep_c = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(v_col.outputs['Color'], sep_c.inputs['Color'])
    mixv = nt.nodes.new('ShaderNodeMix')
    mixv.data_type = 'FLOAT'
    mixv.inputs['Factor'].default_value = 0.4
    nt.links.new(sep_c.outputs['Red'], mixv.inputs['A'])
    nt.links.new(n3.outputs['Fac'], mixv.inputs['B'])
    ramp = _ramp(nt, mixv.outputs['Result'], [(0.15, s0), (0.5, s1), (0.88, s2)])
    mortar_mix = nt.nodes.new('ShaderNodeMix')
    mortar_mix.data_type = 'RGBA'
    mortar_mix.inputs['B'].default_value = _lin(mortar)
    nt.links.new(ramp.outputs['Color'], mortar_mix.inputs['A'])
    nt.links.new(mort.outputs['Result'], mortar_mix.inputs['Factor'])
    # 烟熏：越高越黑
    dark = nt.nodes.new('ShaderNodeMapRange')
    dark.inputs['From Min'].default_value = 1.4
    dark.inputs['From Max'].default_value = 3.0
    dark.inputs['To Min'].default_value = 1.0
    dark.inputs['To Max'].default_value = 0.6
    nt.links.new(sep.outputs['Z'], dark.inputs['Value'])
    cr = nt.nodes.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        nt.links.new(dark.outputs['Result'], cr.inputs[ch])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(mortar_mix.outputs['Result'], mul.inputs['A'])
    nt.links.new(cr.outputs['Color'], mul.inputs['B'])
    nt.links.new(mul.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    h = nt.nodes.new('ShaderNodeMath')
    h.operation = 'MULTIPLY_ADD'
    h.inputs[1].default_value = 0.22
    nt.links.new(n3.outputs['Fac'], h.inputs[0])
    nt.links.new(dome.outputs['Result'], h.inputs[2])
    d = nt.nodes.new('ShaderNodeDisplacement')
    d.inputs['Scale'].default_value = disp
    d.inputs['Midlevel'].default_value = 0.5
    nt.links.new(h.outputs['Value'], d.inputs['Height'])
    nt.links.new(d.outputs['Displacement'], out.inputs['Displacement'])
    m.displacement_method = 'BOTH'
    return m


def mat_plain(name, hexc, rough=0.6, metal=0.0, noise=0.0, noise_scale=40.0, bump=0.0, emit=None, emit_strength=0.0, alpha=1.0, transmission=0.0, ior=1.45):
    m, t = _mat(name)
    if not t:
        return m
    nt, b, out = t
    b.inputs['Base Color'].default_value = _lin(hexc)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if transmission:
        b.inputs['Transmission Weight'].default_value = transmission
        b.inputs['IOR'].default_value = ior
    if noise > 0 or bump > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = noise_scale
        n.inputs['Detail'].default_value = 6
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        if noise > 0:
            mx = nt.nodes.new('ShaderNodeMix')
            mx.data_type = 'RGBA'
            mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = noise
            mx.inputs['A'].default_value = _lin(hexc)
            nt.links.new(n.outputs['Color'], mx.inputs['B'])
            nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
        if bump > 0:
            bp = nt.nodes.new('ShaderNodeBump')
            bp.inputs['Strength'].default_value = bump
            nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
            nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    if emit:
        b.inputs['Emission Color'].default_value = _lin(emit)
        b.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    return m


def mat_image(name, path, rough=0.8, alpha=False, emit_strength=0.0, uv=True, bump=0.0):
    m, t = _mat(name)
    if not t:
        return m
    nt, b, out = t
    img = bpy.data.images.load(path, check_existing=True)
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    nt.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    if alpha:
        nt.links.new(tx.outputs['Alpha'], b.inputs['Alpha'])
    if emit_strength:
        nt.links.new(tx.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit_strength
    b.inputs['Roughness'].default_value = rough
    if bump:
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(tx.outputs['Color'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_emit(name, hexc, strength):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = _lin(hexc)
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
    return m


# ---------------- 灯光 ----------------
def light(name, kind, loc, power, color='#ffb060', radius=0.03, size=0.5, rot=(0, 0, 0), group='lights', spot=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = power
    ld.color = _lin(color)[:3]
    if kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = radius
    if kind == 'AREA':
        ld.size = size
    if kind == 'SPOT' and spot:
        ld.spot_size = spot
        ld.spot_blend = 0.6
    ob = bpy.data.objects.new(name, ld)
    place(ob, loc, rot)
    ob['light_group'] = group
    coll('L_' + group).objects.link(ob)
    return ob


def empty(name, loc, kind='fx', rot=(0, 0, 0)):
    """给游戏用的标记点（火焰、烛光、座位…），导出后按名字找到。"""
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    place(e, loc, rot)
    e['marker'] = kind
    coll('MARKERS').objects.link(e)
    return e
