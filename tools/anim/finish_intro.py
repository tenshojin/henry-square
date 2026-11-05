# 开场片（Seedance 2.0 生成的一镜到底，从门外走到第一个对手对面）→ 游戏素材 intro。
#   裁切：Seedance 没有 2:1，生成时用 16:9，上下各裁 40 像素就是游戏的 1280×640（参考图上下补的就是这一条）
#   补帧：24 帧/秒 → 48 帧/秒（镜头走得快，24 帧看着一顿一顿的）
#   压光：门开到一半时门缝里的光又平又亮，只压门洞这一块，门全开之后松开，门两边的壁灯不动
#   收尾：最后几秒校色、微调位置，最后一小段渐变成待机片的第一帧，接待机时一点不跳
#   开头：第一帧多停 HOLD 秒，开场页的标题淡出的时候门还没动
# 用法：python finish_intro.py 成片.mp4 工作目录 [游戏素材目录(assets/cutscenes)]
import json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image
import interp

SRC, WORK = sys.argv[1], sys.argv[2]
GAME = sys.argv[3] if len(sys.argv) > 3 else None
FFMPEG = r'D:\tools\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
NEXT = 'idle_drinker'  # 开场落到这一段（第一个对手坐着的循环）
SRC_FPS, FPS = 24, 48
END = 11.5  # 成片用到第几秒（后面只是坐着不动，交给待机片）
HOLD = 0.7
CROP = 40
BLEND = 0.9  # 最后这么多秒渐变成待机片第一帧
GRADE_FROM, ALIGN_FROM = 8.5, 9.0  # 从这里开始慢慢校色、微调位置
CRF = 38
LUM = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
BT709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def frames(d):
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.png')]


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


def door_mask(h, w, t, feather=24):
    # 机位在往前走，门洞越来越大，框跟着放大
    grow = 60 * t / 4
    x0, x1, y0 = 496 - grow, 790 + grow, 130
    xs = np.clip(np.minimum(np.arange(w) - x0, x1 - np.arange(w)) / feather, 0, 1)
    ys = np.clip((np.arange(h) - y0) / feather, 0, 1)
    return (ys[:, None] * xs[None, :]).astype(np.float32)


def tame(a, t, knee=60, soft=40):
    s = smooth((t - 0.15) / 0.5) * (1 - smooth((t - 3.2) / 1.0))
    if s <= 0:
        return a
    lum = a @ LUM
    over = np.maximum(lum - knee, 0)
    target = lum - s * door_mask(*a.shape[:2], t) * (over - over / (1 + over / soft))
    return a * (target / np.maximum(lum, 1))[..., None]


def affine(a, scale, dx, dy):
    """以画面中心放大 scale 倍，再平移 (dx, dy)。"""
    h, w = a.shape[:2]
    im = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
    cx, cy = w / 2, h / 2
    k = 1 / scale
    return np.asarray(im.transform((w, h), Image.AFFINE, (k, 0, cx - k * (cx + dx), 0, k, cy - k * (cy + dy)), Image.BICUBIC), dtype=np.float32)


def align(a, ref):
    """找 a 放大多少、挪多少才和 ref 对上：大小试一遍，平移用相位相关。"""
    g = lambda x: (x @ LUM) - (x @ LUM).mean()
    fr = np.fft.fft2(g(ref))
    best = None
    for s in np.arange(1.0, 1.0301, 0.0025):
        c = np.real(np.fft.ifft2(fr * np.conj(np.fft.fft2(g(affine(a, s, 0, 0))))))
        i = np.unravel_index(np.argmax(c), c.shape)
        dy = i[0] if i[0] < c.shape[0] / 2 else i[0] - c.shape[0]
        dx = i[1] if i[1] < c.shape[1] / 2 else i[1] - c.shape[1]
        if best is None or c.max() > best[0]:
            best = (float(c.max()), float(s), int(dx), int(dy))
    return best[1:]


