# 修关键帧背景里的人（v3.4）：empty / elder / drinker / dicer / barmaid 五张关键帧共用同一个背景，里面几个背景人是 AI 画坏的：
#   center —— 柱子后面探出一个戴尖帽、蜡像脸的“小矮人”；right —— 右边吧台后面的酒保脸糊成一团、像蜡像；
#   left —— 左边吧台最里面那人戴着像现代眼镜的东西，前面穿深色外套的侧脸也像蜡像。
# 每块用 Qwen-Image-Edit 只重画那一小块（裁出来放大到 1024 再改，提示词见 PATCHES，每块试 4 个种子挑一张，选中的种子也记在 PATCHES 里）。
# 贴回去时只贴和原图差别大的地方（新画的人），边缘羽化（贴着画面边框的那边不羽化）、稍微模糊一点和背景的虚化对上；
# 四张有人的关键帧再按“和空椅子那张的差别”扣掉坐在对面的人，背景改动完全一致，片段之间接缝照样接得上。
# 用法：python patch_keys.py edit 关键帧目录 输出目录 [块名...]   —— 生成 块名_crop.png 和 块名_s种子.png（要先开着 ComfyUI）
#       python patch_keys.py paste 关键帧目录 块名=选中的图 ...    —— 贴回五张关键帧；原图先备份成 名字_orig.png，每次都从原图重贴
#       python patch_keys.py clip 关键帧目录 旧片段目录 输出目录 块名=选中的图 ... [free=块名,...]
#           —— 补背景之前（用 名字_orig.png）生成的片段，每一帧贴上同样的补丁，人从前面走过、挡住的地方不贴；
#              free 里的块人走不到，不判断遮挡（原片里背景人自己会动，会被误当成遮挡）。
#              v3.4 的 leave_dicer 就是这样来的：用补过的关键帧怎么换种子，柱子后面喝酒的人都会跟着站起来走，只好沿用 v3.3 那版再贴
import os, sys, shutil
import numpy as np
from PIL import Image
from scipy import ndimage

STYLE = ('Realistic adult proportions, the same warm candlelight, the same photographic style, film grain and soft background focus as '
         'the rest of the picture.')
PATCHES = {  # 块名: (在 1456×720 关键帧里裁出来给 Qwen 改的那块, 选中的种子, 提示词)
    'center': ((540, 140, 820, 420), 22,
               'Replace the strange doll-like man with the pointed black hat who peeks out from behind the wooden pillar with an ordinary '
               'middle-aged tavern patron: a normal man with short brown hair and a short beard, wearing a simple brown wool tunic, sitting '
               'at the table behind the pillar and drinking from a pewter mug, seen in three-quarter view. Natural realistic face and '
               'realistic adult proportions, the same warm candlelight, the same photographic style and soft focus as the rest of the '
               'picture. Keep the pillar, the garlic, the candles and everything else exactly the same.'),
    'right': ((1080, 140, 1360, 420), 23,
              'Replace the blurry doll-like bartender standing behind the bar with an ordinary middle-aged medieval innkeeper: a normal man '
              'with a natural realistic face, short dark brown hair and a short dark beard, wearing a white linen shirt and a dark brown '
              'leather vest, standing behind the counter and wiping a pewter tankard with a cloth, looking down at his hands, seen in '
              'three-quarter view. ' + STYLE + ' Keep the shelves, the bottles, the candles, the bar counter and everything else exactly '
              'the same.'),
    'left': ((0, 160, 280, 440), 22,
             'Make the two men sitting at the bar look like ordinary medieval tavern patrons with natural realistic faces. The man at the '
             'far left in the back: no glasses, a normal weathered face with short hair and a beard, looking down at the cup in his '
             'hands. The man in the dark coat in the foreground, seen from behind in profile: a natural realistic face with short brown '
             'hair and light stubble, looking toward the bar. ' + STYLE + ' Keep the bar counter, the candles, the shelves, the dark '
             'coat and everything else exactly the same.'),
}
NAMES = ['empty', 'elder', 'drinker', 'dicer', 'barmaid']


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


mode, KEY = sys.argv[1], sys.argv[2]
for n in NAMES:
    if not os.path.exists(os.path.join(KEY, n + '_orig.png')):
        Image.open(os.path.join(KEY, n + '.png')).save(os.path.join(KEY, n + '_orig.png'))
empty = load(os.path.join(KEY, 'empty_orig.png'))
H, W = empty.shape[:2]

if mode == 'edit':
    import comfy
    out = sys.argv[3]
    os.makedirs(out, exist_ok=True)
    for p in sys.argv[4:] or list(PATCHES):
        box, _, prompt = PATCHES[p]
        crop = os.path.join(out, p + '_crop.png')
        Image.open(os.path.join(KEY, 'empty_orig.png')).convert('RGB').crop(box).resize((1024, 1024), Image.LANCZOS).save(crop)
        img = comfy.put(crop, 'bgfix_' + p + '.png')
        for seed in (21, 22, 23, 24):
            shutil.copy(comfy.qwen_edit(img, prompt, seed=seed, prefix='bgfix_' + p)[0], os.path.join(out, '%s_s%d.png' % (p, seed)))
            print(p, seed, flush=True)
    sys.exit()

