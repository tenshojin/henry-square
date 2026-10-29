# 按设定图的三套衣服：中年人（左侧喝酒）、老人（右侧）、女店员。年轻人的在 chars_build.outfit_dicer。
import math
import numpy as np
from mathutils import Vector
import chars_clothes as C
import chars_build as CB
from chars_build import masks, neck_hole, sleeve, legs_to, boot_from, hide_body, bone_axis, ring_loft


def eye_center(objs):
    e = objs['eyes']
    vs = [Vector(v.co) for v in e.data.vertices]
    return sum(vs, Vector()) / len(vs)


def cowl(info, name, rig, mat, offs=(0.05, 0.068, 0.05), front_open=1.1):
    """放下来的兜帽：绕脖子根部一圈，前面开口。"""
    h, t, d = bone_axis(rig, 'neck_01')
    cs = [h + d * (L * 0.105) for L in (-0.35, -0.12, 0.08)]
    rings = [C.ring(info, c, d, n=28, offset=off, ref=(0, -1, 0), region='body', rmax=0.4) for c, off in zip(cs, offs)]
    ob = C.loft(name, rings, mat, closed=True, open_sector=lambda k, n: (min(k, n - k) / n) * 6.283 < front_open)
    C.copy_weights(info, ob, restrict=['neck_01', 'spine_03', 'clavicle_l', 'clavicle_r'])
    C.solidify(ob, 0.006)
    return ob


def thigh_top(m, info, tmax, nz=-0.35, inner=0.5):
    no = info['no']
    x = info['co'][:, 0]
    tl = m['thigh'] & (x > 0) & (m['t_thigh_l'] < tmax) & (no[:, 2] > nz) & (no[:, 0] > -inner)
    tr = m['thigh'] & (x < 0) & (m['t_thigh_r'] < tmax) & (no[:, 2] > nz) & (no[:, 0] < inner)
    return tl | tr


def hang(info, ob, bones=('pelvis',)):
    C.bake_object_transform(ob)
    C.copy_weights(info, ob, restrict=list(bones))
    return ob


