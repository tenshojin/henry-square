# 一键生成四个人物：建模 → 衣服 → 动作 → 导出 GLB，并保存 C:\blender\henry_square\characters.blend
# 用法（在 Blender 里）：exec(open(r'E:\game\骰子\tools\blender\build_characters.py', encoding='utf8').read())
import bpy, sys, importlib, os, time
HERE = r'E:\game\骰子\tools\blender'
sys.path.insert(0, HERE)
import chars_base, chars_pose, chars_clothes, chars_build, chars_outfits, chars_anim, chars_export
for _m in (chars_base, chars_pose, chars_clothes, chars_build, chars_outfits, chars_anim, chars_export):
    importlib.reload(_m)

NAMES = ['dicer', 'drinker', 'elder', 'barmaid']


def build_all(export=True, names=NAMES, spacing=0.9):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    report = {}
    for i, name in enumerate(names):
        t0 = time.time()
        objs, clothes = chars_outfits.build_one(name, 0.0)
        rig = objs['rig']
        if export:
            path, size = chars_export.export_char(name, rig)
            report[name] = {'glb_mb': round(size / 1e6, 2), 'sec': round(time.time() - t0, 1)}
        rig.location.x = (i - (len(names) - 1) / 2) * spacing
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(r'C:\blender\henry_square', 'characters.blend'), compress=True)
    return report
