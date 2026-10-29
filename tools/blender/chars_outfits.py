# 四套衣服（v3.1，按设定图、站姿上做）：
#  年轻人（投骰子）：亚麻衬衫卷袖、铆钉皮马甲、宽腰带 + 斜挂的工具腰带和皮袋、左肩到右胯的斜挎带、灰褐长裤、高筒靴
#  中年人（左侧喝酒）：带兜帽的皮披肩、及小腿的开衩长皮外套（里面露出浅色内袍）、衬衫袖、双护腕、红腰封、皮带皮袋、铜饰斜挎带、高筒靴
#  老人（右侧）：卷边布头巾帽、带兜帽的橄榄绿短斗篷（毛边）、褐色长袍、米色围裙、皮带 + 皮袋 + 葫芦、灯笼裤、短靴
#  女店员：头巾、发髻、泡泡袖白衬衫、系带深绿皮胸衣、腰带、深绿长裙 + 锈红衬裙边、米色长围裙、背后蝴蝶结、皮袋、短靴
import math
import numpy as np
from mathutils import Vector
import chars_clothes as C
import chars_build as CB
from chars_build import masks, neck_hole, sleeve, legs_to, boot_from, hide_body, bone_axis, ring_loft, TORSO


def eye_center(objs):
    e = objs['eyes']
    vs = [Vector(v.co) for v in e.data.vertices]
    return sum(vs, Vector()) / len(vs)


def hang(info, ob, bones=('pelvis',)):
    C.bake_object_transform(ob)
    C.copy_weights(info, ob, restrict=list(bones))
    return ob


def smooth_weights(ob, iters=4, factor=0.5):
    """沿网格边把骨骼权重抹匀（长外套、裙子走路坐下时不会一道道折）。"""
    me = ob.data
    n = len(me.vertices)
    groups = list(ob.vertex_groups)
    if not groups or not n:
        return
    W = np.zeros((n, len(groups)), dtype=np.float32)
    for v in me.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    E = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', E)
    E = E.reshape(-1, 2)
    for _ in range(iters):
        acc = np.zeros_like(W)
        cnt = np.zeros(n, dtype=np.float32)
        np.add.at(acc, E[:, 0], W[E[:, 1]])
        np.add.at(acc, E[:, 1], W[E[:, 0]])
        np.add.at(cnt, E[:, 0], 1)
        np.add.at(cnt, E[:, 1], 1)
        W = W * (1 - factor) + factor * acc / np.maximum(cnt, 1)[:, None]
    W /= np.maximum(W.sum(1, keepdims=True), 1e-8)
    for j, g in enumerate(groups):
        g.remove(list(range(n)))
        for i in np.nonzero(W[:, j] > 0.01)[0]:
            g.add([int(i)], float(W[i, j]), 'REPLACE')


def fray(co, amp=0.012, f=(140.0, 97.0, 61.0), seed=0.0):
    """毛边：给裁剪用的距离场加一点高频起伏。"""
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    return amp * (0.55 * np.sin(x * f[0] + seed) * np.sin(z * f[1] + 1.3 * seed) + 0.45 * np.sin((x + y) * f[2] + 2.1 * seed))


def skirt_loft(info, name, pel, z_top, z_bot, mat, n=48, rows=14, ease=0.014, flare=0.28, cen_dy=0.01,
               open_sector=None, wave=0.012, folds=11, jag=0.0, seed=1, back_extra=0.0, front_extra=0.0, solid=0.004, with_rings=False):
    """从 z_top 到 z_bot 一圈圈往下的裙摆/长衣下摆：贴着腿的外轮廓，越往下越撑开，加竖褶；jag 让下摆参差。"""
    rng = np.random.default_rng(seed)
    jag_off = np.convolve(np.r_[rng.uniform(-1, 1, n), rng.uniform(-1, 1, 4)], np.ones(3) / 3, 'same')[:n] * jag
    zs = [z_top - (z_top - z_bot) * (k / (rows - 1)) ** 1.05 for k in range(rows)]
    rings = []
    hipr = None
    for k, zz in enumerate(zs):
        cen = Vector((pel.x, pel.y + cen_dy, zz))
        base = C.ring(info, cen, (0, 0, 1), n=n, offset=ease, region='lower', rmax=0.55)
        rs = [(p - cen).length for p in base]
        if hipr is None:
            hipr = max(rs)
        tk = k / (rows - 1)
        rmin_z = hipr * (0.98 + flare * tk)
        ring_k = []
        for j, p in enumerate(base):
            a = 2 * math.pi * j / n
            d = (p - cen)
            d.z = 0
            d = d.normalized() if d.length > 1e-6 else Vector((math.sin(a), -math.cos(a), 0))
            fb = -d.y  # 1 = 正前，-1 = 正后
            extra = (front_extra * max(0.0, fb) + back_extra * max(0.0, -fb)) * tk
            r = max((p - cen).length, rmin_z) + wave * tk * math.sin(a * folds + k * 0.35) + extra
            q = cen + d * r
            if k == rows - 1:
                q.z += jag_off[j]
            ring_k.append(q)
        rings.append(ring_k)
    ob = C.loft(name, rings, mat, open_sector=open_sector)
    C.copy_weights(info, ob, restrict=['pelvis', 'spine_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'])
    smooth_weights(ob, 6)
    if solid:
        C.solidify(ob, solid)
    if with_rings:
        return ob, rings, [Vector((pel.x, pel.y + cen_dy, zz)) for zz in zs]
    return ob


