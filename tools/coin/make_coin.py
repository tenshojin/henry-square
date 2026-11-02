# 亨利酒馆的格罗申（v3.4）：正面亚历山大大帝头像，背面十字 + 王冠 + 骰子，生成游戏用的贴图。
# 头像（准备步骤，结果放在头像目录里）：
#   1. python make_coin.py --blank 头像目录：画一块空白的石膏圆章 blank.png（1024×1024，平面半径 = 0.46×0.93×1024 像素）
#   2. Qwen-Image-Edit-2511 在圆章上雕出浮雕（tools/anim/comfy.py 的 qwen_edit，种子 12，存成 alex_s12.png），提示词：
#      Sculpt a finely detailed bas-relief portrait into the centre of this round plaster medallion: the head of Alexander the Great
#      in right-facing profile, as on an ancient Greek silver tetradrachm. A young idealized face with a straight nose, a strong chin
#      and full lips, the eye gazing slightly upward, thick wavy locks of hair swept up and back from the forehead, a royal diadem
#      ribbon tied around the head with its two ends fluttering behind the neck, and the curled ram's horn of Zeus-Ammon spiralling
#      around the ear. The head and neck fill most of the medallion. The flat background around the head is smooth and empty:
#      no letters, no text, no beads, no border decorations. Matte white plaster cast, high relief with crisp sculpted detail,
#      photographed straight from above with soft light from the upper left, sharp focus.
#   3. Marigold normals v1-1（D:\ai3d 的环境，processing_resolution=1024、ensemble_size=6、种子 7）估出每个像素的朝向，存成 alex_n1024.npy
#   这里再用 Frankot–Chellappa 把法线积分成高度图（算包浆、粗糙度用），头像的法线贴图直接用 Marigold 的。
# 外圈的珠串、拉丁铭文（字体 Cinzel）、背面的十字和纹样都用程序画成高度图，边缘是斜面（像压出来的一样锐利）。
# 输出（1024×1024，WebP）：
#   *_color  颜色（银色 + 凹处的包浆 + 靠近外圈一点点暖色氧化）
#   *_normal 法线（x 向右、y 向上、z 朝外；头像部分直接用 Marigold 的法线，细节最多）
#   *_orm    R 环境遮蔽、G 粗糙度（凸起处被磨亮更光滑）、B 金属度（包浆处低一些）
#   edge_normal 币边的锤打纹；icon_heads / icon_cross 界面上用的小图（160×160，带透明）
# 币的外圈凸边由游戏里的几何体做（src/render/groschen.js），贴图只画半径 0.915 以内。
# 用法：python make_coin.py 头像目录(有 alex_s12.png、alex_n1024.npy) 输出目录(assets/coin)
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
import cv2

