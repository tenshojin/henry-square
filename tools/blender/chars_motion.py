# 人物动作（v3.1 起静止姿势是站姿）：在 Blender 里逐个摆好关键姿势、打关键帧，导出成 glTF 动画片段，游戏里交叉淡化。
#  idle      站着呼吸            walk     原地走路循环（游戏里再沿路线移动，速度和步幅对上，脚不打滑）
#  sit       坐着、手放在桌上     sit_lap  坐着、手放在腿上（椅子拉开、还没挪近桌子时）
#  sit_down  站 → 坐（落到 sit_lap）stand_up 坐 → 站（从 sit_lap 起）
#  laugh     坐着大笑            drink    坐着举杯喝一口（右手）
#  女店员另有 idle_tray / walk_tray（端着托盘）
# 骨架空间：人面朝 -Y，原点在两脚之间的地面上。游戏里人物的位置 = 站着时的脚下；坐着时髋关节在原点后面 SEAT_BACK 米。
import bpy, math
from mathutils import Vector, Quaternion, Matrix
import chars_pose as P

FPS = 30
SEAT_H = 0.45      # 椅面高度（所有椅子一样）
SEAT_BACK = 0.30   # 坐着时髋关节在脚下原点后面多少米（椅子中心再往后 0.06）
FOOT_SIT = 0.47    # 坐着时脚踝在髋关节前面多少米

# 各人的小差别：坐姿前倾、手放桌上的位置（相对坐着的髋关节：x 左右、y 前后（负 = 前）、z 高度）、肘部方向
STYLE = {
    'dicer': dict(lean=0.26, walk_T=1.08, arm_swing=1.0,
                  table={'l': ((0.2, -0.36, 0.79), (0.55, 0.15, 0.85), (0.15, -1, -0.12)), 'r': ((-0.2, -0.36, 0.79), (-0.55, 0.15, 0.85), (-0.15, -1, -0.12))}),
    'drinker': dict(lean=0.22, walk_T=1.14, arm_swing=0.9,
                    table={'l': ((0.17, -0.3, 0.79), (0.55, 0.2, 0.85), (0.4, -1, -0.12)), 'r': ((-0.2, -0.3, 0.8), (-0.55, 0.15, 0.82), (-0.3, -1, -0.05))}),
    'elder': dict(lean=0.3, walk_T=1.26, arm_swing=0.6, stoop=0.12,
                  table={'l': ((0.18, -0.3, 0.8), (0.55, 0.18, 0.85), (0.4, -1, -0.12)), 'r': ((-0.18, -0.3, 0.8), (-0.55, 0.18, 0.85), (-0.4, -1, -0.12))}),
    'barmaid': dict(lean=0.16, walk_T=1.12, arm_swing=0.75,
                    table={'l': ((0.15, -0.32, 0.79), (0.5, 0.12, 0.8), (0.3, -1, -0.12)), 'r': ((-0.15, -0.32, 0.79), (-0.5, 0.12, 0.8), (-0.3, -1, -0.12))}),
}


def upd():
    bpy.context.view_layer.update()


# ---------- 量尺寸 ----------
def measure(rig):
    b = rig.data.bones
    m = {'pel': Vector(b['pelvis'].head_local)}
    for s in 'lr':
        m['hip_' + s] = Vector(b['thigh_' + s].head_local)
        m['ankle_' + s] = Vector(b['foot_' + s].head_local)
    m['L1'] = b['thigh_l'].length
    m['L2'] = b['calf_l'].length
    m['leg'] = m['L1'] + m['L2']
    m['ankle_h'] = m['ankle_l'].z
    m['hip_w'] = abs(m['hip_l'].x)
    m['head'] = Vector(b['head'].head_local)
    return m


# ---------- 基础操作 ----------
def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis.identity()
    upd()


def rot(rig, bone, axis, deg):
    """在骨骼自己的局部轴上叠加旋转（度）。"""
    pb = rig.pose.bones[bone]
    ax = {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis]
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(ax, math.radians(deg))
    upd()


def rot_world(rig, bone, axis, deg):
    """绕骨架空间的轴转（围着骨头自己的头）。"""
    pb = rig.pose.bones[bone]
    M = pb.matrix.copy()
    head = M.translation.copy()
    R = Matrix.Rotation(math.radians(deg), 4, Vector(axis).normalized()) @ M
    R.translation = head
    pb.matrix = R
    upd()


