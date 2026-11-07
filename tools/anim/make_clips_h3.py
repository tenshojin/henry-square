# 过场动画（v6 起）：用本机 MiniMax H3 的首尾帧模式生成（统一走 D:\ComfyUI\gen.py，规则见 D:\ComfyUI\docs\默认用法.md）。
# 片段的结构和以前一样：相邻两段共用同一张关键帧，首帧和尾帧都锁死在关键帧上，所以换段的时候接得上。
#   idle_X   X → X        坐着（眨眼、看一眼别处），首尾同一帧，循环播放
#   act_X    X → X        隔一会儿插一段的小动作
#   leave_X  X → empty    起身离开
#   arrive_X empty → X    走过来坐下
#   tilt_down_X X → table 低头看向牌桌（回菜单的抬头 = 它倒放，finish_h3.py 处理）
# 画布 1408×704：正好 2:1（游戏的视频比例），是 H3 能出的最大 2:1 尺寸。
# 用法：python make_clips_h3.py 关键帧目录 输出目录 [--quality fast|final] [--seconds 秒] [--tag 后缀] 片段名[@种子] …
import argparse, json, os, subprocess, sys, time
from PIL import Image

GEN = r'D:\ComfyUI\gen.py'
PY = r'D:\ComfyUI\venv\Scripts\python.exe'
W, H = 1408, 704

ap = argparse.ArgumentParser()
ap.add_argument('keys')
ap.add_argument('out')
ap.add_argument('--quality', default='fast')
ap.add_argument('--seconds', type=float, default=0)
ap.add_argument('--tag', default='')
ap.add_argument('clips', nargs='+')
args = ap.parse_args()

# 人物：完整称呼、代词、离开时往画面哪边走（都往右走、从左边来，走位最好的两个种子就是这样）、坐下后的姿势、起身的第一个动作
WHO = {
    'elder': dict(full='the old man with the white beard, brown cap and olive hooded cape', he='he', his='his', him='him', side='right',
                  sit='folds his forearms on the table', rise='places both hands on the table and pushes himself up slowly, a little stiffly'),
    'drinker': dict(full='the long-haired bearded man in the hooded leather cloak', he='he', his='his', him='him', side='right',
                    sit='hooks one arm over the back of the chair and rests the other forearm on the table',
                    rise='lifts his arm off the back of the chair, plants one hand on the table and pushes himself up'),
    'dicer': dict(full='the young man in the white shirt, dark vest and dark breeches', he='he', his='his', him='him', side='right',
                  sit='folds his forearms on the table and leans in a little', rise='places both hands on the table and rises easily'),
    'barmaid': dict(full='the young barmaid in the white cap, laced bodice and long brown skirt', he='she', his='her', him='her', side='right',
                    sit='folds her forearms on the table', rise='places both hands on the table and rises lightly, smoothing her skirt'),
}
SET = 'a static shot from across a wooden table in a warm candlelit medieval tavern at night'
BACK = 'Behind, the bartender keeps wiping a cup, the man at the end of the bar sips from his mug and the patrons on the stools shift slightly.'
STILL = 'The camera holds a static shot throughout.'
ROOM = 'A low murmur of tavern voices and a crackling fire, with the soft clink of pewter cups on wood.'
TABLE = 'a red felt dice tray in a dark wooden frame with brass corners, two leather dice cups, a pewter tankard, a small candle and a few coins'
# 坐着：只有小动作；不写呼吸（写了胸口会一起一伏，像大喘气）
IDLE = {
    'elder': 'He blinks slowly, his eyes drift toward the bar and his head follows with a very small turn, his lips press together as if he is weighing something, and then his gaze comes back to the camera. A moment later he blinks again.',
    'drinker': 'He blinks, a faint amused smile comes and goes at the corner of his mouth, his eyes slide toward the bar and his head follows with a very small turn, and then his gaze comes back to the camera.',
    'dicer': 'He blinks, his easy smile widens a little and relaxes, his eyes dip to the table for a moment and come back up to the camera, and his head tilts very slightly and returns.',
    'barmaid': 'She blinks softly, her smile warms a little and relaxes, her eyes glance toward the bar and her head follows with a very small turn, and then her gaze comes back to the camera.',
}
# 隔一会儿的小动作：贴人物身份
ACT = {
    'elder': 'The old man slowly raises one hand from the table to his long white beard and strokes it down once, narrowing his eyes thoughtfully at the camera. He gives a small knowing nod, then lowers the hand back to where it was on the table.',
    'drinker': 'The bearded man reaches for the pewter mug in front of him with the hand on the table, lifts it to his lips and takes a slow swallow, then sets the mug back down on the same spot and gives the camera a sly half smile.',
    'dicer': 'The young man reaches forward and picks one small white die off the table, rolls it between his thumb and fingers with a confident grin, then sets it back down where it was and rests his forearm on the table again.',
    'barmaid': 'The barmaid lifts one hand and tucks a loose strand of brown hair under her white cap, tilts her head a little and gives the camera a warm smile, then rests her hand back on the table where it was.',
}
SECONDS = {'idle': 8.0, 'intro': 12.0}
# 开场：和 Seedance 版比较用（一镜到底，门外 → 推门 → 走进酒馆 → 落到第一个对手对面）
INTRO = ('Live-action, cinematic, one continuous stabilized long take at night with no cuts. The shot begins outside the closed arched double door of a half-timbered tavern as in Picture 1, '
         'with a wall lantern glowing on either side, a wooden sign above the door and a thin line of warm light in the gap between the door leaves. The camera pushes in at slow speed as the two heavy door leaves '
         'swing slowly inward and warm candlelight spills over the threshold. The camera glides through the doorway into the candlelit tavern, past the patrons and the long bar, moving steadily toward a wooden table '
         'in the middle of the room where the long-haired bearded man in the hooded leather cloak sits waiting. The camera slows down and comes to rest across the table from him, '
         'settling into the pose, gaze and composition established by Picture 2 at the end of the shot.')
