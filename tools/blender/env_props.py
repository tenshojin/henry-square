# 道具（按设定图）：木酒杯、锡酒杯、酒桶、搁板桌、梯背椅、长凳、食物拼盘、骰袋、碟形烛台、藤编酒瓶，
# 以及吊灯、壁烛台、提灯、旗帜、盾牌、鹿头、铁锅、地毯等布景
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler
import env_util as U

M = {}


def mats():
    if M:
        return M
    M['oak'] = U.mat_wood('oak', '#2a170b', '#4e3219', '#6e4a28', 0.6, worn=0.25)
    M['oak_dark'] = U.mat_wood('oak_dark', '#1a0e06', '#331f10', '#4a2f18', 0.62)
    M['oak_light'] = U.mat_wood('oak_light', '#3e2614', '#6a4626', '#8a6236', 0.6, worn=0.3)
    M['floor'] = U.mat_wood('floor', '#20130a', '#3c2614', '#5a3c22', 0.55, scale=(0.5, 7.0, 7.0), per_object=0.35, worn=0.4)
    M['staves'] = U.mat_wood('staves', '#2c1a0c', '#5a3a1c', '#7a5530', 0.55, scale=(9.0, 1.0, 1.0))
    M['iron'] = U.mat_plain('iron', '#2a2622', 0.5, 0.85, noise=0.35, noise_scale=60, bump=0.15)
    M['iron_rust'] = U.mat_plain('iron_rust', '#3a2a20', 0.7, 0.6, noise=0.5, noise_scale=30, bump=0.25)
    M['brass'] = U.mat_plain('brass', '#a8823c', 0.35, 1.0, noise=0.2, noise_scale=80)
    M['pewter'] = U.mat_plain('pewter', '#8a8a86', 0.32, 0.95, noise=0.25, noise_scale=50, bump=0.05)
    M['ale'] = U.mat_plain('ale', '#e8d8b0', 0.4, noise=0.2, noise_scale=200, bump=0.2)
    M['wax'] = U.mat_plain('wax', '#ece2c8', 0.45, noise=0.08, noise_scale=30)
    M['flame'] = U.mat_emit('flame', '#ffb24a', 18.0)
    M['ember'] = U.mat_emit('ember', '#ff5a10', 6.0)
    M['glass_green'] = U.mat_plain('glass_green', '#2e4a26', 0.08, transmission=0.85)
    M['glass_brown'] = U.mat_plain('glass_brown', '#4a2a10', 0.08, transmission=0.85)
    M['glass_clear'] = U.mat_plain('glass_clear', '#c8d0c4', 0.05, transmission=0.95)
    M['clay'] = U.mat_plain('clay', '#8a4a2a', 0.7, noise=0.25, noise_scale=20, bump=0.05)
    M['clay_glaze'] = U.mat_plain('clay_glaze', '#5a3a26', 0.25, noise=0.3, noise_scale=10)
    M['clay_white'] = U.mat_plain('clay_white', '#d8ccb4', 0.35, noise=0.15, noise_scale=12)
    M['clay_green'] = U.mat_plain('clay_green', '#3e5232', 0.3, noise=0.2, noise_scale=12)
    M['leather'] = U.mat_plain('leather', '#4a2c16', 0.55, noise=0.4, noise_scale=40, bump=0.2)
    M['wicker'] = U.mat_plain('wicker', '#a8844a', 0.75, noise=0.45, noise_scale=90, bump=0.6)
    M['bread'] = U.mat_plain('bread', '#a86a2a', 0.65, noise=0.35, noise_scale=25, bump=0.4)
    M['chicken'] = U.mat_plain('chicken', '#8a4416', 0.32, noise=0.45, noise_scale=18, bump=0.3)
    M['cheese'] = U.mat_plain('cheese', '#e0b850', 0.5, noise=0.15, noise_scale=20, bump=0.2)
    M['apple_red'] = U.mat_plain('apple_red', '#9a1a12', 0.35, noise=0.3, noise_scale=8)
    M['apple_green'] = U.mat_plain('apple_green', '#6a8a22', 0.35, noise=0.3, noise_scale=8)
    M['grape'] = U.mat_plain('grape', '#3a1430', 0.3)
    M['cloth'] = U.mat_plain('cloth', '#b8a888', 0.85, noise=0.2, noise_scale=120, bump=0.1)
    M['sack'] = U.mat_plain('sack', '#9a865e', 0.9, noise=0.35, noise_scale=150, bump=0.35)
    M['rope'] = U.mat_plain('rope', '#9a8460', 0.85, noise=0.3, noise_scale=200, bump=0.3)
    M['bark'] = U.mat_plain('bark', '#3a2a1a', 0.85, noise=0.6, noise_scale=12, bump=0.8)
    M['logend'] = U.mat_plain('logend', '#8a6a42', 0.75, noise=0.3, noise_scale=30)
    M['soot'] = U.mat_plain('soot', '#0c0a08', 0.9, noise=0.4, noise_scale=10)
    M['fur'] = U.mat_plain('fur', '#6a5a46', 0.95, noise=0.55, noise_scale=60, bump=0.9)
    M['antler'] = U.mat_plain('antler', '#b8a07a', 0.6, noise=0.4, noise_scale=30, bump=0.3)
    M['garlic'] = U.mat_plain('garlic', '#e0d6c0', 0.6, noise=0.2, noise_scale=40)
    M['herb'] = U.mat_plain('herb', '#5a5a2a', 0.85, noise=0.5, noise_scale=30)
    M['pepper'] = U.mat_plain('pepper', '#8a1a10', 0.4, noise=0.2, noise_scale=30)
    return M


R = random.Random(11)


# ---------- 酒杯 ----------
def wood_tankard(loc, rot=0.0, group='tableprops', s=1.0, full=True, name='tankard'):
    m = mats()
    x, y, z = loc
    h, r0, r1 = 0.13 * s, 0.047 * s, 0.043 * s
    body = U.lathe(name, [(r0, 0), (r0, 0.006 * s), (r1, h), (r1 - 0.006 * s, h), (r0 - 0.008 * s, 0.012 * s)], (x, y, z), (0, 0, rot), m['staves'], n=14, group=group, smooth=False)
    out = [body]
    for t in (0.12, 0.5, 0.88):
        rr = r0 + (r1 - r0) * t + 0.0025 * s
        out.append(U.lathe(name + '_band', [(rr, h * t - 0.007 * s), (rr, h * t + 0.007 * s)], (x, y, z), (0, 0, rot), m['iron'], n=20, group=group, cap_bottom=False))
    if full:
        out.append(U.lathe(name + '_ale', [(r1 - 0.006 * s, 0), (0.0001, 0.0)], (x, y, z + h * 0.86), (0, 0, rot), m['ale'], n=16, group=group, cap_bottom=False))
    # 把手：半圆形木条
    pts = []
    for k in range(9):
        a = -math.pi / 2 + math.pi * k / 8
        px = r1 + 0.012 * s + math.cos(a) * 0.035 * s
        pz = h * 0.5 + math.sin(a) * 0.045 * s
        pts.append((px, 0, pz))
    hd = U.tube(name + '_handle', pts, 0.008 * s, m['staves'], group)
    hd.location = (x, y, z)
    hd.rotation_euler = (0, 0, rot)
    out.append(hd)
    return out


