# 过场动画（v3.4）：全部按设定图用本地 AI 生成（不用 3D 人物模型）。
# 关键帧（Qwen-Image-Edit-2511，tools/anim/comfy.py 的 qwen_edit）：
#   door        门外夜景，门关着（v3.4 改成离门更近的构图，招牌是“亨利酒馆”；原来的远景留作 door_far / door_open_far）
#   door_open   门大开，看得见里面的酒馆（先把远景裁近一点再让 Qwen 改招牌、补细节，door 再由它“把两扇门关上”画出来）
#   empty       隔着牌桌看对面的空椅子（设定图左上角主视觉图去掉人）
#   elder / drinker / dicer / barmaid   四个人分别坐在对面那把椅子上（同一个背景）
#   table       游戏里实时渲染的牌桌（游戏机位、没有骰子，1280×640 截图）——低头/抬头镜头的另一头，播完正好接实时画面
# 片段（Wan 2.2 首尾帧生成，16 帧/秒）：
#   intro_a  door → door_open（推门）          intro_b  door_open → elder（走进酒馆，落到桌前）
#   leave_X  X → empty（起身离开）              arrive_X empty → X（走过来坐下）
#   换对手 X → Y = leave_X + arrive_Y（都经过同一张 empty，接得上）
#   tilt_down_X X → table（开局：低头看向牌桌）。回菜单的抬头 tilt_up_X 不单独生成，由 finish_clips.py 把 tilt_down_X 倒放
#     （单独生成时 AI 在空骰盘里凭空变出骰子掉下来，倒放的镜头运动一样自然，首尾帧也一定对得上）
#   idle_X   X → X（选对手时坐着的小动作，首尾同一帧，循环播放）
# 用法：python make_clips.py 关键帧目录 输出目录 [片段名…]（给了片段名就按给的顺序重做这几段，不给就补做还没做的）
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
    'intro_a': ('door', 'door_open', 49, 'Night. The two heavy arched wooden door leaves of the tavern slowly swing open outward toward the camera, warm golden candlelight pours out onto the wet cobblestones and reveals the lively candle-lit tavern inside. Static camera. Realistic, cinematic.'),
    'intro_b': ('door_open', 'elder', 81, 'The camera moves forward through the open doorway into the warm candle-lit tavern, glides past the bar and the barrels and settles in front of a wooden table, where an old man with a white beard and a brown head wrap sits facing the camera, looking at the viewer. Smooth continuous camera movement, realistic, cinematic.'),
}
for x, (the, a, side, he, his) in WHO.items():
    other = 'left' if side == 'right' else 'right'
    # “只有他一个人”是 leave_dicer 第一次生成时分裂出第二个人之后加的
    CLIPS['leave_' + x] = (x, 'empty', 65, f'{the[0].upper() + the[1:]} puts {his} hands on the table, pushes the chair back, stands up and walks away to the {side}, leaving the frame. {he} is the only person at the table; nobody else comes near the table. The chair behind the table is left empty. ' + TAIL)
    CLIPS['arrive_' + x] = ('empty', x, 81, f'{a} walks in from the {other} side of the frame, pulls out the empty chair behind the table, sits down facing the camera, rests {his} forearms on the table and smiles at the viewer. ' + TAIL)
TABLE = 'a red felt dice tray with a dark wooden frame and brass corners, two leather dice cups, a pewter tankard and a few coins'
for x, (the, a, side, he, his) in WHO.items():
    CLIPS['tilt_down_' + x] = (x, 'table', 49, f'The camera slowly tilts down from {the} sitting across the table to the wooden table in front of the viewer, and ends looking down at the table top: {TABLE}. Smooth continuous camera movement. Warm candlelight, realistic, cinematic.')
    CLIPS['idle_' + x] = (x, x, 65, f'{a} sits at the table facing the camera, breathing calmly, blinking, glancing around the tavern and looking back at the viewer, with small natural movements. {he} stays seated. ' + TAIL.replace('steady camera', 'static camera'))

os.makedirs(OUT, exist_ok=True)
LOG = os.path.join(OUT, 'clips.json')
log = json.load(open(LOG, encoding='utf8')) if os.path.exists(LOG) else {}
# 种子按片段名固定：100 起按下面的顺序编号（以前还有 tilt_up_X，删掉后其余片段的种子不变，重跑能得到同样的结果）
ORDER = ['intro_a', 'intro_b'] + [k + x for x in WHO for k in ('leave_', 'arrive_')] + [k + x for x in WHO for k in ('tilt_down_', 'tilt_up_', 'idle_')]
SEED = {name: 100 + i for i, name in enumerate(ORDER)}
SEED['leave_dicer'] = 206  # 种子 106 那版分裂出了第二个人
# v3.4 的 leave_dicer 不是这里生成的：补过背景的关键帧上，柱子后面喝酒的人正好挨着掷骰青年的头，种子 206–210 都让那人也站起来跟着走
# （提示词点明他一直坐着也只是换成画面边上探进来一截袖子）。所以沿用 v3.3 用原关键帧（名字_orig.png）生成的那版（种子 206），
# 再用 patch_keys.py 的 clip 模式把补好的背景人贴到每一帧上。重跑时别把 leave_dicer 写进片段名
todo = ONLY or [c for c in CLIPS if c not in log]
for name in todo:
    a, b, n, prompt = CLIPS[name]
    i = SEED[name]
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
