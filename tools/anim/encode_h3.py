# 过场动画的最后一步：把 finish_h3.py 处理好的帧（工作目录/fc）压成游戏素材，写 cutscenes.json。单独一步，调压缩参数时不用重跑校色。
#   - AV1（打包时内嵌进单文件）+ H.264 小文件（手机和放不了 AV1 的浏览器用，放在网站目录里按需加载）
#   - 整段只有开头一个关键帧：中途再来一个关键帧，静止的背景会被重新画一遍，画面轻轻一跳
#   - 坐着的循环把尾巴和开头交叉淡化，循环时看不出接缝；循环和小动作再算出“人回到坐姿”的时段，游戏切走之前先放到这里
# 用法：python encode_h3.py picks.json 工作目录 游戏素材目录(assets/cutscenes)
import ctypes, json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image

# 压视频很吃 CPU：调成低优先级（子进程跟着），同时开着别的任务时让着它们
if os.name == 'nt':
    ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000)
PICKS, OUT, GAME = sys.argv[1:4]
FFMPEG = r'D:\tools\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
FPS, XF = 48, 9
W, H = 1280, 640
CRF = 42  # 36 / 32 循环首尾的差并不会变小，文件却大一半（实测 idle_barmaid：42 档 313 KB，32 档 638 KB）
GOP = '999'  # 比最长的片段还长 = 只有开头一个关键帧（实测最大单帧跳动 0.81 → 0.18，文件还小四分之一）
BT709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']
picks = json.load(open(PICKS, encoding='utf8'))


def frames(d):
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.png')]


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


def fresh(d):
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    return d


def rest_windows(fs, ref):
    """人回到坐姿的时段（秒）：人物区域和接缝画面差得不多的连续几段。"""
    box = (int(.33 * W), int(.12 * H), int(.70 * W), int(.72 * H))
    small = lambda p: np.asarray(Image.open(p).crop(box).convert('L').resize((237, 192), Image.BILINEAR), dtype=np.float32)
    r = small(ref)
    d = np.array([np.abs(small(f) - r).mean() for f in fs])
    lo = np.percentile(d, 10)
    cut = lo + 0.22 * (d.max() - lo)
    out, start = [], None
    for i, v in enumerate(list(d) + [1e9]):
        if v <= cut and start is None:
            start = i
        elif v > cut and start is not None:
            if i - start >= FPS * 0.15 or start == 0 or i == len(d):
                out.append([round(start / FPS, 2), round((i - 1) / FPS, 2)])
            start = None
    return out


def out_time(name, t):
    """源片里的第 t 秒在成片里是第几秒（声音表用）"""
    warp = picks[name].get('warp')
    return float(np.interp(t, [w[0] for w in warp], [w[1] for w in warp])) if warp else t


clips = sorted(os.listdir(os.path.join(OUT, 'fc')))
os.makedirs(os.path.join(GAME, 'h264'), exist_ok=True)
meta = {'fps': FPS, 'size': [W, H], 'xf': XF, 'codec': 'video/mp4; codecs="av01.0.08M.10"', 'clips': {}}
path = os.path.join(GAME, 'cutscenes.json')
if os.path.exists(path):
    kept = json.load(open(path, encoding='utf8'))
    meta['clips'].update({k: v for k, v in kept['clips'].items() if k not in clips})
total = 0
for c in clips:
    fs = frames(os.path.join(OUT, 'fc', c))
    d = fresh(os.path.join(OUT, 'enc', c))
    if c.startswith('idle_'):
        n = len(fs)
        mid = fs[XF:n - XF]
        for j, f in enumerate(mid):
            os.link(f, os.path.join(d, '%05d.png' % j))
        for j in range(XF):
            x = (j + 1) / (XF + 1)
            a = load(fs[n - XF + j]) * (1 - x) + load(fs[j]) * x
            Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(d, '%05d.png' % (len(mid) + j)))
        count = len(mid) + XF
    else:
        for j, f in enumerate(fs):
            os.link(f, os.path.join(d, '%05d.png' % j))
        count = len(fs)
    seq = os.path.join(d, '%05d.png')
    mp4 = os.path.join(GAME, c + '.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', seq,
                    '-c:v', 'libsvtav1', '-preset', '4', '-crf', str(CRF), '-pix_fmt', 'yuv420p10le', '-g', GOP,
                    # 色彩标记要另外写进 AV1 码流（只给 -color_primaries 之类，SVT-AV1 只记下矩阵）
                    '-svtav1-params', 'scd=0:color-primaries=1:transfer-characteristics=1:matrix-coefficients=1:color-range=0',
                    '-vf', 'scale=out_color_matrix=bt709:out_range=tv'] + BT709 + ['-color_range', 'tv', '-movflags', '+faststart', mp4],
                   check=True, stderr=subprocess.DEVNULL)
    meta['clips'][c] = {'frames': count, 'dur': round(count / FPS, 3)}
    if c.startswith(('idle_', 'act_')):
        meta['clips'][c]['rest'] = rest_windows(frames(d), os.path.join(OUT, 'seam', c.split('_')[1] + '.png'))
    if picks.get(c, {}).get('sfx'):
        meta['clips'][c]['sfx'] = [[round(out_time(c, e[0]), 2)] + e[1:] for e in picks[c]['sfx']]
    total += os.path.getsize(mp4)
    print('av1', c, count, 'frames', round(os.path.getsize(mp4) / 1e3), 'KB', flush=True)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', seq,
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-g', GOP, '-keyint_min', GOP, '-sc_threshold', '0',
                    '-vf', 'scale=960:480:out_color_matrix=bt709'] + BT709 + ['-movflags', '+faststart', '-an', os.path.join(GAME, 'h264', c + '.mp4')], check=True)
with open(path, 'w', encoding='utf8') as f:
    json.dump(meta, f, indent=1)
print('game clips', len(meta['clips']), round(total / 1e6, 2), 'MB')
