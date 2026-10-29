# 从设定图切出每个人物的 正面 / 侧面 / 背面，去背景，存成带透明通道的 PNG（给 Hunyuan3D-2mv 用）
import os, sys, json
import numpy as np
from PIL import Image
from rembg import remove, new_session

SRC = r'C:\blender\henry_square\reference\design_sheet_v31.png'
OUT = r'D:\ai3d\work\views'
os.makedirs(OUT, exist_ok=True)
AREAS = {
    'dicer': (836, 30, 1196, 324),
    'drinker': (6, 380, 348, 654),
    'elder': (584, 380, 872, 652),
    'barmaid': (1088, 384, 1330, 630),
}
UP = 4
sheet = Image.open(SRC).convert('RGB')
sess = new_session(sys.argv[1] if len(sys.argv) > 1 else 'isnet-general-use')
info = {}
for name, (x0, y0, x1, y1) in AREAS.items():
    area = sheet.crop((x0, y0, x1, y1))
    big = area.resize((area.width * UP, area.height * UP), Image.LANCZOS)
    cut = remove(big, session=sess)
    a = np.asarray(cut)[..., 3].astype(np.float32) / 255
    from scipy import ndimage
    fg = a > 0.5
    # 相邻两个人可能手碰到一起：在两段窗口里找前景最少的那一列作为分界
    prof = ndimage.uniform_filter1d(fg.sum(0).astype(np.float32), 9)
    Wd = fg.shape[1]
    s1 = int(Wd * 0.33) + int(np.argmin(prof[int(Wd * 0.33):int(Wd * 0.53)]))
    s2 = int(Wd * 0.53) + int(np.argmin(prof[int(Wd * 0.53):int(Wd * 0.74)]))
    owner = np.zeros(fg.shape, dtype=np.int32)
    owner[:, :s1] = 1
    owner[:, s1:s2] = 2
    owner[:, s2:] = 3
    owner[~fg] = 0
    views = {}
    for vname, oi in zip(('front', 'side', 'back'), (1, 2, 3)):
        own = owner == oi
        cols = np.nonzero(own.any(0))[0]
        rows = np.nonzero(own.any(1))[0]
        c0, c1 = int(cols.min()), int(cols.max()) + 1
        r0, r1 = int(rows.min()), int(rows.max()) + 1
        pad = 4 * UP
        box = (max(0, c0 - pad), max(0, r0 - pad), min(big.width, c1 + pad), min(big.height, r1 + pad))
        ca = np.asarray(cut).copy()
        ca[..., 3] = (ca[..., 3] * own).astype(np.uint8)
        v = Image.fromarray(ca).crop(box)
        v.save(os.path.join(OUT, '%s_%s.png' % (name, vname)))
        # 设定图上的像素范围（原图坐标），后面投影贴图要用
        views[vname] = [x0 + box[0] / UP, y0 + box[1] / UP, x0 + box[2] / UP, y0 + box[3] / UP]
        # 预览：黑底
        bg = Image.new('RGB', v.size, (40, 40, 40))
        bg.paste(v, mask=v.split()[3])
        bg.save(os.path.join(OUT, 'pv_%s_%s.jpg' % (name, vname)))
    info[name] = views
    print(name, {k: [round(x) for x in b] for k, b in views.items()}, flush=True)
with open(os.path.join(OUT, 'views.json'), 'w') as f:
    json.dump(info, f, indent=1)