def pewter_tankard(loc, rot=0.0, group='tableprops', s=1.0, full=True, name='pewter'):
    m = mats()
    x, y, z = loc
    h = 0.12 * s
    prof = [(0.044 * s, 0), (0.046 * s, 0.008 * s), (0.04 * s, 0.014 * s), (0.039 * s, h * 0.6), (0.041 * s, h * 0.93), (0.043 * s, h), (0.039 * s, h), (0.036 * s, 0.016 * s)]
    out = [U.lathe(name, prof, (x, y, z), (0, 0, rot), m['pewter'], n=28, group=group)]
    if full:
        out.append(U.lathe(name + '_ale', [(0.037 * s, 0), (0.0001, 0)], (x, y, z + h * 0.85), (0, 0, rot), m['ale'], n=16, group=group, cap_bottom=False))
    pts = [(0.039 * s, 0, h * 0.85), (0.07 * s, 0, h * 0.82), (0.082 * s, 0, h * 0.6), (0.07 * s, 0, h * 0.35), (0.05 * s, 0, h * 0.22), (0.039 * s, 0, h * 0.2)]
    hd = U.tube(name + '_handle', pts, 0.006 * s, m['pewter'], group)
    hd.location = (x, y, z)
    hd.rotation_euler = (0, 0, rot)
    out.append(hd)
    return out


# ---------- 酒桶 ----------
def barrel(loc, rot=(0, 0, 0), length=0.8, r=0.3, group='shelves', tap=True, name='barrel'):
    m = mats()
    prof = []
    for k in range(9):
        t = k / 8
        prof.append((r * (0.86 + 0.14 * math.sin(math.pi * t)), length * t))
    b = U.lathe(name, prof, loc, rot, m['staves'], n=26, group=group, cap_bottom=True, cap_top=True, smooth=False)
    out = [b]
    for t in (0.06, 0.2, 0.8, 0.94):
        rr = r * (0.86 + 0.14 * math.sin(math.pi * t)) + 0.006
        out.append(U.lathe(name + '_hoop', [(rr, length * t - 0.018), (rr, length * t + 0.018)], loc, rot, m['iron'], n=32, group=group, cap_bottom=False))
    if tap:
        # 桶头的龙头（局部 z=length 处，朝外）
        tp = U.cyl(name + '_tap', 0.018, 0.08, (0, 0, 0), (0, 0, 0), m['brass'], n=12, group=group)
        sp = U.cyl(name + '_spout', 0.01, 0.06, (0, 0, 0), (0, 0, 0), m['brass'], n=10, group=group)
        mw = Matrix.LocRotScale(Vector(loc), Euler(rot), None)
        tp.matrix_world = mw @ Matrix.Translation((0, -r * 0.55, length)) @ Matrix.Rotation(0, 4, 'X')
        sp.matrix_world = mw @ Matrix.Translation((0, -r * 0.55, length + 0.07)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -0.06))
        out += [tp, sp]
    return out


# ---------- 搁板桌（设定图里的木桌） ----------
def trestle_table(cx, cy, w, l, top_z, group='table', name='table'):
    """桌面 w(x) × l(y)。桌面由几块厚木板拼成，两端是 I 形支架 + 斜撑，中间一根横梁。"""
    m = mats()
    out = []
    planks = 5
    pw = w / planks
    th = 0.06
    for i in range(planks):
        x = cx - w / 2 + pw * (i + 0.5)
        out.append(U.box(name + '_top%d' % i, (l, pw - 0.006, th), (x, cy, top_z - th / 2), (0, 0, math.pi / 2), m['oak'], bevel=0.008, group=group, jitter=0.0015, seed=i))
    for sy in (-1, 1):
        y = cy + sy * (l / 2 - 0.22)
        out.append(U.box(name + '_cleat', (w - 0.08, 0.08, 0.05), (cx, y, top_z - th - 0.025), (0, 0, 0), m['oak_dark'], bevel=0.006, group=group))
        out.append(U.box(name + '_post', (top_z - th - 0.12, 0.1, 0.08), (cx, y, (top_z - th - 0.05) / 2 + 0.06), (0, math.pi / 2, 0), m['oak_dark'], bevel=0.008, group=group))
        out.append(U.box(name + '_foot', (w * 0.8, 0.1, 0.08), (cx, y, 0.04), (0, 0, 0), m['oak_dark'], bevel=0.01, group=group))
        for sx in (-1, 1):
            out.append(U.box(name + '_brace', (0.32, 0.05, 0.045), (cx + sx * 0.11, y, top_z - th - 0.16), (0, sx * 0.75, 0), m['oak_dark'], bevel=0.005, group=group))
    out.append(U.box(name + '_stretcher', (l - 0.44, 0.07, 0.07), (cx, cy, 0.24), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.008, group=group))
    for sy in (-1, 1):
        out.append(U.box(name + '_wedge', (0.03, 0.12, 0.05), (cx, cy + sy * (l / 2 - 0.13), 0.24), (0, 0, 0), m['oak_light'], bevel=0.004, group=group))
    return out


def ladder_chair(x, y, rot, seat_h=0.45, group='table', name='chair'):
    m = mats()
    out = []
    W, D = 0.46, 0.42
    mw = Matrix.LocRotScale(Vector((x, y, 0)), Euler((0, 0, rot)), None)
    def add(ob, lx, ly, lz, r=(0, 0, 0)):
        ob.matrix_world = mw @ Matrix.LocRotScale(Vector((lx, ly, lz)), Euler(r), None)
        out.append(ob)
    for sx in (-1, 1):
        add(U.lathe(name + '_leg', [(0.022, 0), (0.024, seat_h * 0.5), (0.021, seat_h)], mat=m['oak_dark'], n=10, group=group, cap_top=True), sx * (W / 2 - 0.03), -D / 2 + 0.03, 0)
        add(U.lathe(name + '_post', [(0.024, 0), (0.026, 0.5), (0.022, 1.0), (0.018, 1.04), (0.0, 1.06)], mat=m['oak_dark'], n=10, group=group), sx * (W / 2 - 0.03), D / 2 - 0.03, 0)
    add(U.box(name + '_seat', (W, D, 0.035), mat=m['oak'], bevel=0.008, group=group), 0, 0, seat_h - 0.017)
    for k, z in enumerate((0.62, 0.78, 0.94)):
        add(U.box(name + '_slat%d' % k, (W - 0.07, 0.022, 0.07), mat=m['oak'], bevel=0.006, group=group), 0, D / 2 - 0.03, z)
    for z in (0.15, 0.3):
        add(U.box(name + '_rung', (W - 0.06, 0.02, 0.02), mat=m['oak_dark'], bevel=0.003, group=group), 0, -D / 2 + 0.03, z)
        add(U.box(name + '_rung', (D - 0.06, 0.02, 0.02), mat=m['oak_dark'], bevel=0.003, group=group), W / 2 - 0.03, 0, z + 0.05, (0, 0, math.pi / 2))
        add(U.box(name + '_rung', (D - 0.06, 0.02, 0.02), mat=m['oak_dark'], bevel=0.003, group=group), -W / 2 + 0.03, 0, z + 0.05, (0, 0, math.pi / 2))
    return out


