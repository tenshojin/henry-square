# 用 Marigold（从照片估算每个像素表面朝向的扩散模型）给三视图和头部特写各算一张法线图，
# 衣服的缝线、褶皱、皮带边、铆钉、系带，脸上的五官，投到模型上就成了真实的凹凸（法线贴图）。
# 法线在相机坐标里（x 向右、y 向上、z 朝向看图的人），存成 float16 的 .npy，和原图一样大。
# 用法：python normals_views.py
import os
import numpy as np
import torch
from PIL import Image
from diffusers import MarigoldNormalsPipeline

JOBS = [(r'D:\ai3d\work\views_face', '%s_%s'), (r'D:\ai3d\work\heads', '%s_%s')]
OUT = r'D:\ai3d\work\normals'
NAMES = ['dicer', 'drinker', 'elder', 'barmaid']
os.makedirs(OUT, exist_ok=True)
pipe = MarigoldNormalsPipeline.from_pretrained('prs-eth/marigold-normals-v1-1', variant='fp16', torch_dtype=torch.float16).to('cuda')
pipe.set_progress_bar_config(disable=True)
for src, pat in JOBS:
    tag = 'head' if src.endswith('heads') else 'view'
    for name in NAMES:
        for v in ('front', 'side', 'back'):
            im = np.asarray(Image.open(os.path.join(src, pat % (name, v) + '.png')).convert('RGBA')).astype(np.float32)
            a = im[..., 3:] / 255
            rgb = (im[..., :3] * a + 110 * (1 - a)).astype(np.uint8)       # 透明处垫灰底
            gen = torch.Generator('cuda').manual_seed(7)
            r = pipe(Image.fromarray(rgb), processing_resolution=768, ensemble_size=4, output_type='np', generator=gen)
            n = np.asarray(r.prediction[0], dtype=np.float32)
            if n.shape[:2] != rgb.shape[:2]:
                n = np.asarray(Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).resize(rgb.shape[1::-1], Image.BICUBIC), np.float32) / 127.5 - 1
            np.save(os.path.join(OUT, '%s_%s_%s.npy' % (tag, name, v)), n.astype(np.float16))
            fg = a[..., 0] > 0.5
            h = fg.shape[1]
            cols = np.nonzero(fg.any(0))[0]
            mid = (cols[0] + cols[-1]) // 2
            # 方向检查：人左半边的法线 x 应该偏负（朝左），右半边偏正；整体 z 为正（朝着看图的人）
            print(tag, name, v, n.shape, 'x left/right %.2f %.2f' % (n[:, :mid][fg[:, :mid]][:, 0].mean(), n[:, mid:][fg[:, mid:]][:, 0].mean()),
                  'z %.2f' % n[fg][:, 2].mean(), flush=True)
            # 预览图
            Image.fromarray(((n * 0.5 + 0.5).clip(0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, '%s_%s_%s.jpg' % (tag, name, v)))