def place_pelvis(rig, pos, pitch=0.0, yaw=0.0, roll=0.0):
    """把骨盆放到骨架空间的 pos（骨盆骨头的头），转一点角度（度）。腿和上身都是它的子骨骼。"""
    pb = rig.pose.bones['pelvis']
    rest = rig.data.bones['pelvis'].matrix_local.copy()
    R = Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X') @ Matrix.Rotation(math.radians(roll), 4, 'Y')
    M = R @ rest
    M.translation = Vector(pos)
    pb.matrix = M
    upd()


def two_bone(A, l1, l2, T, pole):
    d = T - A
    dist = max(abs(l1 - l2) + 1e-3, min(d.length, (l1 + l2) * 0.999))
    dn = d.normalized()
    cosA = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))
    pd = pole - A
    pd = pd - dn * pd.dot(dn)
    pd.normalize()
    sa = math.sqrt(max(0.0, 1 - cosA * cosA))
    mid = A + dn * (cosA * l1) + pd * (sa * l1)
    return mid, A + dn * dist


def leg_ik(rig, s, ankle, knee_dir=(0, -1, 0.1)):
    """解腿：脚踝到 ankle（骨架空间），膝盖朝 knee_dir 方向弯。"""
    pb = rig.pose.bones['thigh_' + s]
    A = pb.head.copy()
    l1 = rig.data.bones['thigh_' + s].length
    l2 = rig.data.bones['calf_' + s].length
    knee, end = two_bone(A, l1, l2, Vector(ankle), A + Vector(knee_dir) * 0.5)
    P.aim(rig, 'thigh_' + s, knee - A)
    P.aim(rig, 'calf_' + s, end - knee)


def foot(rig, s, pitch=0.0, toe=0.0, yaw=0.0):
    """脚掌：pitch > 0 脚尖抬起（脚跟着地），pitch < 0 脚跟抬起；toe 脚趾向上弯（蹬地时）。"""
    sx = 1 if s == 'l' else -1
    d = Vector((0.02 * sx, -0.89, -0.45))
    R = Matrix.Rotation(math.radians(-pitch), 3, 'X') @ Matrix.Rotation(math.radians(yaw * sx), 3, 'Z')
    P.aim(rig, 'foot_' + s, R @ d)
    P.aim(rig, 'ball_' + s, Matrix.Rotation(math.radians(-(pitch + toe)), 3, 'X') @ Vector((0.0, -1, 0.06)))


def spine(rig, lean=0.0, twist=0.0, side=0.0, neck=0.0, head=(0.0, 0.0), stoop=0.0):
    """上身朝向：lean 前倾（弧度），twist 扭转（弧度，正 = 向左转），side 侧弯，neck 低头，
    head (左右转（正 = 向左）, 点头（正 = 低头）)。"""
    def d(fw, up=1.0, sd=0.0):
        return Vector((sd, -fw, up)).normalized()
    P.aim(rig, 'spine_01', d(lean * 1.0, sd=side))
    P.aim(rig, 'spine_02', d(lean * 0.55 + stoop * 0.5, sd=side * 0.6))
    P.aim(rig, 'spine_03', d(lean * 0.25 - 0.05 + stoop, sd=side * 0.3))
    P.aim(rig, 'neck_01', d(0.22 + neck + stoop * 0.6))
    P.aim(rig, 'head', Matrix.Rotation(head[1], 3, 'X') @ Vector((0, -0.02, 1)).normalized())
    # 绕骨头自己的轴扭（aim 只管朝向，不管扭转）。骨头 Y 轴朝上，绕它正转 = 向左转
    if twist:
        P.twist(rig, 'spine_02', twist * 0.5)
        P.twist(rig, 'spine_03', twist * 0.5)
        P.twist(rig, 'neck_01', -twist * 0.6)
        P.twist(rig, 'head', -twist * 0.4)
    if head[0]:
        P.twist(rig, 'neck_01', head[0] * 0.4)
        P.twist(rig, 'head', head[0] * 0.6)