def rings_loft(info, name, rings, cens, mat, dr=0.0, k_scale=1.0, dz=0.0, open_sector=None, solid=0.003):
    """沿已有的裙子截面再做一层（往外 dr 米 / 按比例缩放，整体下移 dz）：衬裙、围裙用，保证和裙子不穿插。"""
    new = []
    for k, (r, c) in enumerate(zip(rings, cens)):
        rr = []
        for p in r:
            d = p - Vector((c.x, c.y, p.z))
            L = d.length
            q = Vector((c.x, c.y, p.z)) + (d.normalized() * (L * k_scale + (dr(k) if callable(dr) else dr)) if L > 1e-6 else d)
            q.z -= dz
            rr.append(q)
        new.append(rr)
    ob = C.loft(name, new, mat, open_sector=open_sector)
    C.copy_weights(info, ob, restrict=['pelvis', 'spine_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'])
    smooth_weights(ob, 6)
    if solid:
        C.solidify(ob, solid)
    return ob


def belt(info, name, pel, zc, height, offset, mat, buckle_mat=None, tilt=0.0, n=56, square=True):
    """腰带（tilt：左高右低的斜度，米/米）+ 正面的扣环。"""
    h2 = height / 2
    rings = []
    for dz in (-h2, h2):
        cen = Vector((pel.x, pel.y, zc + dz))
        base = C.ring(info, cen, (0, 0, 1), n=n, offset=offset, region='torso', rmax=0.35)
        rings.append([p + Vector((0, 0, tilt * p.x)) for p in base])
    ob = C.loft(name, rings, mat)
    C.copy_weights(info, ob, restrict=['pelvis', 'spine_01'])
    C.solidify(ob, 0.006)
    out = {name.split('.')[-1]: ob}
    if buckle_mat is not None:
        front = rings[0][0].lerp(rings[1][0], 0.5)
        if square:
            import bpy, bmesh
            bw, bh = height * 1.15, height * 1.25
            pts = [(-bw / 2, -bh / 2), (bw / 2, -bh / 2), (bw / 2, bh / 2), (-bw / 2, bh / 2)]
            bm = bmesh.new()
            outer = [bm.verts.new((x, 0, y)) for x, y in pts]
            inner = [bm.verts.new((x * 0.62, 0, y * 0.62)) for x, y in pts]
            for i in range(4):
                j = (i + 1) % 4
                bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
            me = bpy.data.meshes.new(name + '_buckle')
            bm.to_mesh(me)
            bm.free()
            me.materials.append(buckle_mat)
            frame = C.link(bpy.data.objects.new(name + '_buckle', me))
            C.solidify(frame, 0.005)
            frame.location = front + Vector((0, -0.006, 0))
        else:
            frame = C.lathe(name + '_buckle', [(0.0, 0), (height * 0.62, 0), (height * 0.7, 0.006), (height * 0.5, 0.012), (0.0, 0.013)], buckle_mat, n=24)
            frame.rotation_euler = (math.radians(90), 0, 0)
            frame.location = front
        out[name.split('.')[-1] + '_buckle'] = hang(info, frame, ('pelvis', 'spine_01'))
    return out


def pouch(info, name, at, size, mat, seed=1, flap_mat=None):
    """挂在腰带上的皮袋：方一点的袋身 + 盖子。"""
    body = C.sack(name, at, size, mat, seed=seed, neck=0.05)
    return hang(info, body, ('pelvis', 'thigh_l', 'thigh_r'))


def strap(info, name, p0, p1, width, offset, mat, rmax=0.4):
    mid = (p0 + p1) / 2
    dvec = (p1 - p0).normalized()
    nrm = dvec.cross(Vector((0, 1, 0))).normalized()
    return ring_loft(info, name, [mid - nrm * width / 2, mid + nrm * width / 2], nrm, mat, n=60, offset=offset, ref=dvec, region='torso', rmax=rmax)


def cowl(info, name, rig, mat, offs=(0.05, 0.068, 0.05), front_open=1.1, drop=0.0):
    """放下来的兜帽：绕脖子根部一圈，前面开口。"""
    h, t, d = bone_axis(rig, 'neck_01')
    cs = [h + d * (L * 0.105) - Vector((0, 0, drop)) for L in (-0.35, -0.12, 0.08)]
    rings = [C.ring(info, c, d, n=28, offset=off, ref=(0, -1, 0), region='body', rmax=0.4) for c, off in zip(cs, offs)]
    ob = C.loft(name, rings, mat, closed=True, open_sector=lambda k, n: (min(k, n - k) / n) * 6.283 < front_open)
    C.copy_weights(info, ob, restrict=['neck_01', 'spine_03', 'clavicle_l', 'clavicle_r'])
    C.solidify(ob, 0.006)
    return ob


