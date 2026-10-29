# 用 Real-ESRGAN（4 倍）放大设定图里四个人的区域，再按 prep_views.py 切好的位置裁出三视图；透明通道沿用原来的抠图。
# 原来的视图是普通插值放大的（偏糊），这样投影出来的贴图更清楚。
# 用法：python upscale_views.py
import os, json
import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

SRC = r'C:\blender\henry_square\reference\design_sheet_v31.png'
VIEWS = r'D:\ai3d\work\views'
OUT = r'D:\ai3d\work\views_sr'
WEIGHTS = r'D:\ai3d\esrgan\RealESRGAN_x4plus.pth'
AREAS = {
    'dicer': (836, 30, 1196, 324),
    'drinker': (6, 380, 348, 654),
    'elder': (584, 380, 872, 652),
    'barmaid': (1088, 384, 1330, 630),
}
UP = 4
PAD = 8
os.makedirs(OUT, exist_ok=True)
model = ModelLoader().load_from_file(WEIGHTS).model.cuda().eval()
sheet = Image.open(SRC).convert('RGB')
W0, H0 = sheet.size
info = json.load(open(os.path.join(VIEWS, 'views.json'), encoding='utf8'))
for name, (x0, y0, x1, y1) in AREAS.items():
    bx0, by0 = max(0, x0 - PAD), max(0, y0 - PAD)
    bx1, by1 = min(W0, x1 + PAD), min(H0, y1 + PAD)
    area = np.asarray(sheet.crop((bx0, by0, bx1, by1)), dtype=np.float32) / 255
    t = torch.from_numpy(area).permute(2, 0, 1)[None].cuda()
    with torch.no_grad():
        out = model(t)
    big = (out[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255 + 0.5).astype(np.uint8)
    ox, oy = (x0 - bx0) * UP, (y0 - by0) * UP          # 去掉四周多放大的那一圈
    for v, box in info[name].items():
        old = Image.open(os.path.join(VIEWS, '%s_%s.png' % (name, v)))
        l = ox + int(round((box[0] - x0) * UP))
        tp = oy + int(round((box[1] - y0) * UP))
        crop = big[tp:tp + old.height, l:l + old.width].astype(np.float32)
        oa = np.asarray(old).astype(np.float32)[:crop.shape[0], :crop.shape[1]]
        # 头部（从头顶往下约 14% 身高）用原来的插值放大：AI 放大会把小小的五官画歪；衣服用 AI 放大（85%）
        rows = np.nonzero((oa[..., 3] > 128).any(1))[0]
        r0, r1 = rows[0], rows[-1]
        f = (np.arange(crop.shape[0]) - r0) / max(1, r1 - r0)
        k = np.clip((f - 0.14) / 0.05, 0, 1)[:, None, None] * 0.85
        rgb = crop * k + oa[..., :3] * (1 - k)
        rgba = np.concatenate([rgb, oa[..., 3:4]], 2).clip(0, 255).astype(np.uint8)
        Image.fromarray(rgba).save(os.path.join(OUT, '%s_%s.png' % (name, v)))
    print(name, big.shape, flush=True)
