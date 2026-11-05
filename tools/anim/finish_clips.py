# 生成完之后：每段补帧到 32 帧/秒 → 校色 → 每段出一张缩略图拼板 → 按游戏里的顺序拼成一条预览片 →（给了游戏素材目录时）压成游戏用的 AV1。
# 校色：Wan 生成的片段越往后越偏暖偏亮（结尾帧比关键帧 R 约 +7、G +5、B +2.5），开头帧基本准。
#   每段按时间线性渐进做逐通道的均值/标准差匹配，让第一帧对上起始关键帧、最后一帧对上结束关键帧，这样共用同一张关键帧的两段接得上。
# 拼接：片段之间共用关键帧，接缝处前后各 XF 帧交叉淡化（两边这时都几乎静止），抹掉 AI 每次画得不完全一样的细节；
#   “坐好了”的地方停一小会儿，代表这里在打牌。
# 游戏素材：每段压成 AV1（10 位，BT.709 标记），写 cutscenes.json（帧率、尺寸、接缝帧数、每段时长）给 build.mjs 打包；
#   idle_X 首尾是同一张关键帧，再把最后 XF 帧和开头 XF 帧交叉淡化、去掉开头这 XF 帧，循环播放时看不出接缝。
# 回菜单的抬头 tilt_up_X = 低头 tilt_down_X 校色后倒放（单独生成的抬头片段会凭空变出骰子，片段目录里有也不用）。
# 低头那段最后 10 帧渐变成牌桌关键帧本身（视频最后一帧 = 实时画面）；桌上东西小改动时重截 table.png、重跑这个脚本即可。
# 用法：python finish_clips.py 片段目录(make_clips 的输出) 关键帧目录 输出目录 [游戏素材目录(assets/cutscenes)]
import os, sys, json, shutil, subprocess
import numpy as np
from PIL import Image
import interp

SRC, KEY, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
GAME = sys.argv[4] if len(sys.argv) > 4 else None
FFMPEG = r'D:\tools\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe'
FPS = 32
XF = 6
CRF = 42  # 36 / 40 / 44 放大看脸几乎没差别（AI 视频本身偏柔），44 比 40 小两成
# 预览片：开场 → 坐着 → 低头看牌桌（停一下代表对局）→ 抬头 → 换人 ……（有哪几段就拼哪几段）
REEL = ['idle_drinker', 'act_drinker', 'tilt_down_drinker', 1.0, 'tilt_up_drinker', 'leave_drinker', 'arrive_elder', 'idle_elder', 'act_elder',
        'tilt_down_elder', 1.0, 'tilt_up_elder', 'leave_elder', 'arrive_dicer', 'idle_dicer', 'act_dicer', 'tilt_down_dicer', 1.0, 'tilt_up_dicer',
        'leave_dicer', 'arrive_barmaid', 'idle_barmaid', 'act_barmaid', 'tilt_down_barmaid', 1.0, 'tilt_up_barmaid', 'leave_barmaid', 'arrive_drinker', 0.8]

log = json.load(open(os.path.join(SRC, 'clips.json'), encoding='utf8'))
# 开场（intro）是 Seedance 2.0 的成片，由 finish_intro.py 处理；Wan 的旧开场 intro_a / intro_b 不再用
clips = [d for d in sorted(os.listdir(SRC)) if os.path.isdir(os.path.join(SRC, d)) and not d.startswith('tilt_up_') and d not in ('intro_a', 'intro_b')]


def frames(d):
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.png')]


def load(p):
    return np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)


def stats(a):
    a = a.reshape(-1, 3)
    return a.mean(0), a.std(0)


def write_seq(items, d):
    """把帧列表写成一个连续编号的文件夹：直接用的帧硬链接过去，(A, B, 比例) 现场混合。"""
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    for k, f in enumerate(items):
        p = os.path.join(d, '%05d.png' % k)
        if isinstance(f, str):
            os.link(f, p)
        else:
            a, b, x = f
            Image.fromarray(np.clip(load(a) * (1 - x) + load(b) * x + 0.5, 0, 255).astype(np.uint8)).save(p)