def hood_drape(info, name, rig, m, mat, length=0.3, width=0.15, offset=0.05):
    """兜帽垂在背上的那一片：后背上部，越往下越窄（尖兜帽的样子）。"""
    co = info['co']
    nk = Vector(C.bone_pts(rig, 'neck_01')[0])
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    back = co[:, 1] > sp3.y + 0.02
    zt = nk.z + 0.02
    t = np.clip((zt - co[:, 2]) / length, 0, 1)
    phi = np.maximum.reduce([(0.5 - C.wsum(info, None, TORSO + ['neck_01'])), np.abs(co[:, 0] - nk.x) - width * (1 - 0.85 * t ** 1.3),
                             co[:, 2] - zt, (zt - length) - co[:, 2], -(co[:, 1] - sp3.y - 0.02)])
    phi = phi + fray(co, 0.004, seed=3.0)
    k = phi < 0
    return C.shell(info, name, lambda i: k[i], lambda i, c, nn: offset + 0.02 * max(0.0, min(1.0, (zt - c.z) / length)), mat,
                   solid=0.005, smooth=2, relax=8, field=phi, folds=C.fold_noise(0.005, 30, (1, 0, 0), 21))


def capelet(info, name, rig, m, mat, front_z, back_z, arm_t=0.55, offset=0.03, drape=0.05, amp=0.012, seed=1.0, front_open=0.0):
    """短斗篷/披肩：盖住肩膀、上臂上半段、前胸到 front_z、后背到 back_z，下缘毛边，越往下离身体越远。"""
    co = info['co']
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    nk = Vector(C.bone_pts(rig, 'neck_01')[0])
    fb = np.clip((co[:, 1] - sp3.y) / 0.12, -1, 1)  # -1 前 … 1 后
    zcut = front_z + (back_z - front_z) * (fb * 0.5 + 0.5)
    arms = m['upper'] & (m['t_upperarm_l'] < arm_t) & (m['t_upperarm_r'] < arm_t)
    region = (m['torso'] | arms) & ~m['head']
    ta = np.where(co[:, 0] > 0, m['t_upperarm_l'], m['t_upperarm_r'])
    phi = np.where(m['upper'] | (C.wsum(info, None, ['upperarm_l', 'upperarm_r']) > 0.35), ta - arm_t, zcut - co[:, 2])
    phi = np.maximum.reduce([phi, (0.5 - (C.wsum(info, None, TORSO + ['neck_01', 'upperarm_l', 'upperarm_r']))),
                             np.minimum((m['t_neck_01'] + 0.25) * 0.1, 0.09 - m['r_neck_01']), C.wsum(info, None, ['head']) - 0.5])
    if front_open:
        phi = np.maximum(phi, np.minimum(front_open - np.abs(co[:, 0] - nk.x), co[:, 1] - (sp3.y - 0.04)))
    phi = phi + fray(co, amp, seed=seed)
    k = phi < 0
    top = nk.z
    return C.shell(info, name, lambda i: k[i], lambda i, c, nn: offset + drape * max(0.0, min(1.0, (top - c.z) / 0.35)), mat,
                   solid=0.005, smooth=2, relax=6, field=phi, folds=C.fold_noise(0.006, 26, (0, 0, 1), int(seed * 7) + 3))


