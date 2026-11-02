# 界面的材质贴图（v3.4 中世纪风）：羊皮纸、压纹皮革、金箔，都是可以无缝平铺的小图（WebP），build.mjs 把它们写成 CSS 变量。
# 噪声在频域里生成（随机相位 + 1/f 频谱），天然首尾相接，平铺看不出接缝。
# 用法：python make_textures.py 输出目录(assets/ui)
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1404)


def noise(n, beta=2.0, fmin=1, fmax=None, aniso=1.0):
    """可平铺的 1/f^beta 噪声（均值 0、标准差 1）；aniso>1 时横向拉长（纤维）。"""
    fx = np.fft.fftfreq(n) * n
    FX, FY = np.meshgrid(fx, fx)
    f = np.hypot(FX / aniso, FY)
    amp = np.where(f >= fmin, 1 / np.maximum(f, 1e-6) ** (beta / 2), 0)
    if fmax:
        amp *= np.exp(-(f / fmax) ** 2)
    ph = np.exp(2j * np.pi * rng.random((n, n)))
    a = np.real(np.fft.ifft2(amp * ph))
    return (a - a.mean()) / a.std()


def save(rgb, name, q=82):
    Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name), 'WEBP', quality=q, method=6)
    print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')


# ---------- 羊皮纸：大块的深浅不匀 + 横向纤维 + 细颗粒 + 零星的褐色斑点 ----------
N = 512
blot = noise(N, 2.6, 1, 14)
mid = noise(N, 2.0, 6, 60)
fib = noise(N, 1.2, 20, 200, aniso=6)
grain = noise(N, 0.5, 60)
spots = np.clip(noise(N, 1.0, 30, 120) - 2.6, 0, None)
L = 1 + 0.026 * blot + 0.016 * mid + 0.03 * fib + 0.014 * grain - 0.08 * spots
base = np.array([226, 206, 166], np.float32)
warm = np.array([204, 170, 118], np.float32)  # 暗处偏褐
w = np.clip(-blot * 0.16 + 0.12, 0, 1)[..., None]
col = (base * (1 - w) + warm * w) * L[..., None]
save(col, 'parchment.webp', 80)

# ---------- 皮革：卵石状的压纹（细胞噪声）+ 低频的深浅，左上来光的浮雕 ----------
N = 256
pts = rng.random((520, 2)) * N
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
d1 = np.full((N, N), 1e9, np.float32)
d2 = np.full((N, N), 1e9, np.float32)
for ox in (-N, 0, N):
    for oy in (-N, 0, N):
        for px, py in pts:
            d = np.hypot(xx - (px + ox), yy - (py + oy))
            m = d < d1
            d2 = np.where(m, d1, np.minimum(d2, d))
            d1 = np.where(m, d, d1)
cell = np.clip((d2 - d1) / 3.5, 0, 1)  # 纹路的沟里是 0
h = ndimage.gaussian_filter(cell, 0.8, mode='wrap') * 0.6 + 0.12 * noise(N, 1.5, 4, 80)
gy, gx = np.gradient(h)
shade = 1 + (-gx * 0.7 - gy * 0.7) * 0.9
tone = 1 + 0.07 * noise(N, 2.4, 1, 10)
base = np.array([72, 42, 24], np.float32)
col = base * (shade * tone * (0.88 + 0.12 * cell))[..., None]
save(col, 'leather.webp', 80)

# ---------- 金箔：一张张方形金箔接缝 + 细微起伏（文字和描边用，CSS 再叠金色渐变） ----------
N = 128
tile = 32
sheet = rng.random((N // tile, N // tile))
sh = np.kron(sheet, np.ones((tile, tile)))
sh = ndimage.gaussian_filter(sh, 0.8, mode='wrap')
seam = np.zeros((N, N), np.float32)
seam[::tile, :] = 1
seam[:, ::tile] = 1
seam = ndimage.gaussian_filter(seam, 0.7, mode='wrap')
crack = np.clip(noise(N, 1.2, 8, 50) - 1.8, 0, None)
L = 1 + 0.05 * (sh - 0.5) - 0.05 * seam - 0.1 * crack + 0.04 * noise(N, 1.0, 10)
col = np.array([226, 182, 92], np.float32) * L[..., None]
save(col, 'gold.webp', 85)
