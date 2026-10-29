# 设定图正面的脸很小（原图约 30 像素宽），放大后是糊的：
# MediaPipe 找出眼睛、鼻尖、嘴角 → 按 FFHQ 五点模板对齐成 512×512 → GFPGAN v1.4 修复 → 反变换贴回（边缘羽化）。
# 输出：views_face\名字_front.png（4 倍视图，脸已修复，其余同 views_sr）
#       heads\名字_{front,side,back}.png（头部特写：8 倍、从头顶到肩膀，正面的脸用修复后的原分辨率贴回）+ heads\heads.json（裁切位置）
# 用法：python restore_faces.py
import os, json
import numpy as np
import cv2
import torch
from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision
from spandrel import ModelLoader

SRC = r'D:\ai3d\work\views_sr'
OUT = r'D:\ai3d\work\views_face'
HEADS = r'D:\ai3d\work\heads'
NAMES = ['dicer', 'drinker', 'elder', 'barmaid']
T5 = np.array([[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935],
               [201.26117, 371.41043], [313.08905, 371.15118]], np.float32)
HEAD_FRAC = 0.24          # 头部特写：从头顶往下取身高的 24%（到肩膀）
K = 2                     # 头部特写再放大 2 倍（相对 4 倍视图 = 原图 8 倍）
os.makedirs(OUT, exist_ok=True)
os.makedirs(HEADS, exist_ok=True)
det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=mpt.BaseOptions(model_asset_path=r'D:\ai3d\mediapipe\face_landmarker.task'), num_faces=1))
model = ModelLoader().load_from_file(r'D:\ai3d\gfpgan\GFPGANv1.4.pth').model.cuda().eval()


def five_points(rgb, top, bottom):
    """头部那一段放大 4 倍再检测（脸太小 MediaPipe 找不到），返回五点（视图坐标）。"""
    head = rgb[top:bottom]
    k = 4
    big = cv2.resize(head, (head.shape[1] * k, head.shape[0] * k), interpolation=cv2.INTER_CUBIC)
    res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(big)))
    if not res.face_landmarks:
        return None
    lm = np.array([(p.x * big.shape[1] / k, p.y * big.shape[0] / k + top) for p in res.face_landmarks[0]], np.float32)
    return np.array([lm[[33, 133]].mean(0), lm[[263, 362]].mean(0), lm[1], lm[61], lm[291]], np.float32)


def restore(rgb, pts, scale=1.0):
    """修复后按 scale 倍的视图尺寸贴回去：返回 (贴回后的图, 修复的 512 脸)。"""
    M, _ = cv2.estimateAffinePartial2D(pts, T5, method=cv2.LMEDS)
    face = cv2.warpAffine(rgb, M, (512, 512), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    t = torch.from_numpy(face.astype(np.float32) / 255).permute(2, 0, 1)[None].cuda() * 2 - 1
    with torch.no_grad():
        out = model(t)[0]
    rest = ((out[0].permute(1, 2, 0).clamp(-1, 1) + 1) * 127.5).cpu().numpy().astype(np.float32)
    S = np.diag([scale, scale, 1.0])
    Mi = cv2.invertAffineTransform(M)
    Mi = (S @ np.vstack([Mi, [0, 0, 1]]))[:2]
    H, W = int(rgb.shape[0] * scale), int(rgb.shape[1] * scale)
    back = cv2.warpAffine(rest, Mi, (W, H), flags=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    mask = np.zeros((512, 512), np.float32)
    cv2.ellipse(mask, (256, 290), (190, 225), 0, 0, 360, 1.0, -1)   # 脸的椭圆（含额头到下巴），不碰头发
    mask = cv2.GaussianBlur(mask, (0, 0), 18)
    mb = cv2.warpAffine(mask, Mi, (W, H), flags=cv2.INTER_LINEAR)[..., None]
    base = cv2.resize(rgb, (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32) if scale != 1 else rgb.astype(np.float32)
    return (base * (1 - mb) + back * mb).clip(0, 255).astype(np.uint8), rest.astype(np.uint8)


info = {}
for name in NAMES:
    views = {v: np.asarray(Image.open(os.path.join(SRC, '%s_%s.png' % (name, v))).convert('RGBA')) for v in ('front', 'side', 'back')}
    fr = views['front']
    rows = np.nonzero((fr[..., 3] > 128).any(1))[0]
    r0, r1 = int(rows[0]), int(rows[-1])
    pts = five_points(np.ascontiguousarray(fr[..., :3]), r0, r0 + int(0.2 * (r1 - r0)))
    if pts is None:
        print(name, 'NO FACE', flush=True)
        continue
    full, face512 = restore(np.ascontiguousarray(fr[..., :3]), pts)
    Image.fromarray(np.concatenate([full, fr[..., 3:]], 2)).save(os.path.join(OUT, name + '_front.png'))
    Image.fromarray(face512).save(os.path.join(HEADS, name + '_face512.png'))
    for v in ('side', 'back'):
        Image.fromarray(views[v]).save(os.path.join(OUT, '%s_%s.png' % (name, v)))
    # 头部特写（三个视图）：从各自的头顶往下 HEAD_FRAC 身高，放大 K 倍；正面的脸按 K 倍重新贴（修复结果不损失）
    crops = {}
    for v, img in views.items():
        rr = np.nonzero((img[..., 3] > 128).any(1))[0]
        t0, t1 = int(rr[0]), int(rr[-1])
        bot = t0 + int(HEAD_FRAC * (t1 - t0))
        if v == 'front':
            big, _ = restore(np.ascontiguousarray(img[..., :3]), pts, scale=K)
            big = big[t0 * K:bot * K]
        else:
            big = cv2.resize(np.ascontiguousarray(img[t0:bot, :, :3]), (img.shape[1] * K, (bot - t0) * K), interpolation=cv2.INTER_LANCZOS4)
        a = cv2.resize(np.ascontiguousarray(img[t0:bot, :, 3]), (img.shape[1] * K, (bot - t0) * K), interpolation=cv2.INTER_LINEAR)
        cols = np.nonzero((a > 128).any(0))[0]
        c0, c1 = max(0, int(cols[0]) - 16), min(a.shape[1], int(cols[-1]) + 16)
        crop = np.concatenate([big[:, c0:c1], a[:, c0:c1, None]], 2)
        Image.fromarray(crop).save(os.path.join(HEADS, '%s_%s.png' % (name, v)))
        crops[v] = dict(top=t0, bottom=bot, c0=c0 / K, c1=c1 / K, k=K)
    info[name] = dict(points=pts.round(1).tolist(), crops=crops)
    print(name, 'face at', pts[2].round(1).tolist(), flush=True)
with open(os.path.join(HEADS, 'heads.json'), 'w', encoding='utf8') as f:
    json.dump(info, f, indent=1)
