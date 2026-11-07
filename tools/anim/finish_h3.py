# H3 片段 → 游戏素材（v6 起，代替 finish_clips.py）。
#   1. 取帧：1408×704 / 24 帧每秒，缩到游戏的 1280×640，做时域降噪
#   2. 补帧和变速一步做完：RIFE 24 → 48 帧每秒（和开场片一样，人走路、镜头转动更顺）。picks.json 里每段可以写 warp（[源秒, 成片秒] 的折线），
#      比如把低头的镜头整体提速、把离开之后空椅子的时间压短；成片的每一帧让 RIFE 直接算对应的时刻，不用混合两帧（镜头转得快时会有重影）
#   3. 校色：H3 整体比关键帧暗一点、对比高一点，每段按时间线性渐进做逐通道的均值 / 标准差匹配，让第一帧对上起始关键帧、最后一帧对上结束关键帧
#   4. 收口：头尾各 EDGE 帧渐变到同一张“接缝画面”（这张关键帧在所有片段里的平均样子），两段之间交叉淡化时不会有一点跳动
#   5. 低头那段最后 LAND 帧渐变成牌桌关键帧本身（视频最后一帧 = 实时画面），抬头 = 低头倒放
#   6. 给了游戏素材目录就接着压缩（encode_h3.py）
# picks.json：{"leave_elder": {"file": "v2/leave_elder_2144.mp4", "warp": [[0,0],[5.17,4.4]], "sfx": [[0.7,"chairScrape",0.55,0,0.11], …]}, …}，路径相对 picks.json 所在目录；sfx 的时间写源片里的秒数
# 用法：python finish_h3.py picks.json 关键帧目录 工作目录 [游戏素材目录(assets/cutscenes)]
import ctypes, json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image
import interp

# 压视频很吃 CPU：调成低优先级（子进程跟着），同时开着别的任务时让着它们
if os.name == 'nt':
    ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x00004000)
PICKS, KEY, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
GAME = sys.argv[4] if len(sys.argv) > 4 else None
FFMPEG = r'D:\tools\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
SRC_FPS, FPS = 24, 48
XF = 9        # 接缝交叉淡化的帧数（0.19 秒，和以前一样长）
EDGE = 10     # 头尾渐变到接缝画面的帧数
LAND = 16     # 低头最后渐变成牌桌的帧数（1/3 秒，这时镜头已经停住）
# H3 解码分块的边界（第 68、136 帧……）整幅画面会轻轻抖一下；时域降噪只在像素几乎不动的地方做平均，把它抹平，人物和烛火不受影响
CLEAN = 'atadenoise=0a=0.02:0b=0.04:1a=0.02:1b=0.04:2a=0.02:2b=0.04:s=9'
W, H = 1280, 640
BT709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']
REEL = ['idle_drinker', 'act_drinker', 'tilt_down_drinker', 1.0, 'tilt_up_drinker', 'leave_drinker', 'arrive_elder', 'idle_elder', 'act_elder',
        'tilt_down_elder', 1.0, 'tilt_up_elder', 'leave_elder', 'arrive_dicer', 'idle_dicer', 'act_dicer', 'tilt_down_dicer', 1.0, 'tilt_up_dicer',
        'leave_dicer', 'arrive_barmaid', 'idle_barmaid', 'act_barmaid', 'tilt_down_barmaid', 1.0, 'tilt_up_barmaid', 'leave_barmaid', 'arrive_drinker', 0.8]
base = os.path.dirname(os.path.abspath(PICKS))
picks = json.load(open(PICKS, encoding='utf8'))


def ends(name):
    kind, x = name.rsplit('_', 1)
    return {'idle': (x, x), 'act': (x, x), 'leave': (x, 'empty'), 'arrive': ('empty', x), 'tilt_down': (x, 'table')}[kind]


def frames(d):
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.png')]


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


def save(a, p):
    Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(p)


def key(k):
    return np.asarray(Image.open(os.path.join(KEY, k + '.png')).convert('RGB').resize((W, H), Image.LANCZOS), dtype=np.float32)


def stats(a):
    a = a.reshape(-1, 3)
    return a.mean(0), a.std(0)


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def fresh(d):
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    return d


def timeline(name, n):
    """成片每一帧对应源片（24 帧每秒）的第几帧，可以是小数"""
    last = (n - 1) / SRC_FPS
    warp = picks[name].get('warp') or [[0, 0], [last, last]]
    src, dst = [w[0] for w in warp], [w[1] for w in warp]
    return [min(n - 1.0, float(np.interp(j / FPS, dst, src)) * SRC_FPS) for j in range(round(dst[-1] * FPS) + 1)]


# 1 + 2. 取帧、补帧和变速（源文件和变速都没变就跳过）
net = None
for name, p in picks.items():
    src = os.path.join(base, p['file'])
    raw, f48 = os.path.join(OUT, 'raw', name), os.path.join(OUT, 'f48', name)
    stamp = os.path.join(f48, 'src.txt')
    sign = src + str(os.path.getmtime(src)) + json.dumps(p.get('warp'))
    if os.path.exists(stamp) and open(stamp, encoding='utf8').read() == sign:
        continue
    fresh(raw)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-fps_mode', 'passthrough', '-vf', f'scale={W}:{H}:flags=lanczos,{CLEAN}', os.path.join(raw, '%05d.png')], check=True)
    net = net or interp.load_net('cuda')
    fresh(f48)
    print('interp', name, interp.warp_dir(raw, f48, timeline(name, len(frames(raw))), net=net), flush=True)
    with open(stamp, 'w', encoding='utf8') as f:
        f.write(sign)

