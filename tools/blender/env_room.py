# 酒馆场景（参照概念图）：坐标单位米，Z 向上，玩家在 -Y 一侧往 +Y 看。
# 左边（-X）柜台、酒架、酒桶；正面（+Y）圆拱窗、旗帜、盾牌；右边（+X）石砌壁炉和鹿头；中间是掷骰的搁板桌。
import bpy, bmesh, math, random
from mathutils import Vector, Euler, Matrix
import env_util as U
import env_props as P

X0, X1, Y0, Y1, H = -3.4, 3.4, -2.6, 3.8, 3.0
WALL_T = 0.35
TABLE = dict(cx=0.0, cy=-0.42, w=1.04, l=1.75, top=0.754)
# 会动的椅子（贴着桌子时的位置）、朝向（绕 Z，0 = 坐的人面朝 -Y）
CHAIRS = {
    'opp': ((0.0, 0.73), 0.0),                 # 对手（掷骰）的位子，正对玩家
    'left': ((-0.78, -0.15), math.pi / 2),     # 左边（中年人的老位子）
    'right': ((0.78, -0.15), -math.pi / 2),    # 右边（老人的老位子）
    'king': ((0.89, 2.55), math.pi / 2),       # 后面右边那张桌（年轻人不上场时坐这儿喝酒）
}
WINDOW = dict(x=0.0, sill=1.15, w=0.95, top=2.55)
DOOR = dict(x0=-0.52, x1=0.52, h=2.15)
HEARTH = dict(y0=0.45, y1=2.35, x0=2.62)
R = random.Random(5)


def mats():
    m = P.mats()
    m['stone'] = U.mat_stone('stone')
    m['stone_hearth'] = U.mat_stone('stone_hearth', mortar='#2a241c', s0='#4e4438', s1='#6e6250', s2='#8a7c64', brick=(0.3, 0.2), disp=0.035)
    m['stone_soot'] = U.mat_stone('stone_soot', mortar='#141210', s0='#1a1714', s1='#2a2420', s2='#3a322a', brick=(0.3, 0.18), disp=0.02)
    m['plaster'] = U.mat_plain('plaster', '#c8b896', 0.9, noise=0.3, noise_scale=6, bump=0.15)
    m['cobble'] = U.mat_stone('cobble', mortar='#1e1c1a', s0='#3a3632', s1='#56504a', s2='#6e6660', brick=(0.2, 0.18), disp=0.03, horizontal=True)
    m['glass_window'] = U.mat_plain('glass_window', '#a8c0e0', 0.1, emit='#8aa8dc', emit_strength=1.3)
    m['lead'] = U.mat_plain('lead', '#1a1a1c', 0.5, 0.7)
    m['sign'] = U.mat_image('mat_sign', r'C:\blender\henry_square\textures\sign.png', rough=0.6)
    return m


# ---------------- 房间外壳 ----------------
def wall_grid(name, w, h, cell, hole=None, group='walls'):
    """一面墙（局部：x 横向 0..w，z 竖直 0..h，法线 -y 朝屋内）。hole(x,z)->bool 判断门窗洞。"""
    nx, nz = max(1, int(round(w / cell))), max(1, int(round(h / cell)))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = [[bm.verts.new((w * i / nx, 0, h * j / nz)) for i in range(nx + 1)] for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            cx, cz = w * (i + 0.5) / nx, h * (j + 0.5) / nz
            if hole and hole(cx, cz):
                continue
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))  # 法线朝 -y（屋内）
            for l in f.loops:
                l[uv].uv = (l.vert.co.x, l.vert.co.z)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    return bm


def snap_hole(bm, outline_fn):
    """把洞口边界上的顶点吸到真正的门窗轮廓上（网格是方格，洞口边会是锯齿）。"""
    for v in bm.verts:
        if v.is_boundary:
            p = outline_fn(v.co.x, v.co.z)
            if p:
                v.co.x, v.co.z = p


def make_wall(name, origin, rot_z, w, h, mat, hole=None, outline=None, reveal=0.0, group='walls', cell=0.12, sub=3):
    bm = wall_grid(name, w, h, cell, hole, group)
    if outline:
        snap_hole(bm, outline)
    if reveal > 0:
        # 洞口内侧（窗台、窗洞侧面）：把洞口边界沿 +y（往墙外）挤出墙厚
        edges = [e for e in bm.edges if e.is_boundary and outline and all(outline(v.co.x, v.co.z) is not None for v in e.verts)]
        ret = bmesh.ops.extrude_edge_only(bm, edges=edges)
        nv = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
        for v in nv:
            v.co.y += reveal
    ob = U.mesh_obj(name, bm, mat)
    me = ob.data
    for p in me.polygons:
        p.use_smooth = False
    U.place(ob, origin, (0, 0, rot_z))
    s = ob.modifiers.new('Sub', 'SUBSURF')
    s.subdivision_type = 'SIMPLE'
    s.levels = 0
    s.render_levels = sub
    return U.put(ob, group)