def fingers(rig, curl=1.0, side='lr', thumb=0.0):
    for s in side:
        for f in ('index', 'middle', 'ring', 'pinky'):
            for j, a in ((1, 0.18), (2, 0.28), (3, 0.2)):
                pb = rig.pose.bones['%s_0%d_%s' % (f, j, s)]
                pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion((1, 0, 0), a * curl)
        if thumb:
            pb = rig.pose.bones['thumb_02_' + s]
            pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion((1, 0, 0), thumb)
    upd()


def arms_down(rig, swing=0.0, out=0.0, bend=0.0, side='lr'):
    """手臂自然下垂。swing：前后摆（弧度，正 = 左臂往前），bend 附加屈肘。"""
    for s in side:
        sx = 1 if s == 'l' else -1
        sw = swing * sx
        up = Vector((0.13 * sx + out * sx, 0.04, -1)).normalized()
        up = Matrix.Rotation(-sw, 3, Vector((1, 0, 0))) @ up
        P.aim(rig, 'upperarm_' + s, up)
        b = 0.16 + bend + max(0.0, sw) * 0.55
        lo = Matrix.Rotation(-b, 3, Vector((1, 0, 0))) @ up
        lo = lo + Vector((0.02 * sx, 0, 0))
        P.aim(rig, 'lowerarm_' + s, lo)
        hd = Matrix.Rotation(-b - 0.08, 3, Vector((1, 0, 0))) @ up
        P.aim(rig, 'hand_' + s, hd + Vector((0.03 * sx, 0, 0)))


def arm_to(rig, s, target, pole, hand_dir=None):
    P.ik_arm(rig, s, tuple(target), tuple(pole))
    if hand_dir is not None:
        P.aim(rig, 'hand_' + s, hand_dir)


# ---------- 姿势 ----------
def pose_stand(rig, m, st, breath=0.0, sway=0.0, look=(0.0, 0.0)):
    reset(rig)
    p = m['pel']
    place_pelvis(rig, (p.x + 0.008 * sway, p.y, p.z - 0.004 + 0.002 * breath), roll=1.2 * sway, yaw=0.8 * sway)
    for s, sx in (('l', 1), ('r', -1)):
        leg_ik(rig, s, (m['ankle_' + s].x + 0.01 * sx, m['ankle_' + s].y, m['ankle_h']), (0.05 * sx, -1, 0.0))
        foot(rig, s)
    spine(rig, lean=0.02 + 0.012 * breath, side=-0.015 * sway, head=look, stoop=st.get('stoop', 0.0))
    rot(rig, 'clavicle_l', 'Z', 0.8 * breath)
    rot(rig, 'clavicle_r', 'Z', -0.8 * breath)
    arms_down(rig, bend=0.04)
    fingers(rig, 0.9)


def hip_seat(m, st):
    return Vector((0.0, SEAT_BACK, 0.0))


def pose_sit(rig, m, st, hands='table', breath=0.0, z_hip=None, feet_y=None, lean_add=0.0, look=(0.0, 0.0)):
    """坐姿。hands: 'table'（手放桌上）/ 'lap'（手放腿上）/ None（不管手）。z_hip：骨盆高度（由 seat_height 算出）。"""
    reset(rig)
    p = m['pel']
    zh = z_hip if z_hip is not None else st['_z_sit']
    place_pelvis(rig, (0.0, SEAT_BACK + (p.y - m['hip_l'].y), zh + 0.002 * breath), pitch=-8)
    fy = SEAT_BACK - FOOT_SIT if feet_y is None else feet_y
    for s, sx in (('l', 1), ('r', -1)):
        leg_ik(rig, s, (0.13 * sx, fy, m['ankle_h']), (0.12 * sx, -1, 0.35))
        foot(rig, s, yaw=4)
    spine(rig, lean=st['lean'] + lean_add + 0.012 * breath, head=look, stoop=st.get('stoop', 0.0))
    rot(rig, 'clavicle_l', 'Z', 0.8 * breath)
    rot(rig, 'clavicle_r', 'Z', -0.8 * breath)
    if hands == 'table':
        for s in 'lr':
            (x, y, z), pole, hd = st['table'][s]
            arm_to(rig, s, (x, SEAT_BACK + y, z), (pole[0], SEAT_BACK + pole[1], pole[2]), hd)
        fingers(rig, 1.0)
    elif hands == 'lap':
        for s, sx in (('l', 1), ('r', -1)):
            arm_to(rig, s, (0.13 * sx, SEAT_BACK - 0.27, zh + 0.07), (0.5 * sx, SEAT_BACK + 0.2, zh + 0.25), (0.12 * sx, -1, -0.35))
        fingers(rig, 0.7)


