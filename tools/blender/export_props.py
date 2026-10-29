# 游戏里会动的道具 → props.glb：椅子（人起身时会被推开、坐下后挪近）、拿在手里的木酒杯 / 锡酒杯、女店员的托盘。
# 程序材质导不出去：用 Cycles 把每个材质的“底色”烘成一张贴图（再乘一点环境光遮蔽），金属部分保留金属度。
# 后台：blender -b --python export_props.py
import bpy, sys, os, math
import numpy as np
HERE = r'E:\game\骰子\tools\blender'
sys.path.insert(0, HERE)
import importlib
import env_util as U
import env_props as P
importlib.reload(U)
importlib.reload(P)

EXPORT = r'C:\blender\henry_square\export'


def tray(name='tray'):
    m = P.mats()
    out = [U.lathe(name, [(0.0, 0), (0.17, 0), (0.18, 0.004), (0.185, 0.026), (0.172, 0.028), (0.165, 0.012), (0.0, 0.012)], (0, 0, 0), (0, 0, 0), m['oak'], n=40, group='props')]
    for x, y, kind, rot in ((-0.07, -0.03, 'wood', 0.6), (0.06, -0.05, 'pewter', 2.0), (0.01, 0.07, 'wood', 4.0)):
        f = P.wood_tankard if kind == 'wood' else P.pewter_tankard
        out += f((x, y, 0.012), rot, 'props', s=0.95, full=True, name=name + '_' + kind)
    return out


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        if o.type == 'MESH':
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=md.name)
            o.select_set(True)
    bpy.context.view_layer.objects.active = [o for o in objs if o.type == 'MESH'][0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def unwrap(ob):
    me = ob.data
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    me.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_albedo(ob, size):
    """每个材质：把接到 Base Color 的东西改接到发光，烘 EMIT → 底色贴图；再烘一张 AO 乘上去。"""
    img = bpy.data.images.new(ob.name + '_col', size, size)
    ao = bpy.data.images.new(ob.name + '_ao', size, size)
    infos = []
    for slot in ob.material_slots:
        mat = slot.material.copy()
        slot.material = mat
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        metal = bsdf.inputs['Metallic'].default_value
        rough = bsdf.inputs['Roughness'].default_value
        infos.append((mat, metal, rough))
        em = nt.nodes.new('ShaderNodeEmission')
        bc = bsdf.inputs['Base Color']
        if bc.is_linked:
            nt.links.new(bc.links[0].from_socket, em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = bc.default_value
        mat['_surf'] = out.inputs['Surface'].links[0].from_socket.node.name if out.inputs['Surface'].is_linked else ''
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        nt.nodes.active = t
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = 16
    sc.render.bake.margin = 6
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='EMIT')
    for mat, _, _ in infos:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image == img:
                n.image = ao
    sc.cycles.samples = 64
    bpy.ops.object.bake(type='AO')
    c = np.empty(size * size * 4, dtype=np.float32)
    a = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(c)
    ao.pixels.foreach_get(a)
    c = c.reshape(-1, 4)
    a = a.reshape(-1, 4)[:, :1]
    c[:, :3] *= 0.45 + 0.55 * a
    img.pixels.foreach_set(c.ravel())
    img.filepath_raw = os.path.join(r'C:\blender\henry_square\textures', ob.name + '_col.png')
    img.file_format = 'PNG'
    img.save()
    return img, infos


def final_materials(ob, img, infos):
    for slot, (mat, metal, rough) in zip(ob.material_slots, infos):
        m = bpy.data.materials.new(ob.name + '_' + mat.name.split('.')[0])
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = img
        m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Metallic'].default_value = metal
        b.inputs['Roughness'].default_value = max(0.3, rough)
        slot.material = m


def main():
    bpy.ops.wm.read_homefile(use_empty=True)
    P.M.clear()
    items = {
        'chair': (P.slat_chair(0, 0, 0, 0.45, 'props', 'chair'), 1024),
        'mug_wood': (P.wood_tankard((0, 0, 0), 0.0, 'props', s=1.0, full=True, name='mug_wood'), 512),
        'mug_pewter': (P.pewter_tankard((0, 0, 0), 0.0, 'props', s=1.0, full=True, name='mug_pewter'), 512),
        'tray': (tray(), 1024),
    }
    done = []
    for name, (objs, size) in items.items():
        ob = join(objs, name)
        unwrap(ob)
        img, infos = bake_albedo(ob, size)
        final_materials(ob, img, infos)
        done.append(ob)
    for o in list(bpy.data.objects):
        if o not in done:
            bpy.data.objects.remove(o, do_unlink=True)
    for i, ob in enumerate(done):
        ob.location = (i * 0.8, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=r'C:\blender\henry_square\props.blend', compress=True)
    for ob in done:
        ob.location = (0, 0, 0)
    path = os.path.join(EXPORT, 'props.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_apply=True, export_animations=False,
                              export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
                              export_meshopt_compression_enable=True, export_yup=True)
    print('[props] exported', path, round(os.path.getsize(path) / 1e6, 2), 'MB', flush=True)


main()
