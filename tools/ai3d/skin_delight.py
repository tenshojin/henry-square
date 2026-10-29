# 头部特写和整身视图：去掉照片里自带的光影，并做一张“材质图”给游戏里的皮肤着色用。
# 去光影：Marigold IID（lighting v1-1）估出整张图的光照 → 原图 ÷ 光照（线性空间；整块区域的平均亮度不变）。
#         它直接给的反照率太平（眼睛成了黑点），不用；只拿光照，原图的细节（毛孔、发丝、胡茬）都留着。
#         去哪些地方：头部特写下巴以上全去（脸、头发、头巾），下巴以下只去皮肤（脖子、胸口）；整身视图同样。
# 分区（只信正面）：MediaPipe selfie_multiclass（头发 / 身体皮肤 / 脸部皮肤 / 衣服 / 其他）+ FaceLandmarker（眼睛、嘴唇、T 区）。
#         侧面、背面它认不准（会把头巾、后脑当成皮肤），材质图只做正面，侧面和背面在贴图里从正面看到的地方往外补。
# 输出：
#   heads_albedo\名字_{front,side,back}.png、views_albedo\名字_{front,side,back}.png —— 去光影后的颜色（RGBA）
#   heads_mat\名字_front.png、views_mat\名字_front.png —— R = 皮肤（0~1，眼睛为 0）、G = 粗糙度、B = 0（不是金属）、A = 原 alpha
#   heads_mat\名字_face.png —— 整张脸的范围（人脸关键点的凸包）
#   delight\check_名字.jpg —— 对比图（原图 | 去光影 | 材质）
# 用法：python skin_delight.py [名字…]
import os, sys, json
os.environ.setdefault('HF_HOME', r'D:\ai3d\hf')
os.environ.setdefault('HF_HUB_OFFLINE', '1')
import numpy as np
import cv2
import torch
from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
from diffusers import MarigoldIntrinsicsPipeline

W = r'D:\ai3d\work'
NAMES = sys.argv[1:] or ['dicer', 'drinker', 'elder', 'barmaid']
MG_PATH = os.path.join(os.environ['HF_HOME'], 'hub', 'models--prs-eth--marigold-iid-lighting-v1-1', 'snapshots',
                       '08c3930bb641abf786ba44ce92547507ebefbc16')
GAMMA = 0.85              # 去掉多少光影（1 = 全去；留一点，脸不会平得像纸）
CLIP = 2.5                # 每个像素最多提亮/压暗几倍（很深的阴影里本来就没多少信息）
R_CLOTH, R_HAIR, R_SKIN, R_TZONE, R_LIPS, R_EYE = 0.86, 0.72, 0.52, 0.42, 0.33, 0.10
EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
TZONE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1]
LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)

seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
    base_options=mpt.BaseOptions(model_asset_path=r'D:\ai3d\mediapipe\selfie_multiclass_256x256.tflite'),
    output_category_mask=False, output_confidence_masks=True))
det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=mpt.BaseOptions(model_asset_path=r'D:\ai3d\mediapipe\face_landmarker.task'), num_faces=1))
mg = MarigoldIntrinsicsPipeline.from_pretrained(MG_PATH, variant='fp16', torch_dtype=torch.float16).to('cuda')
mg.set_progress_bar_config(disable=True)


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def square(rgba, bg=128):
    h, w = rgba.shape[:2]
    s = max(h, w)
    y0, x0 = (s - h) // 2, (s - w) // 2
    m = rgba[..., 3:4].astype(np.float32) / 255
    out = np.full((s, s, 3), bg, np.float32)
    out[y0:y0 + h, x0:x0 + w] = rgba[..., :3] * m + bg * (1 - m)
    return out.astype(np.uint8), (y0, x0, h, w)