# ======================= 年轻人（投骰子） =======================
def outfit_dicer(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z = m['pel'], m['z']
    co, no = info['co'], info['no']
    waist = pel.z + 0.05
    out = {}
    nk = Vector(C.bone_pts(rig, 'neck_01')[0])
    zb = Vector(C.bone_pts(rig, 'spine_03')[0]).z - 0.05
    f = np.clip((co[:, 2] - zb) / max(nk.z - zb, 1e-3), 0, 1)
    # 马甲：V 领开到胸口下面
    v_open = np.minimum(np.minimum(-0.25 - no[:, 1], co[:, 2] - zb), 0.07 * f - np.abs(co[:, 0] - nk.x))
    v_neck = np.minimum((m['t_neck_01'] + 0.15) * 0.1, 0.085 - m['r_neck_01'])
    vest_phi = np.maximum.reduce([0.5 - C.wsum(info, None, TORSO + ['neck_01']), m['up_w'] - 0.4, v_neck, v_open,
                                  (waist - 0.11) - z, C.wsum(info, None, ['head']) - 0.5])
    vest_k = vest_phi < 0
    # 衬衫：领口开个小 V，袖子卷到前臂上段
    shirt_v = (co[:, 1] < nk.y - 0.02) & (np.abs(co[:, 0] - nk.x) < 0.012 + np.clip(nk.z - co[:, 2], 0, None) * 0.3) & (co[:, 2] > nk.z - 0.15)
    shirt_k = (m['torso'] | sleeve(m, 0.3)) & ~neck_hole(m, 0.074) & ~shirt_v & (z > waist - 0.08) & ~m['head'] & ~C.erode(info['body'], vest_k, 2)
    tl = np.maximum(np.where(co[:, 0] > 0, m['t_lowerarm_l'], m['t_lowerarm_r']), 0)
    out['shirt'] = C.shell(info, 'dicer.shirt', lambda i: shirt_k[i],
                           lambda i, c, n: 0.007 + 0.014 * float(m['upper'][i]) + 0.012 * float((m['low_l'][i] or m['low_r'][i]) and tl[i] < 0.3),
                           mats['linen_cream'], solid=0.002, smooth=2, folds=C.fold_noise(0.004, 50, (0, 0, 1), 3))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'lowerarm_' + s)
        out['cuff_' + s] = ring_loft(info, 'dicer.cuff_' + s, [h.lerp(t, 0.22 + 0.035 * k) for k in range(4)], d, mats['linen_cream'], n=22,
                                     offset=0.024, region='arm_' + s, rmax=0.09, wobble=lambda a: 0.004 * math.sin(a * 5))
    out['vest'] = C.shell(info, 'dicer.vest', lambda i: vest_k[i], lambda i, c, n: 0.02, mats['leather_vest'], solid=0.004, smooth=2, relax=6, snap=True, field=vest_phi)
    # 裤子：大腿略宽松
    pants_k = legs_to(m, 0.42) & ~(m['torso'] & (z > waist + 0.01)) & ~m['feet']
    out['pants'] = C.shell(info, 'dicer.pants', lambda i: pants_k[i], lambda i, c, n: 0.009 + 0.008 * float(m['thigh'][i]), mats['wool_olive_pants'], solid=0.002, smooth=2,
                           folds=C.fold_noise(0.004, 40, (0, 0, 1), 5))
    boot_k = boot_from(m, 0.2)
    out.update(CB.boots(info, rig, m, mats['leather_boot'], 'dicer.boots', 0.2, offset=0.014))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'calf_' + s)
        out['bootcuff_' + s] = ring_loft(info, 'dicer.bootcuff_' + s, [h.lerp(t, 0.17 + 0.045 * k) for k in range(3)], d, mats['leather_boot'], n=24, offset=0.024, region='leg_' + s)
    zb1 = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.005
    out.update(belt(info, 'dicer.belt', pel, zb1, 0.05, 0.03, mats['leather_belt'], mats['brass']))
    out.update(belt(info, 'dicer.hipbelt', pel, zb1 - 0.075, 0.035, 0.042, mats['leather_belt'], None, tilt=0.18))
    for s, sx in (('l', 1), ('r', -1)):
        side = C.ring(info, Vector((pel.x, pel.y, zb1 - 0.08)), (0, 0, 1), n=16, offset=0.06, ref=(sx, 0, 0), region='torso', rmax=0.35)[0]
        out['pouch_' + s] = pouch(info, 'dicer.pouch_' + s, side + Vector((0, -0.02, -0.07)), (0.05, 0.085, 0.11), mats['leather_brown'], seed=11 + sx)
    h, t, d = bone_axis(rig, 'lowerarm_l')
    out['bracer'] = ring_loft(info, 'dicer.bracer', [h.lerp(t, 0.58 + 0.09 * k) for k in range(5)], d, mats['leather_brown'], n=20, offset=0.013, restrict=['lowerarm_l', 'hand_l'], region='arm_l', rmax=0.09)
    # 斜挎带：左肩（锁骨外侧）→ 右胯
    cl_h, cl_t = C.bone_pts(rig, 'clavicle_l')
    shL = Vector(cl_h).lerp(Vector(cl_t), 0.62) + Vector((0, 0, 0.07))
    hipR = Vector(C.bone_pts(rig, 'thigh_r')[0]) + Vector((-0.03, 0, 0.06))
    out['strap'] = strap(info, 'dicer.strap', shL, hipR, 0.04, 0.032, mats['leather_belt'])
    hide_body(objs['body'], shirt_k | vest_k | pants_k | boot_k)
    return out


