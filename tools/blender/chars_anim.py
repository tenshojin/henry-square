# 人物动作：在 Blender 里打关键帧，导出成 glTF 动画片段。游戏里用 AnimationMixer 交叉淡入淡出。
#  坐着的三人：idle（呼吸、轻微晃动）、drink（右手举杯喝一口）、laugh（仰头大笑、肩膀抖）
#  女店员：walk（端托盘走路，原地循环）、idle（端托盘站着）
import bpy, math
from mathutils import Vector, Quaternion, Matrix
import chars_pose as P

FPS = 30


def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis.identity()
    P.upd()


def rot(rig, bone, axis, deg):
    """在骨骼自己的局部轴上叠加旋转（度）。"""
    pb = rig.pose.bones[bone]
    pb.rotation_mode = 'QUATERNION'
    ax = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis]
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(ax, math.radians(deg))


def key(rig, frame, bones=None, loc=('Root', 'pelvis')):
    for pb in rig.pose.bones:
        if bones and pb.name not in bones:
            continue
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        if pb.name in loc:
            pb.keyframe_insert('location', frame=frame)


def begin(rig, name):
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    return act


def finish(rig, act):
    """把动作收进 NLA（导出时每个动作是一段独立动画），并把曲线设成平滑。"""
    tr = rig.animation_data.nla_tracks.new()
    tr.name = act.name
    st = tr.strips.new(act.name, 1, act)
    st.name = act.name
    rig.animation_data.action = None
    reset(rig)


def smooth_loop(act):
    for fc in _fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'


def _fcurves(act):
    # Blender 4.4+ 的分层动作：曲线在 layers → strips → channelbag 里
    if hasattr(act, 'layers') and len(act.layers):
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in getattr(strip, 'channelbags', []):
                    out.extend(cb.fcurves)
        if out:
            return out
    return list(getattr(act, 'fcurves', []))


# ---------- 坐着：呼吸 ----------
def make_idle_sit(rig, name, seed=0.0, period=4.0):
    act = begin(rig, name)
    n = int(period * FPS)
    for k in range(0, 9):
        f = 1 + n * k / 8
        ph = 2 * math.pi * k / 8
        reset(rig)
        b = math.sin(ph)
        rot(rig, 'spine_02', 'X', 1.2 * b)
        rot(rig, 'spine_03', 'X', 1.0 * b)
        rot(rig, 'clavicle_l', 'Z', 0.8 * b)
        rot(rig, 'clavicle_r', 'Z', -0.8 * b)
        rot(rig, 'neck_01', 'X', -0.8 * b + 1.2 * math.sin(ph * 0.5 + seed))
        rot(rig, 'head', 'Y', 3.0 * math.sin(ph * 0.5 + seed * 1.7))
        rot(rig, 'head', 'Z', 1.2 * math.sin(ph + seed))
        key(rig, f)
    smooth_loop(act)
    finish(rig, act)
    return act


# ---------- 坐着：大笑 ----------
def make_laugh(rig, name, dur=2.6):
    act = begin(rig, name)
    n = int(dur * FPS)
    keys = 14
    for k in range(keys + 1):
        t = k / keys
        f = 1 + n * t
        env = math.sin(math.pi * min(1.0, t * 1.15)) if t < 0.87 else 0.0
        bob = math.sin(t * 2 * math.pi * 5) * env
        reset(rig)
        rot(rig, 'spine_02', 'X', -4.0 * env + 1.6 * bob)
        rot(rig, 'spine_03', 'X', -5.0 * env + 2.0 * bob)
        rot(rig, 'neck_01', 'X', -6.0 * env)
        rot(rig, 'head', 'X', -10.0 * env + 2.5 * bob)
        rot(rig, 'clavicle_l', 'Z', 3.0 * bob)
        rot(rig, 'clavicle_r', 'Z', -3.0 * bob)
        key(rig, f)
    smooth_loop(act)
    finish(rig, act)
    return act


