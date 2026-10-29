# 酒馆光照烘焙 + 导出（后台运行）：
#   blender -b C:\blender\henry_square\tavern.blend --python bake_tavern.py -- [--samples 512] [--only floor,table] [--scale 1.0]
# 每个烘焙组：合并物体 → 生成光照贴图 UV（所有物体打包进一张图）→ Cycles 烘 Combined → 存成 8 位贴图
# 最后把材质换成“只显示烘焙图”的无光照材质，导出 tavern.glb；另外渲染一张桌边的全景 HDR 给人物打光。
import bpy, bmesh, os, sys, time, math, zlib
import numpy as np

OUT = r'C:\blender\henry_square'
BAKE = os.path.join(OUT, 'bake')
EXPORT = os.path.join(OUT, 'export')
os.makedirs(BAKE, exist_ok=True)
os.makedirs(EXPORT, exist_ok=True)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default
SAMPLES = int(arg('--samples', 512))
ONLY = [g for g in arg('--only', '').split(',') if g]
SCALE = float(arg('--scale', 1.0))
NO_EXPORT = '--no-export' in argv

# 每组贴图大小
SIZES = {
    'floor': 2048, 'walls_back': 2048, 'walls_side': 2048, 'walls_front': 1024, 'ceiling': 2048,
    'tabletop': 2048, 'table': 2048, 'tableprops': 1024, 'bar': 2048, 'shelves': 2048, 'hearth': 2048,
    'decor': 2048, 'back': 1024, 'exterior': 2048, 'door': 512, 'boards': 1024,
}
# 有字的板子单独一组，贴图密度高，字才看得清
BOARDS = ('chalkboard', 'sign_board')
# 存图编码：s = L / (L + K)（可逆，暗部精度高，烛光处也不截断）。游戏里用 L = K·s / (1 - s) 还原
K_ENC = 0.25


def log(*a):
    print('[bake]', *a, flush=True)


def setup_cycles():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                break
        except Exception:
            pass
    for d in prefs.devices:
        d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 4
    sc.render.bake.margin = 12
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = True
    log('device', prefs.compute_device_type, [d.name for d in prefs.devices if d.use])


def groups():
    g = {}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        name = o.get('bake')
        if not name or name in ('flames',):
            continue
        if o.name in BOARDS:
            name = 'boards'
        g.setdefault(name, []).append(o)
    return g


def split_tabletop(g):
    """游戏桌的桌面单独一组，贴图密度更高。"""
    if 'table' in g:
        top = [o for o in g['table'] if o.name.startswith('gametable_top')]
        g['table'] = [o for o in g['table'] if o not in top]
        g['tabletop'] = top
    return g


def has_disp(o):
    return any(m.type == 'SUBSURF' and m.render_levels > 0 for m in o.modifiers)


def apply_all_modifiers(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    o.modifiers.clear()
    old = o.data
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def freeze_object_space(objs):
    """合并前把每个物体自己的局部坐标、随机数存进网格属性。
    材质里的 Object 坐标（木纹方向、噪声）和物体随机值（每块木板颜色不同）合并后就不会全变成第一个物体的。"""
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
        me = o.data
        n = len(me.vertices)
        co = np.empty(n * 3, dtype=np.float32)
        me.vertices.foreach_get('co', co)
        a = me.attributes.get('ocoord') or me.attributes.new('ocoord', 'FLOAT_VECTOR', 'POINT')
        a.data.foreach_set('vector', co)
        r = me.attributes.get('orand') or me.attributes.new('orand', 'FLOAT', 'POINT')
        r.data.foreach_set('value', np.full(n, (zlib.crc32(o.name.encode()) & 0xFFFFFF) / float(0x1000000), dtype=np.float32))


def use_frozen_space():
    """材质改读上面存的属性；图片贴图固定用 UVMap（合并后“渲染用 UV”可能变成光照贴图 UV，字会被放大错位）。"""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type in ('TEX_COORD', 'OBJECT_INFO'):
                out_name, attr, sock = ('Object', 'ocoord', 'Vector') if n.type == 'TEX_COORD' else ('Random', 'orand', 'Fac')
                links = [l for l in nt.links if l.from_node == n and l.from_socket.name == out_name]
                if not links:
                    continue
                at = nt.nodes.new('ShaderNodeAttribute')
                at.attribute_name = attr
                for l in links:
                    to = l.to_socket
                    nt.links.remove(l)
                    nt.links.new(at.outputs[sock], to)
            elif n.type == 'TEX_IMAGE' and n.name != 'BAKE_TARGET' and not n.inputs['Vector'].is_linked:
                uvn = nt.nodes.new('ShaderNodeUVMap')
                uvn.uv_map = 'UVMap'
                nt.links.new(uvn.outputs['UV'], n.inputs['Vector'])


def prepare_group(name, objs):
    """不带置换的物体先应用修改器再合并成一个；带置换的（石墙等）保留细分修改器单独存在。"""
    disp = [o for o in objs if has_disp(o)]
    plain = [o for o in objs if not has_disp(o)]
    for o in plain:
        if o.modifiers:
            apply_all_modifiers(o)
    freeze_object_space(plain + disp)
    out = []
    if plain:
        j = join(plain, 'B_' + name)
        out.append(j)
    for i, o in enumerate(disp):
        o.name = 'B_%s_d%d' % (name, i)
        out.append(o)
    for o in out:
        o['bake'] = name
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name='UVMap')
        render_uv = None
        for uv in me.uv_layers:
            if uv.active_render:
                render_uv = uv.name
        lm = me.uv_layers.get('LM') or me.uv_layers.new(name='LM')
        me.uv_layers.active = lm
        if render_uv:
            me.uv_layers[render_uv].active_render = True
    return out