# ======================= 中年人（左侧喝酒） =======================
def outfit_drinker(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z, co = m['pel'], m['z'], info['co']
    waist = pel.z + 0.04
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    knee = Vector(C.bone_pts(rig, 'calf_l')[0])
    out = {}
    shirt_k = (m['torso'] | sleeve(m, 0.92)) & ~neck_hole(m, 0.075) & (z > waist - 0.08) & ~m['head']
    out['shirt'] = C.shell(info, 'drinker.shirt', lambda i: shirt_k[i], lambda i, c, n: 0.007 + 0.016 * float(m['upper'][i]) + 0.008 * float(m['low_l'][i] or m['low_r'][i]),
                           mats['linen_cream'], solid=0.002, smooth=2, folds=C.fold_noise(0.004, 45, (0, 0, 1), 7))
    # 无袖长皮外套：上身（不含手臂）+ 长下摆
    front = co[:, 1] < sp3.y - 0.03
    vopen = front & (np.abs(co[:, 0]) < 0.03 + np.clip(sp3.z + 0.12 - z, 0, None) * 0.25) & (z > waist - 0.05)
    coat_k = m['torso'] & (m['up_w'] < 0.3) & ~neck_hole(m, 0.09, -0.3) & ~vopen & ~m['head'] & (z > waist - 0.12)
    out['coat'] = C.shell(info, 'drinker.coat', lambda i: coat_k[i], lambda i, c, n: 0.022, mats['leather_coat'], solid=0.005, smooth=2,
                          folds=C.fold_noise(0.004, 30, (0, 0, 1), 9))
    split = lambda k, n: min(k, n - k) < n * 0.035
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.01
    out['coat_skirt'] = skirt_loft(info, 'drinker.coat_skirt', pel, zb - 0.025, knee.z - 0.2, mats['leather_coat'], n=56, rows=15, ease=0.03,
                                   flare=0.34, open_sector=split, wave=0.016, folds=9, jag=0.025, seed=3, back_extra=0.02, solid=0.005)
    out['undertunic'] = skirt_loft(info, 'drinker.undertunic', pel, zb - 0.035, knee.z - 0.06, mats['linen_tan'], n=48, rows=12, ease=0.018,
                                   flare=0.22, open_sector=lambda k, n: not (k < n * 0.12 or k >= n * 0.88), wave=0.01, folds=13, jag=0.02, seed=5, solid=0.003)
    out['mantle'] = capelet(info, 'drinker.mantle', rig, m, mats['leather_mantle'], sp3.z + 0.03, sp3.z - 0.1, arm_t=0.6, offset=0.02, drape=0.024, amp=0.012, seed=1.7)
    out['hood'] = cowl(info, 'drinker.hood', rig, mats['leather_mantle'], offs=(0.06, 0.085, 0.07), front_open=1.0)
    out['hood_back'] = hood_drape(info, 'drinker.hood_back', rig, m, mats['leather_mantle'], length=0.32, width=0.15, offset=0.062)
    pants_k = legs_to(m, 0.3) & ~(m['torso'] & (z > waist + 0.01)) & ~m['feet']
    out['pants'] = C.shell(info, 'drinker.pants', lambda i: pants_k[i], lambda i, c, n: 0.01, mats['wool_dark'], solid=0.002, smooth=1)
    boot_k = boot_from(m, 0.14)
    out.update(CB.boots(info, rig, m, mats['leather_boot'], 'drinker.boots', 0.14, offset=0.018))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'lowerarm_' + s)
        out['bracer_' + s] = ring_loft(info, 'drinker.bracer_' + s, [h.lerp(t, 0.36 + 0.1 * k) for k in range(7)], d, mats['leather_dark'], n=20, offset=0.024,
                                       restrict=['lowerarm_' + s, 'hand_' + s], region='arm_' + s, rmax=0.1)
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.01
    out['sash'] = ring_loft(info, 'drinker.sash', [Vector((pel.x, pel.y, zb - 0.06)), Vector((pel.x, pel.y, zb + 0.05))], (0, 0, 1), mats['wool_red'], n=48, offset=0.045, region='torso', rmax=0.35)
    out.update(belt(info, 'drinker.belt', pel, zb, 0.055, 0.056, mats['leather_belt'], mats['brass'], square=False))
    out.update(belt(info, 'drinker.hipbelt', pel, zb - 0.09, 0.035, 0.07, mats['leather_belt'], None, tilt=-0.15))
    for s, sx in (('l', 1), ('r', -1)):
        side = C.ring(info, Vector((pel.x, pel.y, zb - 0.1)), (0, 0, 1), n=16, offset=0.08, ref=(sx, 0, 0), region='torso', rmax=0.35)[0]
        out['pouch_' + s] = pouch(info, 'drinker.pouch_' + s, side + Vector((0, -0.03, -0.08)), (0.05, 0.08, 0.11), mats['leather_brown'], seed=21 + sx)
    shL = Vector(C.bone_pts(rig, 'upperarm_l')[0]) + Vector((-0.03, 0, 0.06))
    hipR = Vector(C.bone_pts(rig, 'thigh_r')[0]) + Vector((-0.03, 0, 0.07))
    out['strap'] = strap(info, 'drinker.strap', shL, hipR, 0.045, 0.062, mats['leather_belt'])
    # 胸前的铜饰（罗盘纹样的圆牌）
    mid = shL.lerp(hipR, 0.3)
    fr = C.ring(info, mid, (0, 0, 1), n=4, offset=0.07, ref=(0, -1, 0), region='torso', rmax=0.4)[0]
    med = C.lathe('drinker.medal', [(0.0, 0), (0.034, 0), (0.038, 0.004), (0.03, 0.009), (0.012, 0.012), (0.0, 0.012)], mats['brass'], n=24)
    med.rotation_euler = (math.radians(90), 0, 0)
    med.location = fr
    out['medal'] = hang(info, med, ('spine_02', 'spine_03'))
    hide_body(objs['body'], shirt_k | coat_k | pants_k | boot_k)
    return out