if sys.argv[1] == '--blank':
    # 空白石膏圆章：平的场 + 一圈凸起的边，左上来光
    S = 1024
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.hypot(x - (S - 1) / 2, y - (S - 1) / 2) / (S * 0.46)
    h = np.where(r < 0.93, 0.0, np.where(r < 1.0, 0.04 * np.clip((r - 0.93) / 0.02, 0, 1), -1))
    gy, gx = np.gradient(h * S * 0.46)
    n = np.dstack([-gx, -gy, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = np.array([-0.5, -0.6, 0.62])
    shade = np.clip(n @ (L / np.linalg.norm(L)), 0, 1) * 0.55 + 0.45
    img = np.where((r < 1.0)[..., None], np.array([232, 226, 214], np.float32) * shade[..., None], np.array([52, 50, 48], np.float32))
    Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(os.path.join(sys.argv[2], 'blank.png'))
    sys.exit()

SRC, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '..', '..', 'node_modules', '@fontsource', 'cinzel', 'files', 'cinzel-latin-700-normal.woff')
N = 2048            # 工作分辨率，输出缩到一半
C = (N - 1) / 2
R = N / 2           # 币的半径（像素）
os.makedirs(OUT, exist_ok=True)

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
DX, DY = (xx - C) / R, (yy - C) / R
RR = np.hypot(DX, DY)
TH = np.arctan2(DX, -DY)  # 从正上方顺时针量的角度


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def bevel(mask, height, width):
    """二值图形 → 平顶 + 斜边的浮雕（width 像素宽的斜面）。"""
    d = ndimage.distance_transform_edt(mask)
    return height * smooth(0, width, d)


def beads(r0, n, rb, h):
    """一圈珠子（半球）。"""
    step = 2 * math.pi / n
    a = np.round(TH / step) * step
    cx, cy = np.sin(a) * r0, -np.cos(a) * r0
    d = np.hypot(DX - cx, DY - cy) / rb
    return h * np.sqrt(np.clip(1 - d * d, 0, 1))


def ring(r0, w, h):
    """一条细的凸线圈（圆润的截面）。"""
    d = (RR - r0) / w
    return h * np.sqrt(np.clip(1 - d * d, 0, 1))


def cross_patee(draw, cx, cy, s, rot=0.0):
    """小的十字（四臂外张），铭文开头用。"""
    pts = []
    for k in range(4):
        a = rot + k * math.pi / 2
        for u, v in ((0.16, 0.12), (1.0, 0.42), (1.0, -0.42), (0.16, -0.12)):
            x, y = u * math.sin(a) + v * math.cos(a), -u * math.cos(a) + v * math.sin(a)
            pts.append((cx + x * s, cy + y * s))
    draw.polygon(pts, fill=255)


def legend(text, r_mid, cap, h, bevel_w=3.5):
    """沿圆周写铭文：顺时针，字头朝外，从正上方的十字开始，整圈均匀铺满。"""
    font = ImageFont.truetype(FONT, int(cap * R * 1.42))
    glyphs = []
    for ch in text:
        if ch == '+':
            glyphs.append(('+', cap * R * 1.05))
        else:
            b = font.getbbox(ch)
            glyphs.append((ch, b[2] - b[0]))
    rpx = r_mid * R
    total = sum(w for _, w in glyphs) / rpx
    gap = (2 * math.pi - total) / len(glyphs)
    mask = Image.new('L', (N, N), 0)
    a = -glyphs[0][1] / rpx / 2  # 第一个字（十字）正好在最上面
    for ch, w in glyphs:
        a_mid = a + w / rpx / 2
        cx, cy = C + math.sin(a_mid) * rpx, C - math.cos(a_mid) * rpx
        if ch == '+':
            cross_patee(ImageDraw.Draw(mask), cx, cy, cap * R * 0.5, a_mid)
        else:
            size = int(cap * R * 3)
            tile = Image.new('L', (size, size), 0)
            td = ImageDraw.Draw(tile)
            b = font.getbbox(ch)
            # 大写字母的上下居中按字母高度，冒号这类标点按自己居中
            top, bot = (b[1], b[3]) if ch in ':·' else font.getbbox('H')[1::2]
            td.text((size / 2 - (b[0] + b[2]) / 2, size / 2 - (top + bot) / 2), ch, font=font, fill=255)
            tile = tile.rotate(-math.degrees(a_mid), resample=Image.BICUBIC)
            mask.paste(tile, (int(round(cx - size / 2)), int(round(cy - size / 2))), tile)
        a += w / rpx + gap
    m = np.asarray(mask, np.float32) / 255 > 0.5
    return bevel(m, h, bevel_w)


def poly_mask(fn):
    im = Image.new('L', (N, N), 0)
    fn(ImageDraw.Draw(im))
    return np.asarray(im, np.float32) / 255 > 0.5


# ---------- 正面：头像 ----------
def portrait():
    n = np.load(os.path.join(SRC, 'alex_n1024.npy')).astype(np.float32)
    S = n.shape[0]
    c_ai = (S - 1) / 2
    f_ai = S * 0.46 * 0.93          # 空白圆章（tools/coin 的 blank.png）里平面部分的半径
    nz = np.maximum(n[..., 2], 0.2)
    p, q = -n[..., 0] / nz, n[..., 1] / nz  # dH/d列、dH/d行（法线的 y 朝上，行往下）
    ry, rx = np.mgrid[0:S, 0:S].astype(np.float32)
    keep = np.hypot(rx - c_ai, ry - c_ai) < f_ai * 0.985  # 去掉圆章自己的边
    p, q = p * keep, q * keep
    f_c = 0.69 * R                  # 圆章的平面对到币上内圈线以内
    s = f_c / f_ai
    mx, my = c_ai + (xx - C) / s, c_ai + (yy - C) / s
    P = ndimage.map_coordinates(p, [my, mx], order=1, mode='constant')
    Q = ndimage.map_coordinates(q, [my, mx], order=1, mode='constant')
    # Frankot–Chellappa：频域里解 ∇H = (P, Q)
    wx = np.fft.fftfreq(N) * 2 * np.pi
    WX, WY = np.meshgrid(wx, wx)
    den = WX ** 2 + WY ** 2
    den[0, 0] = 1
    Hf = (-1j * WX * np.fft.fft2(P) - 1j * WY * np.fft.fft2(Q)) / den
    Hf[0, 0] = 0
    H = np.real(np.fft.ifft2(Hf))
    # 去掉积分的漂移：在平的底面上拟合一个二次曲面减掉
    field = RR < 0.69
    flat = field & (np.hypot(P, Q) < 0.04)
    for _ in range(3):
        bg = flat & (H < np.percentile(H[flat], 60))
        A = np.stack([np.ones(bg.sum()), DX[bg], DY[bg], DX[bg] ** 2, DY[bg] ** 2, DX[bg] * DY[bg]], 1)
        coef = np.linalg.lstsq(A, H[bg], rcond=None)[0]
        base = coef[0] + coef[1] * DX + coef[2] * DY + coef[3] * DX ** 2 + coef[4] * DY ** 2 + coef[5] * DX * DY
        H = H - base
    H = np.clip(H, 0, None) * field
    k = 30.0 / np.percentile(H[field], 99.7)  # 头像最高处约 30 像素（约 0.4 毫米）
    print('portrait relief max', round(float(H.max()), 1), 'px  scale', round(k, 3))
    return H * k, P * k * field, Q * k * field


def crown(draw, cx, cy, s):
    pts = [(-34, 18), (-38, -8), (-24, 2), (-18, -22), (-8, 0), (0, -30), (8, 0), (18, -22), (24, 2), (38, -8), (34, 18)]
    draw.polygon([(cx + x * s, cy + y * s) for x, y in pts], fill=255)
    draw.rectangle([cx - 36 * s, cy + 20 * s, cx + 36 * s, cy + 28 * s], fill=255)
    for x, y, r in ((-38, -12, 4.5), (-18, -26, 4.5), (0, -35, 5.5), (18, -26, 4.5), (38, -12, 4.5)):
        draw.ellipse([cx + (x - r) * s, cy + (y - r) * s, cx + (x + r) * s, cy + (y + r) * s], fill=255)


def reverse_center():
    """背面：外张十字（四臂从中心往外变宽，侧边内凹，沿边刻一道细线）+ 中心圆钮 + 两个王冠 + 两个骰子（五点）。"""
    H = np.zeros((N, N), np.float32)
    w0, w1, L = 0.055, 0.17, 0.64

    def cross(d):
        for k in range(4):
            a = k * math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            def pt(u, v):
                return (C + (u * sa + v * ca) * R, C + (-u * ca + v * sa) * R)
            us = np.linspace(0, L, 40)
            half = w0 + (w1 - w0) * (us / L) ** 1.6
            end = [(L - 0.03 * (1 - (v / w1) ** 2), v) for v in np.linspace(-w1, w1, 15)]  # 末端微微内凹
            d.polygon([pt(u, -h) for u, h in zip(us, half)] + [pt(u, v) for u, v in end] + [pt(u, h) for u, h in zip(us[::-1], half[::-1])], fill=255)
    m = poly_mask(cross)
    dist = ndimage.distance_transform_edt(m)
    groove = np.sqrt(np.clip(1 - ((dist - 0.024 * R) / (0.0045 * R)) ** 2, 0, 1))
    H = np.maximum(H, bevel(m, 16, 4) - 5 * groove)
    # 中心圆钮：凸起的圆盘中间压一圈
    boss = bevel(RR < 0.075, 20, 5) - 6 * ring(0.045, 0.012, 1)
    H = np.maximum(H, boss)
    for k, kind in enumerate(('crown', 'die', 'crown', 'die')):
        a = math.pi / 4 + k * math.pi / 2
        cx, cy = C + math.sin(a) * 0.4 * R, C - math.cos(a) * 0.4 * R
        if kind == 'crown':
            H = np.maximum(H, bevel(poly_mask(lambda d: crown(d, cx, cy, 0.0034 * R)), 13, 3))
        else:
            half = 0.085 * R
            sq = poly_mask(lambda d: d.rounded_rectangle([cx - half, cy - half, cx + half, cy + half], radius=0.025 * R, fill=255))
            die = bevel(sq, 14, 3.5)
            for px, py in ((-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)):
                d = np.hypot(xx - (cx + px * 0.045 * R), yy - (cy + py * 0.045 * R)) / (0.017 * R)
                die -= 8 * np.sqrt(np.clip(1 - d * d, 0, 1))
            H = np.maximum(H, die * sq)
    return H


def finish(name, H, P=None, Q=None):
    """高度（+ 头像的斜率）→ 法线、颜色、ORM，缩到 1024 存 WebP。"""
    H = H.astype(np.float32)
    gx = cv2.Sobel(H, cv2.CV_32F, 1, 0, ksize=3) / 8
    gr = cv2.Sobel(H, cv2.CV_32F, 0, 1, ksize=3) / 8
    if P is not None:
        # 头像区域用 Marigold 的斜率（比积分出来的高度再求导细节多）
        w = smooth(0.66, 0.69, RR)
        gx = gx * w + P * (1 - w)
        gr = gr * w + Q * (1 - w)
    nrm = np.dstack([-gx, gr, np.ones_like(gx)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    # 凹处：周围比自己高多少（大、小两个尺度），越凹包浆越重
    cav = np.clip((ndimage.gaussian_filter(H, 5) - H) / 6, 0, 1) * 0.7 + np.clip((ndimage.gaussian_filter(H, 18) - H) / 10, 0, 1) * 0.5
    cav = np.clip(cav, 0, 1)
    hi = np.clip(H / 22, 0, 1)                       # 凸起的高处：被摸亮
    rng = np.random.default_rng(7 if name == 'obverse' else 8)
    noise = ndimage.gaussian_filter(rng.standard_normal((N, N)).astype(np.float32), 1.2) * 0.9
    blot = ndimage.gaussian_filter(rng.standard_normal((N, N)).astype(np.float32), 40) * 14
    silver_hi = np.array([238, 237, 232], np.float32)
    silver_lo = np.array([196, 193, 186], np.float32)
    patina = np.array([62, 56, 48], np.float32)
    col = silver_lo + (silver_hi - silver_lo) * hi[..., None]
    col = col * (1 - 0.82 * cav[..., None]) + patina * (0.82 * cav[..., None])
    tone = smooth(0.62, 0.92, RR) * 0.14 + np.clip(blot, 0, None) * 0.004
    col = col * (1 - tone[..., None]) + np.array([214, 178, 120], np.float32) * tone[..., None]  # 靠外圈一点点金褐色氧化
    col *= (1 + noise * 0.035)[..., None]
    rough = 0.30 - 0.13 * hi + 0.30 * cav + noise * 0.035
    metal = 1 - 0.55 * cav
    ao = 1 - 0.55 * cav
    # 外圈凸边（几何体做的）那一片：磨得最亮
    rim = RR > 0.915
    col[rim] = silver_hi
    rough[rim] = 0.17
    metal[rim] = 1
    ao[rim] = 1
    nrm[rim] = (0, 0, 1)

    def save(a, path, lossless=False):
        im = cv2.resize(a, (N // 2, N // 2), interpolation=cv2.INTER_AREA)
        Image.fromarray(np.clip(im + 0.5, 0, 255).astype(np.uint8)).save(path, 'WEBP', quality=92, lossless=lossless, method=6)
        return im

    save(col, os.path.join(OUT, name + '_color.webp'))
    small = cv2.resize(nrm, (N // 2, N // 2), interpolation=cv2.INTER_AREA)
    small /= np.linalg.norm(small, axis=2, keepdims=True)
    Image.fromarray(np.clip((small * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '_normal.webp'), 'WEBP', quality=95, method=6)
    save(np.dstack([ao, np.clip(rough, 0.08, 1), metal]) * 255, os.path.join(OUT, name + '_orm.webp'))
    # 界面用的小图：左上方来光的简单着色（漫反射 + 高光 + 环境里的暖色）
    L = np.array([-0.45, 0.55, 0.7], np.float32)
    L /= np.linalg.norm(L)
    Hh = (L + np.array([0, 0, 1], np.float32))
    Hh /= np.linalg.norm(Hh)
    diff = np.clip(nrm @ L, 0, 1)
    spec = np.clip(nrm @ Hh, 0, 1) ** (2 / np.clip(rough, 0.08, 1) ** 2)
    env = 0.55 + 0.45 * nrm[..., 1]
    shade = col / 255 * (0.25 + 0.55 * diff + 0.35 * env)[..., None] * ao[..., None] + (spec * 0.9 * metal)[..., None]
    alpha = smooth(1.0, 0.996, RR) * 255
    icon = np.dstack([np.clip(shade, 0, 1) * 255, alpha])
    Image.fromarray(cv2.resize(icon, (160, 160), interpolation=cv2.INTER_AREA).astype(np.uint8), 'RGBA').save(
        os.path.join(OUT, 'icon_' + ('heads' if name == 'obverse' else 'cross') + '.webp'), 'WEBP', quality=90, method=6)
    Image.fromarray(np.clip(np.dstack([shade, smooth(1.0, 0.996, RR)]) * 255, 0, 255).astype(np.uint8), 'RGBA').resize((768, 768), Image.LANCZOS).save(
        os.path.join(SRC, 'preview_' + name + '.png'))
    print(name, 'height max', round(float(H.max()), 1))


common = beads(0.885, 110, 0.0115, 10) + ring(0.705, 0.0055, 8)
Hp, P, Q = portrait()
obv = np.maximum(common, legend('+ALEXANDER:MAGNVS:REX:MACEDONVM:', 0.795, 0.105, 14))
obv = np.maximum(obv, Hp)
finish('obverse', obv, P, Q)
rev = np.maximum(common, legend('+GROSSVS:DE:TABERNA:HENRICI:', 0.795, 0.11, 14))
rev = np.maximum(rev, reverse_center())
finish('reverse', rev)

# 币边：竖向的锤打纹（横向循环）
rng = np.random.default_rng(3)
W, Hh = 1024, 32
e = ndimage.gaussian_filter1d(rng.standard_normal(W).astype(np.float32), 2.5, mode='wrap') * 3
e += ndimage.gaussian_filter1d(rng.standard_normal(W).astype(np.float32), 12, mode='wrap') * 6
g = np.gradient(np.concatenate([e[-1:], e, e[:1]]))[1:-1]
en = np.dstack([np.tile(-g, (Hh, 1)), np.zeros((Hh, W)), np.ones((Hh, W))]).astype(np.float32)
en /= np.linalg.norm(en, axis=2, keepdims=True)
Image.fromarray(np.clip((en * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'edge_normal.webp'), 'WEBP', quality=92, method=6)
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