def seat_height(rig, body, m, st):
    """调整骨盆高度，让屁股正好落在椅面上（取屁股最低点）。"""
    zh = SEAT_H + 0.09
    for _ in range(3):
        pose_sit(rig, m, st, hands=None, z_hip=zh)
        co = P.evaluated_coords(body)
        hip_y = SEAT_BACK
        sel = (co[:, 1] > hip_y - 0.12) & (abs(co[:, 0]) < 0.2) & (co[:, 2] < zh + 0.05)
        low = float(co[sel][:, 2].min())
        zh += (SEAT_H + 0.004) - low
    return zh


# ---------- 走路 ----------
def gait(t, step, duty=0.6, back=0.05):
    """一只脚在一个周期里的位置。t: 0..1（0 = 脚跟着地）。返回 (前后 y（负 = 前），抬高, 脚掌俯仰)。"""
    span = step * 2 * duty   # 支撑期里脚相对身体往后移动的距离
    if t < duty:
        k = t / duty
        y = -span / 2 + span * k + back
        pitch = 14 * max(0.0, 1 - k / 0.18) - 24 * max(0.0, (k - 0.72) / 0.28) ** 1.4
        toe = 30 * max(0.0, (k - 0.72) / 0.28)
        lift = 0.0
    else:
        k = (t - duty) / (1 - duty)
        e = 0.5 - 0.5 * math.cos(math.pi * k)
        y = span / 2 - span * e + back
        lift = 0.1 * math.sin(math.pi * min(1.0, k * 1.1)) ** 1.2
        pitch = -24 * max(0.0, 1 - k / 0.3) + 10 * max(0.0, (k - 0.55) / 0.45)
        toe = 30 * max(0.0, 1 - k / 0.25)
    # 脚跟抬起时脚尖还踩在地上：脚踝跟着升高
    if pitch < 0:
        lift = max(lift, 0.14 * math.sin(math.radians(-pitch)))
    return y, lift, pitch, toe


def pose_walk(rig, m, st, ph, step, tray=None):
    """走路周期 ph（0..1），左脚在 ph=0 着地。"""
    reset(rig)
    p = m['pel']
    reach = step * 0.6 - 0.05
    # 髋要低一点，前后两只脚才够得着
    h_leg = math.sqrt(max(0.01, (m['leg'] * 0.985) ** 2 - reach ** 2))
    drop = (m['hip_l'].z - m['ankle_h']) - h_leg
    bob = 0.024 * (0.5 - 0.5 * math.cos(4 * math.pi * ph - 0.3))
    sway = math.sin(2 * math.pi * ph)      # 左脚支撑时 > 0：重心移到左边
    fwd_l = math.cos(2 * math.pi * ph)     # 左腿在前 = 1
    place_pelvis(rig, (p.x + 0.018 * sway, p.y + 0.01, p.z - drop - 0.004 + bob), yaw=-5 * fwd_l, roll=-2.5 * sway, pitch=2)
    for s, sx, off in (('l', 1, 0.0), ('r', -1, 0.5)):
        y, lift, pitch, toe = gait((ph + off) % 1.0, step)
        leg_ik(rig, s, (0.11 * sx, y, m['ankle_h'] + lift), (0.04 * sx, -1, 0.0))
        foot(rig, s, pitch=pitch, toe=toe)
    spine(rig, lean=0.03, twist=0.08 * fwd_l, stoop=st.get('stoop', 0.0))
    if tray is None:
        arms_down(rig, swing=-0.34 * st.get('arm_swing', 1.0) * fwd_l, bend=0.05)
        fingers(rig, 0.9)
    else:
        tray_arms(rig, tray)
        fingers(rig, 0.4)