def bench(x, y, rot, length, seat_h=0.45, depth=0.32, group='table', name='bench'):
    m = mats()
    out = []
    mw = Matrix.LocRotScale(Vector((x, y, 0)), Euler((0, 0, rot)), None)
    def add(ob, lx, ly, lz, r=(0, 0, 0)):
        ob.matrix_world = mw @ Matrix.LocRotScale(Vector((lx, ly, lz)), Euler(r), None)
        out.append(ob)
    add(U.box(name + '_top', (length, depth, 0.055), mat=m['oak'], bevel=0.01, group=group, jitter=0.002), 0, 0, seat_h - 0.027)
    for sx in (-1, 1):
        lx = sx * (length / 2 - 0.12)
        add(U.box(name + '_leg', (seat_h - 0.06, 0.07, depth - 0.04), mat=m['oak_dark'], bevel=0.008, group=group), lx, 0, (seat_h - 0.055) / 2, (0, math.pi / 2, 0))
    add(U.box(name + '_rail', (length - 0.3, 0.05, 0.05), mat=m['oak_dark'], bevel=0.005, group=group), 0, 0, 0.14)
    return out


def stool(x, y, h=0.62, group='bar', name='stool'):
    m = mats()
    out = [U.cyl(name + '_seat', 0.17, 0.045, (x, y, h - 0.045), (0, 0, 0), m['oak'], n=24, group=group, bevel=0.01)]
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        lx, ly = x + math.cos(a) * 0.11, y + math.sin(a) * 0.11
        leg = U.cyl(name + '_leg', 0.022, h - 0.04, (lx, ly, 0), (math.sin(a) * 0.12, -math.cos(a) * 0.12, 0), m['oak_dark'], n=8, group=group)
        out.append(leg)
    out.append(U.tube(name + '_ring', U.ring_pts((x, y, 0.22), 0.13, 12) + [U.ring_pts((x, y, 0.22), 0.13, 12)[0]], 0.009, m['oak_dark'], group))
    return out


# ---------- 食物拼盘 ----------
def ellipsoid(name, loc, size, mat, group, seg=16, rot=(0, 0, 0), squash_bottom=0.0):
    prof = []
    for k in range(seg + 1):
        a = -math.pi / 2 + math.pi * k / seg
        r = math.cos(a)
        z = math.sin(a)
        if z < -1 + squash_bottom:
            z = -1 + squash_bottom
        prof.append((max(r, 0.0001), z))
    ob = U.lathe(name, prof, (0, 0, 0), (0, 0, 0), mat, n=seg + 4, group=group, cap_bottom=False)
    ob.scale = size
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def food_platter(loc, group='tableprops', name='platter', rot=0.0):
    m = mats()
    x, y, z = loc
    out = [U.lathe(name, [(0.0, 0), (0.17, 0), (0.18, 0.012), (0.175, 0.02), (0.16, 0.016), (0.0, 0.014)], (x, y, z), (0, 0, rot), m['oak_light'], n=36, group=group)]
    zt = z + 0.016
    c, s = math.cos(rot), math.sin(rot)
    def at(dx, dy):
        return (x + dx * c - dy * s, y + dx * s + dy * c)
    # 烤鸡：身体 + 两只鸡腿 + 翅膀
    cx, cy = at(-0.02, 0.0)
    out.append(ellipsoid(name + '_chicken', (cx, cy, zt + 0.045), (0.075, 0.06, 0.05), m['chicken'], group, rot=(0, 0, rot), squash_bottom=0.45))
    for sd in (-1, 1):
        lx, ly = at(0.05, sd * 0.045)
        out.append(ellipsoid(name + '_leg', (lx, ly, zt + 0.04), (0.045, 0.024, 0.024), m['chicken'], group, rot=(0, -0.4, rot + sd * 0.5)))
        bx, by = at(0.095, sd * 0.06)
        out.append(U.cyl(name + '_bone', 0.006, 0.03, (bx, by, zt + 0.045), (0, math.pi / 2 - 0.3, rot + sd * 0.5), m['clay_white'], n=8, group=group))
        wx, wy = at(-0.05, sd * 0.055)
        out.append(ellipsoid(name + '_wing', (wx, wy, zt + 0.05), (0.035, 0.018, 0.02), m['chicken'], group, rot=(sd * 0.4, 0, rot)))
    # 面包
    bx, by = at(-0.1, -0.09)
    out.append(ellipsoid(name + '_bread', (bx, by, zt + 0.02), (0.06, 0.045, 0.04), m['bread'], group, rot=(0, 0, rot + 0.6), squash_bottom=0.6))
    # 奶酪楔子
    kx, ky = at(0.08, -0.1)
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in [(0, 0, 0), (0.08, 0.03, 0), (0.08, -0.03, 0), (0, 0, 0.045), (0.08, 0.03, 0.045), (0.08, -0.03, 0.045)]]
    for f in [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]:
        bm.faces.new([v[i] for i in f])
    ch = U.mesh_obj(name + '_cheese', bm, m['cheese'])
    U.place(ch, (kx, ky, zt), (0, 0, rot - 2.2))
    out.append(U.put(ch, group))
    # 苹果、葡萄
    for i, (dx, dy, mat) in enumerate([(-0.11, 0.08, 'apple_red'), (-0.06, 0.12, 'apple_green'), (0.1, 0.09, 'apple_red')]):
        ax, ay = at(dx, dy)
        out.append(ellipsoid(name + '_apple%d' % i, (ax, ay, zt + 0.032), (0.034, 0.034, 0.031), m[mat], group))
        out.append(U.cyl(name + '_stem', 0.002, 0.016, (ax, ay, zt + 0.06), (0.2, 0.1, 0), m['bark'], n=5, group=group))
    for i in range(9):
        gx, gy = at(0.13 + R.uniform(-0.02, 0.02), -0.02 + R.uniform(-0.03, 0.03))
        out.append(ellipsoid(name + '_grape', (gx, gy, zt + 0.012 + (i % 3) * 0.012), (0.011, 0.011, 0.012), m['grape'], group, seg=8))
    return out