# 1. 取帧、裁切
raw = os.path.join(WORK, 'raw')
shutil.rmtree(raw, ignore_errors=True)
os.makedirs(raw)
n = round(END * SRC_FPS) + 1
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', SRC, '-fps_mode', 'passthrough', '-frames:v', str(n), '-vf', f'crop=1280:640:0:{CROP}', os.path.join(raw, '%05d.png')], check=True)

# 2. 补帧
f48 = os.path.join(WORK, 'f48')
shutil.rmtree(f48, ignore_errors=True)
print('interp', interp.interp_dir(raw, f48, net=interp.load_net('cuda')), flush=True)
fs = frames(f48)

# 3. 待机片第一帧（游戏里接下去放的就是它）
ref_png = os.path.join(WORK, 'next.png')
game_dir = GAME or os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'cutscenes')
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', os.path.join(game_dir, NEXT + '.mp4'), '-frames:v', '1', ref_png], check=True)
ref = load(ref_png)
last = load(fs[-1])
scale, dx, dy = align(last, ref)
print('align', scale, dx, dy, flush=True)
fitted = affine(last, scale, dx, dy)
m1, s1 = fitted.reshape(-1, 3).mean(0), fitted.reshape(-1, 3).std(0)
k1, t1 = ref.reshape(-1, 3).mean(0), ref.reshape(-1, 3).std(0)

# 4. 逐帧处理
out = os.path.join(WORK, 'done')
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
T = (len(fs) - 1) / FPS
pad = round(HOLD * FPS)
for i, p in enumerate(fs):
    t = i / FPS
    a = tame(load(p), t)
    r = smooth((t - ALIGN_FROM) / (T - BLEND - ALIGN_FROM))
    if r > 0:
        a = affine(a, 1 + (scale - 1) * r, dx * r, dy * r)
    g = smooth((t - GRADE_FROM) / (T - BLEND - GRADE_FROM))
    if g > 0:
        a = a * (1 - g) + ((a - m1) * (t1 / s1) + k1) * g
    b = smooth((t - (T - BLEND)) / BLEND)
    if b > 0:
        a = a * (1 - b) + ref * b
    im = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))
    im.save(os.path.join(out, '%05d.png' % (i + pad)))
    if i == 0:
        for j in range(pad):
            im.save(os.path.join(out, '%05d.png' % j))
total = len(fs) + pad
print('frames', total, 'seconds', round(total / FPS, 3), flush=True)

# 5. 压缩
if GAME:
    seq = os.path.join(out, '%05d.png')
    mp4 = os.path.join(GAME, 'intro.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', seq,
                    '-c:v', 'libsvtav1', '-preset', '4', '-crf', str(CRF), '-pix_fmt', 'yuv420p10le',
                    '-svtav1-params', 'color-primaries=1:transfer-characteristics=1:matrix-coefficients=1:color-range=0',
                    '-vf', 'scale=out_color_matrix=bt709:out_range=tv'] + BT709 + ['-color_range', 'tv', '-movflags', '+faststart', mp4],
                   check=True, stderr=subprocess.DEVNULL)
    print('av1 intro', round(os.path.getsize(mp4) / 1e3), 'KB', flush=True)
    os.makedirs(os.path.join(GAME, 'h264'), exist_ok=True)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', seq,
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
                    '-vf', 'scale=960:480:out_color_matrix=bt709'] + BT709 + ['-movflags', '+faststart', '-an', os.path.join(GAME, 'h264', 'intro.mp4')], check=True)
    meta_path = os.path.join(GAME, 'cutscenes.json')
    meta = json.load(open(meta_path, encoding='utf8'))
    meta['clips'] = {'intro': {'frames': total, 'dur': round(total / FPS, 3)}, **{k: v for k, v in meta['clips'].items() if k not in ('intro', 'intro_a', 'intro_b')}}
    with open(meta_path, 'w', encoding='utf8') as f:
        json.dump(meta, f, indent=1)
    for old in ('intro_a', 'intro_b'):
        for d in (GAME, os.path.join(GAME, 'h264')):
            p = os.path.join(d, old + '.mp4')
            if os.path.exists(p):
                os.remove(p)