def resize(a, w, h, interp=cv2.INTER_LINEAR):
    if a.ndim == 3 and a.shape[2] > 4:
        return np.stack([cv2.resize(a[..., i], (w, h), interpolation=interp) for i in range(a.shape[2])], -1)
    return cv2.resize(a, (w, h), interpolation=interp)


def segment(rgba):
    """六类的置信度（H×W×6）：0 背景 1 头发 2 身体皮肤 3 脸部皮肤 4 衣服 5 其他。"""
    sq, (y0, x0, h, w) = square(rgba)
    res = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(sq)))
    conf = np.stack([np.squeeze(m.numpy_view()) for m in res.confidence_masks], -1).astype(np.float32)
    if conf.shape[:2] != sq.shape[:2]:
        conf = resize(conf, sq.shape[1], sq.shape[0])
    return conf[y0:y0 + h, x0:x0 + w]


def landmarks(rgb):
    res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    if not res.face_landmarks:
        return None
    return np.array([(p.x * rgb.shape[1], p.y * rgb.shape[0]) for p in res.face_landmarks[0]], np.float32)


def poly(shape, pts, blur):
    m = np.zeros(shape, np.float32)
    cv2.fillPoly(m, [np.round(pts).astype(np.int32)], 1.0)
    return cv2.GaussianBlur(m, (0, 0), blur) if blur > 0.3 else m


def tzone(shape, lm, sigma):
    """额头中线到鼻尖这条线附近（皮肤更油、更亮）。"""
    m = np.zeros(shape, np.float32)
    cv2.polylines(m, [np.round(lm[TZONE]).astype(np.int32)], False, 1.0, thickness=max(1, int(sigma)))
    return np.clip(cv2.GaussianBlur(m, (0, 0), sigma) * 2.2, 0, 1)


def shading(rgba):
    """Marigold 估的光照亮度（线性、和输入同尺寸，只有相对大小有意义）。"""
    sq, (y0, x0, h, w) = square(rgba)
    pr = mg(Image.fromarray(sq), num_inference_steps=4, ensemble_size=3, processing_resolution=768,
            generator=torch.manual_seed(0), output_type='np')
    shd = pr.prediction[1][y0:y0 + h, x0:x0 + w].astype(np.float32)      # 0 反照率、1 光照、2 高光
    return cv2.GaussianBlur(shd @ LUM, (0, 0), 1.0)


def rows_above(shape, y_full, y_zero):
    """y_full 以上为 1、y_zero 以下为 0（中间平滑过渡）。"""
    y = np.arange(shape[0], dtype=np.float32)[:, None]
    t = np.clip((y_zero - y) / max(1.0, y_zero - y_full), 0, 1)
    return np.ascontiguousarray(np.broadcast_to(t * t * (3 - 2 * t), shape), np.float32)


def delight(rgba, k, eyes=None):
    """k（0~1）是这个像素去光影的程度；返回 (去光影后的 RGBA, 区域里的中位倍数)。区域内的平均亮度保持不变。"""
    a = rgba[..., 3].astype(np.float32) / 255
    lin = to_lin(rgba[..., :3].astype(np.float32) / 255)
    lum = shading(rgba)
    if eyes is not None:
        k = k * (1 - 0.6 * eyes)          # 眼睛只去一点（眼白提太亮会瞪眼）
    r = 1 / np.maximum(lum, 1e-4)
    Y = lin @ LUM
    sel = (k > 0.5) & (a > 0.5)
    if sel.sum() < 50:
        return rgba.copy(), 1.0
    s = 1.0
    for _ in range(6):                    # 找个整体倍数：去光影后区域里的平均亮度和原来一样
        ratio = np.clip(s * r, 1 / CLIP, CLIP) ** GAMMA
        s *= (Y[sel].mean() / (Y[sel] * ratio[sel]).mean()) ** (1 / GAMMA)
    ratio = np.clip(s * r, 1 / CLIP, CLIP) ** GAMMA
    out = lin * (1 + k * (ratio - 1))[..., None]
    alb = np.concatenate([(to_srgb(out) * 255 + 0.5).astype(np.uint8), rgba[..., 3:]], 2)
    return alb, float(np.median(ratio[sel]))