def dice_pouch(loc, rot=0.0, group='tableprops', name='pouch'):
    m = mats()
    x, y, z = loc
    prof = [(0.0001, 0), (0.035, 0.004), (0.05, 0.02), (0.052, 0.04), (0.04, 0.062), (0.018, 0.075), (0.016, 0.082), (0.026, 0.094), (0.0001, 0.096)]
    out = [U.lathe(name, prof, (x, y, z), (0.0, 0.25, rot), m['leather'], n=18, group=group)]
    out.append(U.tube(name + '_cord', U.ring_pts((x, y, z + 0.08), 0.019, 12) + [U.ring_pts((x, y, z + 0.08), 0.019, 12)[0]], 0.0025, m['rope'], group))
    return out


def candle_dish(loc, h=0.12, group='tableprops', name='candle', light=True, power=12.0):
    """碟形烛台：铁盘 + 指环把手 + 蜡烛（带流蜡）+ 火焰。返回 (物体列表, 火焰位置)。"""
    m = mats()
    x, y, z = loc
    out = [U.lathe(name + '_dish', [(0.0, 0), (0.06, 0), (0.07, 0.012), (0.066, 0.016), (0.055, 0.008), (0.0, 0.008)], (x, y, z), (0, 0, 0), m['brass'], n=28, group=group)]
    out.append(U.tube(name + '_ring', U.ring_pts((x + 0.085, y, z + 0.012), 0.017, 12, axis='y') + [U.ring_pts((x + 0.085, y, z + 0.012), 0.017, 12, axis='y')[0]], 0.003, m['brass'], group))
    out.append(U.lathe(name + '_holder', [(0.018, 0), (0.02, 0.03), (0.017, 0.032), (0.0, 0.032)], (x, y, z + 0.008), (0, 0, 0), m['brass'], n=16, group=group))
    wax = [(0.0145, 0), (0.0145, h * 0.85), (0.013, h), (0.006, h * 0.98), (0.0, h * 0.97)]
    out.append(U.lathe(name + '_wax', wax, (x, y, z + 0.035), (0, 0, 0), m['wax'], n=14, group=group))
    for k in range(3):
        a = R.uniform(0, 6.28)
        dl = R.uniform(0.02, 0.05)
        out.append(ellipsoid(name + '_drip', (x + math.cos(a) * 0.0145, y + math.sin(a) * 0.0145, z + 0.035 + h - dl / 2), (0.004, 0.004, dl / 2), m['wax'], group, seg=6))
    fz = z + 0.035 + h + 0.018
    out.append(U.cyl(name + '_wick', 0.0012, 0.01, (x, y, fz - 0.019), (0, 0, 0), m['soot'], n=5, group=group))
    flame = ellipsoid(name + '_flame', (x, y, fz), (0.006, 0.006, 0.016), m['flame'], 'flames', seg=8)
    out.append(flame)
    if light:
        U.light(name + '_L', 'POINT', (x, y, fz + 0.01), power, '#ff9a40', 0.015, group='candles')
    U.empty('FX_candle_' + name, (x, y, fz - 0.012), 'candle')
    return out, (x, y, fz)


def wicker_bottle(loc, rot=0.0, group='tableprops', name='wicker'):
    m = mats()
    x, y, z = loc
    out = [U.lathe(name + '_glass', [(0.0, 0), (0.05, 0.004), (0.075, 0.05), (0.07, 0.11), (0.03, 0.16), (0.014, 0.19), (0.014, 0.27), (0.017, 0.28), (0.0, 0.28)], (x, y, z), (0, 0, rot), m['glass_green'], n=24, group=group)]
    out.append(U.lathe(name + '_basket', [(0.0, -0.002), (0.054, 0.002), (0.079, 0.05), (0.075, 0.105), (0.062, 0.125)], (x, y, z), (0, 0, rot), m['wicker'], n=30, group=group))
    out.append(U.cyl(name + '_cork', 0.012, 0.02, (x, y, z + 0.275), (0, 0, 0), m['logend'], n=10, group=group))
    return out


def wine_bottle(loc, mat='glass_green', group='shelves', name='bottle', h=0.3, r=0.04):
    m = mats()
    prof = [(0.0, 0), (r, 0.004), (r, h * 0.6), (r * 0.9, h * 0.66), (r * 0.42, h * 0.76), (r * 0.36, h * 0.97), (r * 0.42, h), (0.0, h)]
    return [U.lathe(name, prof, loc, (0, 0, 0), m[mat], n=18, group=group)]


def jug(loc, rot=0.0, mat='clay_glaze', h=0.22, r=0.07, group='shelves', name='jug'):
    m = mats()
    x, y, z = loc
    prof = [(0.0, 0), (r * 0.7, 0.002), (r, h * 0.35), (r * 0.95, h * 0.55), (r * 0.5, h * 0.8), (r * 0.45, h * 0.92), (r * 0.55, h), (r * 0.45, h), (r * 0.4, h * 0.9)]
    out = [U.lathe(name, prof, (x, y, z), (0, 0, rot), m[mat], n=24, group=group)]
    pts = [(r * 0.48, 0, h * 0.88), (r * 1.15, 0, h * 0.85), (r * 1.35, 0, h * 0.6), (r * 1.1, 0, h * 0.42), (r * 0.95, 0, h * 0.38)]
    hd = U.tube(name + '_handle', pts, 0.008, m[mat], group)
    hd.location = (x, y, z)
    hd.rotation_euler = (0, 0, rot)
    out.append(hd)
    return out


def plate(loc, r=0.11, mat='pewter', group='shelves', name='plate', tilt=(0, 0, 0)):
    m = mats()
    return [U.lathe(name, [(0.0, 0), (r * 0.7, 0), (r, r * 0.12), (r * 0.96, r * 0.14), (r * 0.68, r * 0.03), (0.0, r * 0.03)], loc, tilt, m[mat], n=32, group=group)]


def bowl(loc, r=0.08, mat='oak_light', group='tableprops', name='bowl', fill=None):
    m = mats()
    out = [U.lathe(name, [(0.0, 0), (r * 0.5, 0), (r * 0.85, r * 0.35), (r, r * 0.6), (r * 0.92, r * 0.62), (r * 0.78, r * 0.38), (0.0, r * 0.1)], loc, (0, 0, 0), m[mat], n=28, group=group)]
    if fill:
        for i in range(10):
            a = R.uniform(0, 6.28)
            rr = R.uniform(0, r * 0.55)
            out.append(ellipsoid(name + '_nut', (loc[0] + math.cos(a) * rr, loc[1] + math.sin(a) * rr, loc[2] + r * 0.42 + R.uniform(0, 0.012)), (0.011, 0.009, 0.008), m[fill], group, seg=6, rot=(0, 0, a)))
    return out