# 1. 补帧
net = None
for c in clips:
    src, dst = os.path.join(SRC, c), os.path.join(OUT, 'f32', c)
    # 补过而且比这一段新（重新生成过的片段要重补）就跳过
    if os.path.isdir(dst) and len(os.listdir(dst)) == 2 * len(frames(src)) - 1 and os.path.getmtime(dst) >= os.path.getmtime(src):
        continue
    net = net or interp.load_net('cuda')
    shutil.rmtree(dst, ignore_errors=True)
    print(c, interp.interp_dir(src, dst, net=net), flush=True)

# 2. 校色
for c in clips:
    fs = frames(os.path.join(OUT, 'f32', c))
    dst = os.path.join(OUT, 'fc', c)
    shutil.rmtree(dst, ignore_errors=True)
    os.makedirs(dst)
    h, w = load(fs[0]).shape[:2]
    key = lambda k: np.asarray(Image.open(os.path.join(KEY, k + '.png')).convert('RGB').resize((w, h), Image.LANCZOS), dtype=np.float32)
    (m0, s0), (m1, s1) = stats(load(fs[0])), stats(load(fs[-1]))
    (k0, t0), (k1, t1) = stats(key(log[c]['start'])), stats(key(log[c]['end']))
    for i, p in enumerate(fs):
        t = i / (len(fs) - 1)
        m, s, km, ks = m0 + (m1 - m0) * t, s0 + (s1 - s0) * t, k0 + (k1 - k0) * t, t0 + (t1 - t0) * t
        a = load(p)
        a = (a - m) * (ks / s) + km
        Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(dst, '%05d.png' % i))
    print('color', c, 'end shift', np.round(m1 - k1, 1), flush=True)
# 落到牌桌的那几段：最后 LAND 帧（镜头已经停住）渐变成牌桌关键帧本身，视频最后一帧和实时画面一模一样；
# 牌桌上的小改动（比如钱币的材质）重截一张关键帧、重跑这个脚本就行，不用重新生成视频
LAND = 10
for c in [c for c in clips if log[c]['end'] == 'table']:
    fs = frames(os.path.join(OUT, 'fc', c))
    h, w = load(fs[0]).shape[:2]
    k = np.asarray(Image.open(os.path.join(KEY, 'table.png')).convert('RGB').resize((w, h), Image.LANCZOS), dtype=np.float32)
    for j in range(LAND):
        x = (j + 1) / LAND
        x = x * x * (3 - 2 * x)
        p = fs[len(fs) - LAND + j]
        Image.fromarray(np.clip(load(p) * (1 - x) + k * x + 0.5, 0, 255).astype(np.uint8)).save(p)
for c in [c for c in clips if c.startswith('tilt_down_')]:
    up = c.replace('tilt_down_', 'tilt_up_')
    write_seq(frames(os.path.join(OUT, 'fc', c))[::-1], os.path.join(OUT, 'fc', up))
    clips.append(up)

