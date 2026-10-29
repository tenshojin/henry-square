# 人物总装：MPFB 身体 → 表情形态键 → 去掉辅助网格 → 坐姿设为静止姿势 → 按设定图穿衣服
import bpy, bmesh, os, math, sys
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r'E:\game\骰子\tools\blender')
import chars_base as B
import chars_pose as P
import chars_clothes as C


def coords(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float32)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


# ---------- 表情 ----------
def add_expressions(objs):
    HumanService, TargetService, ClothesService = B.services()
    bm = objs['body']
    TargetService.bake_targets(bm)
    unit_dir = os.path.join(B.MPFB_SYS, 'targets', 'expression', 'units', 'caucasian')
    units = sorted({u for rec in B.EXPRESSIONS.values() for u, w in rec})
    for u in units:
        TargetService.load_target(bm, os.path.join(unit_dir, u + '.target.gz'), weight=0.0, name='u_' + u)
    keys = bm.data.shape_keys.key_blocks
    for expr, rec in B.EXPRESSIONS.items():
        for k in keys:
            k.value = 0.0
        for u, w in rec:
            keys['u_' + u].value = w
        bm.shape_key_add(name=expr, from_mix=True)
    for k in list(keys):
        if k.name.startswith('u_'):
            bm.shape_key_remove(k)
    keys = bm.data.shape_keys.key_blocks
    for k in keys:
        k.value = 0.0
    # 眉毛、睫毛、胡子、牙齿跟着表情动：在每个表情下重新贴合，记下位置做成它们自己的形态键
    proxies = [objs[k] for k in ('brows', 'lashes', 'beard', 'moustache', 'teeth') if k in objs]
    per = {}
    for expr in B.EXPRESSIONS:
        keys[expr].value = 1.0
        for p in proxies:
            ClothesService.fit_clothes_to_human(p, bm, set_parent=False)
            per[(p.name, expr)] = coords(p)
        keys[expr].value = 0.0
    for p in proxies:
        ClothesService.fit_clothes_to_human(p, bm, set_parent=False)
        p.shape_key_add(name='Basis', from_mix=False)
        for expr in B.EXPRESSIONS:
            sk = p.shape_key_add(name=expr, from_mix=False)
            sk.data.foreach_set('co', per[(p.name, expr)].ravel())