# ======================= 老人（右侧） =======================
def outfit_elder(objs, info, mats):
    rig = objs['rig']
    m = masks(info)
    pel, z, co = m['pel'], m['z'], info['co']
    waist = pel.z + 0.04
    sp3 = Vector(C.bone_pts(rig, 'spine_03')[0])
    knee = Vector(C.bone_pts(rig, 'calf_l')[0])
    ec = eye_center(objs)
    out = {}
    shirt_k = (m['torso'] | sleeve(m, 0.86)) & ~neck_hole(m, 0.075) & (z > waist - 0.08) & ~m['head']
    out['shirt'] = C.shell(info, 'elder.shirt', lambda i: shirt_k[i], lambda i, c, n: 0.008 + 0.016 * float(m['upper'][i] or m['low_l'][i] or m['low_r'][i]),
                           mats['linen_cream'], solid=0.002, smooth=2, folds=C.fold_noise(0.004, 40, (0, 0, 1), 9))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'lowerarm_' + s)
        out['cuff_' + s] = ring_loft(info, 'elder.cuff_' + s, [h.lerp(t, 0.78 + 0.035 * k) for k in range(3)], d, mats['linen_cream'], n=20, offset=0.022, region='arm_' + s, rmax=0.1)
    robe_k = m['torso'] & (m['up_w'] < 0.3) & ~neck_hole(m, 0.085, -0.3) & ~m['head'] & (z > waist - 0.12)
    out['robe'] = C.shell(info, 'elder.robe', lambda i: robe_k[i], lambda i, c, n: 0.02, mats['wool_brown'], solid=0.004, smooth=2, folds=C.fold_noise(0.004, 36, (0, 0, 1), 13))
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.01
    out['robe_skirt'] = skirt_loft(info, 'elder.robe_skirt', pel, zb - 0.025, knee.z - 0.15, mats['wool_brown'], n=56, rows=15, ease=0.03,
                                   flare=0.3, wave=0.018, folds=10, jag=0.02, seed=7, back_extra=0.015, solid=0.004)
    out['apron'] = skirt_loft(info, 'elder.apron', pel, zb - 0.02, knee.z + 0.02, mats['canvas_apron'], n=48, rows=12, ease=0.05,
                              flare=0.26, open_sector=lambda k, n: not (k < n * 0.17 or k >= n * 0.83), wave=0.012, folds=7, jag=0.03, seed=9, solid=0.003)
    out['cape'] = capelet(info, 'elder.cape', rig, m, mats['wool_olive'], sp3.z + 0.02, sp3.z - 0.12, arm_t=0.58, offset=0.022, drape=0.03, amp=0.016, seed=4.2)
    out['hood'] = cowl(info, 'elder.hood', rig, mats['wool_olive'], offs=(0.07, 0.095, 0.075), front_open=1.0)
    out['hood_back'] = hood_drape(info, 'elder.hood_back', rig, m, mats['wool_olive'], length=0.3, width=0.16, offset=0.072)
    # 卷边布帽：头顶一层鼓起的布 + 一圈粗的卷边
    hb = Vector(C.bone_pts(rig, 'head')[0])
    head = m['head']
    cap_k = head & ((z > ec.z + 0.04) | ((co[:, 1] > ec.y + 0.08) & (z > ec.z - 0.01)))
    out['cap'] = C.shell(info, 'elder.cap', lambda i: cap_k[i], lambda i, c, n: 0.018 + 0.012 * max(0.0, min(1.0, (c.z - ec.z - 0.06) * 10)) + 0.03 * max(0.0, min(1.0, (c.y - ec.y - 0.02) * 8)), mats['wool_cap'], solid=0.004, smooth=4,
                         folds=C.fold_noise(0.005, 40, (1, 0.3, 0), 17))
    hc = Vector((hb.x, hb.y + 0.012, ec.z + 0.045))
    out['capband'] = ring_loft(info, 'elder.capband', [hc + Vector((0, 0, dz)) for dz in (-0.016, -0.006, 0.008, 0.024, 0.038, 0.048)], (0, 0, 1), mats['wool_cap'], n=44,
                               offset=0.03, region='head', rmax=0.25, flare=lambda a, r: r + 0.012 * math.sin(math.pi * 0.5), wobble=lambda a: 0.007 * math.sin(a * 7) + 0.004 * math.sin(a * 13))
    pin = C.lathe('elder.pin', [(0.0, 0), (0.009, 0), (0.011, 0.004), (0.0, 0.006)], mats['brass'], n=12)
    side = C.ring(info, hc + Vector((0, 0, 0.015)), (0, 0, 1), n=12, offset=0.046, ref=(0.6, -1, 0), region='head', rmax=0.25)[0]
    pin.rotation_euler = (math.radians(90), 0, math.radians(30))
    pin.location = side
    out['pin'] = hang(info, pin, ('head',))
    zb = Vector(C.bone_pts(rig, 'spine_01')[0]).z + 0.01
    out.update(belt(info, 'elder.belt', pel, zb, 0.05, 0.062, mats['leather_belt'], mats['iron']))
    out['rope'] = ring_loft(info, 'elder.rope', [Vector((pel.x, pel.y, zb - 0.045)), Vector((pel.x, pel.y, zb - 0.032))], (0, 0, 1), mats['rope'], n=40, offset=0.07, region='torso', rmax=0.35)
    sideL = C.ring(info, Vector((pel.x, pel.y, zb)), (0, 0, 1), n=8, offset=0.08, ref=(1, 0, 0), region='torso', rmax=0.35)[0]
    sideR = C.ring(info, Vector((pel.x, pel.y, zb)), (0, 0, 1), n=8, offset=0.08, ref=(-1, 0, 0), region='torso', rmax=0.35)[0]
    g = C.lathe('elder.gourd', [(0.0, -0.06), (0.03, -0.055), (0.048, -0.03), (0.045, 0.0), (0.022, 0.022), (0.028, 0.045), (0.019, 0.066), (0.009, 0.076), (0.0, 0.079)], mats['gourd'], n=18)
    g.location = sideL + Vector((0.0, -0.02, -0.1))
    g.rotation_euler = (0.15, -0.2, 0)
    out['gourd'] = hang(info, g)
    out['pouch'] = pouch(info, 'elder.pouch', sideR + Vector((-0.01, -0.04, -0.11)), (0.06, 0.1, 0.12), mats['leather_brown'], seed=4)
    # 胸前垂下的打结绳子
    nk = Vector(C.bone_pts(rig, 'neck_01')[0])
    a = C.ring(info, Vector((nk.x, nk.y, sp3.z + 0.15)), (0, 0, 1), n=4, offset=0.05, ref=(0, -1, 0), region='torso', rmax=0.35)[0]
    b = C.ring(info, Vector((nk.x, nk.y, sp3.z - 0.02)), (0, 0, 1), n=4, offset=0.03, ref=(0, -1, 0), region='torso', rmax=0.35)[0]
    cord = C.lathe('elder.cord', [(0.0, 0), (0.004, 0), (0.004, (b - a).length), (0.0, (b - a).length)], mats['rope'], n=6)
    cord.location = a
    cord.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    out['cord'] = hang(info, cord, ('spine_02', 'spine_03'))
    pants_k = legs_to(m, 0.7) & ~(m['torso'] & (z > waist + 0.01)) & ~m['feet']
    tc = np.maximum(np.where(co[:, 0] > 0, m['t_calf_l'], m['t_calf_r']), 0)
    out['pants'] = C.shell(info, 'elder.pants', lambda i: pants_k[i], lambda i, c, n: 0.012 + 0.02 * float((m['calf_l'][i] or m['calf_r'][i]) and tc[i] < 0.66) * math.sin(math.pi * min(1.0, tc[i] / 0.66)),
                           mats['wool_pants'], solid=0.002, smooth=2, folds=C.fold_noise(0.005, 36, (0, 0, 1), 15))
    boot_k = boot_from(m, 0.52)
    out.update(CB.boots(info, rig, m, mats['leather_boot'], 'elder.boots', 0.52, offset=0.018))
    hide_body(objs['body'], shirt_k | robe_k | pants_k | boot_k)
    return out