def material(rgba, conf, lm, alb=None):
    """返回 (材质 RGBA：R = 皮肤、G = 粗糙度、B = 0、A = alpha, 眼睛)。
    alb（去光影后的颜色）给了的话：皮肤范围里的胡子、眉毛、胡茬（很暗，或者发白不带颜色）不算皮肤，粗糙度按头发。"""
    H, Wd = rgba.shape[:2]
    a = rgba[..., 3] > 128
    skin = np.clip(conf[..., 2] + conf[..., 3], 0, 1) * a
    hair = conf[..., 1] * a
    eyes = np.zeros((H, Wd), np.float32)
    lips = np.zeros((H, Wd), np.float32)
    tz = np.zeros((H, Wd), np.float32)
    if lm is not None:
        fw = float(np.linalg.norm(lm[454] - lm[234]))
        eyes = np.clip(poly((H, Wd), lm[EYE_R], fw * 0.008) + poly((H, Wd), lm[EYE_L], fw * 0.008), 0, 1)
        lips = poly((H, Wd), lm[LIPS], fw * 0.01)
        tz = tzone((H, Wd), lm, fw * 0.07)
        skin = np.maximum(skin, lips)
    skin = cv2.GaussianBlur(skin, (0, 0), 1.0) * (1 - eyes)
    hairy = np.zeros((H, Wd), np.float32)
    if alb is not None:
        hsv = cv2.cvtColor(np.ascontiguousarray(alb[..., :3]), cv2.COLOR_RGB2HSV).astype(np.float32)
        S, V = hsv[..., 1] / 255, hsv[..., 2] / 255
        hairy = cv2.GaussianBlur((((S < 0.28) & (V > 0.42)) | (V < 0.24)).astype(np.float32), (0, 0), 1.5) * (1 - lips) * skin
        skin = skin - hairy
    rough = np.full((H, Wd), R_CLOTH, np.float32)
    rough += (R_HAIR - rough) * np.maximum(hair, hairy)
    rough += (R_SKIN - (R_SKIN - R_TZONE) * tz - rough) * skin
    rough += (R_LIPS - rough) * lips
    rough += (R_EYE - rough) * eyes
    mat = np.stack([skin, rough, np.zeros_like(skin)], 2)
    return np.concatenate([(mat * 255 + 0.5).astype(np.uint8), rgba[..., 3:]], 2), eyes


def flat(im):
    a = im[..., 3:].astype(np.float32) / 255
    return (im[..., :3] * a + 40 * (1 - a)).astype(np.uint8)


for d in ('heads_albedo', 'heads_mat', 'views_albedo', 'views_mat'):
    os.makedirs(os.path.join(W, d), exist_ok=True)
with open(os.path.join(W, 'heads', 'heads.json'), encoding='utf8') as f:
    crops = json.load(f)