def cup(loc, mat='clay_glaze', group='shelves', name='cup'):
    m = mats()
    return [U.lathe(name, [(0.0, 0), (0.03, 0), (0.035, 0.06), (0.032, 0.062), (0.028, 0.008), (0.0, 0.008)], loc, (0, 0, 0), m[mat], n=18, group=group)]


# ---------- 灯具 ----------
def chandelier(loc, radius=0.45, candles=8, chain_to=2.95, group='decor', name='chandelier', power=14.0):
    m = mats()
    x, y, z = loc
    out = []
    ring = U.ring_pts((x, y, z), radius, 48)
    out.append(U.tube(name + '_ring', ring + [ring[0]], 0.016, m['iron'], group, n=8))
    inner = U.ring_pts((x, y, z), radius * 0.35, 24)
    out.append(U.tube(name + '_inner', inner + [inner[0]], 0.01, m['iron'], group, n=8))
    for k in range(candles):
        a = 2 * math.pi * k / candles
        out.append(U.tube(name + '_spoke', [(x + math.cos(a) * radius * 0.35, y + math.sin(a) * radius * 0.35, z), (x + math.cos(a) * radius, y + math.sin(a) * radius, z)], 0.008, m['iron'], group, n=6))
    out.append(U.lathe(name + '_hub', [(0.0, -0.05), (0.03, -0.04), (0.04, 0.0), (0.02, 0.04), (0.012, 0.08), (0.0, 0.09)], (x, y, z), (0, 0, 0), m['iron'], n=16, group=group))
    flames = []
    for k in range(candles):
        a = 2 * math.pi * k / candles + math.pi / candles
        cx, cy = x + math.cos(a) * radius, y + math.sin(a) * radius
        out.append(U.lathe(name + '_cup', [(0.0, 0), (0.028, 0), (0.034, 0.025), (0.03, 0.028), (0.0, 0.01)], (cx, cy, z + 0.008), (0, 0, 0), m['iron'], n=12, group=group))
        h = R.uniform(0.07, 0.12)
        out.append(U.lathe(name + '_wax', [(0.012, 0), (0.012, h), (0.006, h * 0.99), (0.0, h * 0.98)], (cx, cy, z + 0.03), (0, 0, 0), m['wax'], n=10, group=group))
        fz = z + 0.03 + h + 0.017
        out.append(ellipsoid(name + '_flame', (cx, cy, fz), (0.0055, 0.0055, 0.015), m['flame'], 'flames', seg=8))
        U.light(name + '_L%d' % k, 'POINT', (cx, cy, fz + 0.01), power, '#ffbe80', 0.015, group='candles')
        U.empty('FX_candle_%s_%d' % (name, k), (cx, cy, fz - 0.012), 'candle')
        flames.append((cx, cy, fz))
    # 四根铁链 → 汇到上方吊钩
    top = (x, y, chain_to)
    for k in range(4):
        a = 2 * math.pi * k / 4 + 0.4
        p0 = (x + math.cos(a) * radius * 0.92, y + math.sin(a) * radius * 0.92, z)
        p1 = (x, y, z + 0.55)
        out += chain(name + '_chain%d' % k, p0, p1, group)
    out += chain(name + '_chain', (x, y, z + 0.55), top, group)
    return out, flames


def chain(name, p0, p1, group, link=0.035):
    """一串交替朝向的椭圆环。"""
    m = mats()
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    n = max(2, int(L / link))
    out = []
    q = d.to_track_quat('Z', 'Y')
    pts = U.ring_pts((0, 0, 0), 1.0, 10, axis='y')
    for i in range(n):
        c = p0 + d * ((i + 0.5) / n)
        ring = [(px * 0.009, py, pz * 0.02) for (px, py, pz) in pts]
        ob = U.tube(name + '_l', ring + [ring[0]], 0.0028, m['iron'], group, n=4)
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = q @ (Euler((0, 0, (i % 2) * math.pi / 2)).to_quaternion())
        ob.location = c
        out.append(ob)
    return out


def sconce(loc, facing, group='decor', name='sconce', power=18.0):
    """壁烛台：墙上铁片 + 弯臂 + 烛盘 + 蜡烛。facing：从墙面朝屋里的方向 (x, y)。"""
    m = mats()
    x, y, z = loc
    fx, fy = facing
    rot = math.atan2(fy, fx) - math.pi / 2
    out = [U.box(name + '_plate', (0.12, 0.012, 0.2), (x, y, z), (0, 0, rot), m['iron'], bevel=0.004, group=group)]
    arm = [(x + fx * 0.005, y + fy * 0.005, z - 0.04), (x + fx * 0.09, y + fy * 0.09, z - 0.05), (x + fx * 0.15, y + fy * 0.15, z + 0.0), (x + fx * 0.16, y + fy * 0.16, z + 0.04)]
    out.append(U.tube(name + '_arm', arm, 0.008, m['iron'], group, n=6))
    cx, cy = x + fx * 0.16, y + fy * 0.16
    out.append(U.lathe(name + '_cup', [(0.0, 0), (0.035, 0), (0.042, 0.02), (0.0, 0.01)], (cx, cy, z + 0.04), (0, 0, 0), m['iron'], n=14, group=group))
    h = 0.13
    out.append(U.lathe(name + '_wax', [(0.014, 0), (0.014, h), (0.0, h * 0.98)], (cx, cy, z + 0.055), (0, 0, 0), m['wax'], n=10, group=group))
    fz = z + 0.055 + h + 0.017
    out.append(ellipsoid(name + '_flame', (cx, cy, fz), (0.006, 0.006, 0.016), m['flame'], 'flames', seg=8))
    U.light(name + '_L', 'POINT', (cx, cy, fz + 0.01), power, '#ffa048', 0.02, group='candles')
    U.empty('FX_candle_' + name, (cx, cy, fz - 0.012), 'candle')
    return out