def outfit_drinker(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z, co = m['pel'], m['z'], info['co']
    waist = pel.z + 0.04
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    chest = sp3.z + 0.08
    out = {}
    front = co[:, 1] < sp3.y - 0.03
    vopen = front & (np.abs(co[:, 0]) < 0.035 + np.clip(chest - z, 0, None) * 0.28) & (z > waist - 0.15)
    coat_k = ((m['torso'] | sleeve(m, 0.9)) & ~neck_hole(m, 0.085, -0.3) & ~vopen & ~m['head']) | thigh_top(m, info, 0.62)
    shirt_k = (m['torso'] | sleeve(m, 0.95)) & ~neck_hole(m, 0.072) & (z > waist - 0.07) & ~m['head'] & ~C.erode(info['body'], coat_k, 2)
    out['shirt'] = C.shell(info, 'drinker.shirt', lambda i: shirt_k[i], lambda i, c, n: 0.005 + 0.006 * float(m['upper'][i]), mats['linen_cream'], solid=0.002, smooth=1)
    out['coat'] = C.shell(info, 'drinker.coat', lambda i: coat_k[i], lambda i, c, n: 0.02 + 0.01 * float(m['thigh'][i]), mats['leather_coat'], solid=0.005, smooth=2,
                          folds=C.fold_noise(0.004, 30, (0, 0, 1), 7))
    out['hood'] = cowl(info, 'drinker.hood', rig, mats['leather_coat'])
    pants_k = legs_to(m, 0.35) & ~(m['torso'] & (z > waist + 0.01)) & ~m['feet']
    out['pants'] = C.shell(info, 'drinker.pants', lambda i: pants_k[i], lambda i, c, n: 0.007, mats['wool_brown'], solid=0.002, smooth=1)
    boot_k = boot_from(m, 0.2)
    out.update(CB.boots(info, rig, m, mats['leather_dark'], 'drinker.boots', 0.2))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'lowerarm_' + s)
        out['bracer_' + s] = ring_loft(info, 'drinker.bracer_' + s, [h.lerp(t, 0.5 + 0.1 * k) for k in range(6)], d, mats['leather_dark'], n=20, offset=0.022,
                                       restrict=['lowerarm_' + s, 'hand_' + s], region='arm_' + s)
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.015
    out['belt'] = ring_loft(info, 'drinker.belt', [Vector((pel.x, pel.y, zb - 0.026)), Vector((pel.x, pel.y, zb + 0.026))], (0, 0, 1), mats['leather_belt'], n=48, offset=0.042, region='torso', rmax=0.3)
    fr = C.ring(info, Vector((pel.x, pel.y, zb)), (0, 0, 1), n=4, offset=0.05, ref=(0, -1, 0), region='torso', rmax=0.3)[0]
    buckle = C.lathe('drinker.buckle', [(0.0, 0), (0.03, 0), (0.034, 0.006), (0.024, 0.012), (0.0, 0.013)], mats['brass'], n=20)
    buckle.rotation_euler = (math.radians(90), 0, 0)
    buckle.location = fr
    out['buckle'] = hang(info, buckle)
    shL = Vector(C.bone_pts(rig, 'upperarm_l')[0]) + Vector((-0.02, 0, 0.05))
    hipR = Vector(C.bone_pts(rig, 'thigh_r')[0]) + Vector((-0.03, 0, 0.06))
    mid = (shL + hipR) / 2
    dvec = (hipR - shL).normalized()
    nrm = dvec.cross(Vector((0, 1, 0))).normalized()
    out['strap'] = ring_loft(info, 'drinker.strap', [mid - nrm * 0.022, mid + nrm * 0.022], nrm, mats['leather_belt'], n=56, offset=0.032, ref=dvec, region='torso', rmax=0.4)
    hide_body(objs['body'], shirt_k | coat_k | pants_k | boot_k)
    return out