# 3. 缩略图拼板：每段均匀取 8 帧
os.makedirs(os.path.join(OUT, 'sheets'), exist_ok=True)
for c in clips:
    fs = frames(os.path.join(OUT, 'fc', c))
    ims = [Image.open(fs[round(i * (len(fs) - 1) / 7)]) for i in range(8)]
    w, h = ims[0].size[0] // 3, ims[0].size[1] // 3
    sheet = Image.new('RGB', (w * 4, h * 2))
    for i, im in enumerate(ims):
        sheet.paste(im.resize((w, h)), ((i % 4) * w, (i // 4) * h))
    sheet.save(os.path.join(OUT, 'sheets', c + '.jpg'), quality=85)

# 4. 预览片：直接用的帧硬链接过去，接缝处交叉淡化的帧另存
seq = os.path.join(OUT, 'reel_frames')
shutil.rmtree(seq, ignore_errors=True)
os.makedirs(seq)
out = []  # 每项：路径，或 (路径A, 路径B, B 的比例)
for item in [x for x in REEL if not isinstance(x, str) or x in clips]:
    if isinstance(item, float):
        out += [out[-1]] * round(item * FPS)
        continue
    fs = frames(os.path.join(OUT, 'fc', item))
    if out:
        tail = out[-XF:]  # 上一段（或停留画面）的最后 XF 帧
        del out[-XF:]
        for j in range(XF):
            out.append((tail[j], fs[j], (j + 1) / (XF + 1)))
        fs = fs[XF:]
    out += fs

BT709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']
write_seq(out, seq)
reel = os.path.join(OUT, 'reel.mp4')
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(seq, '%05d.png'),
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
                '-vf', 'scale=out_color_matrix=bt709'] + BT709 + ['-movflags', '+faststart', reel], check=True)
print('reel', len(out), 'frames', round(len(out) / FPS, 1), 's', round(os.path.getsize(reel) / 1e6, 1), 'MB')

# 5. 游戏素材
if GAME:
    os.makedirs(GAME, exist_ok=True)
    w, h = Image.open(frames(os.path.join(OUT, 'fc', clips[0]))[0]).size
    meta = {'fps': FPS, 'size': [w, h], 'xf': XF, 'codec': 'video/mp4; codecs="av01.0.08M.10"', 'clips': {}}
    old = os.path.join(GAME, 'cutscenes.json')
    if os.path.exists(old):
        kept = json.load(open(old, encoding='utf8'))['clips'].get('intro')
        if kept:
            meta['clips']['intro'] = kept
    total = 0
    for c in clips:
        fs = frames(os.path.join(OUT, 'fc', c))
        if c.startswith('idle_'):
            n = len(fs)
            fs = fs[XF:n - XF] + [(fs[n - XF + j], fs[j], (j + 1) / (XF + 1)) for j in range(XF)]
        d = os.path.join(OUT, 'enc', c)
        write_seq(fs, d)
        mp4 = os.path.join(GAME, c + '.mp4')
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(d, '%05d.png'),
                        '-c:v', 'libsvtav1', '-preset', '4', '-crf', str(CRF), '-pix_fmt', 'yuv420p10le',
                        # 色彩标记要另外写进 AV1 码流（只给 -color_primaries 之类，SVT-AV1 只记下矩阵）
                        '-svtav1-params', 'color-primaries=1:transfer-characteristics=1:matrix-coefficients=1:color-range=0',
                        '-vf', 'scale=out_color_matrix=bt709:out_range=tv'] + BT709 + ['-color_range', 'tv', '-movflags', '+faststart', mp4],
                       check=True, stderr=subprocess.DEVNULL)
        meta['clips'][c] = {'frames': len(fs), 'dur': round(len(fs) / FPS, 3)}
        total += os.path.getsize(mp4)
        print('av1', c, len(fs), 'frames', round(os.path.getsize(mp4) / 1e3), 'KB', flush=True)
        # 放不了 AV1 的浏览器（大多数 iPhone）用的 H.264 小文件：不打进 HTML，放在网站目录里按需加载
        os.makedirs(os.path.join(GAME, 'h264'), exist_ok=True)
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(d, '%05d.png'),
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
                        '-vf', 'scale=960:480:out_color_matrix=bt709'] + BT709 + ['-movflags', '+faststart', '-an', os.path.join(GAME, 'h264', c + '.mp4')], check=True)
    with open(os.path.join(GAME, 'cutscenes.json'), 'w', encoding='utf8') as f:
        json.dump(meta, f, indent=1)
    print('game clips', len(meta['clips']), round(total / 1e6, 2), 'MB')