INTRO_SOUND = 'A night breeze outside, then the long creak of heavy door hinges, then the warm murmur of tavern voices, a crackling fire and the clink of cups growing louder as the camera enters.'


def align(sec):
    return ('How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; '
            f'Picture 2 (from Shot 1) aligns with the {sec:.2f}-second mark of the target video.')


def body(text, sound):
    return f'integrated_multimodal_description: [Shot 1] {text}\n\noverall_soundscape: {sound}\n\nnon_diegetic_music: N/A'


def cap(t):
    return t[0].upper() + t[1:]


def clip(name):
    """返回 (首帧, 尾帧, 描述, 声音)"""
    if name == 'intro':
        return 'door', 'drinker', INTRO, INTRO_SOUND
    kind, x = name.rsplit('_', 1)
    w = WHO[x]
    full, he, his, him, side = w['full'], w['he'], w['his'], w['him'], w['side']
    other = 'left' if side == 'right' else 'right'
    if kind == 'idle':
        return x, x, (
            f'Live-action, cinematic, {SET}, framed exactly as in Picture 1. {cap(full)} sits at ease, quietly watching the camera, {his} shoulders low and relaxed. {IDLE[x]} '
            f'The candle flame in front of {him} sways softly and its light moves over {his} face and hands. {BACK} '
            f'{cap(he)} settles into the pose, gaze and composition established by Picture 2 at the end of the shot. {STILL}'), ROOM
    if kind == 'act':
        return x, x, (
            f'Live-action, cinematic, {SET}, framed exactly as in Picture 1. {ACT[x]} {cap(he)} stays seated, and the movement is slow, calm and natural. '
            f'The candle flame sways softly. {BACK} {cap(he)} settles into the pose, gaze and composition established by Picture 2 at the end of the shot. {STILL}'), ROOM
    if kind == 'leave':
        # 这段写法配种子 2144 的走位最好：起身、转身、背对镜头往右走远，头一直在画面里
        return x, 'empty', (
            f'Live-action, cinematic, {SET}, beginning in the position and framing established by Picture 1. {cap(full)} {w["rise"]}, the chair sliding back a little behind {him}. '
            f'{cap(he)} stands, turns {his} back to the camera and walks away from the table into the room, heading diagonally toward the {side} with unhurried steps, growing smaller as {he} goes, '
            f'and passes out of the frame at the {side} edge, behind the stools. {cap(he)} never comes closer to the camera. {cap(he)} is the only person who moves away from the table. {BACK} '
            f'The empty wooden chair stays behind the table, settling into the composition established by Picture 2 at the end of the shot. {STILL}'), \
            'Wooden chair legs scrape on the floorboards, followed by unhurried footsteps fading away. ' + ROOM
    if kind == 'arrive':
        return 'empty', x, (
            f'Live-action, cinematic, {SET}, beginning with the empty wooden chair behind the table as in Picture 1. {cap(full)} enters at the {other} edge of the frame on the far side of the room, '
            f'small in the distance, walking along the front of the bar past the stools. Partway across {he} turns toward the camera and comes straight to the chair with unhurried steps, '
            f'growing larger, {his} face in view the whole way. {cap(he)} stays behind the table, draws the chair back with one hand, sits down facing the camera and {w["sit"]}. '
            f'{cap(he)} is the only person who comes to the table. {BACK} '
            f'{cap(he)} settles into the pose, gaze and composition established by Picture 2 at the end of the shot, looking at the camera. {STILL}'), \
            'Unhurried footsteps approach, then chair legs scrape on the floorboards and cloth rustles as someone sits. ' + ROOM
    if kind == 'tilt_down':
        return x, 'table', (
            f'Live-action, cinematic, beginning on {full} sitting across the table as in Picture 1. The camera tilts down with large amplitude at slow speed in one smooth continuous move. '
            f'{cap(his)} face slides up out of the frame as the single long wooden table between {him} and the viewer rises to fill the view, its planks running unbroken toward the camera, '
            f'until the camera looks down onto {TABLE} at the viewer\'s end of the same table, settling into the composition established by Picture 2 at the end of the shot.'), ROOM
    raise SystemExit('不认识的片段：' + name)