# ======================= 女店员 =======================
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
    scoop = front & (z > bust + 0.07) & (np.abs(co[:, 0]) < 0.11)
    puff = m['upper'] & (m['t_upperarm_l'] < 0.95) & (m['t_upperarm_r'] < 0.95)
    bod_k = m['torso'] & (z > waist - 0.09) & (z < bust - 0.03) & (m['up_w'] < 0.08)
    blouse_k = (m['torso'] | puff) & ~neck_hole(m, 0.1, -0.5) & ~scoop & (z > waist - 0.06) & ~m['head'] & ~C.erode(info['body'], bod_k, 2)
    tu = np.maximum(np.where(co[:, 0] > 0, m['t_upperarm_l'], m['t_upperarm_r']), 0)
    out['blouse'] = C.shell(info, 'barmaid.blouse', lambda i: blouse_k[i],
                            lambda i, c, n: 0.007 + (0.034 * math.sin(math.pi * min(1.0, tu[i] / 0.95)) if m['upper'][i] else 0.0),
                            mats['linen_white'], solid=0.002, smooth=2, folds=C.fold_noise(0.004, 55, (0, 0, 1), 13))
    for s in ('l', 'r'):
        h, t, d = bone_axis(rig, 'upperarm_' + s)
        out['frill_' + s] = ring_loft(info, 'barmaid.frill_' + s, [h.lerp(t, 0.9 + 0.04 * k) for k in range(3)], d, mats['linen_white'], n=28,
                                      offset=0.02, region='arm_' + s, rmax=0.12, wobble=lambda a: 0.007 * math.sin(a * 9))
    out['bodice'] = C.shell(info, 'barmaid.bodice', lambda i: bod_k[i], lambda i, c, n: 0.014, mats['leather_green'], solid=0.004, smooth=2)
    # 肩带：从胸衣上缘两侧翻过肩膀到后背
    for s, sx in (('l', 1), ('r', -1)):
        stp_k = m['torso'] & (np.abs(co[:, 0] - sx * 0.085) < 0.022) & (z > bust - 0.06) & ~m['head'] & (m['up_w'] < 0.2) & ~neck_hole(m, 0.075)
        out['shstrap_' + s] = C.shell(info, 'barmaid.shstrap_' + s, lambda i, k=stp_k: k[i], lambda i, c, n: 0.016, mats['leather_green'], solid=0.003, smooth=2)
    lace_pts = []
    for k in range(7):
        zz = waist - 0.07 + k * 0.032
        r = C.ring(info, Vector((pel.x, sp3.y, zz)), (0, 0, 1), n=72, offset=0.021, ref=(0, -1, 0), region='torso', rmax=0.3)
        lace_pts.append((r[71 if k % 2 else 1], r[1 if k % 2 else 71]))
    for k in range(len(lace_pts) - 1):
        a, b = lace_pts[k][0], lace_pts[k + 1][1]
        L = (b - a).length
        cyl = C.lathe('barmaid.lace%d' % k, [(0.0, 0), (0.0025, 0), (0.0025, L), (0.0, L)], mats['lace'], n=6)
        cyl.location = a
        cyl.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
        out['lace%d' % k] = hang(info, cyl, ('spine_01', 'spine_02'))
    ankle = Vector(C.bone_pts(rig, 'foot_l')[0])
    out['skirt'], rings, cens = skirt_loft(info, 'barmaid.skirt', pel, waist + 0.01, ankle.z + 0.07, mats['wool_skirt'], n=56, rows=15, ease=0.016, flare=0.3,
                                           wave=0.016, folds=11, seed=13, with_rings=True)
    # 锈红衬裙：裙子最下面几圈往里收一点、往下露出 3.5 厘米
    out['underskirt'] = rings_loft(info, 'barmaid.underskirt', rings[-5:], cens[-5:], mats['wool_rust'], k_scale=0.985, dz=0.035)
    # 围裙：裙子前面一片，往外 1.2~1.8 厘米，到裙子往上 4 圈为止
    out['apron'] = rings_loft(info, 'barmaid.apron', rings[:12], cens[:12], mats['linen_apron'], dr=lambda k: 0.012 + 0.0006 * k,
                              open_sector=lambda k, n: not (k < n * 0.16 or k >= n * 0.84), solid=0.002)
    zb = waist - 0.005
    out.update(belt(info, 'barmaid.belt', pel, zb, 0.032, 0.03, mats['leather_belt'], mats['brass']))
    # 背后的蝴蝶结：两个耳朵 + 两条长飘带
    backp = C.ring(info, Vector((pel.x, pel.y, zb)), (0, 0, 1), n=4, offset=0.045, ref=(0, 1, 0), region='torso', rmax=0.35)[0]
    for s, sx in (('l', 1), ('r', -1)):
        loop = C.sack('barmaid.bow_' + s, backp + Vector((0.045 * sx, 0.012, 0.006)), (0.07, 0.025, 0.045), mats['linen_apron'], seed=31 + sx, neck=0.2)
        loop.rotation_euler = (0, sx * 0.4, 0)
        out['bow_' + s] = hang(info, loop, ('pelvis', 'spine_01'))
        top = backp + Vector((0.015 * sx, 0.02, -0.01))
        L = 0.42 + 0.05 * (sx > 0)
        tail = C.lathe('barmaid.tail_' + s, [(0.0, 0), (0.022, 0), (0.026, -L), (0.0, -L)], mats['linen_apron'], n=6)
        tail.location = top
        tail.scale = (1, 0.18, 1)
        tail.rotation_euler = (0.1, sx * 0.08, 0)
        out['tail_' + s] = hang(info, tail, ('pelvis',))
    knot = C.sack('barmaid.knot', backp + Vector((0, 0.022, 0.0)), (0.035, 0.03, 0.035), mats['linen_apron'], seed=37)
    out['bow_knot'] = hang(info, knot, ('pelvis',))
    head = m['head']
    kerch_k = head & ((z > ec.z + 0.05) | ((co[:, 1] > ec.y + 0.115) & (z > ec.z - 0.03)))
    out['kerchief'] = C.shell(info, 'barmaid.kerchief', lambda i: kerch_k[i], lambda i, c, n: 0.032 + 0.02 * max(0.0, (c.y - ec.y - 0.08) * 6), mats['linen_white'],
                              solid=0.003, smooth=3, folds=C.fold_noise(0.004, 70, (1, 0, 0), 15))
    hb = Vector(C.bone_pts(rig, 'head')[0])
    knot = C.sack('barmaid.kerchief_knot', Vector((hb.x, hb.y + 0.115, ec.z - 0.005)), (0.05, 0.04, 0.045), mats['linen_white'], seed=7, neck=0.1)
    out['kerchief_knot'] = hang(info, knot, ('head',))
    bun = C.sack('barmaid.bun', Vector((hb.x, hb.y + 0.105, ec.z - 0.06)), (0.085, 0.06, 0.07), mats['hair_bun'], seed=41, neck=0.05)
    out['bun'] = hang(info, bun, ('head',))
    shoe_k = m['feet'] | (m['calf_l'] & (m['t_calf_l'] > 0.8)) | (m['calf_r'] & (m['t_calf_r'] > 0.8))
    out.update(CB.boots(info, rig, m, mats['leather_boot'], 'barmaid.boots', 0.8, offset=0.01))
    side = C.ring(info, Vector((pel.x, pel.y, waist - 0.03)), (0, 0, 1), n=8, offset=0.06, ref=(-1, 0, 0), region='torso', rmax=0.3)[0]
    out['pouch'] = pouch(info, 'barmaid.pouch', side + Vector((0, -0.02, -0.09)), (0.06, 0.085, 0.1), mats['leather_brown'], seed=9)
    legs_hidden = m['thigh'] | (m['calf_l'] & (m['t_calf_l'] < 0.82)) | (m['calf_r'] & (m['t_calf_r'] < 0.82))
    hide_body(objs['body'], blouse_k | bod_k | legs_hidden | shoe_k)
    return out