def outfit_elder(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z, co = m['pel'], m['z'], info['co']
    waist = pel.z + 0.04
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    chest = sp3.z + 0.08
    ec = eye_center(objs)
    out = {}
    tunic_k = ((m['torso'] | sleeve(m, 0.93)) & ~neck_hole(m, 0.07) & ~m['head']) | thigh_top(m, info, 0.45)
    out['tunic'] = C.shell(info, 'elder.tunic', lambda i: tunic_k[i], lambda i, c, n: 0.007 + 0.008 * float(m['upper'][i] or m['low_l'][i] or m['low_r'][i]), mats['wool_brown'],
                           solid=0.002, smooth=1, folds=C.fold_noise(0.003, 40, (0, 0, 1), 9))
    jerk_k = m['torso'] & (m['up_w'] < 0.15) & ~neck_hole(m, 0.1, -0.4) & (z > waist - 0.12) & ~m['head']
    out['jerkin'] = C.shell(info, 'elder.jerkin', lambda i: jerk_k[i], lambda i, c, n: 0.02, mats['leather_brown'], solid=0.004, smooth=2)
    lap_k = thigh_top(m, info, 0.55, nz=0.25, inner=0.9)
    out['apron'] = C.shell(info, 'elder.apron', lambda i: lap_k[i], lambda i, c, n: 0.026, mats['leather_brown'], solid=0.004, smooth=3)
    back = co[:, 1] > sp3.y
    upper_part = m['upper'] & (m['t_upperarm_l'] < 0.55) & (m['t_upperarm_r'] < 0.55)
    cloak_k = (m['torso'] | upper_part) & ~neck_hole(m, 0.09, -0.35) & ~m['head'] & ((z > chest - 0.05) | (back & (z > pel.z - 0.02)))
    out['cloak'] = C.shell(info, 'elder.cloak', lambda i: cloak_k[i], lambda i, c, n: 0.038 + 0.02 * max(0.0, (chest - c.z) * 2.0), mats['wool_green'], solid=0.005, smooth=3,
                           folds=C.fold_noise(0.006, 22, (0, 0, 1), 11))
    out['hood'] = cowl(info, 'elder.hood', rig, mats['wool_green'], offs=(0.065, 0.085, 0.06), front_open=1.25)
    hb = Vector(C.bone_pts(rig, 'head')[0])
    head = m['head']
    cap_k = head & ((z > ec.z + 0.035) | ((co[:, 1] > ec.y + 0.07) & (z > ec.z - 0.01)))
    out['cap'] = C.shell(info, 'elder.cap', lambda i: cap_k[i], lambda i, c, n: 0.026 + 0.03 * max(0.0, min(1.0, (c.y - ec.y - 0.02) * 6)) * max(0.0, min(1.0, (c.z - ec.z - 0.04) * 12)), mats['wool_cap'], solid=0.004, smooth=4,
                         folds=C.fold_noise(0.004, 45, (1, 0.3, 0), 17))
    hc = Vector((hb.x, hb.y + 0.01, ec.z + 0.05))
    out['capband'] = ring_loft(info, 'elder.capband', [hc, hc + Vector((0, 0, 0.03))], (0, 0, 1), mats['wool_cap'], n=36, offset=0.032, region='head', rmax=0.25)
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.015
    out['rope'] = ring_loft(info, 'elder.rope', [Vector((pel.x, pel.y, zb - 0.008)), Vector((pel.x, pel.y, zb + 0.008))], (0, 0, 1), mats['rope'], n=40, offset=0.05, region='torso', rmax=0.3)
    side = C.ring(info, Vector((pel.x, pel.y, zb)), (0, 0, 1), n=8, offset=0.07, ref=(1, 0, 0), region='torso', rmax=0.3)
    g = C.lathe('elder.gourd', [(0.0, -0.06), (0.03, -0.055), (0.045, -0.03), (0.042, 0.0), (0.02, 0.02), (0.026, 0.045), (0.018, 0.065), (0.008, 0.075), (0.0, 0.078)], mats['gourd'], n=18)
    g.location = side[4] + Vector((-0.01, -0.02, -0.09))
    g.rotation_euler = (0.15, 0.2, 0)
    out['gourd'] = hang(info, g)
    p = C.sack('elder.pouch', side[0] + Vector((0.01, -0.03, -0.08)), (0.08, 0.05, 0.09), mats['leather_brown'], seed=4)
    out['pouch'] = hang(info, p)
    pants_k = legs_to(m, 0.45) & ~(m['torso'] & (z > waist + 0.01)) & ~m['feet']
    out['pants'] = C.shell(info, 'elder.pants', lambda i: pants_k[i], lambda i, c, n: 0.008, mats['wool_dark'], solid=0.002, smooth=1)
    boot_k = boot_from(m, 0.42)
    out.update(CB.boots(info, rig, m, mats['leather_brown'], 'elder.boots', 0.42))
    hide_body(objs['body'], tunic_k | jerk_k | pants_k | boot_k)
    return out


def outfit_barmaid(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z, co = m['pel'], m['z'], info['co']
    waist = pel.z + 0.07
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    ec = eye_center(objs)
    chest_sel = m['torso'] & (co[:, 2] > sp3.z - 0.1) & (co[:, 2] < sp3.z + 0.25) & (np.abs(co[:, 0]) < 0.15)
    bust = float(co[chest_sel][np.argmin(co[chest_sel][:, 1]), 2])
    out = {}
    front = co[:, 1] < sp3.y - 0.02
    scoop = front & (z > bust + 0.075) & (np.abs(co[:, 0]) < 0.1)
    puff = m['upper'] & (m['t_upperarm_l'] < 0.62) & (m['t_upperarm_r'] < 0.62)
    bod_k = m['torso'] & (z > waist - 0.09) & (z < bust - 0.035) & (m['up_w'] < 0.08)
    blouse_k = (m['torso'] | puff) & ~neck_hole(m, 0.1, -0.5) & ~scoop & (z > waist - 0.06) & ~m['head'] & ~C.erode(info['body'], bod_k, 2)
    tu = np.maximum(np.where(co[:, 0] > 0, m['t_upperarm_l'], m['t_upperarm_r']), 0)
    out['blouse'] = C.shell(info, 'barmaid.blouse', lambda i: blouse_k[i],
                            lambda i, c, n: 0.006 + (0.03 * math.sin(math.pi * min(1.0, tu[i] / 0.62)) if m['upper'][i] else 0.0),
                            mats['linen_white'], solid=0.002, smooth=2, folds=C.fold_noise(0.003, 55, (0, 0, 1), 13))
    out['bodice'] = C.shell(info, 'barmaid.bodice', lambda i: bod_k[i], lambda i, c, n: 0.013, mats['leather_dark'], solid=0.004, smooth=2)
    # 前襟交叉系带
    lace_pts = []
    for k in range(6):
        zz = waist - 0.06 + k * 0.035
        r = C.ring(info, Vector((pel.x, sp3.y, zz)), (0, 0, 1), n=72, offset=0.02, ref=(0, -1, 0), region='torso', rmax=0.3)
        lace_pts.append((r[71 if k % 2 else 1], r[1 if k % 2 else 71]))
    for k in range(len(lace_pts) - 1):
        a, b = lace_pts[k][0], lace_pts[k + 1][1]
        L = (b - a).length
        cyl = C.lathe('barmaid.lace%d' % k, [(0.0, 0), (0.0025, 0), (0.0025, L), (0.0, L)], mats['lace'], n=6)
        cyl.location = a
        cyl.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
        out['lace%d' % k] = hang(info, cyl, ('spine_01', 'spine_02'))
    # 长裙：围着竖直轴一圈圈往下，越往下越撑开，加竖褶
    zs = [waist + 0.01 - (waist - 0.07) * (k / 13) ** 1.05 for k in range(14)]
    rings = []
    hipr = 0.0
    for k, zz in enumerate(zs):
        cen = Vector((pel.x, pel.y + 0.01, zz))
        base = C.ring(info, cen, (0, 0, 1), n=48, offset=0.014, region='lower', rmax=0.5)
        rs = [(p - cen).length for p in base]
        if k == 0:
            hipr = max(rs)
        rmin_z = hipr * (0.98 + 0.28 * (k / 13))
        ring_k = []
        for j, p in enumerate(base):
            a = 2 * math.pi * j / 48
            r = max((p - cen).length, rmin_z) + 0.014 * (k / 13) * math.sin(a * 11 + k * 0.35)
            ring_k.append(cen + (p - cen).normalized() * r)
        rings.append(ring_k)
    skirt = C.loft('barmaid.skirt', rings, mats['wool_skirt'])
    C.copy_weights(info, skirt, restrict=['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'])
    C.solidify(skirt, 0.004)
    out['skirt'] = skirt
    ap_rings = []
    for k, rk in enumerate(rings[:11]):
        cen = Vector((pel.x, pel.y + 0.01, zs[k]))
        ap_rings.append([cen + (p - cen) + (p - cen).normalized() * (0.012 + 0.004 * k / 10) for p in rk])
    apron = C.loft('barmaid.apron', ap_rings, mats['linen_white'], closed=True, open_sector=lambda j, n: not (j < n * 0.15 or j >= n * 0.85))
    C.copy_weights(info, apron, restrict=['pelvis', 'thigh_l', 'thigh_r'])
    C.solidify(apron, 0.002)
    out['apron'] = apron
    out['sash'] = ring_loft(info, 'barmaid.sash', [Vector((pel.x, pel.y, waist - 0.005)), Vector((pel.x, pel.y, waist + 0.025))], (0, 0, 1), mats['linen_white'], n=48, offset=0.03, region='torso', rmax=0.3)
    head = m['head']
    kerch_k = head & ((z > ec.z + 0.05) | ((co[:, 1] > ec.y + 0.115) & (z > ec.z - 0.03)))
    out['kerchief'] = C.shell(info, 'barmaid.kerchief', lambda i: kerch_k[i], lambda i, c, n: 0.03 + 0.02 * max(0.0, (c.y - ec.y - 0.08) * 6), mats['linen_white'],
                              solid=0.003, smooth=3, folds=C.fold_noise(0.003, 70, (1, 0, 0), 15))
    hb = Vector(C.bone_pts(rig, 'head')[0])
    knot = C.sack('barmaid.knot', Vector((hb.x, hb.y + 0.11, ec.z - 0.01)), (0.05, 0.04, 0.045), mats['linen_white'], seed=7, neck=0.1)
    out['knot'] = hang(info, knot, ('head',))
    shoe_k = m['feet'] | (m['calf_l'] & (m['t_calf_l'] > 0.88)) | (m['calf_r'] & (m['t_calf_r'] > 0.88))
    for s in ('l', 'r'):
        out['shoe_' + s] = CB.foot_shoe(info, rig, s, mats['leather_dark'], 'barmaid.shoe_' + s, offset=0.007)
    side = C.ring(info, Vector((pel.x, pel.y, waist - 0.03)), (0, 0, 1), n=8, offset=0.06, ref=(1, 0, 0), region='torso', rmax=0.3)
    out['pouch'] = hang(info, C.sack('barmaid.pouch', side[1] + Vector((0, 0, -0.08)), (0.07, 0.04, 0.08), mats['leather_brown'], seed=9))
    legs_hidden = m['thigh'] | (m['calf_l'] & (m['t_calf_l'] < 0.8)) | (m['calf_r'] & (m['t_calf_r'] < 0.8))
    hide_body(objs['body'], blouse_k | bod_k | legs_hidden | shoe_k)
    return out


OUTFITS = {'dicer': CB.outfit_dicer, 'drinker': outfit_drinker, 'elder': outfit_elder, 'barmaid': outfit_barmaid}
HANDS = {
    # 手腕位置（骨架空间，人面朝 -y）。两侧的人手不能伸进中间的骰盘和骰盅区域
    'dicer': {'l': ((0.2, -0.36, 0.79), (0.55, 0.15, 0.85), (0.15, -1, -0.12)), 'r': ((-0.2, -0.36, 0.79), (-0.55, 0.15, 0.85), (-0.15, -1, -0.12))},
    'drinker': {'l': ((0.16, -0.24, 0.79), (0.55, 0.2, 0.85), (0.45, -1, -0.12)), 'r': ((-0.2, -0.22, 0.84), (-0.55, 0.15, 0.8), (-0.3, -1, 0.05))},
    'elder': {'l': ((0.18, -0.24, 0.8), (0.55, 0.18, 0.85), (0.45, -1, -0.12)), 'r': ((-0.18, -0.24, 0.8), (-0.55, 0.18, 0.85), (-0.45, -1, -0.12))},
}


def build_one(name, x=0.0):
    """完整造一个人物：身体 → 表情 → 坐姿(或站姿) → 衣服。返回 (objs, clothes)。"""
    P = CB.P
    objs = CB.build(name, x)
    if name in HANDS:
        CB.sit(objs, HANDS[name])
        P.apply_rest(objs['rig'], CB.mesh_objs(objs))
    info = C.body_info(objs['body'], objs['rig'])
    mats = CB.materials()
    clothes = OUTFITS[name](objs, info, mats)
    for k, ob in clothes.items():
        C.add_armature(ob, objs['rig'])
        ob['henry_char'] = name
    import chars_anim as A
    A.make_all(name, objs['rig'], objs)
    return objs, clothes