def tray_arms(rig, chest_z, fwd=-0.3):
    """两只手托在胸前（托盘在手上）。"""
    P.ik_arm(rig, 'l', (0.16, fwd, chest_z), (0.45, 0.25, chest_z - 0.25))
    P.ik_arm(rig, 'r', (-0.16, fwd, chest_z), (-0.45, 0.25, chest_z - 0.25))
    P.aim(rig, 'hand_l', (0.35, -1, 0.0))
    P.aim(rig, 'hand_r', (-0.35, -1, 0.0))


# ---------- 打关键帧 ----------
class Recorder:
    """逐帧打关键帧：保证四元数和上一帧同号（不然插值会绕远路）。"""
    def __init__(self, rig, name):
        self.rig = rig
        rig.animation_data_create()
        self.act = bpy.data.actions.new(name)
        self.act.use_fake_user = True
        rig.animation_data.action = self.act
        self.prev = {}

    def key(self, frame):
        for pb in self.rig.pose.bones:
            q = pb.rotation_quaternion.copy()
            pq = self.prev.get(pb.name)
            if pq is not None and pq.dot(q) < 0:
                q.negate()
                pb.rotation_quaternion = q
            self.prev[pb.name] = q
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            if pb.name == 'pelvis':
                pb.keyframe_insert('location', frame=frame)

    def finish(self, interp='BEZIER'):
        for fc in fcurves(self.act):
            for kp in fc.keyframe_points:
                kp.interpolation = interp
                kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        rig = self.rig
        tr = rig.animation_data.nla_tracks.new()
        tr.name = self.act.name
        stp = tr.strips.new(self.act.name, 1, self.act)
        stp.name = self.act.name
        rig.animation_data.action = None
        reset(rig)
        return self.act


def fcurves(act):
    if hasattr(act, 'layers') and len(act.layers):
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for cb in getattr(strip, 'channelbags', []):
                    out.extend(cb.fcurves)
        if out:
            return out
    return list(getattr(act, 'fcurves', []))


def record(rig, name, keys, interp='BEZIER'):
    """keys: [(秒, 摆姿势的函数)]。"""
    r = Recorder(rig, name)
    for t, fn in keys:
        fn()
        r.key(1 + round(t * FPS))
    return r.finish(interp)