masks = []  # (裁剪框, 贴上去的图, 遮罩, 块名)
FREE = []
for arg in sys.argv[5 if mode == 'clip' else 3:]:
    p, path = arg.split('=', 1)
    if p == 'free':
        FREE = path.split(',')
        continue
    x0, y0, x1, y1 = PATCHES[p][0]
    w, h = x1 - x0, y1 - y0
    fixed = np.asarray(Image.open(path).convert('RGB').resize((w, h), Image.LANCZOS), dtype=np.float32)
    fixed = ndimage.gaussian_filter(fixed, (0.7, 0.7, 0))  # 和周围背景的虚化对上
    orig = empty[y0:y1, x0:x1]
    # 只贴新画的人：差别大的地方，扩大一圈再羽化；裁剪框的边上淡出（贴着画面边框的那边不用）
    diff = ndimage.gaussian_filter(np.abs(fixed - orig).mean(2), 2)
    m = ndimage.binary_dilation(diff > 14, iterations=8)
    m = ndimage.binary_fill_holes(m)
    m = ndimage.gaussian_filter(m.astype(np.float32), 4)
    yy, xx = np.mgrid[0:h, 0:w]
    far = np.full((h, w), 99)
    sides = [xx if x0 > 0 else far, yy if y0 > 0 else far, w - 1 - xx if x1 < W else far, h - 1 - yy if y1 < H else far]
    m *= np.clip(np.minimum.reduce(sides).astype(np.float32) / 16, 0, 1)
    print(p, 'patch area', round(float(m.mean()), 3))
    masks.append(((x0, y0, x1, y1), fixed, m, p))

if mode == 'clip':
    SRC, OUT = sys.argv[3], sys.argv[4]
    alpha = np.zeros((H, W), np.float32)
    free = np.zeros((H, W), np.float32)
    pat = empty.copy()  # 补好的空椅子关键帧
    for (x0, y0, x1, y1), fixed, m, p in masks:
        alpha[y0:y1, x0:x1] = m
        pat[y0:y1, x0:x1] = empty[y0:y1, x0:x1] * (1 - m[..., None]) + fixed * m[..., None]
        free[y0:y1, x0:x1] = p in FREE
    names = sorted(f for f in os.listdir(SRC) if f.endswith('.png'))
    size = Image.open(os.path.join(SRC, names[0])).size
    alpha, free = [np.asarray(Image.fromarray(a).resize(size, Image.BILINEAR), dtype=np.float32) for a in (alpha, free)]
    pat, org = [np.asarray(Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).resize(size, Image.LANCZOS), dtype=np.float32)
                for a in (pat, empty)]
    os.makedirs(OUT, exist_ok=True)
    T = 28
    for n in names:
        fr = load(os.path.join(SRC, n))
        # 先估计这一帧整体的亮度颜色漂移（低频，补丁跟着它走），再找出被人挡住的地方（和原关键帧差别大）
        d0 = ndimage.gaussian_filter(np.abs(fr - org).mean(2), 5)
        w = (d0 < T).astype(np.float32)
        den = ndimage.gaussian_filter(w, 12) + 1e-3
        lf = np.stack([ndimage.gaussian_filter((fr[..., c] - org[..., c]) * w, 12) / den for c in range(3)], 2)
        d = ndimage.gaussian_filter(np.abs(fr - org - lf).mean(2), 5)
        occ = ndimage.binary_dilation(d > T, iterations=6)
        occ = ndimage.gaussian_filter(occ.astype(np.float32), 3) * (1 - free)
        a = (alpha * (1 - np.clip(occ * 1.5, 0, 1)))[..., None]
        Image.fromarray(np.clip(fr * (1 - a) + (pat + lf) * a + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, n))
    print('done', len(names))
    sys.exit()

for n in NAMES:
    img = load(os.path.join(KEY, n + '_orig.png'))
    out = img.copy()
    for (x0, y0, x1, y1), fixed, m, _ in masks:
        a = m.copy()
        if n != 'empty':
            # 坐在对面的人：和空椅子那张差别大的地方（人和人的影子），不往上贴
            d = ndimage.gaussian_filter(np.abs(img - empty).mean(2), 3)[y0:y1, x0:x1]
            person = ndimage.binary_dilation(d > 22, iterations=6)
            person = ndimage.gaussian_filter(person.astype(np.float32), 3)
            a *= 1 - np.clip(person * 1.5, 0, 1)
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - a[..., None]) + fixed * a[..., None]
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(KEY, n + '.png'))
print('done')
