# 预览渲染：摆一台相机和三盏灯，渲染到 C:\blender\henry_square\previews
import bpy, os
from mathutils import Vector

PREV = r'C:\blender\henry_square\previews'


def look(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def studio(target, warm=True):
    sc = bpy.context.scene
    for o in list(bpy.data.objects):
        if o.get('preview_rig'):
            bpy.data.objects.remove(o, do_unlink=True)
    def light(name, loc, energy, color, size):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.color = color
        ld.size = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o['preview_rig'] = True
        sc.collection.objects.link(o)
        look(o, target)
    t = Vector(target)
    light('pv_key', t + Vector((-1.2, -1.6, 1.0)), 260, (1.0, 0.8, 0.6) if warm else (1, 1, 1), 1.0)
    light('pv_fill', t + Vector((1.6, -1.2, 0.3)), 70, (0.75, 0.82, 1.0), 1.5)
    light('pv_rim', t + Vector((0.6, 1.6, 1.0)), 160, (1.0, 0.72, 0.45), 0.8)
    if not sc.world:
        sc.world = bpy.data.worlds.new('World')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.025, 0.02, 0.017, 1)
        bg.inputs[1].default_value = 1.0


def camera(loc, target, lens=50):
    sc = bpy.context.scene
    cam = bpy.data.objects.get('pv_cam')
    if not cam:
        cam = bpy.data.objects.new('pv_cam', bpy.data.cameras.new('pv_cam'))
        cam['preview_rig'] = True
        sc.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.clip_start = 0.02
    cam.location = loc
    look(cam, target)
    sc.camera = cam
    return cam


def contact(names, out, cols=2):
    """把几张预览图拼成一张（同尺寸），方便一次查看。"""
    import numpy as np
    imgs = []
    for n in names:
        im = bpy.data.images.load(os.path.join(PREV, n + '.jpg'), check_existing=False)
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        imgs.append(px.reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    rows = (len(imgs) + cols - 1) // cols
    sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
    sheet[..., 3] = 1
    for i, px in enumerate(imgs):
        r, c = divmod(i, cols)
        r = rows - 1 - r  # Blender 图像原点在左下
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = px[:h, :w]
    img = bpy.data.images.new('contact_tmp', cols * w, rows * h)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = os.path.join(PREV, out + '.jpg')
    img.file_format = 'JPEG'
    img.save()
    bpy.data.images.remove(img)
    return os.path.join(PREV, out + '.jpg')


def render(name, w=1200, h=800, samples=64, engine='CYCLES'):
    sc = bpy.context.scene
    sc.render.engine = engine
    if engine == 'CYCLES':
        sc.cycles.device = 'GPU'
        sc.cycles.samples = samples
        sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 88
    path = os.path.join(PREV, name + '.jpg')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