def lantern(loc, group='decor', name='lantern', power=30.0, hang=None):
    m = mats()
    x, y, z = loc
    out = []
    s = 0.09
    for sx in (-1, 1):
        for sy in (-1, 1):
            out.append(U.box(name + '_bar', (0.26, 0.012, 0.012), (x + sx * s, y + sy * s, z + 0.13), (0, math.pi / 2, 0), m['iron'], bevel=0.002, group=group))
    out.append(U.lathe(name + '_base', [(0.0, 0), (0.12, 0), (0.12, 0.02), (0.0, 0.02)], (x, y, z), (0, 0, math.pi / 4), m['iron'], n=4, group=group))
    out.append(U.lathe(name + '_roof', [(0.13, 0), (0.0, 0.1)], (x, y, z + 0.26), (0, 0, math.pi / 4), m['iron'], n=4, group=group, cap_bottom=True))
    out.append(U.tube(name + '_loop', U.ring_pts((x, y, z + 0.38), 0.025, 10, axis='y') + [U.ring_pts((x, y, z + 0.38), 0.025, 10, axis='y')[0]], 0.004, m['iron'], group))
    glow = U.mat_plain('lantern_glass', '#f0c070', 0.2, emit='#ffb050', emit_strength=0.9)
    out.append(U.box(name + '_glass', (0.17, 0.17, 0.22), (x, y, z + 0.13), (0, 0, 0), glow, bevel=0.0, group=group))
    U.light(name + '_L', 'POINT', (x, y, z + 0.14), power, '#ffa850', 0.04, group='candles')
    U.empty('FX_lantern_' + name, (x, y, z + 0.13), 'lantern')
    if hang:
        out += chain(name + '_chain', (x, y, z + 0.4), hang, group)
    return out