# 3. 校色：把每段拉到关键帧的颜色上（只算系数，后面逐帧用）
grade = {}
for name in picks:
    fs = frames(os.path.join(OUT, 'f48', name))
    a, b = ends(name)
    grade[name] = (stats(load(fs[0])), stats(load(fs[-1])), stats(key(a)), stats(key(b)))


def graded(name, i, n, img):
    (m0, s0), (m1, s1), (k0, t0), (k1, t1) = grade[name]
    t = i / (n - 1)
    m, s, km, ks = m0 + (m1 - m0) * t, s0 + (s1 - s0) * t, k0 + (k1 - k0) * t, t0 + (t1 - t0) * t
    return (img - m) * (ks / s) + km


# 4. 接缝画面：校色后，同一张关键帧在所有用到它的片段里的平均样子（AI 每次画的细节不一样，平均之后谁接上来都一样近）
seam_sum, seam_n = {}, {}
for name in picks:
    fs = frames(os.path.join(OUT, 'f48', name))
    a, b = ends(name)
    for k, i in ((a, 0), (b, len(fs) - 1)):
        if k == 'table':
            continue
        img = graded(name, i, len(fs), load(fs[i]))
        seam_sum[k] = seam_sum.get(k, 0) + img
        seam_n[k] = seam_n.get(k, 0) + 1
seam = {k: seam_sum[k] / seam_n[k] for k in seam_sum}
seam['table'] = key('table')
os.makedirs(os.path.join(OUT, 'seam'), exist_ok=True)
for k, a in seam.items():
    save(a, os.path.join(OUT, 'seam', k + '.png'))


# 5. 逐帧校色，头尾收口
clips = []
for name in picks:
    fs = frames(os.path.join(OUT, 'f48', name))
    m = len(fs)
    dst = fresh(os.path.join(OUT, 'fc', name))
    a, b = ends(name)
    land = LAND if b == 'table' else EDGE
    for j, f in enumerate(fs):
        img = graded(name, j, m, load(f))
        if j < EDGE:
            img = img + (seam[a] - img) * (1 - smooth((j + 1) / (EDGE + 1)))
        if j >= m - land:
            img = img + (seam[b] - img) * smooth((j - (m - land) + 1) / land)
        save(img, os.path.join(dst, '%05d.png' % j))
    clips.append(name)
    print('graded', name, m, 'frames', round(m / FPS, 2), 's', flush=True)
for name in [c for c in clips if c.startswith('tilt_down_')]:
    up = name.replace('tilt_down_', 'tilt_up_')
    dst = fresh(os.path.join(OUT, 'fc', up))
    for j, f in enumerate(frames(os.path.join(OUT, 'fc', name))[::-1]):
        os.link(f, os.path.join(dst, '%05d.png' % j))
    clips.append(up)

# 每段的缩略图
os.makedirs(os.path.join(OUT, 'sheets'), exist_ok=True)
for c in clips:
    fs = frames(os.path.join(OUT, 'fc', c))
    ims = [Image.open(fs[round(i * (len(fs) - 1) / 7)]) for i in range(8)]
    w, h = ims[0].size[0] // 3, ims[0].size[1] // 3
    sheet = Image.new('RGB', (w * 4, h * 2))
    for i, im in enumerate(ims):
        sheet.paste(im.resize((w, h)), ((i % 4) * w, (i // 4) * h))
    sheet.save(os.path.join(OUT, 'sheets', c + '.jpg'), quality=85)

# 预览片：按游戏里的顺序把片段接起来，接缝和游戏一样交叉淡化（有哪几段就拼哪几段）
def write_seq(items, d):
    fresh(d)
    for k, f in enumerate(items):
        p = os.path.join(d, '%05d.png' % k)
        if isinstance(f, str):
            os.link(f, p)
        else:
            a, b, x = f
            save(load(a) * (1 - x) + load(b) * x, p)


seq, out = os.path.join(OUT, 'reel_frames'), []
for item in [x for x in REEL if not isinstance(x, str) or x in clips]:
    if isinstance(item, float):
        out += [out[-1]] * round(item * FPS)
        continue
    fs = frames(os.path.join(OUT, 'fc', item))
    if out:
        tail = out[-XF:]
        del out[-XF:]
        out += [(tail[j], fs[j], (j + 1) / (XF + 1)) for j in range(XF)]
        fs = fs[XF:]
    out += fs
if out:
    write_seq(out, seq)
    reel = os.path.join(OUT, 'reel.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(seq, '%05d.png'),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
                    '-vf', 'scale=out_color_matrix=bt709'] + BT709 + ['-movflags', '+faststart', reel], check=True)
    print('reel', len(out), 'frames', round(len(out) / FPS, 1), 's', round(os.path.getsize(reel) / 1e6, 1), 'MB', flush=True)

# 6. 游戏素材：压缩单独一步（encode_h3.py），调压缩参数时不用重跑上面
if GAME:
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'encode_h3.py'), PICKS, OUT, GAME], check=True)