def room_shell(m):
    out = []
    # 地板：一条条木板（沿 y 方向），每块长度不同、错缝
    bw = 0.2
    nx = int((X1 - X0) / bw)
    for i in range(nx):
        x = X0 + bw * (i + 0.5)
        y = Y0
        k = 0
        while y < Y1 - 0.05:
            L = min(Y1 - y, R.uniform(1.6, 3.2) if k else R.uniform(0.6, 2.6))
            ob = U.box('floor_board', (L - 0.004, bw - 0.006, 0.04), (x, y + L / 2, -0.02 + R.uniform(-0.002, 0.002)), (R.uniform(-0.004, 0.004), 0, math.pi / 2 + R.uniform(-0.002, 0.002)), m['floor'], bevel=0.004, group='floor')
            out.append(ob)
            y += L
            k += 1
    # 后墙（+Y），带圆拱窗洞
    wx, ws, wt, ww = WINDOW['x'], WINDOW['sill'], WINDOW['top'], WINDOW['w']
    rr = ww / 2
    zc = wt - rr
    def win_hole(x, z):
        lx = x + X0 - wx
        if abs(lx) > rr or z < ws:
            return False
        return z < zc or (lx * lx + (z - zc) ** 2) < rr * rr
    def win_outline(x, z):
        lx = x + X0 - wx
        if abs(lx) > rr + 0.13 or z < ws - 0.13 or z > wt + 0.13:
            return None
        if z <= zc:
            # 直边 / 窗台
            if abs(abs(lx) - rr) < abs(z - ws):
                return (wx - X0 + math.copysign(rr, lx), max(z, ws))
            return (x, ws)
        d = math.hypot(lx, z - zc)
        if d < 1e-6:
            return None
        return (wx - X0 + lx / d * rr, zc + (z - zc) / d * rr)
    out.append(make_wall('wall_back', (X0, Y1, 0), 0.0, X1 - X0, H, m['stone'], win_hole, win_outline, WALL_T, 'walls_back'))
    # 左墙（-X）：从屋里看法线朝 +X
    out.append(make_wall('wall_left', (X0, Y0, 0), math.pi / 2, Y1 - Y0, H, m['stone'], group='walls_side'))
    # 右墙（+X）
    out.append(make_wall('wall_right', (X1, Y1, 0), -math.pi / 2, Y1 - Y0, H, m['stone'], group='walls_side'))
    # 前墙（-Y），带门洞
    d0, d1, dh = DOOR['x0'], DOOR['x1'], DOOR['h']
    def door_hole(x, z):
        lx = X1 - x
        return d0 < lx < d1 and z < dh
    def door_outline(x, z):
        lx = X1 - x
        if not (d0 - 0.13 < lx < d1 + 0.13 and z < dh + 0.13):
            return None
        cands = [(abs(lx - d0), (X1 - d0, z)), (abs(lx - d1), (X1 - d1, z)), (abs(z - dh), (x, dh))]
        return min(cands)[1]
    out.append(make_wall('wall_front', (X1, Y0, 0), math.pi, X1 - X0, H, m['stone'], door_hole, door_outline, WALL_T, 'walls_front'))
    # 天花板木板 + 大梁 + 柱子
    for i in range(int((Y1 - Y0) / 0.24)):
        y = Y0 + 0.24 * (i + 0.5)
        out.append(U.box('ceil_board', (X1 - X0, 0.235, 0.035), (0, y, H + 0.017), (0, 0, 0), m['oak_dark'], bevel=0.004, group='ceiling'))
    beam_y = [-1.9, -0.6, 0.7, 2.0, 3.25]
    for y in beam_y:
        out.append(U.box('beam', (X1 - X0, 0.24, 0.28), (0, y, H - 0.14), (0, 0, 0), m['oak_dark'], bevel=0.02, group='ceiling', jitter=0.004, seed=int(y * 10)))
    out.append(U.box('beam_long', (Y1 - Y0, 0.22, 0.2), (-1.85, (Y0 + Y1) / 2, H - 0.38), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.02, group='ceiling'))
    out.append(U.box('beam_long', (Y1 - Y0, 0.22, 0.2), (2.15, (Y0 + Y1) / 2, H - 0.38), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.02, group='ceiling'))
    for (px, py) in [(-1.85, 0.42), (-1.85, 3.3), (2.15, -1.9), (2.15, 3.3)]:
        out.append(U.box('post', (H - 0.48, 0.24, 0.24), (px, py, (H - 0.48) / 2), (0, math.pi / 2, 0), m['oak_dark'], bevel=0.02, group='ceiling', jitter=0.003))
        for sd in (-1, 1):
            out.append(U.box('brace', (0.12, 0.7, 0.12), (px, py + sd * 0.26, H - 0.74), (sd * -0.785, 0, 0), m['oak_dark'], bevel=0.012, group='ceiling'))
    return out