def lightmap_uv(objs):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.0025)
    except Exception as e:
        log('pack failed', e)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_group(name, objs):
    size = int(SIZES.get(name, 1024) * SCALE)
    img = bpy.data.images.new('BAKE_' + name, size, size, alpha=False, float_buffer=True)
    mats = set()
    for o in objs:
        for s in o.material_slots:
            if s.material:
                mats.add(s.material)
    for m in mats:
        if not m.use_nodes:
            m.use_nodes = True
        nt = m.node_tree
        node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE_TARGET'
        node.image = img
        nt.nodes.active = node
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t0 = time.time()
    bpy.ops.object.bake(type='COMBINED', pass_filter={'DIRECT', 'INDIRECT', 'DIFFUSE', 'GLOSSY', 'TRANSMISSION', 'EMIT'},
                        margin=12, use_clear=True, target='IMAGE_TEXTURES')
    log(name, size, 'baked in %.1fs' % (time.time() - t0))
    # 浮点结果 → 8 位 PNG（先乘 ENC，游戏里再除回去）
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(size, size, 4)
    L = np.maximum(px[..., :3], 0)
    sv = L / (L + K_ENC)
    # 8 位图里存 sRGB 编码后的 s（暗部精度高）；游戏里贴图按 sRGB 解码就拿回 s
    px[..., :3] = np.where(sv <= 0.0031308, sv * 12.92, 1.055 * np.power(sv, 1 / 2.4) - 0.055)
    px[..., 3] = 1.0
    out = bpy.data.images.new('LM_' + name, size, size, alpha=False)
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = os.path.join(BAKE, 'lm_%s.png' % name)
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(img)
    return out


def unlit_material(name, img):
    m = bpy.data.materials.new('LM_' + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    bg = nt.nodes.new('ShaderNodeBackground')
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'UVMap'
    nt.links.new(uvn.outputs['UV'], tx.inputs['Vector'])
    nt.links.new(tx.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], o.inputs['Surface'])
    return m


def finalize_for_export(name, objs, img):
    mat = unlit_material(name, img)
    for o in objs:
        me = o.data
        for m in list(o.modifiers):
            o.modifiers.remove(m)
        me.materials.clear()
        me.materials.append(mat)
        for p in me.polygons:
            p.material_index = 0
        for uv in list(me.uv_layers):
            if uv.name != 'LM':
                me.uv_layers.remove(uv)
        me.uv_layers['LM'].name = 'UVMap'
        for a in ('ocoord', 'orand'):
            if me.attributes.get(a):
                me.attributes.remove(me.attributes[a])


def render_probe():
    """桌边的 360° 全景（人物、骰子用的环境光）。"""
    sc = bpy.context.scene
    cam = bpy.data.objects.new('PROBE', bpy.data.cameras.new('PROBE'))
    sc.collection.objects.link(cam)
    cam.data.type = 'PANO'
    try:
        cam.data.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
    cam.location = (0.0, -0.3, 1.15)
    # 画面中心朝 +X（three.js 的全景图约定：中心是 +X，往右转向 +Z）
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1024, 512
    sc.render.resolution_percentage = 100
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    sc.render.image_settings.file_format = 'HDR'
    sc.render.filepath = os.path.join(EXPORT, 'probe.hdr')
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    log('probe rendered')


def main():
    t0 = time.time()
    setup_cycles()
    # 人物只用来预览，烘焙前删掉
    for o in list(bpy.data.objects):
        if o.users_collection and any(c.name == 'CHARACTERS' for c in o.users_collection):
            bpy.data.objects.remove(o, do_unlink=True)
    if not ONLY:
        render_probe()
    use_frozen_space()
    g = split_tabletop(groups())
    log('groups', {k: len(v) for k, v in g.items()})
    baked = {}
    for name, objs in g.items():
        if ONLY and name not in ONLY:
            continue
        t1 = time.time()
        bobjs = prepare_group(name, objs)
        lightmap_uv(bobjs)
        img = bake_group(name, bobjs)
        baked[name] = (bobjs, img)
        log(name, 'done in %.1fs' % (time.time() - t1))
    if NO_EXPORT:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'tavern_baked.blend'), compress=True)
        return
    for name, (bobjs, img) in baked.items():
        finalize_for_export(name, bobjs, img)
    # 导出：只要烘好的网格 + 标记点（灯、火焰网格、相机都不要）
    keep = set()
    for name, (bobjs, img) in baked.items():
        keep.update(o.name for o in bobjs)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
        elif o.type in ('LIGHT', 'CAMERA', 'CURVE'):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'tavern_baked.blend'), compress=True)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    path = os.path.join(EXPORT, 'tavern.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_apply=False,
                              export_animations=False, export_lights=False, export_cameras=False, export_extras=True,
                              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=80,
                              export_meshopt_compression_enable=True, export_yup=True, export_normals=False, export_texcoords=True)
    log('exported', path, round(os.path.getsize(path) / 1e6, 2), 'MB', 'total %.0fs' % (time.time() - t0))
    with open(os.path.join(EXPORT, 'tavern.json'), 'w') as f:
        f.write('{"k": %g}' % K_ENC)


main()
