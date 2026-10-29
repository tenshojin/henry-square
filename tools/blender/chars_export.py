# 导出人物为 GLB（网格 + 蒙皮 + 表情形态键 + 动作 + 贴图）
import bpy, os
import chars_clothes as C

EXPORT = r'C:\blender\henry_square\export'


def shrink_images(objs, size=1024):
    seen = set()
    for o in objs:
        for m in o.data.materials:
            if not m or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.name not in seen:
                    seen.add(n.image.name)
                    w, h = n.image.size
                    if max(w, h) > size:
                        k = size / max(w, h)
                        n.image.scale(int(w * k), int(h * k))


def prepare(rig):
    objs = [o for o in bpy.data.objects if o.parent == rig and o.type == 'MESH']
    for o in objs:
        if o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks:
                k.value = 0.0
        if not (o.data.shape_keys and len(o.data.shape_keys.key_blocks) > 1):
            bpy.context.view_layer.objects.active = o
            C.apply_modifiers(o)
        for m in o.data.materials:
            if m and getattr(m, 'surface_render_method', None) == 'BLENDED' and 'cornea' not in m.name:
                m.surface_render_method = 'DITHERED'
    return objs


def export_char(name, rig, out_dir=EXPORT, tex_size=1024):
    os.makedirs(out_dir, exist_ok=True)
    objs = prepare(rig)
    shrink_images(objs, tex_size)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(out_dir, name + '.glb')
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_morph=True, export_morph_normal=True,
              export_skins=True, export_yup=True, export_texcoords=True, export_normals=True,
              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
              export_meshopt_compression_enable=True, export_try_sparse_sk=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw['export_image_format'] = 'JPEG'
        bpy.ops.export_scene.gltf(**kw)
    return path, os.path.getsize(path)