OUTFITS = {'dicer': outfit_dicer, 'drinker': outfit_drinker, 'elder': outfit_elder, 'barmaid': outfit_barmaid}


def build_one(name, x=0.0, project=True, report=None):
    """完整造一个人物：身体 → 表情 → 衣服（站姿）→ 动作。返回 (objs, clothes, anim)。"""
    import chars_motion as A
    objs = CB.build(name, x)
    rig = objs['rig']
    # 坐着时骨盆多高：用完整的身体量（衣服盖住的部分之后会删掉），再加一点裤子厚度
    st = dict(A.STYLE[name])
    z_sit = A.seat_height(rig, objs['body'], A.measure(rig), st) + 0.008
    A.reset(rig)
    info = C.body_info(objs['body'], rig)
    mats = CB.materials()
    clothes = OUTFITS[name](objs, info, mats)
    for k, ob in clothes.items():
        C.add_armature(ob, rig)
        ob['henry_char'] = name
    if project:
        # 衣服的颜色和细节直接取自设定图：三视图投影烘成一张贴图
        import chars_project
        chars_project.fit_silhouette(name, objs, report=report)
        clothes = chars_project.project_outfit(name, objs, clothes, report=report)
    anim = A.make_all(name, rig, objs, z_sit=z_sit)
    if report is not None:
        anim = dict(anim)
    return objs, clothes, anim