# ---------- 墙上的布景 ----------
def banner(loc, rot, w, h, img, group='decor', name='banner'):
    """挂旗：细分平面加一点波浪，下摆燕尾，顶上横杆和吊绳。"""
    m = mats()
    mat = U.mat_image('mat_' + name, img, rough=0.85, bump=0.3)
    bm = bmesh.new()
    nx, nz = 10, 24
    uv = bm.loops.layers.uv.new('UVMap')
    verts = [[None] * (nx + 1) for _ in range(nz + 1)]
    for j in range(nz + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / nz
            px = (u - 0.5) * w
            pz = -v * h
            # 燕尾：下边中间往上收
            if v > 0.82:
                notch = (1 - abs(u - 0.5) * 2) * 0.16 * h
                pz = -min(v * h, h - notch * ((v - 0.82) / 0.18))
            py = 0.012 * math.sin(u * math.pi * 3 + v * 2) + 0.008 * v
            verts[j][i] = (bm.verts.new((px, py, pz)), (u, 1 - v))
    for j in range(nz):
        for i in range(nx):
            vs = [verts[j][i], verts[j + 1][i], verts[j + 1][i + 1], verts[j][i + 1]]  # 法线朝 -y（朝屋里），烘焙才会烘到正面
            f = bm.faces.new([a[0] for a in vs])
            for l, a in zip(f.loops, vs):
                l[uv].uv = a[1]
    ob = U.mesh_obj(name, bm, mat, smooth=True)
    U.place(ob, loc, (0, 0, rot))
    out = [U.put(ob, group)]
    c, s = math.cos(rot), math.sin(rot)
    rod = U.cyl(name + '_rod', 0.012, w + 0.14, (loc[0] - c * (w / 2 + 0.07), loc[1] - s * (w / 2 + 0.07), loc[2] + 0.02), (0, math.pi / 2, rot), m['oak_dark'], n=10, group=group)
    out.append(rod)
    for sd in (-1, 1):
        out.append(U.lathe(name + '_finial', [(0.0, 0), (0.022, 0.01), (0.02, 0.03), (0.0, 0.045)], (loc[0] + sd * c * (w / 2 + 0.07), loc[1] + sd * s * (w / 2 + 0.07), loc[2] + 0.02), (0, sd * math.pi / 2, rot), m['brass'], n=10, group=group))
    return out


def heater_shield(loc, rot, size, img, group='decor', name='shield'):
    """三角盾：顶边平直、两侧弧线收到底尖；正面贴纹章图。"""
    mat = U.mat_image('mat_' + name, img, rough=0.55, bump=0.2)
    m = mats()
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    pts = []
    N = 24
    for k in range(N + 1):
        t = k / N
        a = math.pi * t
        x = 0.5 - t
        y = 0.5 if t in (0, 1) else 0.5
        pts.append(None)
    outline = [(-0.5, 0.5), (0.5, 0.5)]
    for k in range(1, 12):
        t = k / 12
        outline.append((0.5 * math.cos(t * math.pi / 2) ** 0.8, 0.5 - t * 1.0))
    outline.append((0.0, -0.5))
    for k in range(11, 0, -1):
        t = k / 12
        outline.append((-0.5 * math.cos(t * math.pi / 2) ** 0.8, 0.5 - t * 1.0))
    front = [bm.verts.new((p[0] * size, 0, p[1] * size * 1.15)) for p in outline]
    back = [bm.verts.new((p[0] * size, 0.03, p[1] * size * 1.15)) for p in outline]
    f = bm.faces.new(front)
    for l in f.loops:
        l[uv].uv = (l.vert.co.x / size + 0.5, l.vert.co.z / (size * 1.15) + 0.5)
    bm.faces.new(list(reversed(back)))
    n = len(front)
    for i in range(n):
        bm.faces.new((front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = U.mesh_obj(name, bm, mat)
    U.place(ob, loc, (0, 0, rot))
    out = [U.put(ob, group)]
    rim = [(p[0] * size * 1.02, -0.004, p[1] * size * 1.15 * 1.02) for p in outline]
    r = U.tube(name + '_rim', rim + [rim[0]], 0.008, m['iron'], group, n=6)
    r.location = loc
    r.rotation_euler = (0, 0, rot)
    out.append(r)
    return out


def rug(loc, w, l, rot=0.0, group='floor', name='rug'):
    m = mats()
    mat = U.mat_image('mat_rug', r'C:\blender\henry_square\textures\rug.png', rough=0.95, bump=0.4)
    ob = U.grid_plane(name, w, l, (loc[0], loc[1], 0.006), (0, 0, rot), mat, 8, 8, group)
    out = [ob]
    for sd in (-1, 1):
        for k in range(36):
            u = (k + 0.5) / 36 - 0.5
            x0 = u * w
            y0 = sd * l / 2
            c, s = math.cos(rot), math.sin(rot)
            px, py = loc[0] + x0 * c - y0 * s, loc[1] + x0 * s + y0 * c
            dx, dy = -s * sd, c * sd
            out.append(U.tube(name + '_fringe', [(px, py, 0.006), (px + dx * 0.05, py + dy * 0.05, 0.004)], 0.003, m['cloth'], group, n=4))
    return out


def stag_head(loc, facing, group='hearth', name='stag'):
    """鹿头：底板 + 用 Skin 修改器长出来的脖子和头 + 耳朵 + 眼睛 + 分叉鹿角。facing：朝屋里的方向。"""
    m = mats()
    x, y, z = loc
    rot = math.atan2(facing[1], facing[0])
    out = []
    plaque = U.lathe(name + '_plaque', [(0.0, 0), (0.2, 0), (0.22, 0.02), (0.2, 0.04), (0.0, 0.04)], (0, 0, 0), (0, 0, 0), m['oak_dark'], n=6, group=group)
    plaque.scale = (1.0, 0.8, 1.0)
    plaque.rotation_euler = (0, math.pi / 2, 0)
    out.append(plaque)
    # 骨架：沿局部 +X 伸出（朝屋里）
    me = bpy.data.meshes.new(name + '_head')
    pts = [(0.03, 0, 0.0), (0.12, 0, 0.03), (0.21, 0, 0.07), (0.27, 0, 0.09), (0.33, 0, 0.06), (0.4, 0, 0.0), (0.44, 0, -0.03)]
    rad = [0.13, 0.11, 0.085, 0.08, 0.065, 0.05, 0.035]
    me.from_pydata(pts, [(i, i + 1) for i in range(len(pts) - 1)], [])
    hob = bpy.data.objects.new(name + '_head', me)
    bpy.context.scene.collection.objects.link(hob)
    sk = hob.modifiers.new('Skin', 'SKIN')
    for v, r in zip(me.skin_vertices[0].data, rad):
        v.radius = (r * 0.8, r)
    me.skin_vertices[0].data[0].use_root = True
    sub = hob.modifiers.new('Sub', 'SUBSURF')
    sub.levels = 2
    dg = bpy.context.evaluated_depsgraph_get()
    hm = bpy.data.meshes.new_from_object(hob.evaluated_get(dg))
    bpy.data.objects.remove(hob, do_unlink=True)
    head = bpy.data.objects.new(name + '_head', hm)
    hm.materials.append(m['fur'])
    for p in hm.polygons:
        p.use_smooth = True
    out.append(U.put(head, group))
    nose = ellipsoid(name + '_nose', (0.455, 0, -0.04), (0.025, 0.03, 0.02), mats()['soot'], group, seg=10)
    out.append(nose)
    for sd in (-1, 1):
        out.append(ellipsoid(name + '_eye', (0.31, sd * 0.06, 0.085), (0.012, 0.012, 0.012), U.mat_plain('eye_glass', '#0a0806', 0.08), group, seg=8))
        ear = ellipsoid(name + '_ear', (0.22, sd * 0.1, 0.17), (0.025, 0.012, 0.07), m['fur'], group, seg=10, rot=(sd * 0.9, -0.3, 0))
        out.append(ear)
        # 鹿角：主枝向上向外弯，再分出几个叉
        base = Vector((0.24, sd * 0.05, 0.16))
        main = [base]
        p = base.copy()
        d = Vector((-0.05, sd * 0.35, 1.0)).normalized()
        for k in range(10):
            p = p + d * 0.05
            d = (d + Vector((-0.04, sd * 0.06, -0.02))).normalized()
            main.append(p.copy())
        out.append(U.tube(name + '_antler', [tuple(v) for v in main], 0.012, m['antler'], group, n=8))
        for k in (3, 5, 7, 9):
            t0 = main[k]
            tip = t0 + Vector((0.09, sd * 0.02 * (k % 3), 0.08 + 0.01 * k))
            out.append(U.tube(name + '_tine', [tuple(t0), tuple(t0.lerp(tip, 0.5) + Vector((0.01, 0, 0.02))), tuple(tip)], 0.007, m['antler'], group, n=6))
    # 整体放到墙上
    M = Matrix.LocRotScale(Vector((x, y, z)), Euler((0, 0, rot)), None)
    for ob in out:
        ob.matrix_world = M @ Matrix.LocRotScale(ob.location, ob.rotation_euler, ob.scale)
    return out


def cauldron(loc, group='hearth', name='cauldron'):
    m = mats()
    x, y, z = loc
    prof = [(0.0, 0.0), (0.1, 0.01), (0.17, 0.08), (0.18, 0.15), (0.16, 0.23), (0.165, 0.245), (0.15, 0.245), (0.14, 0.23)]
    out = [U.lathe(name, prof, loc, (0, 0, 0), m['iron'], n=28, group=group)]
    for k in range(3):
        a = 2 * math.pi * k / 3
        out.append(U.cyl(name + '_foot', 0.018, 0.06, (x + math.cos(a) * 0.1, y + math.sin(a) * 0.1, z - 0.05), (0, 0, 0), m['iron'], n=8, group=group))
    hp = [(x - 0.16, y, z + 0.235)]
    for k in range(1, 12):
        a = math.pi * k / 12
        hp.append((x - 0.16 * math.cos(a), y, z + 0.235 + 0.16 * math.sin(a)))
    hp.append((x + 0.16, y, z + 0.235))
    out.append(U.tube(name + '_bail', hp, 0.007, m['iron'], group))
    out.append(U.lathe(name + '_stew', [(0.145, 0), (0.0, 0)], (x, y, z + 0.2), (0, 0, 0), m['chicken'], n=24, group=group, cap_bottom=False))
    return out


def log(loc, length, r, rot, group='hearth', name='log'):
    m = mats()
    ob = U.lathe(name, [(r * 0.92, 0), (r, 0.01), (r * 0.97, length * 0.5), (r, length - 0.01), (r * 0.92, length)], loc, rot, m['bark'], n=10, group=group, cap_bottom=True, cap_top=True, smooth=False)
    return [ob]


def hanging_bundle(loc, kind='garlic', group='decor', name='bundle', n=9, length=0.45):
    """梁上挂的大蒜辫 / 干草药 / 辣椒串。"""
    m = mats()
    x, y, z = loc
    out = [U.tube(name + '_cord', [(x, y, z), (x, y, z - length)], 0.004, m['rope'], group)]
    for i in range(n):
        t = (i + 0.5) / n
        zz = z - 0.04 - t * (length - 0.04)
        for sd in (-1, 1):
            ox = sd * 0.02 + R.uniform(-0.008, 0.008)
            oy = R.uniform(-0.015, 0.015)
            if kind == 'garlic':
                out.append(ellipsoid(name + '_g', (x + ox, y + oy, zz), (0.022, 0.022, 0.02), m['garlic'], group, seg=8))
            elif kind == 'pepper':
                out.append(ellipsoid(name + '_p', (x + ox, y + oy, zz), (0.007, 0.007, 0.03), m['pepper'], group, seg=6, rot=(R.uniform(-0.3, 0.3), 0, 0)))
            else:
                out.append(ellipsoid(name + '_h', (x + ox, y + oy, zz - 0.02), (0.018, 0.012, 0.05), m['herb'], group, seg=6, rot=(R.uniform(-0.4, 0.4), R.uniform(-0.4, 0.4), 0)))
    return out


def chalkboard(loc, rot, w=0.9, h=0.68, group='shelves', name='chalkboard'):
    m = mats()
    mat = U.mat_image('mat_chalk', r'C:\blender\henry_square\textures\chalkboard.png', rough=0.9)
    out = [U.grid_plane(name, w, h, loc, (math.pi / 2, 0, rot), mat, 1, 1, group)]
    c, s = math.cos(rot), math.sin(rot)
    for (dx, dz, L, vert) in [(0, h / 2 + 0.025, w + 0.1, False), (0, -h / 2 - 0.025, w + 0.1, False), (w / 2 + 0.025, 0, h, True), (-w / 2 - 0.025, 0, h, True)]:
        px, py = loc[0] + dx * c, loc[1] + dx * s
        if vert:
            out.append(U.box(name + '_frame', (L, 0.05, 0.03), (px, py, loc[2] + dz), (0, math.pi / 2, rot), m['oak_dark'], bevel=0.006, group=group))
        else:
            out.append(U.box(name + '_frame', (L, 0.05, 0.03), (px, py, loc[2] + dz), (0, 0, rot), m['oak_dark'], bevel=0.006, group=group))
    return out


def sack(loc, size=(0.3, 0.25, 0.4), group='shelves', name='sack', rot=0.0):
    m = mats()
    prof = [(0.0001, 0), (0.42, 0.02), (0.5, 0.25), (0.48, 0.6), (0.36, 0.85), (0.14, 0.95), (0.16, 1.0), (0.0001, 1.0)]
    ob = U.lathe(name, prof, (0, 0, 0), (0, 0, 0), m['sack'], n=18, group=group)
    for v in ob.data.vertices:
        v.co.x *= size[0] * (1 + R.uniform(-0.06, 0.06))
        v.co.y *= size[1]
        v.co.z *= size[2]
    ob.location = loc
    ob.rotation_euler = (0, 0, rot)
    return [ob]


def crate(loc, size=(0.5, 0.4, 0.35), rot=0.0, group='shelves', name='crate'):
    m = mats()
    out = []
    x, y, z = loc
    sx, sy, sz = size
    c, s = math.cos(rot), math.sin(rot)
    def at(dx, dy):
        return (x + dx * c - dy * s, y + dx * s + dy * c)
    for k in range(3):
        zz = z + 0.04 + k * (sz - 0.06) / 2.5
        for sd in (-1, 1):
            px, py = at(0, sd * sy / 2)
            out.append(U.box(name + '_slat', (sx, 0.018, 0.08), (px, py, zz + 0.04), (0, 0, rot), m['oak_light'], bevel=0.003, group=group, jitter=0.002, seed=k))
            px, py = at(sd * sx / 2, 0)
            out.append(U.box(name + '_slat', (sy, 0.018, 0.08), (px, py, zz + 0.04), (0, 0, rot + math.pi / 2), m['oak_light'], bevel=0.003, group=group, jitter=0.002, seed=k + 5))
    for cx in (-1, 1):
        for cy in (-1, 1):
            px, py = at(cx * (sx / 2 - 0.02), cy * (sy / 2 - 0.02))
            out.append(U.box(name + '_post', (sz, 0.04, 0.04), (px, py, z + sz / 2), (0, math.pi / 2, rot), m['oak_dark'], bevel=0.004, group=group))
    px, py = at(0, 0)
    out.append(U.box(name + '_bottom', (sx, sy, 0.02), (px, py, z + 0.01), (0, 0, rot), m['oak_light'], bevel=0.003, group=group))
    return out


# ---------- 柜台边睡觉的猫（参考图左下角那只花猫）：变形球拼出蜷成一团的身子、头和尾巴 ----------
def mat_tabby():
    m = bpy.data.materials.get('tabby')
    if m:
        return m
    m = bpy.data.materials.new('tabby')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    w = nt.nodes.new('ShaderNodeTexWave')
    w.wave_type = 'BANDS'
    w.bands_direction = 'X'
    w.inputs['Scale'].default_value = 24.0
    w.inputs['Distortion'].default_value = 5.0
    w.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 120
    n.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].position = 0.3
    r.color_ramp.elements[0].color = U._lin('#4a3220')
    r.color_ramp.elements[1].position = 0.7
    r.color_ramp.elements[1].color = U._lin('#a87a4a')
    nt.links.new(w.outputs['Fac'], r.inputs['Fac'])
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    mx.blend_type = 'MULTIPLY'
    mx.inputs['Factor'].default_value = 0.35
    nt.links.new(r.outputs['Color'], mx.inputs['A'])
    nt.links.new(n.outputs['Color'], mx.inputs['B'])
    nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.9
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.6
    nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def sleeping_cat(loc, rot=0.0, group='shelves', name='cat'):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = 0.01
    mb.render_resolution = 0.006
    mo = bpy.data.objects.new(name + '_mb', mb)
    bpy.context.scene.collection.objects.link(mo)
    def ball(co, r, kind='BALL', size=(1, 1, 1)):
        e = mb.elements.new()
        e.co = co
        e.radius = r
        e.type = kind
        if kind == 'ELLIPSOID':
            e.size_x, e.size_y, e.size_z = size
        return e
    # 身子：沿一段圆弧排几个椭球（蜷成 C 形）
    for i in range(9):
        a = math.radians(-80 + i * 22)
        ball((math.cos(a) * 0.085, math.sin(a) * 0.085, 0.07), 0.085, 'ELLIPSOID', (1.0, 1.0, 0.72))
    # 头：在弧的一端，下巴搁在身上；再加一个小鼻吻
    ball((math.cos(math.radians(105)) * 0.1 + 0.02, math.sin(math.radians(105)) * 0.1 + 0.02, 0.1), 0.07)
    ball((math.cos(math.radians(105)) * 0.1 + 0.06, math.sin(math.radians(105)) * 0.1 + 0.05, 0.085), 0.035)
    # 尾巴：从另一端绕回到头前面（球挨得近才能连成一条）
    for i in range(26):
        a = math.radians(-85 - i * 7.5)
        rr = 0.15 - i * 0.0012
        ball((math.cos(a) * rr, math.sin(a) * rr, 0.03), 0.034 - i * 0.0005)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mo.evaluated_get(dg))
    bpy.data.objects.remove(mo, do_unlink=True)
    bpy.data.metaballs.remove(mb)
    cat = bpy.data.objects.new(name, me)
    me.materials.append(mat_tabby())
    for p in me.polygons:
        p.use_smooth = True
    out = [U.put(cat, group)]
    hx, hy, hz = math.cos(math.radians(105)) * 0.1 + 0.02, math.sin(math.radians(105)) * 0.1 + 0.02, 0.1
    for sd in (-1, 1):
        ear = U.lathe(name + '_ear', [(0.018, 0), (0.0, 0.035)], (hx + sd * 0.028, hy + 0.01, hz + 0.04), (sd * 0.3, -0.2, 0), mat_tabby(), n=3, group=group)
        out.append(ear)
    M = Matrix.LocRotScale(Vector(loc), Euler((0, 0, rot)), None)
    for ob in out:
        ob.matrix_world = M @ Matrix.LocRotScale(ob.location, ob.rotation_euler, ob.scale)
    return out