def frames_for(sec):
    n = max(5, round(sec * 24))
    while n % 17 != 5:
        n += 1
    return n


def key(name, tmp):
    """关键帧缩放到 H3 的画布（用哪张就缩哪张，放在输出目录里）"""
    p = os.path.join(tmp, name + '.png')
    if not os.path.exists(p):
        Image.open(os.path.join(args.keys, name + '.png')).convert('RGB').resize((W, H), Image.LANCZOS).save(p)
    return p


os.makedirs(args.out, exist_ok=True)
tmp = os.path.join(args.out, '_keys')
os.makedirs(tmp, exist_ok=True)
log_path = os.path.join(args.out, 'takes.json')
log = json.load(open(log_path, encoding='utf8')) if os.path.exists(log_path) else {}
for i, item in enumerate(args.clips):
    name, _, seed = item.partition('@')
    seed = int(seed) if seed else 1000 + sum(ord(c) for c in name)
    a, b, text, sound = clip(name)
    want = args.seconds or SECONDS.get(name.rsplit('_', 1)[0], 5.0)  # 'intro' 没有下划线，rsplit 后还是它自己
    sec = frames_for(want) / 24
    prompt = align(sec) + '\n\n' + body(text, sound)
    out = os.path.join(args.out, f'{name}{args.tag}_{seed}.mp4')
    t0 = time.time()
    cmd = [PY, GEN, 'video', prompt, '--first', key(a, tmp), '--last', key(b, tmp), '--size', f'{W}x{H}', '--seconds', str(want),
           '--quality', args.quality, '--seed', str(seed), '--out', out]
    if i < len(args.clips) - 1:
        cmd.append('--keep')
    r = subprocess.run(cmd)
    log[os.path.basename(out)] = dict(name=name, seed=seed, start=a, end=b, quality=args.quality, seconds=round(sec, 3), sec=round(time.time() - t0), code=r.returncode, prompt=prompt)
    with open(log_path, 'w', encoding='utf8') as f:
        json.dump(log, f, indent=1, ensure_ascii=False)
    print(name, seed, 'ok' if r.returncode == 0 else 'FAILED', round(time.time() - t0), 's', flush=True)
    if r.returncode:
        sys.exit(r.returncode)
print('ALL_DONE', flush=True)
