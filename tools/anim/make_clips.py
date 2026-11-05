# 过场动画（v3.4 起）：全部按设定图用本地 AI 生成（不用 3D 人物模型）。
# 关键帧（Qwen-Image-Edit-2511，tools/anim/comfy.py 的 qwen_edit）：
#   door        门外深夜，门关着，只有门缝和两盏壁灯有光（v5：v3.4 的 door 让 Qwen 压暗，种子 31；旧的留作 door_v34）
#   door_open   门大开，外面同样暗，门里是烛光下的酒馆，第一个对手（新手）坐在桌后面朝门口（v5：v3.4 的 door_open 压暗 → 门里换成
#               drinker 关键帧的酒馆，种子 42 → 招牌贴种子 41 那张。门里门外都不刺眼，这是用户要的）
#   empty       隔着牌桌看对面的空椅子（设定图左上角主视觉图去掉人）
#   elder / drinker / dicer / barmaid   四个人分别坐在对面那把椅子上（同一个背景）
#   table       游戏里实时渲染的牌桌（游戏机位、没有骰子，1280×640 截图）——低头/抬头镜头的另一头，播完正好接实时画面
# 片段（Wan 2.2 首尾帧生成，16 帧/秒）：
#   intro_a  door → door_open（推门）          intro_b  door_open → drinker（走进酒馆，落到第一个对手的桌前）
#            （v5 起开场换成 Seedance 2.0 的成片，见 finish_intro.py；这两段留着是因为种子按这里的顺序编号）
#   leave_X  X → empty（起身离开）              arrive_X empty → X（走过来坐下）
#   换对手 X → Y = leave_X + arrive_Y（都经过同一张 empty，接得上）
#   tilt_down_X X → table（开局：低头看向牌桌）。回菜单的抬头 tilt_up_X 不单独生成，由 finish_clips.py 把 tilt_down_X 倒放
#     （单独生成时 AI 在空骰盘里凭空变出骰子掉下来，倒放的镜头运动一样自然，首尾帧也一定对得上）
#   idle_X   X → X（选对手时坐着，几乎不动，只眨眼、看一眼别处；首尾同一帧，循环播放）
#   act_X    X → X（隔一会儿插一段的小动作：摸胡子、捋头发……首尾同一帧）
# 用法：python make_clips.py 关键帧目录 输出目录 [片段名[@种子]…]（给了片段名就按给的顺序重做这几段，不给就补做还没做的）
# 注意：跑的时候别往 ComfyUI 里插别的任务（比如 qwen_edit）——两套大模型来回换，32 GB 内存不够，ComfyUI 会卡死。
import os, sys, shutil, time, json
import comfy

KEY, OUT = sys.argv[1], sys.argv[2]
ONLY = sys.argv[3:]
W, H = 1280, 640
TAIL = 'The people in the background keep working at the bar. Warm candlelight, realistic, cinematic, steady camera.'
WHO = {
    'elder': ('the old man with the white beard and the brown head wrap', 'An old man with a white beard and a brown head wrap', 'right', 'He', 'his'),
    'drinker': ('the long-haired bearded man in the hooded leather cloak', 'A long-haired bearded man in a hooded leather cloak', 'left', 'He', 'his'),
    'dicer': ('the young man in the white shirt and dark vest', 'A young man in a white shirt and a dark vest', 'right', 'He', 'his'),
    'barmaid': ('the young barmaid in the white headscarf', 'A young barmaid in a white headscarf and a corset dress', 'left', 'She', 'her'),
}
CLIPS = {
    'intro_a': ('door', 'door_open', 65, 'Deep night, very dark. The two heavy arched wooden door leaves of the dark tavern slowly and quietly swing open outward, revealing the dim candle-lit room inside. The soft warm light inside stays low and gentle, nothing is bright, no glare, no light flooding out. Static camera. Realistic, cinematic, low-key lighting.'),
    'intro_b': ('door_open', 'drinker', 81, 'The camera moves slowly forward through the open doorway into the dim candle-lit tavern, past the dark door leaves, and glides straight toward the wooden table, where a long-haired bearded man in a hooded leather cloak sits facing the camera, looking at the viewer. The room is dark and moody, lit only by soft candlelight. Smooth continuous camera movement, realistic, cinematic, low-key lighting.'),
}
for x, (the, a, side, he, his) in WHO.items():
    other = 'left' if side == 'right' else 'right'
    # “只有他一个人”是 leave_dicer 第一次生成时分裂出第二个人之后加的
    CLIPS['leave_' + x] = (x, 'empty', 65, f'{the[0].upper() + the[1:]} puts {his} hands on the table, pushes the chair back, stands up and walks away to the {side}, leaving the frame. {he} is the only person at the table; nobody else comes near the table. The chair behind the table is left empty. ' + TAIL)
    CLIPS['arrive_' + x] = ('empty', x, 81, f'{a} walks in from the {other} side of the frame, pulls out the empty chair behind the table, sits down facing the camera, rests {his} forearms on the table and smiles at the viewer. ' + TAIL)
