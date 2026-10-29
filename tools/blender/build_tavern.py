# 一键搭酒馆：清空 → 建场景 → 放人物（预览用）→ 保存 C:\blender\henry_square\tavern.blend → 渲染几张预览
import bpy, sys, importlib, os, math, time
HERE = r'E:\game\骰子\tools\blender'
sys.path.insert(0, HERE)
import env_util, env_props, env_room, preview
for _m in (env_util, env_props, env_room, preview):
    importlib.reload(_m)
from mathutils import Vector

OUT = r'C:\blender\henry_square'


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.actions):
        for d in list(block):
            if d.users == 0:
                block.remove(d)
    env_props.M.clear()


def place_characters(path=os.path.join(OUT, 'characters.blend')):
    """把四个人物（骨架 + 身上所有网格）链接进来，放到座位上。只用于预览渲染，烘焙时隐藏。"""
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects]
    c = env_util.coll('CHARACTERS')
    rigs = {}
    for o in dst.objects:
        if o is None:
            continue
        c.objects.link(o)
        if o.type == 'ARMATURE':
            rigs[o.name.split('.')[0]] = o
    home = {'dicer': 'opp', 'drinker': 'left', 'elder': 'right'}
    for name, rig in rigs.items():
        if rig.animation_data:
            for t in rig.animation_data.nla_tracks:
                t.mute = True
            rig.animation_data.action = None
        if name in home:
            (x, y), rz = env_room.CHAIRS[home[name]]
            # 坐着时脚下原点在椅子中心前面 0.36 米（见 chars_motion.SEAT_BACK）
            rig.location = (x + 0.36 * math.sin(rz), y - 0.36 * math.cos(rz), 0)
            rig.rotation_euler = (0, 0, rz)
            act = bpy.data.actions.get(name + '_sit')
            if act:
                rig.animation_data_create()
                rig.animation_data.action = act
                if hasattr(rig.animation_data, 'action_slot') and act.slots:
                    rig.animation_data.action_slot = act.slots[0]
        elif name == 'barmaid':
            rig.location = (-1.4, 1.35, 0)
            rig.rotation_euler = (0, 0, math.radians(-55))
    c.hide_render = False
    return rigs


def game_camera():
    cam = bpy.data.objects.get('CAM_game') or bpy.data.objects.new('CAM_game', bpy.data.cameras.new('CAM_game'))
    if cam.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(cam)
    # 游戏相机：three (0, 21.5, 15.8) → (0, -1.6, 1.0)，地面 y=-38，1 米 = 50
    to_b = lambda x, y, z: Vector((x / 50, -z / 50, (y + 38) / 50))
    cam.location = to_b(0, 21.5, 15.8)
    preview.look(cam, to_b(0, -1.6, 1.0))
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle_y = math.radians(42)
    cam.data.clip_start = 0.02
    return cam


def build(with_chars=True):
    t0 = time.time()
    clear_scene()
    env_room.build_all()
    if with_chars:
        place_characters()
    bpy.context.scene.render.engine = 'CYCLES'
    bpy.context.scene.cycles.device = 'GPU'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'tavern.blend'), compress=True)
    return round(time.time() - t0, 1)


def renders(samples=96, w=1440, h=810, names=('ref', 'game', 'bar', 'hearth')):
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.cycles.max_bounces = 6
    out = []
    shots = {
        'ref': ((0.05, -2.15, 1.5), (0.0, 1.6, 1.05), 22),
        'game': None,
        'bar': ((-0.4, -0.9, 1.6), (-2.6, 1.8, 1.25), 24),
        'hearth': ((0.2, -0.6, 1.55), (3.0, 1.4, 1.2), 24),
        'window': ((0.0, 0.2, 1.6), (0.0, 3.8, 1.9), 24),
        'street': ((0.0, -8.5, 1.65), (0.0, -2.6, 1.6), 30),
    }
    for n in names:
        if n == 'game':
            sc.camera = game_camera()
        else:
            loc, tgt, lens = shots[n]
            preview.camera(loc, tgt, lens)
        out.append(preview.render('tav_' + n, w, h, samples))
    preview.contact(['tav_' + n for n in names], 'tav_sheet', 2)
    return out