# ---------------- 圆拱窗 ----------------
def window(m):
    out = []
    wx, ws, wt, ww = WINDOW['x'], WINDOW['sill'], WINDOW['top'], WINDOW['w']
    rr = ww / 2
    zc = wt - rr
    yg = Y1 + WALL_T * 0.7
    # 玻璃（自发光，冷色月光）
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    pts = [(wx - rr, ws), (wx + rr, ws)]
    for k in range(17):
        a = math.pi * k / 16
        pts.append((wx + rr * math.cos(a), zc + rr * math.sin(a)))
    vs = [bm.verts.new((p[0], yg, p[1])) for p in pts]
    f = bm.faces.new(vs)
    ob = U.mesh_obj('window_glass', bm, m['glass_window'])
    out.append(U.put(ob, 'walls_back'))
    # 铅条：斜格子
    lead = []
    step = 0.12
    for k in range(-14, 15):
        for sd in (-1, 1):
            p0 = Vector((wx + k * step - 1.2 * sd, yg - 0.01, ws - 0.0))
            pts2 = []
            for t in range(41):
                p = p0 + Vector((sd * t * 0.06, 0, t * 0.06))
                lx = p.x - wx
                inside = abs(lx) <= rr and p.z >= ws and (p.z <= zc or lx * lx + (p.z - zc) ** 2 <= rr * rr)
                if inside:
                    pts2.append(tuple(p))
                elif pts2:
                    break
            if len(pts2) >= 2:
                lead.append(U.tube('window_lead', pts2, 0.004, m['lead'], 'walls_back', n=4))
    out += lead
    # 窗框（铁）
    frame = [(wx - rr, yg - 0.012, ws), (wx - rr, yg - 0.012, zc)] + [(wx - rr * math.cos(math.pi * k / 16), yg - 0.012, zc + rr * math.sin(math.pi * k / 16)) for k in range(1, 16)] + [(wx + rr, yg - 0.012, zc), (wx + rr, yg - 0.012, ws), (wx - rr, yg - 0.012, ws)]
    out.append(U.tube('window_frame', frame, 0.018, m['oak_dark'], 'walls_back', n=6))
    out.append(U.box('window_sill', (ww + 0.24, WALL_T + 0.1, 0.06), (wx, Y1 + WALL_T / 2 - 0.04, ws - 0.03), (0, 0, 0), m['stone_hearth'], bevel=0.01, group='walls_back'))
    # 窗外的光
    U.light('window_sky', 'AREA', (wx, Y1 + 1.2, (ws + wt) / 2), 220, '#9ab4e0', size=1.6, rot=(math.radians(-90), 0, 0), group='window')
    return out


