# 一键生成四个人物：建模（站姿）→ 衣服 → 动作 → 导出 GLB，并保存 C:\blender\henry_square\characters.blend
# 用法（在 Blender 里）：exec(open(r'E:\game\骰子\tools\blender\build_characters.py', encoding='utf8').read())
# 后台：blender -b --python 脚本 里先 read_homefile(use_empty=True)，再 exec 本文件、调 build_all()
# v3.2 起人物网格用 AI（Hunyuan3D-2mv）按设定图三视图生成（D:\ai3d\work\shapes），见 chars_ai.py；AI = False 退回 v3.1 的程序建模
import bpy, sys, importlib, os, time, json
HERE = r'E:\game\骰子\tools\blender'
sys.path.insert(0, HERE)
import chars_base, chars_pose, chars_clothes, chars_build, chars_outfits, chars_motion, chars_project, chars_ai, chars_export
for _m in (chars_base, chars_pose, chars_clothes, chars_build, chars_outfits, chars_motion, chars_project, chars_ai, chars_export):
    importlib.reload(_m)

NAMES = ['dicer', 'drinker', 'elder', 'barmaid']
META = os.path.join(chars_export.EXPORT, 'people.json')
AI = True


def build_all(export=True, names=NAMES, spacing=0.9):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    report = {}
    meta = {}
    if os.path.exists(META):
        with open(META, encoding='utf8') as f:
            meta = json.load(f)
    for i, name in enumerate(names):
        t0 = time.time()
        rep = {}
        if AI:
            objs, clothes, anim = chars_ai.build_one(name, 0.0, report=rep)
        else:
            objs, clothes, anim = chars_outfits.build_one(name, 0.0)
        rig = objs['rig']
        meta[name] = {k: round(v, 4) for k, v in anim.items()}
        if export:
            path, size = chars_export.export_char(name, rig)
            report[name] = {'glb_mb': round(size / 1e6, 2), 'sec': round(time.time() - t0, 1)}
            report[name].update({k: rep[k] for k in ('paint', 'arms', 'unpose_err') if k in rep})
        rig.location.x = (i - (len(names) - 1) / 2) * spacing
    if export:
        with open(META, 'w', encoding='utf8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(r'C:\blender\henry_square', 'characters.blend'), compress=True)
    return report