# ---------- 坐着：右手举杯喝一口 ----------
def make_drink(rig, name, mouth, rest_hand, dur=3.4):
    """mouth / rest_hand：骨架空间坐标。右手（_r）从桌上举到嘴边，仰头喝，再放下。"""
    act = begin(rig, name)
    n = int(dur * FPS)
    side = 'r'
    pole = Vector((-0.5, 0.1, 0.75))
    near = mouth + Vector((-0.07, -0.11, -0.07))
    up = mouth + Vector((-0.06, -0.08, -0.03))
    plan = [(0.0, rest_hand, 0, 0), (0.22, near, 0, 0.3), (0.34, up, -12, 1.0), (0.62, up + Vector((0, 0.005, 0.01)), -15, 1.0), (0.78, near, -3, 0.3), (1.0, rest_hand, 0, 0)]
    for (t, hand, head_back, lift) in plan:
        reset(rig)
        rot(rig, 'neck_01', 'X', head_back * 0.4)
        rot(rig, 'head', 'X', head_back * 0.6)
        rot(rig, 'spine_03', 'X', head_back * 0.15)
        P.upd()
        P.ik_arm(rig, side, hand, pole)
        rot(rig, 'hand_' + side, 'X', -20 * lift)
        key(rig, 1 + n * t)
    smooth_loop(act)
    finish(rig, act)
    return act


# ---------- 女店员：端托盘的手臂姿势 ----------
def tray_arms(rig, chest_z, fwd=-0.3):
    """两只手托在胸前（托盘在手上）。"""
    P.ik_arm(rig, 'l', (0.16, fwd, chest_z), (0.45, 0.25, chest_z - 0.25))
    P.ik_arm(rig, 'r', (-0.16, fwd, chest_z), (-0.45, 0.25, chest_z - 0.25))
    P.aim(rig, 'hand_l', (0.35, -1, 0.0))
    P.aim(rig, 'hand_r', (-0.35, -1, 0.0))


def make_walk(rig, name, chest_z, dur=1.1):
    """原地走路循环（游戏里再沿路径移动）。步幅约 0.6 米。"""
    act = begin(rig, name)
    n = int(dur * FPS)
    steps = 8
    for k in range(steps + 1):
        t = k / steps
        ph = 2 * math.pi * t
        reset(rig)
        sw = math.sin(ph)
        cw = math.cos(ph)
        # 腿：大腿前后摆，膝盖在抬腿时弯
        rot(rig, 'thigh_l', 'X', 22 * sw)
        rot(rig, 'thigh_r', 'X', -22 * sw)
        rot(rig, 'calf_l', 'X', -(14 + 22 * max(0.0, -cw)) )
        rot(rig, 'calf_r', 'X', -(14 + 22 * max(0.0, cw)))
        rot(rig, 'foot_l', 'X', 8 * sw)
        rot(rig, 'foot_r', 'X', -8 * sw)
        # 骨盆左右扭一点、上下起伏
        rot(rig, 'pelvis', 'Y', 4 * sw)
        rot(rig, 'spine_02', 'Y', -3 * sw)
        pb = rig.pose.bones['pelvis']
        pb.location = (0, 0, 0.012 * abs(math.cos(ph)))
        P.upd()
        tray_arms(rig, chest_z)
        key(rig, 1 + n * t)
    smooth_loop(act)
    finish(rig, act)
    return act


def make_stand_tray(rig, name, chest_z, period=3.6):
    act = begin(rig, name)
    n = int(period * FPS)
    for k in range(9):
        t = k / 8
        ph = 2 * math.pi * t
        reset(rig)
        b = math.sin(ph)
        rot(rig, 'pelvis', 'Y', 2.0 * b)
        rot(rig, 'spine_03', 'X', 1.0 * b)
        rot(rig, 'head', 'Y', 6 * math.sin(ph * 0.5))
        P.upd()
        tray_arms(rig, chest_z + 0.004 * b)
        key(rig, 1 + n * t)
    smooth_loop(act)
    finish(rig, act)
    return act


def make_all(name, rig, objs):
    acts = []
    if name in ('dicer', 'drinker', 'elder'):
        seed = {'dicer': 0.3, 'drinker': 1.4, 'elder': 2.2}[name]
        acts.append(make_idle_sit(rig, name + '_idle', seed))
        acts.append(make_laugh(rig, name + '_laugh'))
        if name in ('drinker', 'elder'):
            e = objs['eyes']
            ec = sum((Vector(v.co) for v in e.data.vertices), Vector()) / len(e.data.vertices)
            mouth = ec + Vector((0, -0.07, -0.075))
            rest_hand = Vector(rig.pose.bones['hand_r'].head)
            acts.append(make_drink(rig, name + '_drink', mouth, rest_hand))
    else:
        chest = Vector(rig.data.bones['spine_03'].head_local).z + 0.02
        acts.append(make_walk(rig, name + '_walk', chest))
        acts.append(make_stand_tray(rig, name + '_idle', chest))
    return acts