# ---------------- 门（开场时打开）和街景 ----------------
def door_and_street(m):
    out = []
    d0, d1, dh = DOOR['x0'], DOOR['x1'], DOOR['h']
    w = d1 - d0
    hinge = Vector((d1 - 0.02, Y0 - WALL_T / 2 + 0.03, 0))
    parts = []
    for k in range(6):
        x = d0 + w * (k + 0.5) / 6
        parts.append(U.box('door_plank', (dh - 0.01, w / 6 - 0.004, 0.05), (x, Y0 - WALL_T / 2, dh / 2), (0, math.pi / 2, math.pi / 2), m['oak'], bevel=0.006, group='door', jitter=0.002, seed=k))
    for z in (0.35, 1.05, 1.8):
        parts.append(U.box('door_strap', (w - 0.06, 0.012, 0.06), (0, Y0 - WALL_T / 2 - 0.032, z), (0, 0, 0), m['iron'], bevel=0.003, group='door'))
        parts.append(U.box('door_strap_b', (w - 0.06, 0.012, 0.06), (0, Y0 - WALL_T / 2 + 0.032, z), (0, 0, 0), m['iron'], bevel=0.003, group='door'))
    ring = U.ring_pts((d0 + 0.14, Y0 - WALL_T / 2 + 0.045, 1.05), 0.04, 12, axis='x')
    parts.append(U.tube('door_ring', ring + [ring[0]], 0.006, m['iron'], 'door'))
    door = U.join(parts, 'door')
    # 原点放在铰链上。合并后的物体带着第一块木板的位置和旋转：先把它烘进网格（物体变换归零），
    # 再把网格平移到以铰链为原点（原来直接平移，门被转到墙里、地板下面，门洞是空的）
    door.data.transform(door.matrix_basis)
    door.matrix_basis = Matrix.Identity(4)
    off = hinge.copy()
    door.data.transform(Matrix.Translation(-off))
    door.location = off
    door['marker'] = 'door'
    out.append(door)
    # 门框（石头）
    out.append(U.box('door_lintel', (w + 0.3, WALL_T + 0.06, 0.22), (0, Y0 - WALL_T / 2, dh + 0.11), (0, 0, 0), m['stone_hearth'], bevel=0.015, group='walls_front'))
    for sx in (d0 - 0.075, d1 + 0.075):
        out.append(U.box('door_jamb', (dh, WALL_T + 0.06, 0.15), (sx, Y0 - WALL_T / 2, dh / 2), (0, math.pi / 2, 0), m['stone_hearth'], bevel=0.015, group='walls_front'))
    # 外立面：白灰泥 + 木框架
    fy = Y0 - WALL_T
    def facade_hole(x, z):
        lx = x + X0
        return d0 < lx < d1 and z < dh
    fac = make_wall('facade', (X0, fy, 0), 0.0, X1 - X0, H + 0.6, m['plaster'], facade_hole, None, 0.0, 'exterior', cell=0.25, sub=1)
    out.append(fac)
    for x in (X0 + 0.1, -1.6, d0 - 0.25, d1 + 0.25, 1.6, X1 - 0.1):
        out.append(U.box('timber_v', (H + 0.6, 0.2, 0.1), (x, fy - 0.05, (H + 0.6) / 2), (0, math.pi / 2, 0), m['oak_dark'], bevel=0.01, group='exterior'))
    for z in (0.08, dh + 0.3, H + 0.5):
        out.append(U.box('timber_h', (X1 - X0, 0.2, 0.1), (0, fy - 0.05, z), (0, 0, 0), m['oak_dark'], bevel=0.01, group='exterior'))
    for sd in (-1, 1):
        x = sd * 1.9
        out.append(U.box('timber_d', (1.9, 0.16, 0.08), (x + sd * 0.15, fy - 0.05, 1.45), (0, sd * 0.85, 0), m['oak_dark'], bevel=0.01, group='exterior'))
    # 招牌
    sign = U.grid_plane('sign_board', 1.0, 0.5, (0.0, fy - 0.625, dh + 0.62), (math.pi / 2, 0, 0), m['sign'], 1, 1, 'exterior')
    out.append(sign)
    out.append(U.box('sign_back', (1.04, 0.04, 0.54), (0.0, fy - 0.6, dh + 0.62), (0, 0, 0), m['oak_dark'], bevel=0.008, group='exterior'))
    out.append(U.box('sign_arm', (0.9, 0.05, 0.06), (0.0, fy - 0.4, dh + 0.98), (0, 0, math.pi / 2), m['iron'], bevel=0.004, group='exterior'))
    for sx in (-0.4, 0.4):
        out += P.chain('sign_chain', (sx, fy - 0.6, dh + 0.88), (sx, fy - 0.55, dh + 0.98), 'exterior')
    out += P.lantern((d1 + 0.45, fy - 0.25, 1.75), 'exterior', 'lantern_door', 90)
    out += P.lantern((d0 - 0.45, fy - 0.25, 1.75), 'exterior', 'lantern_door2', 90)
    out.append(U.box('lantern_bracket', (0.3, 0.03, 0.03), (d0 - 0.45, fy - 0.14, 2.17), (0, 0, math.pi / 2), m['iron'], bevel=0.003, group='exterior'))
    out.append(U.box('lantern_bracket', (0.3, 0.03, 0.03), (d1 + 0.45, fy - 0.14, 2.17), (0, 0, math.pi / 2), m['iron'], bevel=0.003, group='exterior'))
    # 石板街
    street = U.grid_plane('street', 16, 12, (0, Y0 - WALL_T - 6.0, 0.0), (0, 0, 0), m['cobble'], 64, 48, 'exterior')
    s = street.modifiers.new('Sub', 'SUBSURF')
    s.subdivision_type = 'SIMPLE'
    s.levels = 0
    s.render_levels = 2
    out.append(street)
    # 对面的房子（远处的轮廓）
    for k, x in enumerate((-4.5, -1.0, 2.8, 6.0)):
        hh = R.uniform(4.5, 6.5)
        out.append(U.box('house', (3.2, 0.4, hh), (x, Y0 - 9.5, hh / 2), (0, 0, 0), m['plaster'], bevel=0.02, group='exterior'))
        out.append(U.box('house_roof', (3.4, 1.6, 0.25), (x, Y0 - 9.2, hh + 0.2), (0.5, 0, 0), m['oak_dark'], bevel=0.02, group='exterior'))
        win = U.mat_plain('house_window', '#ffb050', 0.4, emit='#ffa040', emit_strength=4.0)
        out.append(U.box('house_window', (0.5, 0.05, 0.7), (x + R.uniform(-0.8, 0.8), Y0 - 9.28, 1.8 + R.uniform(0, 1.5)), (0, 0, 0), win, bevel=0.0, group='exterior'))
    U.light('moon', 'SUN', (0, -8, 10), 1.4, '#8aa8e0', rot=(math.radians(52), 0, math.radians(18)), group='exterior')
    return out