def smoothstep(a, b, x):
    k = max(0.0, min(1.0, (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


# ---------- 动作 ----------
def make_idle(rig, m, st, name, period=4.4, seed=0.0, tray=None):
    keys = []
    n = 8
    for k in range(n + 1):
        ph = 2 * math.pi * k / n
        b = math.sin(ph)
        sw = math.sin(ph * 0.5 + seed) * 0.8
        def f(b=b, sw=sw, ph=ph):
            pose_stand(rig, m, st, breath=b, sway=sw, look=(0.08 * math.sin(ph * 0.5 + seed * 1.7), 0.02 * math.sin(ph + seed)))
            if tray is not None:
                tray_arms(rig, tray + 0.004 * b)
                fingers(rig, 0.4)
        keys.append((period * k / n, f))
    return record(rig, name, keys)


def make_walk(rig, m, st, name, tray=None):
    T = st.get('walk_T', 1.1) * (1.08 if tray is not None else 1.0)
    step = m['leg'] * (0.64 if tray is None else 0.56)
    keys = []
    n = 16
    for k in range(n + 1):
        ph = k / n
        keys.append((T * ph, lambda ph=ph: pose_walk(rig, m, st, ph % 1.0, step, tray)))
    act = record(rig, name, keys, interp='LINEAR')
    # 游戏里用：每秒走多少米（脚不打滑）
    act['speed'] = 2 * step / T
    return act, 2 * step / T


def make_sit_idle(rig, m, st, name, hands, period=4.0, seed=0.0):
    keys = []
    n = 8
    for k in range(n + 1):
        ph = 2 * math.pi * k / n
        b = math.sin(ph)
        def f(b=b, ph=ph):
            pose_sit(rig, m, st, hands=hands, breath=b, look=(0.05 * math.sin(ph * 0.5 + seed * 1.7), 0.02 * math.sin(ph + seed)))
        keys.append((period * k / n, f))
    return record(rig, name, keys)


def make_sit_down(rig, m, st, name):
    zs = st['_z_sit']
    p = m['pel']
    stand_z = p.z
    off = p.y - m['hip_l'].y   # 骨盆骨头相对髋关节的前后差

    def mid(hip_y, z, lean, feet_y, hands, arm_fwd=0.0, look=(0.0, 0.0)):
        def f():
            reset(rig)
            place_pelvis(rig, (0.0, hip_y + off, z), pitch=-8 * smoothstep(stand_z, zs, z))
            for s, sx in (('l', 1), ('r', -1)):
                leg_ik(rig, s, (0.12 * sx, feet_y, m['ankle_h']), (0.1 * sx, -1, 0.25))
                foot(rig, s, yaw=2)
            spine(rig, lean=lean, stoop=st.get('stoop', 0.0), head=look)
            if hands == 'knees':
                for s, sx in (('l', 1), ('r', -1)):
                    arm_to(rig, s, (0.14 * sx, hip_y - 0.32 - arm_fwd, z + 0.02), (0.5 * sx, hip_y + 0.1, z + 0.3), (0.1 * sx, -1, -0.5))
                fingers(rig, 0.7)
            else:
                arms_down(rig, swing=0.0, bend=0.25 + arm_fwd)
                fingers(rig, 0.9)
        return f

    keys = [
        (0.0, lambda: pose_stand(rig, m, st)),
        (0.4, mid(0.02, stand_z - 0.05, 0.12, 0.0, 'down', 0.15, (0.0, 0.12))),
        (0.95, mid(0.17, (stand_z + zs) / 2 + 0.04, 0.55, 0.0, 'knees', 0.08, (0.0, 0.05))),
        (1.35, mid(SEAT_BACK - 0.02, zs + 0.03, 0.45, 0.0, 'knees', 0.0)),
        (1.7, mid(SEAT_BACK, zs, st['lean'] + 0.08, SEAT_BACK - FOOT_SIT + 0.06, 'knees', -0.02)),
        (2.05, lambda: pose_sit(rig, m, st, hands='lap')),
    ]
    return record(rig, name, keys)


def make_stand_up(rig, m, st, name):
    zs = st['_z_sit']
    p = m['pel']
    stand_z = p.z
    off = p.y - m['hip_l'].y

    def mid(hip_y, z, lean, feet_y, hands, look=(0.0, 0.0)):
        def f():
            reset(rig)
            place_pelvis(rig, (0.0, hip_y + off, z), pitch=-8 * smoothstep(stand_z, zs, z))
            for s, sx in (('l', 1), ('r', -1)):
                leg_ik(rig, s, (0.12 * sx, feet_y, m['ankle_h']), (0.1 * sx, -1, 0.25))
                foot(rig, s, yaw=2)
            spine(rig, lean=lean, stoop=st.get('stoop', 0.0), head=look)
            if hands == 'knees':
                for s, sx in (('l', 1), ('r', -1)):
                    arm_to(rig, s, (0.14 * sx, hip_y - 0.3, z + 0.03), (0.5 * sx, hip_y + 0.1, z + 0.3), (0.1 * sx, -1, -0.5))
                fingers(rig, 0.7)
            else:
                arms_down(rig, bend=0.3)
                fingers(rig, 0.9)
        return f

    keys = [
        (0.0, lambda: pose_sit(rig, m, st, hands='lap')),
        (0.35, mid(SEAT_BACK, zs, st['lean'] + 0.12, 0.03, 'knees')),
        (0.75, mid(SEAT_BACK - 0.03, zs + 0.03, 0.62, 0.0, 'knees', (0.0, 0.1))),
        (1.1, mid(0.14, (stand_z + zs) / 2 + 0.03, 0.5, 0.0, 'knees', (0.0, 0.05))),
        (1.45, mid(0.03, stand_z - 0.04, 0.16, 0.0, 'down')),
        (1.8, lambda: pose_stand(rig, m, st)),
    ]
    return record(rig, name, keys)


def make_laugh(rig, m, st, name, dur=2.6):
    keys = []
    n = 14
    for k in range(n + 1):
        t = k / n
        env = math.sin(math.pi * min(1.0, t * 1.15)) if t < 0.87 else 0.0
        bob = math.sin(t * 2 * math.pi * 5) * env
        def f(env=env, bob=bob):
            pose_sit(rig, m, st, hands='table')
            rot(rig, 'spine_02', 'X', -4.0 * env + 1.6 * bob)
            rot(rig, 'spine_03', 'X', -5.0 * env + 2.0 * bob)
            rot(rig, 'neck_01', 'X', -6.0 * env)
            rot(rig, 'head', 'X', -10.0 * env + 2.5 * bob)
            rot(rig, 'clavicle_l', 'Z', 3.0 * bob)
            rot(rig, 'clavicle_r', 'Z', -3.0 * bob)
        keys.append((dur * t, f))
    return record(rig, name, keys)


def make_drink(rig, m, st, name, mouth, dur=3.4):
    """右手从桌上举到嘴边，仰头喝一口，再放回去。mouth：骨架空间（坐着时）。"""
    (x, y, z), pole, hd = st['table']['r']
    rest = Vector((x, SEAT_BACK + y, z))
    pole_v = Vector((-0.5, SEAT_BACK + 0.1, 0.75))
    near = mouth + Vector((-0.07, -0.11, -0.07))
    up = mouth + Vector((-0.06, -0.08, -0.03))
    plan = [(0.0, rest, 0, 0), (0.22, near, 0, 0.3), (0.34, up, -12, 1.0), (0.62, up + Vector((0, 0.005, 0.01)), -15, 1.0), (0.78, near, -3, 0.3), (1.0, rest, 0, 0)]
    keys = []
    for (t, hand, back, lift) in plan:
        def f(hand=hand, back=back, lift=lift):
            pose_sit(rig, m, st, hands='table')
            rot(rig, 'neck_01', 'X', back * 0.4)
            rot(rig, 'head', 'X', back * 0.6)
            rot(rig, 'spine_03', 'X', back * 0.15)
            if lift > 0:
                P.ik_arm(rig, 'r', tuple(hand), tuple(pole_v))
                P.aim(rig, 'hand_r', Vector(hd).lerp(Vector((-0.2, -0.6, 0.75)), lift))
            # 手指握住杯把（静止时也半握着）
            fingers(rig, 1.5 if lift > 0 else 0.5, side='r', thumb=0.35 if lift > 0 else 0.1)
        keys.append((dur * t, f))
    return record(rig, name, keys)


def make_all(name, rig, objs, z_sit=None):
    """一个人物的全部动作。z_sit：坐着时骨盆高度（穿衣服前用完整身体量好再传进来）。返回 {名字: 数值}。"""
    st = dict(STYLE[name])
    m = measure(rig)
    st['_z_sit'] = z_sit if z_sit is not None else seat_height(rig, objs['body'], m, st)
    reset(rig)
    out = {}
    tray = None
    if name == 'barmaid':
        tray = Vector(rig.data.bones['spine_03'].head_local).z + 0.02
    seed = {'dicer': 0.3, 'drinker': 1.4, 'elder': 2.2, 'barmaid': 0.9}[name]
    make_idle(rig, m, st, name + '_idle', seed=seed)
    act, speed = make_walk(rig, m, st, name + '_walk')
    out['walk'] = speed
    make_sit_idle(rig, m, st, name + '_sit', 'table', seed=seed)
    make_sit_idle(rig, m, st, name + '_sit_lap', 'lap', seed=seed + 0.5)
    make_sit_down(rig, m, st, name + '_sit_down')
    make_stand_up(rig, m, st, name + '_stand_up')
    make_laugh(rig, m, st, name + '_laugh')
    e = objs['eyes']
    reset(rig)
    pose_sit(rig, m, st, hands='table')
    ec = sum((Vector(v.co) for v in e.data.vertices), Vector()) / len(e.data.vertices)
    # 眼睛网格是静止姿势的坐标：用头骨把它变换到坐姿下
    hb = rig.data.bones['head']
    M = rig.pose.bones['head'].matrix @ hb.matrix_local.inverted()
    mouth = M @ (ec + Vector((0, -0.07, -0.075)))
    make_drink(rig, m, st, name + '_drink', mouth)
    if tray is not None:
        make_idle(rig, m, st, name + '_idle_tray', period=3.6, seed=seed, tray=tray)
        act, speed = make_walk(rig, m, st, name + '_walk_tray', tray=tray)
        out['walk_tray'] = speed
    reset(rig)
    out['z_sit'] = st['_z_sit']
    return out