report = {}
for name in NAMES:
    rep = report[name] = {}
    load = lambda d, v: np.asarray(Image.open(os.path.join(W, d, '%s_%s.png' % (name, v))).convert('RGBA'))
    hf = load('heads', 'front')
    conf = segment(hf)
    lm = landmarks(hf[..., :3])
    fw = float(np.linalg.norm(lm[454] - lm[234]))
    chin = float(lm[152, 1])
    y_full, y_zero = chin + 0.15 * fw, chin + 0.6 * fw
    # 头部特写：下巴以上全去（三个视图的特写都从各自头顶开始、同样放大，下巴差不多在同一行），下巴以下只去皮肤
    hmat, heyes = material(hf, conf, lm)
    skin = hmat[..., 0].astype(np.float32) / 255
    alb, rmed = delight(hf, np.maximum(rows_above(hf.shape[:2], y_full, y_zero), skin), heyes)
    hmat, _ = material(hf, conf, lm, alb)
    Image.fromarray(alb).save(os.path.join(W, 'heads_albedo', name + '_front.png'))
    Image.fromarray(hmat).save(os.path.join(W, 'heads_mat', name + '_front.png'))
    # 整张脸的范围（关键点的凸包：额头到下巴、两颊，胡子、嘴、眼睛都在里面）：建模时按照片修正脸型用
    face = np.zeros(hf.shape[:2], np.uint8)
    cv2.fillConvexPoly(face, cv2.convexHull(np.round(lm[:468]).astype(np.int32)), 255)
    Image.fromarray(face).save(os.path.join(W, 'heads_mat', name + '_face.png'))
    rep['front'] = dict(face_px=round(fw), chin=round(chin), ratio=round(rmed, 3))
    sheet = [np.concatenate([flat(hf), flat(alb), hmat[..., :3]], 1)]
    for v in ('side', 'back'):
        h = load('heads', v)
        al, rm = delight(h, rows_above(h.shape[:2], y_full, y_zero))
        Image.fromarray(al).save(os.path.join(W, 'heads_albedo', '%s_%s.png' % (name, v)))
        rep[v] = dict(ratio=round(rm, 3))
        sheet.append(np.concatenate([flat(h), flat(al)], 1))
    # 整身视图：上半身切成小块分区（整张太小认不出），头部那段直接用特写的分区缩回来
    for v in ('front', 'side', 'back'):
        b = load('views_face', v)
        cr = crops[name]['crops'][v]
        kk = cr['k']
        above = rows_above(b.shape[:2], cr['top'] + y_full / kk, cr['top'] + y_zero / kk)
        if v == 'front':
            rows = np.nonzero((b[..., 3] > 128).any(1))[0]
            t0, t1 = int(rows[0]), int(rows[-1])
            bconf = np.zeros(b.shape[:2] + (6,), np.float32)
            bconf[..., 4] = 1.0
            bw = b.shape[1]
            for top in range(t0, t0 + int(0.55 * (t1 - t0)), bw // 2):
                sl = slice(top, min(b.shape[0], top + bw))
                c = segment(b[sl])
                bconf[sl] = c if top == t0 else np.maximum(bconf[sl], c)
            hb = resize(conf, int(round(conf.shape[1] / kk)), int(round(conf.shape[0] / kk)), cv2.INTER_AREA)
            c0, top = int(round(cr['c0'])), cr['top']
            hh, ww = min(hb.shape[0], b.shape[0] - top), min(hb.shape[1], bw - c0)
            bconf[top:top + hh, c0:c0 + ww] = hb[:hh, :ww]
            blm = lm / kk + np.array([cr['c0'], cr['top']], np.float32)
            bmat, beyes = material(b, bconf, blm)
            balb, _ = delight(b, np.maximum(bmat[..., 0].astype(np.float32) / 255, above), beyes)
            bmat, _ = material(b, bconf, blm, balb)
            Image.fromarray(bmat).save(os.path.join(W, 'views_mat', name + '_front.png'))
            sheet.append(np.concatenate([flat(b), flat(balb), bmat[..., :3]], 1))
        else:
            balb, _ = delight(b, above)
        Image.fromarray(balb).save(os.path.join(W, 'views_albedo', '%s_%s.png' % (name, v)))
    wmax = max(s.shape[1] for s in sheet)
    sheet = np.concatenate([np.pad(s, ((0, 0), (0, wmax - s.shape[1]), (0, 0))) for s in sheet], 0)
    Image.fromarray(sheet).save(os.path.join(W, 'delight', 'check_%s.jpg' % name), quality=90)
    print(name, rep, flush=True)
with open(os.path.join(W, 'skin_delight.json'), 'w', encoding='utf8') as f:
    json.dump(report, f, indent=1)