# ---------------- 柜台、酒架、酒桶（左边） ----------------
def bar(m):
    out = []
    bx = -2.25
    y0, y1 = 0.55, 3.35
    L = y1 - y0
    yc = (y0 + y1) / 2
    out.append(U.box('bar_top', (L + 0.1, 0.7, 0.07), (bx, yc, 1.05), (0, 0, math.pi / 2), m['oak'], bevel=0.015, group='bar', jitter=0.002))
    out.append(U.box('bar_body', (L, 0.55, 1.0), (bx - 0.05, yc, 0.5), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.01, group='bar'))
    # 正面的框和尖拱镶板
    fx = bx + 0.24
    n = 5
    for k in range(n + 1):
        y = y0 + L * k / n
        out.append(U.box('bar_stile', (0.98, 0.09, 0.05), (fx, y, 0.5), (0, math.pi / 2, 0), m['oak'], bevel=0.008, group='bar'))
    for z in (0.08, 0.92):
        out.append(U.box('bar_rail', (L, 0.05, 0.09), (fx, yc, z), (0, 0, math.pi / 2), m['oak'], bevel=0.008, group='bar'))
    for k in range(n):
        y = y0 + L * (k + 0.5) / n
        pw = L / n - 0.12
        arch = [(fx + 0.012, y - pw / 2, 0.2), (fx + 0.012, y - pw / 2, 0.62)]
        for t in range(1, 10):
            a = t / 10
            arch.append((fx + 0.012, y - pw / 2 + pw * a, 0.62 + 0.18 * math.sin(math.pi * a) ** 0.6))
        arch += [(fx + 0.012, y + pw / 2, 0.62), (fx + 0.012, y + pw / 2, 0.2), (fx + 0.012, y - pw / 2, 0.2)]
        out.append(U.tube('bar_arch', arch, 0.011, m['oak_light'], 'bar', n=6))
    out.append(U.tube('bar_footrail', [(fx + 0.18, y0 + 0.1, 0.18), (fx + 0.18, y1 - 0.1, 0.18)], 0.02, m['brass'], 'bar', n=10))
    for y in (y0 + 0.4, yc, y1 - 0.4):
        out.append(U.box('bar_rail_post', (0.18, 0.03, 0.03), (fx + 0.09, y, 0.18), (0, 0, 0), m['iron'], bevel=0.003, group='bar'))
    # 柜台上的东西
    cz = 1.085
    out += P.wood_tankard((bx + 0.12, 1.0, cz), 0.4, 'bar', name='bar_tankard')
    out += P.pewter_tankard((bx - 0.05, 1.25, cz), 1.2, 'bar', name='bar_pewter')
    out += P.jug((bx - 0.1, 2.6, cz), 0.5, 'clay', 0.24, 0.08, 'bar', 'bar_jug')
    out += P.wine_bottle((bx + 0.05, 2.15, cz), 'glass_green', 'bar', 'bar_bottle')
    out += P.plate((bx, 1.75, cz), 0.12, 'pewter', 'bar', 'bar_plate')
    out += P.bowl((bx + 0.02, 3.0, cz), 0.09, 'oak_light', 'bar', 'bar_bowl', fill='apple_red')
    for k, y in enumerate((1.5, 2.85)):
        o, f = P.candle_dish((bx + 0.15, y, cz), 0.1 + 0.03 * k, 'bar', 'bar_candle%d' % k, power=10)
        out += o
    for k, y in enumerate((0.95, 1.65, 2.35, 3.05)):
        out += P.stool(bx + 0.62, y, 0.68, 'bar', 'stool%d' % k)
    return out


def shelves(m):
    out = []
    sx = X0 + 0.16
    y0, y1 = 0.6, 3.5
    yc = (y0 + y1) / 2
    for z in (1.25, 1.68, 2.1):
        out.append(U.box('shelf', (y1 - y0, 0.3, 0.035), (sx, yc, z), (0, 0, math.pi / 2), m['oak'], bevel=0.006, group='shelves'))
        for y in (y0 + 0.2, yc, y1 - 0.2):
            out.append(U.box('shelf_bracket', (0.24, 0.035, 0.035), (sx - 0.04, y, z - 0.09), (0, 0.7, 0), m['oak_dark'], bevel=0.004, group='shelves'))
        y = y0 + 0.12
        k = 0
        while y < y1 - 0.1:
            r = R.random()
            if r < 0.35:
                mat = R.choice(['glass_green', 'glass_brown', 'glass_clear'])
                h = R.uniform(0.24, 0.32)
                out += P.wine_bottle((sx + R.uniform(-0.05, 0.05), y, z + 0.018), mat, 'shelves', 'shelf_bottle', h, R.uniform(0.032, 0.042))
                y += 0.1
            elif r < 0.6:
                out += P.jug((sx + R.uniform(-0.03, 0.03), y + 0.05, z + 0.018), R.uniform(0, 6.28), R.choice(['clay', 'clay_glaze', 'clay_white', 'clay_green']), R.uniform(0.16, 0.24), R.uniform(0.05, 0.075), 'shelves', 'shelf_jug')
                y += 0.18
            elif r < 0.75:
                out += P.plate((sx + 0.08, y + 0.04, z + 0.13), 0.12, 'pewter', 'shelves', 'shelf_plate', (0, -1.25, 0))
                y += 0.09
            elif r < 0.9:
                for j in range(3):
                    out += P.cup((sx + R.uniform(-0.06, 0.06), y + j * 0.07, z + 0.018), R.choice(['clay_glaze', 'pewter']), 'shelves', 'shelf_cup')
                y += 0.22
            else:
                out += P.pewter_tankard((sx, y + 0.04, z + 0.018), R.uniform(0, 6.28), 'shelves', 0.9, False, 'shelf_pewter')
                y += 0.12
            k += 1
    # 黑板挂在酒桶上方
    out += P.chalkboard((X0 + 0.08, -0.75, 2.2), math.pi / 2, group='shelves')
    return out