TABLE = 'a red felt dice tray with a dark wooden frame and brass corners, two leather dice cups, a pewter tankard and a few coins'
for x, (the, a, side, he, his) in WHO.items():
    CLIPS['tilt_down_' + x] = (x, 'table', 49, f'The camera slowly tilts down from {the} sitting across the table to the wooden table in front of the viewer, and ends looking down at the table top: {TABLE}. Smooth continuous camera movement. Warm candlelight, realistic, cinematic.')
    # 不要写“呼吸”：v3.4 写了 breathing calmly，模型把胸口画得一起一伏，老人胸口上下 7 像素、头却不动，看着像大喘气
    CLIPS['idle_' + x] = (x, x, 81, f'{a} sits relaxed at the table facing the camera, almost completely still. {his.capitalize()} chest and shoulders do not move. {he} only blinks slowly now and then, and {his} eyes glance once to the side and come back to the viewer, with a very slight, slow turn of the head. {he} stays seated. ' + TAIL.replace('steady camera', 'static camera'))
ACTS = {
    'elder': 'The old man with the white beard slowly raises one hand from the table, strokes his long white beard once while narrowing his eyes thoughtfully at the viewer, and slowly lowers the hand back to exactly where it was on the table.',
    'drinker': 'The long-haired bearded man slowly rubs his short beard with one hand and gives the viewer a sly half smile, then slowly rests the hand back on the table exactly where it was.',
    'dicer': 'The young man tilts his head a little, gives the viewer a confident smile and slowly taps two fingers on the table, then goes back to sitting exactly as before.',
    'barmaid': 'The young barmaid slowly tucks a strand of hair behind her ear with one hand and smiles warmly at the viewer, then rests her hand back on the table exactly where it was.',
}
for x, text in ACTS.items():
    CLIPS['act_' + x] = (x, x, 81, text + ' Slow, calm, natural movement, the chest stays still. Stays seated. ' + TAIL.replace('steady camera', 'static camera'))

os.makedirs(OUT, exist_ok=True)
LOG = os.path.join(OUT, 'clips.json')
log = json.load(open(LOG, encoding='utf8')) if os.path.exists(LOG) else {}
# 种子按片段名固定：100 起按下面的顺序编号（以前还有 tilt_up_X，删掉后其余片段的种子不变，重跑能得到同样的结果）
ORDER = ['intro_a', 'intro_b'] + [k + x for x in WHO for k in ('leave_', 'arrive_')] + [k + x for x in WHO for k in ('tilt_down_', 'tilt_up_', 'idle_')]
SEED = {name: 100 + i for i, name in enumerate(ORDER)}
SEED.update({'act_' + x: 300 + i for i, x in enumerate(WHO)})
SEED['leave_dicer'] = 206  # 种子 106 那版分裂出了第二个人
# v3.4 的 leave_dicer 不是这里生成的：补过背景的关键帧上，柱子后面喝酒的人正好挨着掷骰青年的头，种子 206–210 都让那人也站起来跟着走
# （提示词点明他一直坐着也只是换成画面边上探进来一截袖子）。所以沿用 v3.3 用原关键帧（名字_orig.png）生成的那版（种子 206），
# 再用 patch_keys.py 的 clip 模式把补好的背景人贴到每一帧上。重跑时别把 leave_dicer 写进片段名
todo = ONLY or [c for c in CLIPS if c not in log]
for item in todo:
    name, _, seed = item.partition('@')
    a, b, n, prompt = CLIPS[name]
    i = int(seed) if seed else SEED[name]
    t0 = time.time()
    sa = comfy.put(os.path.join(KEY, a + '.png'), 'key_' + a + '.png')
    sb = comfy.put(os.path.join(KEY, b + '.png'), 'key_' + b + '.png')
    frames = comfy.wan_flf2v(sa, sb, prompt, width=W, height=H, length=n, seed=i, prefix='final_' + name)
    d = os.path.join(OUT, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    for k, f in enumerate(frames):
        shutil.move(f, os.path.join(d, '%05d.png' % k))
    log[name] = dict(frames=len(frames), start=a, end=b, seed=i, sec=round(time.time() - t0))
    print(name, log[name], flush=True)
    with open(LOG, 'w', encoding='utf8') as f:
        json.dump(log, f, indent=1)
print('ALL_DONE', flush=True)
