# 亨利广场 v3 · 人物基础：用 MPFB 生成四个人物的身体、皮肤、眼睛、眉毛、睫毛、牙齿、头发、胡子和表情形态键
# 在 Blender 里运行（需要 MPFB 扩展和 MakeHuman 素材包）。被 build_characters.py 调用。
import bpy, os, math
import numpy as np
from mathutils import Vector

MPFB_DATA = os.path.join(os.environ['APPDATA'], r'Blender Foundation\Blender\5.2\extensions\.user\user_default\mpfb\data')
MPFB_SYS = os.path.join(os.environ['APPDATA'], r'Blender Foundation\Blender\5.2\extensions\user_default\mpfb\data')
OUT = r'C:\blender\henry_square'
TEX = os.path.join(OUT, 'textures')
os.makedirs(TEX, exist_ok=True)


def mp(*parts):
    return os.path.join(MPFB_DATA, *parts)


def services():
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    from bl_ext.user_default.mpfb.services.clothesservice import ClothesService
    return HumanService, TargetService, ClothesService


# ---------- 贴图处理（numpy） ----------
def load_pixels(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return img, px.reshape(h, w, 4)


def save_pixels(name, arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=True)
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def recolor(src_path, name, dark, light, gamma=1.0, keep_alpha=True):
    """把头发/胡子贴图按亮度映射到 dark→light 两个颜色（保留 alpha）。"""
    img, px = load_pixels(src_path)
    lum = px[..., 0] * 0.3 + px[..., 1] * 0.59 + px[..., 2] * 0.11
    a = px[..., 3] if keep_alpha else np.ones_like(lum)
    sel = a > 0.05
    lo, hi = (np.percentile(lum[sel], 3), np.percentile(lum[sel], 97)) if sel.any() else (0.0, 1.0)
    t = np.clip((lum - lo) / max(1e-4, hi - lo), 0, 1) ** gamma
    d, l = hex_rgb(dark), hex_rgb(light)
    out = np.empty_like(px)
    for c in range(3):
        out[..., c] = d[c] + (l[c] - d[c]) * t
    out[..., 3] = a
    return save_pixels(name, out, os.path.join(TEX, name + '.png'))


def tint_skin(src_path, name, mul=(1, 1, 1), add=(0, 0, 0), stubble=None):
    """皮肤贴图整体调色；stubble 给下巴和两颊画上胡茬（用 UV 区域蒙版）。"""
    img, px = load_pixels(src_path)
    out = px.copy()
    for c in range(3):
        out[..., c] = np.clip(px[..., c] * mul[c] + add[c], 0, 1)
    return save_pixels(name, out, os.path.join(TEX, name + '.png')), out


# ---------- 材质 ----------
def principled(name, base=None, color=(0.8, 0.8, 0.8, 1), rough=0.6, normal=None, normal_strength=0.6, alpha_from_base=False, metallic=0.0, spec=0.5, blend=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (-300, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Specular IOR Level'].default_value = spec
    bsdf.inputs['Base Color'].default_value = color
    if base is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = base
        t.location = (-700, 100)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha_from_base:
            nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
    if normal is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = normal
        tn.image.colorspace_settings.name = 'Non-Color'
        tn.location = (-700, -250)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nm.location = (-450, -250)
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if alpha_from_base:
        m.surface_render_method = 'BLENDED' if blend else 'DITHERED'
        m.use_backface_culling = False
    return m


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def split_cornea(eyes, eye_img, name):
    """眼球模型外面有一层角膜，UV 落在贴图透明区。把这些面单独给一个透明高光材质（眼睛才有反光点）。"""
    w, h = eye_img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    eye_img.pixels.foreach_get(px)
    alpha = px.reshape(h, w, 4)[..., 3]
    me = eyes.data
    uv = me.uv_layers.active.data
    cornea = bpy.data.materials.get(name + '.cornea') or bpy.data.materials.new(name + '.cornea')
    cornea.use_nodes = True
    nt = cornea.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1)
    b.inputs['Roughness'].default_value = 0.03
    b.inputs['Specular IOR Level'].default_value = 1.0
    b.inputs['Alpha'].default_value = 0.08
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    cornea.surface_render_method = 'BLENDED'
    me.materials.append(cornea)
    n_cornea = 0
    for p in me.polygons:
        u = sum(uv[l].uv[0] for l in p.loop_indices) / p.loop_total
        v = sum(uv[l].uv[1] for l in p.loop_indices) / p.loop_total
        a = alpha[min(h - 1, int(v * h)), min(w - 1, int(u * w))]
        if a < 0.5:
            p.material_index = 1
            n_cornea += 1
    return n_cornea


# ---------- 人物规格（按设定图） ----------
SPECS = {
    'dicer': dict(
        macro=dict(gender=1.0, age=0.53, muscle=0.66, weight=0.48, height=0.58, proportions=0.75),
        race=dict(caucasian=0.92, asian=0.04, african=0.04),
        skin='young_caucasian_male', skin_mul=(0.93, 0.79, 0.67), eyes='brown', brows='eyebrow010', lashes='eyelashes01',
        hair=('short02', '#160c06', '#5a3a22', 1.15), beard=None, stubble=0.8,
        targets={'head/head-square': 0.35, 'chin/chin-bones-incr': 0.4, 'nose/nose-hump-incr': 0.15},
    ),
    'drinker': dict(
        macro=dict(gender=1.0, age=0.72, muscle=0.62, weight=0.62, height=0.6, proportions=0.6),
        race=dict(caucasian=0.95, asian=0.02, african=0.03),
        skin='middleage_caucasian_male', skin_mul=(0.9, 0.75, 0.63), eyes='brownlight', brows='eyebrow010', lashes='eyelashes02',
        hair=('long01', '#150e08', '#544232', 1.3), beard=('grinsegold_beard_sigmund_wip', '#2a2018', '#8e8070', 0.9), stubble=0.3,
        targets={'nose/nose-hump-incr': 0.4, 'head/head-square': 0.4},
    ),
    'elder': dict(
        macro=dict(gender=1.0, age=0.93, muscle=0.35, weight=0.5, height=0.48, proportions=0.4),
        race=dict(caucasian=0.95, asian=0.02, african=0.03),
        skin='old_caucasian_male', skin_mul=(0.93, 0.79, 0.69), eyes='grey', brows='eyebrow011', lashes='eyelashes04',
        hair=('short04', '#9a958c', '#efebe2', 1.0), beard=('rehmanpolanski_beard_viking', '#a8a298', '#f2efe8', 1.0),
        moustache=('rehmanpolanski_moustache_viking', '#a8a298', '#f4f1ea'),
        targets={'nose/nose-scale-depth-incr': 0.3, 'nose/nose-hump-incr': 0.5},
    ),
    'barmaid': dict(
        macro=dict(gender=0.0, age=0.47, muscle=0.42, weight=0.46, height=0.45, proportions=0.8, cupsize=0.62, firmness=0.6),
        race=dict(caucasian=0.92, asian=0.04, african=0.04),
        skin='young_caucasian_female', skin_mul=(0.97, 0.85, 0.75), eyes='brown', brows='eyebrow001', lashes='eyelashes03',
        hair=('ponytail01', '#160c06', '#4e301c', 1.1), beard=None,
        targets={},
    ),
}

BEARD_TEX = {
    'grinsegold_beard_sigmund_wip': ('Material_Diffuse_Color1_d.png', 'Material_Diffuse_Color1_hn.png'),
    'rehmanpolanski_beard_viking': ('BeardViking.png', None),
    'wdg_scruffy_beard': ('beard2_texture-SMUDGE2.png', None),
    'culturalibre_faun_beard': ('brown.png', None),
}


def _smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def paint_stubble(objs, img_name, strength=0.5, seed=3):
    """在皮肤贴图上画胡茬：按脸上的位置给每个顶点一个权重，在 UV 里逐个三角形画进蒙版，再撒上细密的深色点。"""
    body, eyes = objs['body'], objs['eyes']
    img = bpy.data.images[img_name]
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    ev = np.array([v.co[:] for v in eyes.data.vertices], dtype=np.float32)
    ec = ev.mean(0)
    me = body.data
    # 身体的体型还在形态键里（没烘进网格）：关掉修改器求值，拿到真正的顶点位置
    saved = [(md, md.show_viewport) for md in body.modifiers]
    for md, _ in saved:
        md.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev_ob = body.evaluated_get(dg)
    tmp = ev_ob.to_mesh()
    co = np.empty(len(tmp.vertices) * 3, dtype=np.float32)
    tmp.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    ev_ob.to_mesh_clear()
    for md, vis in saved:
        md.show_viewport = vis
    dx, dy, dz = co[:, 0] - ec[0], co[:, 1] - ec[1], co[:, 2] - ec[2]
    ax = np.abs(dx)
    z_top = -0.032 - 0.04 * np.clip(1 - (ax - 0.02) / 0.05, 0, 1)
    wv = _smooth(z_top + 0.01, z_top - 0.008, dz)
    wv *= _smooth(0.07, 0.045, dy)
    wv *= _smooth(-0.2, -0.165, dz)
    wv *= np.where(dz < -0.15, _smooth(0.03, -0.01, dy), 1.0)
    lips = (ax < 0.03) & (dz > -0.104) & (dz < -0.076) & (dy < -0.085)
    wv[lips] *= 0.12
    gi = {g.name: g.index for g in body.vertex_groups}
    hw = np.zeros(len(co), dtype=np.float32)
    for v in me.vertices:
        for g in v.groups:
            if g.group in (gi.get('head'), gi.get('neck_01')):
                hw[v.index] += g.weight
    wv *= np.clip(hw * 2, 0, 1)
    mask = np.zeros((h, w), dtype=np.float32)
    uv = me.uv_layers.active.data
    for p in me.polygons:
        ids = list(p.vertices)
        if wv[ids].max() <= 0.01:
            continue
        L = list(p.loop_indices)
        pts = np.array([uv[l].uv[:] for l in L], dtype=np.float64) * [w, h]
        ws = wv[ids]
        for tri in ((0, 1, 2), (0, 2, 3)) if len(L) == 4 else ((0, 1, 2),):
            a, b, c = pts[list(tri)]
            wa, wb, wc = ws[list(tri)]
            x0, x1 = int(max(0, np.floor(min(a[0], b[0], c[0])))), int(min(w - 1, np.ceil(max(a[0], b[0], c[0]))))
            y0, y1 = int(max(0, np.floor(min(a[1], b[1], c[1])))), int(min(h - 1, np.ceil(max(a[1], b[1], c[1]))))
            if x1 < x0 or y1 < y0:
                continue
            yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-9:
                continue
            l1 = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / den
            l2 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / den
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            val = l1 * wa + l2 * wb + l3 * wc
            sub = mask[y0:y1 + 1, x0:x1 + 1]
            np.maximum(sub, np.where(inside, val, 0), out=sub)
    ys, xs = np.nonzero(mask > 0.001)
    if not len(ys):
        return
    y0, y1, x0, x1 = max(0, ys.min() - 8), min(h, ys.max() + 9), max(0, xs.min() - 8), min(w, xs.max() + 9)
    m = mask[y0:y1, x0:x1]
    for _ in range(3):
        m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
    rng = np.random.default_rng(seed)
    dots = rng.random(m.shape)
    dots = (dots > 0.45).astype(np.float32) * 0.7 + 0.3 * rng.random(m.shape)
    d = np.clip(m * strength * (0.55 + 0.45 * dots), 0, 0.85)[..., None]
    col = np.array([0.075, 0.05, 0.035], dtype=np.float32)
    region = px[y0:y1, x0:x1, :3]
    px[y0:y1, x0:x1, :3] = region * (1 - d) + col * d
    img.pixels.foreach_set(px.ravel())
    img.save()


# 表情：MPFB 自带的面部动作单元
EXPRESSIONS = {
    'blink': [('eye-left-closure', 1.0), ('eye-right-closure', 1.0)],
    'smile': [('mouth-corner-puller', 0.85), ('mouth-upward-retraction', 0.25), ('eye-left-slit', 0.25), ('eye-right-slit', 0.25)],
    'laugh': [('mouth-corner-puller', 1.0), ('mouth-open', 0.55), ('mouth-upward-retraction', 0.4), ('eye-left-slit', 0.55), ('eye-right-slit', 0.55), ('eyebrows-left-up', 0.25), ('eyebrows-right-up', 0.25)],
    'open': [('mouth-open', 0.6)],
}


def build_human(name, spec, x_offset=0.0):
    HumanService, TargetService, ClothesService = services()
    macro = TargetService.get_default_macro_info_dict()
    macro.update(spec['macro'])
    macro['race'] = dict(spec['race'])
    bm = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
    bm.name = name
    for t, w in spec.get('targets', {}).items():
        p = os.path.join(MPFB_SYS, 'targets', *t.split('/')) + '.target.gz'
        if os.path.exists(p):
            TargetService.load_target(bm, p, weight=w, name=os.path.basename(t))
    rig = HumanService.add_builtin_rig(bm, 'game_engine')
    rig.name = rig.data.name = name + '.rig'
    rig.location.x = x_offset

    # 皮肤
    skin_src = mp('skins', spec['skin'], spec['skin'] + '.mhmat')
    HumanService.set_character_skin(skin_src, bm, skin_type='GAMEENGINE')
    diffuse = None
    for n in bm.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            diffuse = n.image.filepath
            break
    skin_img, _ = tint_skin(bpy.path.abspath(diffuse), name + '_skin', mul=spec.get('skin_mul', (1, 1, 1)))
    set_material(bm, principled(name + '.skin', base=skin_img, rough=0.55, spec=0.35))

    objs = {'body': bm, 'rig': rig}
    def add(typ, rel):
        o = HumanService.add_mhclo_asset(mp(*rel.split('/')), bm, asset_type=typ, subdiv_levels=0, material_type='MAKESKIN')
        return o
    # 眼睛
    eyes = add('Eyes', 'eyes/high-poly/high-poly.mhclo')
    eye_img = bpy.data.images.load(mp('eyes', 'materials', spec['eyes'] + '_eye.png'), check_existing=True)
    set_material(eyes, principled(name + '.eyes', base=eye_img, rough=0.25, spec=0.5))
    split_cornea(eyes, eye_img, name)
    objs['eyes'] = eyes
    # 眉毛、睫毛
    brows = add('Eyebrows', 'eyebrows/%s/%s.mhclo' % (spec['brows'], spec['brows']))
    hc = spec['hair']
    bimg = recolor(mp('eyebrows', spec['brows'], spec['brows'] + '.png'), name + '_brows', hc[1] if name != 'elder' else '#8a857c', hc[2] if name != 'elder' else '#dcd7cc')
    set_material(brows, principled(name + '.brows', base=bimg, rough=0.7, alpha_from_base=True))
    objs['brows'] = brows
    lashes = add('Eyelashes', 'eyelashes/%s/%s.mhclo' % (spec['lashes'], spec['lashes']))
    limg = bpy.data.images.load(mp('eyelashes', spec['lashes'], spec['lashes'] + '.png'), check_existing=True)
    set_material(lashes, principled(name + '.lashes', base=limg, color=(0.02, 0.015, 0.01, 1), rough=0.6, alpha_from_base=True))
    objs['lashes'] = lashes
    teeth = add('Teeth', 'teeth/teeth_base/teeth_base.mhclo')
    timg = bpy.data.images.load(mp('teeth', 'teeth_base', 'teeth.png'), check_existing=True)
    set_material(teeth, principled(name + '.teeth', base=timg, rough=0.3))
    objs['teeth'] = teeth
    # 头发
    hname, dark, light, gamma = hc
    hair = add('Hair', 'hair/%s/%s.mhclo' % (hname, hname))
    src = None
    for n in hair.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and 'normal' not in n.image.name.lower():
            src = bpy.path.abspath(n.image.filepath)
            break
    himg = recolor(src, name + '_hair', dark, light, gamma)
    set_material(hair, principled(name + '.hair', base=himg, rough=0.55, alpha_from_base=True))
    objs['hair'] = hair
    # 胡子
    if spec.get('beard'):
        bn, dark, light, gamma = spec['beard']
        beard = add('Clothes', 'clothes/%s/%s.mhclo' % (bn, bn))
        dif, nrm = BEARD_TEX[bn]
        bsrc = mp('clothes', bn, dif)
        nimg = bpy.data.images.load(mp('clothes', bn, nrm), check_existing=True) if nrm else None
        bimg = recolor(bsrc, name + '_beard', dark, light, gamma)
        set_material(beard, principled(name + '.beard', base=bimg, rough=0.6, normal=nimg, alpha_from_base=True))
        objs['beard'] = beard
    if spec.get('moustache'):
        mn, dark, light = spec['moustache']
        mo = add('Clothes', 'clothes/%s/%s.mhclo' % (mn, mn))
        mimg = recolor(mp('clothes', mn, 'MoustacheViking.png'), name + '_moustache', dark, light)
        set_material(mo, principled(name + '.moustache', base=mimg, rough=0.6, alpha_from_base=True))
        objs['moustache'] = mo
    if spec.get('stubble'):
        paint_stubble(objs, name + '_skin', spec['stubble'])
    for o in objs.values():
        o['henry_char'] = name
    return objs