def barrels(m):
    out = []
    bx = X0 + 0.1
    # 木架子
    for y in (-1.95, -0.25):
        out.append(U.box('cradle', (1.2, 0.12, 0.14), (bx + 0.55, y, 0.07), (0, 0, 0), m['oak_dark'], bevel=0.01, group='shelves'))
    out.append(U.box('cradle_long', (1.9, 0.1, 0.1), (bx + 0.12, -1.1, 0.12), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.01, group='shelves'))
    out.append(U.box('cradle_long', (1.9, 0.1, 0.1), (bx + 0.98, -1.1, 0.12), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.01, group='shelves'))
    r = 0.33
    for k, y in enumerate((-1.75, -1.07, -0.39)):
        out += P.barrel((bx, y, r + 0.14), (0, math.pi / 2, 0), 0.92, r, 'shelves', True, 'barrel%d' % k)
    for k, y in enumerate((-1.41, -0.73)):
        out += P.barrel((bx + 0.04, y, r * 2 + 0.14 + r * 0.72), (0, math.pi / 2, 0), 0.88, r * 0.95, 'shelves', k == 0, 'barrel_top%d' % k)
    # 立着的小桶和麻袋
    out += P.barrel((-2.55, 0.25, 0.0), (0, 0, 0), 0.62, 0.24, 'shelves', False, 'barrel_stand')
    out += P.sleeping_cat((-2.55, 0.25, 0.62), 0.9, 'shelves', 'cat')
    out += P.sack((-2.95, 0.2, 0.0), (0.32, 0.26, 0.5), 'shelves', 'sack0', 0.4)
    out += P.sack((-2.85, -2.25, 0.0), (0.3, 0.24, 0.42), 'shelves', 'sack1', 1.1)
    out += P.crate((-2.9, -2.3, 0.42), (0.45, 0.4, 0.32), 0.3, 'shelves', 'crate0')
    return out