def delete_helpers(body):
    """删掉 MakeHuman 的辅助网格（裙子/紧身裤/关节方块等），只留身体。"""
    gi = body.vertex_groups['body'].index
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.active
    dead = [v for v in bm.verts if v[dl].get(gi, 0.0) < 0.5]
    bmesh.ops.delete(bm, geom=dead, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    for m in list(body.modifiers):
        if m.type == 'MASK':
            body.modifiers.remove(m)
    for g in list(body.vertex_groups):
        if g.name.startswith(('helper', 'joint', 'Helper', 'JointCubes')):
            body.vertex_groups.remove(g)


def mesh_objs(objs):
    return [o for k, o in objs.items() if k != 'rig' and o.type == 'MESH']


# ---------- 坐姿 ----------
def sit(objs, hands, lean=0.26, head_dir=(0, 0.02, 1)):
    """hands: {'l': (目标, 肘部方向), 'r': ...}（骨架空间）。"""
    rig, body = objs['rig'], objs['body']
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()
    P.upd()
    for s, sx in (('l', 1), ('r', -1)):
        P.aim(rig, 'thigh_' + s, (0.07 * sx, -1, -0.03))
        P.aim(rig, 'calf_' + s, (0.02 * sx, -0.16, -1))
        P.aim(rig, 'foot_' + s, (0.03 * sx, -0.89, -0.45))
        P.aim(rig, 'ball_' + s, (0.0, -1, 0.05))
    P.aim(rig, 'spine_01', (0, -lean, 1))
    P.aim(rig, 'spine_02', (0, -0.05, 1))
    P.aim(rig, 'spine_03', (0, 0.06, 1))
    P.aim(rig, 'neck_01', (0, -0.22, 0.97))
    P.aim(rig, 'head', head_dir)
    low = float(P.evaluated_coords(body)[:, 2].min())
    rp = rig.pose.bones['Root']
    M = rp.matrix.copy()
    M.translation.z -= low
    rp.matrix = M
    P.upd()
    for s in ('l', 'r'):
        if s in hands:
            tgt, pole, hand_dir = hands[s]
            P.ik_arm(rig, s, tgt, pole)
            P.aim(rig, 'hand_' + s, hand_dir)
    # 手指放松微屈
    for s in ('l', 'r'):
        for f in ('index', 'middle', 'ring', 'pinky'):
            for j, a in ((1, 0.18), (2, 0.28), (3, 0.2)):
                P.bend(rig, '%s_0%d_%s' % (f, j, s), a, 'X')
    co = P.evaluated_coords(body)
    m = (co[:, 1] > -0.12) & (co[:, 2] < 0.7) & (np.abs(co[:, 0]) < 0.2)
    return float(co[m, 2].min())


# ---------- 各部位工具 ----------
def bone_axis(rig, name):
    h, t = C.bone_pts(rig, name)
    return h, t, (t - h).normalized()


def in_bones(info, names, thr=0.0):
    s = C.wsum(info, None, names)
    return s


TORSO = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']
ARM_U = ['upperarm_l', 'upperarm_r']
ARM_L = ['lowerarm_l', 'lowerarm_r']
LEGS_U = ['thigh_l', 'thigh_r']
LEGS_L = ['calf_l', 'calf_r']
FEET = ['foot_l', 'foot_r', 'ball_l', 'ball_r']


def collar_cut(rig, drop=0.0):
    h, t, d = bone_axis(rig, 'neck_01')
    return (h + d * (0.015 - drop), d)


def limb_cut(rig, bone, t, keep_proximal=True):
    """垂直于骨骼的切面，默认删掉远端那一侧。"""
    h, tl, d = bone_axis(rig, bone)
    p = h.lerp(tl, t)
    return (p, d if keep_proximal else -d)


def ring_loft(info, name, centers, axis, mat, n=24, offset=0.008, ref=None, flare=None, wobble=None, closed=True, open_sector=None, restrict=None, region=None, rmax=0.6):
    rings = [C.ring(info, c, axis, n=n, offset=offset, ref=ref, flare=flare, wobble=wobble, region=region, rmax=rmax) for c in centers]
    ob = C.loft(name, rings, mat, closed=closed, open_sector=open_sector)
    C.copy_weights(info, ob, restrict=restrict)
    return ob


# ---------- 区域蒙版 ----------
def masks(info):
    rig = info['rig']
    co = info['co']
    m = {}
    m['pel'] = Vector(C.bone_pts(rig, 'pelvis')[0])
    m['z'] = co[:, 2]
    for b in ('lowerarm_l', 'lowerarm_r', 'upperarm_l', 'upperarm_r', 'calf_l', 'calf_r', 'thigh_l', 'thigh_r', 'neck_01', 'spine_03'):
        m['t_' + b], m['r_' + b] = C.bone_param(info, b)
    m['torso'] = C.in_set(info, TORSO + ['neck_01'])
    m['upper'] = C.in_set(info, ARM_U)
    m['low_l'] = C.in_set(info, ['lowerarm_l'])
    m['low_r'] = C.in_set(info, ['lowerarm_r'])
    m['legs'] = C.in_set(info, ['pelvis'] + LEGS_U + LEGS_L)
    m['feet'] = C.in_set(info, FEET)
    m['calf_l'] = C.in_set(info, ['calf_l'])
    m['calf_r'] = C.in_set(info, ['calf_r'])
    m['thigh'] = C.in_set(info, LEGS_U)
    m['head'] = C.in_set(info, ['head'])
    m['up_w'] = C.wsum(info, None, ARM_U)
    return m


def neck_hole(m, r, t0=-0.15):
    return (m['t_neck_01'] > t0) & (m['r_neck_01'] < r)


def sleeve(m, t):
    """上臂整段 + 前臂到参数 t 为止。"""
    return m['upper'] | (m['low_l'] & (m['t_lowerarm_l'] < t)) | (m['low_r'] & (m['t_lowerarm_r'] < t))


def legs_to(m, t):
    """骨盆、大腿 + 小腿到参数 t 为止。"""
    calf_cut = (m['calf_l'] & (m['t_calf_l'] > t)) | (m['calf_r'] & (m['t_calf_r'] > t))
    return m['legs'] & ~calf_cut


def boot_from(m, t):
    return m['feet'] | (m['calf_l'] & (m['t_calf_l'] > t)) | (m['calf_r'] & (m['t_calf_r'] > t))


def foot_shoe(info, rig, side, mat, name, offset=0.009, toe_puff=0.004):
    """鞋/靴的脚掌部分：从脚跟到脚尖一圈圈取截面（向脚面打射线），半径做平滑把脚趾缝填平，鞋底压平。"""
    ank = Vector(C.bone_pts(rig, 'foot_' + side)[0])
    tip = Vector(C.bone_pts(rig, 'ball_' + side)[1])
    f = Vector((tip.x - ank.x, tip.y - ank.y, 0)).normalized()
    heel = ank - f * 0.075
    rings = []
    steps = 11
    L = (Vector((tip.x, tip.y, 0)) - Vector((heel.x, heel.y, 0))).length
    for k in range(steps):
        t = k / (steps - 1)
        c = heel + f * (L * t * 0.97)
        c.z = 0.055 * (1 - t) + 0.028 * t
        pts = C.ring(info, c, f, n=24, offset=0.0, ref=(0, 0, 1), region='leg_' + side, rmax=0.16)
        rs = np.array([(p - c).length for p in pts])
        # 圆周方向先取局部最大再平均：脚趾之间的缝被填平
        rs = np.maximum.reduce([np.roll(rs, s) for s in (-1, 0, 1)])
        rs = (np.roll(rs, -1) + rs * 2 + np.roll(rs, 1)) / 4
        shrink = 1.0 if t < 0.85 else 1.0 - (t - 0.85) / 0.15 * 0.55
        ring_k = []
        for j, p in enumerate(pts):
            d = (p - c).normalized()
            q = c + d * ((rs[j] + offset + toe_puff * t) * shrink)
            q.z = max(q.z, -0.006)
            ring_k.append(q)
        rings.append(ring_k)
    ob = C.loft(name, rings, mat, cap_start=True, cap_end=True)
    C.copy_weights(info, ob, restrict=['foot_' + side, 'ball_' + side, 'calf_' + side])
    return ob


def boots(info, rig, m, mat, name, t0, offset=0.011):
    """靴筒（小腿表面外扩）+ 两只鞋（放样）。"""
    shaft_k = (m['calf_l'] & (m['t_calf_l'] > t0)) | (m['calf_r'] & (m['t_calf_r'] > t0))
    out = {name + '_shaft': C.shell(info, name + '.shaft', lambda i: shaft_k[i], lambda i, c, n: offset, mat, solid=0.003, smooth=2)}
    for s in ('l', 'r'):
        out[name + '_foot_' + s] = foot_shoe(info, rig, s, mat, name + '.foot_' + s)
    return out


def boot_blob(m):
    """靴子：脚掌部分抹平（不要脚趾），稍微鼓一点。"""
    feet = m['feet']
    return (lambda i, c: bool(feet[i]) if i < len(feet) else False, 14, 0.006)


def hide_body(body, covered, erode=1):
    """删掉被衣服完全盖住的身体面（缩一圈，避免露缝）。"""
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    cov = covered.copy()
    for _ in range(erode):
        nxt = cov.copy()
        for v in bm.verts:
            if cov[v.index] and not all(cov[e.other_vert(v).index] for e in v.link_edges):
                nxt[v.index] = False
        cov = nxt
    dead = [f for f in bm.faces if all(cov[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()


# ---------- 年轻人（投骰子）----------
def outfit_dicer(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z = m['pel'], m['z']
    waist = pel.z + 0.04
    out = {}
    # 马甲：盖住前胸后背和肩头，只留袖窿；前襟从脖子根往下收成 V 字，到胸口下方合拢（V 里露出衬衫）
    co, no = info['co'], info['no']
    nk = Vector(C.bone_pts(rig, 'neck_01')[0])
    zb = Vector(C.bone_pts(rig, 'spine_03')[0]).z - 0.05
    f = np.clip((co[:, 2] - zb) / max(nk.z - zb, 1e-3), 0, 1)
    # 连续的“距离场”（< 0 = 马甲盖住的地方），按它的 0 等值线裁边，边才是顺的；几个条件取最大值 = 同时满足
    v_open = np.minimum(np.minimum(-0.25 - no[:, 1], co[:, 2] - zb), 0.068 * f - np.abs(co[:, 0] - nk.x))
    v_neck = np.minimum((m['t_neck_01'] + 0.15) * 0.1, 0.085 - m['r_neck_01'])
    vest_phi = np.maximum.reduce([0.5 - C.wsum(info, None, TORSO + ['neck_01']), m['up_w'] - 0.4, v_neck, v_open,
                                  (waist - 0.1) - z, C.wsum(info, None, ['head']) - 0.5])
    vest_k = vest_phi < 0
    shirt_k = (m['torso'] | sleeve(m, 0.42)) & ~neck_hole(m, 0.072) & (z > waist - 0.07) & ~m['head'] & ~C.erode(info['body'], vest_k, 2)
    out['shirt'] = C.shell(info, 'dicer.shirt', lambda i: shirt_k[i],
                           lambda i, c, n: 0.005 + 0.007 * float(m['upper'][i] or m['low_l'][i] or m['low_r'][i]), mats['linen_cream'],
                           solid=0.002, smooth=1, folds=C.fold_noise(0.0025, 60, (0, 0, 1), 3))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'lowerarm_' + s)
        out['cuff_' + s] = ring_loft(info, 'dicer.cuff_' + s, [h.lerp(t, 0.36 + 0.035 * k) for k in range(4)], d, mats['linen_cream'], n=20, offset=0.016, region='arm_' + s, rmax=0.09)
    out['vest'] = C.shell(info, 'dicer.vest', lambda i: vest_k[i], lambda i, c, n: 0.02, mats['leather_dark'], solid=0.004, smooth=2, relax=6, snap=True, field=vest_phi)
    pants_k = legs_to(m, 0.32) & ~(m['torso'] & (z > waist + 0.01)) & ~m['feet']
    out['pants'] = C.shell(info, 'dicer.pants', lambda i: pants_k[i], lambda i, c, n: 0.007, mats['wool_dark'], solid=0.002, smooth=1,
                           folds=C.fold_noise(0.003, 45, (0, 1, 0), 5))
    boot_k = boot_from(m, 0.12)
    out.update(boots(info, rig, m, mats['leather_brown'], 'dicer.boots', 0.12))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'calf_' + s)
        out['bootcuff_' + s] = ring_loft(info, 'dicer.bootcuff_' + s, [h.lerp(t, 0.1 + 0.04 * k) for k in range(3)], d, mats['leather_brown'], n=24, offset=0.02, region='leg_' + s)
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.01
    out['belt'] = ring_loft(info, 'dicer.belt', [Vector((pel.x, pel.y, zb - 0.024)), Vector((pel.x, pel.y, zb + 0.024))], (0, 0, 1), mats['leather_belt'], n=48, offset=0.028, region='torso', rmax=0.3)
    h, t, d = bone_axis(rig, 'lowerarm_l')
    out['bracer'] = ring_loft(info, 'dicer.bracer', [h.lerp(t, 0.55 + 0.1 * k) for k in range(5)], d, mats['leather_brown'], n=20, offset=0.012, restrict=['lowerarm_l', 'hand_l'], region='arm_l', rmax=0.09)
    # 斜挎带从右肩（锁骨外侧，躯干上）斜到左胯，不压在肩关节上，免得被袖子盖住
    cl_h, cl_t = C.bone_pts(rig, 'clavicle_r')
    shR = Vector(cl_h).lerp(Vector(cl_t), 0.62) + Vector((0, 0, 0.07))
    hipL = Vector(C.bone_pts(rig, 'thigh_l')[0]) + Vector((0.03, 0, 0.06))
    mid = (shR + hipL) / 2
    dvec = (hipL - shR).normalized()
    nrm = dvec.cross(Vector((0, 1, 0))).normalized()
    out['strap'] = ring_loft(info, 'dicer.strap', [mid - nrm * 0.02, mid + nrm * 0.02], nrm, mats['leather_belt'], n=56, offset=0.03, ref=dvec, region='torso', rmax=0.4)
    hide_body(objs['body'], shirt_k | vest_k | pants_k | boot_k)
    return out


MATS = {}


def materials():
    C.make_fabric('linen')
    C.make_fabric('wool')
    C.make_fabric('canvas')
    C.make_leather()
    def fab(name, kind, hexc, rough, scale):
        c = B.hex_rgb(hexc)
        c = [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c]
        MATS[name] = C.fabric_material(name, kind, (c[0], c[1], c[2], 1), rough=rough, scale=scale)
    fab('linen_cream', 'linen', '#d9ccae', 0.85, 7)
    fab('linen_white', 'linen', '#e8e2d4', 0.85, 7)
    fab('wool_dark', 'wool', '#2f2620', 0.92, 6)
    fab('wool_brown', 'wool', '#5a3f2a', 0.92, 6)
    fab('wool_green', 'wool', '#4a4a2e', 0.92, 6)
    fab('wool_skirt', 'wool', '#3c3326', 0.92, 6)
    fab('leather_dark', 'leather', '#2c1a0e', 0.5, 6)
    fab('leather_brown', 'leather', '#4a2c16', 0.48, 6)
    fab('leather_belt', 'leather', '#38200f', 0.45, 8)
    fab('leather_coat', 'leather', '#4e321e', 0.58, 4)
    fab('wool_cap', 'wool', '#5e4632', 0.92, 7)
    fab('rope', 'canvas', '#b8a27a', 0.9, 30)
    MATS['lace'] = C.plain_material('lace', (0.16, 0.11, 0.07, 1), 0.7)
    MATS['gourd'] = C.plain_material('gourd', (0.55, 0.36, 0.16, 1), 0.45)
    MATS['iron'] = C.plain_material('iron', (0.32, 0.3, 0.28, 1), 0.45, 0.85)
    MATS['brass'] = C.plain_material('brass', (0.75, 0.55, 0.28, 1), 0.35, 1.0)
    return MATS


def build(name, x=0.0):
    objs = B.build_human(name, B.SPECS[name], x_offset=x)
    add_expressions(objs)
    delete_helpers(objs['body'])
    return objs