# ---------------- 壁炉（右边） ----------------
def hearth(m):
    out = []
    hy0, hy1, hx0 = HEARTH['y0'], HEARTH['y1'], HEARTH['x0']
    hyc = (hy0 + hy1) / 2
    W = hy1 - hy0
    D = X1 - hx0
    out.append(U.box('hearth_slab', (W + 0.6, 1.2, 0.08), (X1 - 0.6, hyc, 0.04), (0, 0, math.pi / 2), m['stone_hearth'], bevel=0.01, group='hearth'))
    for (ya, yb) in ((hy0, hy0 + 0.36), (hy1 - 0.36, hy1)):
        b = U.box('hearth_jamb', (1.3, yb - ya, D), (hx0 + D / 2, (ya + yb) / 2, 0.65), (0, math.pi / 2, 0), m['stone_hearth'], bevel=0.02, group='hearth')
        sub = b.modifiers.new('Sub', 'SUBSURF')
        sub.subdivision_type = 'SIMPLE'
        sub.levels = 0
        sub.render_levels = 4
        out.append(b)
    out.append(U.box('hearth_back', (1.3, W - 0.72, 0.1), (X1 - 0.08, hyc, 0.65), (0, math.pi / 2, 0), m['stone_soot'], bevel=0.0, group='hearth'))
    out.append(U.box('hearth_floor', (W - 0.72, D - 0.05, 0.04), (hx0 + D / 2, hyc, 0.08), (0, 0, math.pi / 2), m['soot'], bevel=0.0, group='hearth'))
    out.append(U.box('mantel', (W + 0.2, D + 0.16, 0.16), (hx0 + D / 2 - 0.08, hyc, 1.38), (0, 0, math.pi / 2), m['oak_dark'], bevel=0.015, group='hearth', jitter=0.003))
    br = U.box('chimney', (H - 1.46, W - 0.3, D - 0.12), (hx0 + D / 2 + 0.06, hyc, 1.46 + (H - 1.46) / 2), (0, math.pi / 2, 0), m['stone_hearth'], bevel=0.02, group='hearth')
    sub = br.modifiers.new('Sub', 'SUBSURF')
    sub.subdivision_type = 'SIMPLE'
    sub.levels = 0
    sub.render_levels = 5
    out.append(br)
    # 柴火、铁架、火炭
    fx = X1 - 0.38
    for k, (dy, dz, rz) in enumerate([(-0.12, 0.14, 0.15), (0.12, 0.14, -0.1), (0.0, 0.25, 0.05)]):
        out += P.log((fx - 0.3, hyc + dy, 0.12 + dz), 0.6, 0.07, (0, math.pi / 2, rz), 'hearth', 'firelog%d' % k)
    for sd in (-1, 1):
        out.append(U.box('andiron', (0.5, 0.03, 0.04), (fx - 0.05, hyc + sd * 0.25, 0.14), (0, 0, 0), m['iron'], bevel=0.004, group='hearth'))
        out.append(U.cyl('andiron_head', 0.03, 0.22, (fx - 0.3, hyc + sd * 0.25, 0.1), (0, 0, 0), m['iron'], n=10, group='hearth'))
    for k in range(10):
        out.append(P.ellipsoid('ember', (fx - 0.1 + R.uniform(-0.2, 0.2), hyc + R.uniform(-0.25, 0.25), 0.11), (R.uniform(0.02, 0.05), R.uniform(0.02, 0.05), 0.02), m['ember'], 'flames', seg=6))
    flame_m = U.mat_emit('fire', '#ff8a2a', 22.0)
    for k in range(5):
        out.append(P.ellipsoid('fire_tongue', (fx - 0.15 + R.uniform(-0.12, 0.12), hyc + R.uniform(-0.2, 0.2), 0.32), (0.05, 0.05, R.uniform(0.12, 0.2)), flame_m, 'flames', seg=8))
    for (dy, dz, pw) in ((-0.2, 0.35, 140), (0.2, 0.32, 140), (0.0, 0.6, 110)):
        U.light('fire_L', 'POINT', (fx - 0.2, hyc + dy, dz), pw, '#ff7a26', 0.12, group='fire')
    U.empty('FX_hearth', (fx - 0.15, hyc, 0.16), 'hearth')
    # 吊锅：铁架横杆 + 链子
    out += P.cauldron((fx - 0.15, hyc, 0.42), 'hearth')
    out.append(U.cyl('crane_post', 0.018, 1.1, (X1 - 0.12, hy0 + 0.45, 0.12), (0, 0, 0), m['iron'], n=8, group='hearth'))
    out.append(U.tube('crane_arm', [(X1 - 0.12, hy0 + 0.45, 1.05), (fx - 0.15, hyc, 1.05)], 0.014, m['iron'], 'hearth'))
    out += P.chain('cauldron_chain', (fx - 0.15, hyc, 0.68), (fx - 0.15, hyc, 1.04), 'hearth')
    # 壁炉台上的东西 + 鹿头
    mz = 1.46
    out += P.jug((hx0 + 0.15, hy0 + 0.25, mz), 1.0, 'clay_glaze', 0.2, 0.06, 'hearth', 'mantel_jug')
    out += P.plate((hx0 + 0.25, hyc + 0.45, mz + 0.12), 0.13, 'pewter', 'hearth', 'mantel_plate', (0, -1.3, math.pi))
    for k, y in enumerate((hy0 + 0.55, hy1 - 0.3)):
        o, f = P.candle_dish((hx0 + 0.12, y, mz), 0.13, 'hearth', 'mantel_candle%d' % k, power=10)
        out += o
    out += P.stag_head((hx0 + 0.18, hyc, 2.12), (-1, 0), 'hearth')
    # 旁边的柴堆、火钳
    for k in range(9):
        row = k // 3
        out += P.log((X1 - 0.75 + (k % 3) * 0.17, hy1 + 0.3, 0.07 + row * 0.13), 0.55, 0.065, (math.pi / 2, 0, 0), 'hearth', 'stack%d' % k)
    out.append(U.cyl('poker', 0.007, 0.8, (hx0 - 0.08, hy0 - 0.12, 0.0), (0.12, 0.1, 0), m['iron'], n=6, group='hearth'))
    return out


# ---------------- 墙上的旗、盾、灯 ----------------
def decor(m):
    out = []
    T = r'C:\blender\henry_square\textures'
    out += P.banner((-1.25, Y1 - 0.09, 2.55), 0.0, 0.62, 1.25, T + r'\banner_blue.png', 'decor', 'banner_blue')
    out += P.banner((1.95, Y1 - 0.09, 2.55), 0.0, 0.62, 1.25, T + r'\banner_red.png', 'decor', 'banner_red')
    out += P.heater_shield((0.95, Y1 - 0.1, 2.0), 0.0, 0.48, T + r'\shield.png', 'decor', 'shield')
    out += P.banner((X1 - 0.09, -1.2, 2.5), -math.pi / 2, 0.55, 1.1, T + r'\banner_red.png', 'decor', 'banner_side')
    out += P.chandelier((0.0, -0.4, 2.15), 0.45, 8, H - 0.28, 'decor', 'chandelier_main', 13)[0]
    out += P.chandelier((0.3, 2.45, 2.3), 0.36, 6, H - 0.28, 'decor', 'chandelier_back', 11)[0]
    out += P.sconce((-2.35, Y1 - 0.05, 1.85), (0, -1), 'decor', 'sconce_b1')
    out += P.sconce((2.45, Y1 - 0.05, 1.85), (0, -1), 'decor', 'sconce_b2')
    out += P.sconce((X1 - 0.05, -0.4, 1.85), (-1, 0), 'decor', 'sconce_r1')
    out += P.sconce((X0 + 0.05, 0.35, 1.95), (1, 0), 'decor', 'sconce_l1')
    out += P.sconce((-1.6, Y0 + 0.05, 1.85), (0, 1), 'decor', 'sconce_f1')
    out += P.lantern((-1.85, 0.42 - 0.22, 1.95), 'decor', 'lantern_post', 28, hang=(-1.85, 0.42 - 0.22, 2.4))
    out += P.lantern((-2.25, 2.05, 2.15), 'decor', 'lantern_bar', 26, hang=(-2.25, 2.0, H - 0.28))
    # 梁上挂的大蒜、草药、辣椒
    for k, (x, y, kind) in enumerate([(-2.5, 0.7, 'garlic'), (-2.2, 0.7, 'herb'), (-1.95, 0.72, 'pepper'), (-2.6, 2.0, 'herb'), (-2.3, 2.0, 'garlic'), (-2.05, 2.02, 'herb'), (-2.45, 3.25, 'pepper'), (-2.15, 3.25, 'garlic')]):
        out += P.hanging_bundle((x, y, H - 0.28), kind, 'decor', 'bundle%d' % k, 8, R.uniform(0.35, 0.55))
    return out


# ---------------- 后面两张桌子 ----------------
def back_tables(m):
    out = []
    for k, (cx, cy) in enumerate(((-1.45, 2.75), (1.55, 2.85))):
        out += P.trestle_table(cx, cy, 0.78, 1.4, 0.74, 'back', 'backtable%d' % k)
        if k == 0:
            out += P.bench(cx - 0.62, cy, math.pi / 2, 1.3, 0.44, 0.3, 'back', 'backbench%d' % k)
        # 右边那张桌的左侧不放长凳：年轻人的椅子（会动）在这里
        out += P.bench(cx + 0.62, cy, math.pi / 2, 1.3, 0.44, 0.3, 'back', 'backbench%d' % k)
        z = 0.745
        out += P.wood_tankard((cx - 0.15, cy + 0.3, z), 0.5, 'back', name='bt_tank%d' % k)
        out += P.pewter_tankard((cx + 0.18, cy - 0.25, z), 2.0, 'back', name='bt_pew%d' % k)
        out += P.plate((cx, cy - 0.05, z), 0.12, 'pewter', 'back', 'bt_plate%d' % k)
        out += P.bowl((cx + 0.05, cy + 0.45, z), 0.07, 'clay_glaze', 'back', 'bt_bowl%d' % k, fill='bread')
        o, f = P.candle_dish((cx - 0.1 if k == 0 else cx + 0.17, cy - 0.45 if k == 0 else cy - 0.5, z), 0.09, 'back', 'bt_candle%d' % k, power=9)
        out += o
    return out


# ---------------- 掷骰的桌子和座位 ----------------
def game_table(m):
    t = TABLE
    out = P.trestle_table(t['cx'], t['cy'], t['w'], t['l'], t['top'], 'table', 'gametable')
    # 对手和两边的人坐的椅子会被拉开、挪近，游戏里单独加载（chair.glb），这里只放标记点
    for name, ((x, y), rz) in CHAIRS.items():
        U.empty('CHAIR_' + name, (x, y, 0.0), 'chair', (0, 0, rz))
    # 靠近玩家这一头两边各一张不动的椅子（烘焙进场景）
    out += P.slat_chair(-0.83, -1.0, math.pi / 2 + 0.25, 0.45, 'table', 'chair_near_l')
    out += P.slat_chair(0.85, -0.95, -math.pi / 2 - 0.2, 0.45, 'table', 'chair_near_r')
    out += P.rug((0.0, -0.42), 2.7, 3.3, 0.0, 'floor', 'rug')
    # 桌上的静物（避开中间的骰盘、两排骰子和骰盅）
    z = t['top']
    o, flame = P.candle_dish((-0.38, 0.32, z), 0.13, 'tableprops', 'table_candle', power=5)
    out += o
    out += P.food_platter((0.27, -0.78, z), 'tableprops', 'platter', 0.3)
    out += P.wood_tankard((0.36, 0.33, z), 2.4, 'tableprops', name='tank_dicer')
    out += P.pewter_tankard((-0.4, -0.62, z), 0.3, 'tableprops', name='pewter_table')
    out += P.wicker_bottle((-0.3, -0.98, z), 0.4, 'tableprops', 'wicker')
    out += P.dice_pouch((-0.17, 0.36, z), 0.6, 'tableprops', 'dice_pouch')
    out += P.bowl((0.05, -0.68, z), 0.075, 'oak_light', 'tableprops', 'nut_bowl', fill='bread')
    out += P.plate((-0.12, -0.95, z), 0.11, 'pewter', 'tableprops', 'table_plate')
    # 给游戏的标记
    U.empty('TRAY', (0, 0, z), 'tray')
    for k, p in enumerate([(-1.74, 1.98, 0), (-1.4, 1.35, 0), (-0.95, 0.95, 0)]):
        U.empty('PATH_barmaid_%d' % k, p, 'path')
    # 女店员要坐下时，把托盘先放到柜台上这里
    U.empty('TRAY_counter', (-2.03, 1.95, 1.085), 'tray')
    return out


def build_all():
    m = mats()
    for fn in (room_shell, window, door_and_street, bar, shelves, barrels, hearth, decor, back_tables, game_table):
        fn(m)
    w = bpy.context.scene.world or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.012, 0.016, 0.034, 1)
    bg.inputs[1].default_value = 1.0
    return m
