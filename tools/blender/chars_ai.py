# AI 人物（v3.2）：用 Hunyuan3D-2mv 按设定图三视图生成的整人网格（身体、衣服、头发、胡子连在一起），
# 接到原来的 MPFB 骨架上，动作照旧：
#   1. 读入网格，转成朝 -Y、脚底 z=0，高度和位置对齐到按设定图轮廓拟合过的“代理”（MPFB 身体 + 程序做的衣服）
#   2. 减面 → 展 UV → 三视图投影成贴图（网格本身就是设定图的站姿，投影最准）
#   3. 代理摆成设定图站姿，把骨骼权重传给 AI 网格，再按权重反算出静止姿势（骨架摆回站姿时形状不变）
#   4. 手换成 MPFB 的手（有手指，能握骰盅、端酒杯），手腕处把 AI 前臂收口接上
# 细节（v3.2）：头部另用“头部特写”（GFPGAN 修复过的脸 + 放大 2 倍的头发）单独生成一次，五官、头发、胡子更立体，
#   换掉整身网格的头；脸在贴图上分到更多像素、从特写图取色；Marigold 从三视图估出的法线做成法线贴图（缝线、褶皱、皮带、五官的凹凸）
import bpy, math, os, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import chars_clothes as C
import chars_motion as A
import chars_project as P
import chars_pose as PS

SHAPES = r'D:\ai3d\work\shapes'
REF_SR = r'C:\blender\henry_square\reference\views_sr'   # Real-ESRGAN 放大过的三视图（头部仍用普通放大）
REF_FACE = r'C:\blender\henry_square\reference\views_face'   # 同上，正面的脸换成 GFPGAN 修复过的
HEADS = r'C:\blender\henry_square\reference\heads'       # 头部特写（restore_faces.py）+ heads.json
NORMALS = r'C:\blender\henry_square\reference\normals'   # Marigold 法线（normals_views.py）
# v3.3 写实皮肤（skin_delight.py）：去掉照片自带光影的三视图/特写（游戏里的灯重新打光），和正面的材质图（R 皮肤、G 粗糙度）
REF_ALB = r'C:\blender\henry_square\reference\views_albedo'
HEADS_ALB = r'C:\blender\henry_square\reference\heads_albedo'
MATS = r'C:\blender\henry_square\reference\views_mat'
HEAD_MATS = r'C:\blender\henry_square\reference\heads_mat'
SCULPT_DEBUG = os.environ.get('HENRY_SCULPT_DEBUG')       # 设了就把 sculpt_face 的中间数据存到这个目录（排查用）
FACES = 60000                      # 减面后每人多少个面（身体）
HEAD_FACES = 36000                 # 头部网格减面后
HEAD_FRAC = 0.24                   # 头部特写从头顶往下占身高多少（和 restore_faces.py 一致）
HEAD_UV = 2.4                      # 头部的 UV 岛放大几倍（脸在贴图上分到更多像素）
CUT_BELOW_MOUTH = {'dicer': 0.06, 'barmaid': 0.06, 'drinker': 0.10, 'elder': 0.11}   # 头部接缝在嘴下多少米（有胡子的往下些）
HAND = ('hand_', 'thumb_', 'index_', 'middle_', 'ring_', 'pinky_')
SKIP = ('eyes', 'brows', 'lashes', 'teeth')     # 代理里不要的（在头里面，传权重用不上）


def mesh_co(ob):
    co = np.empty(len(ob.data.vertices) * 3, dtype=np.float64)
    ob.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def set_co(ob, co):
    ob.data.vertices.foreach_set('co', np.ascontiguousarray(co, dtype=np.float32).ravel())
    ob.data.update()


def select(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def load_ai(name, path=None):
    """读入 AI 生成的 GLB，合成一个物体、应用变换、去掉材质。"""
    path = path or os.path.join(SHAPES, name + '.glb')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        M = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = M
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = ob.data.name = name + '.ai'
    ob.data.materials.clear()
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def orient(ob):
    """转成头朝上（z）、脸朝 -Y。前后靠靴子判断：脚尖比脚跟离脚踝远得多，左右两边则差不多。"""
    co = mesh_co(ob)
    if int(np.argmax(co.max(0) - co.min(0))) != 2:
        raise RuntimeError('AI 网格的高度方向不是 z')
    z0, H = co[:, 2].min(), np.ptp(co[:, 2])
    feet = co[co[:, 2] < z0 + 0.035 * H, :2]
    ankle = co[(co[:, 2] > z0 + 0.07 * H) & (co[:, 2] < z0 + 0.11 * H), :2]
    c = ankle.mean(0)
    best, front = -1.0, None
    for d in (np.array((1.0, 0)), np.array((0, 1.0))):
        fwd = np.percentile((feet - c) @ d, 99)
        bwd = np.percentile((feet - c) @ -d, 99)
        if abs(fwd - bwd) > best:
            best = abs(fwd - bwd)
            front = d if fwd > bwd else -d
    # 把 front 转到 (0, -1)
    ang = math.atan2(-1, 0) - math.atan2(front[1], front[0])
    R = np.array(Matrix.Rotation(ang, 3, 'Z'))
    set_co(ob, co @ R.T)
    return front.tolist(), round(float(best), 4)


def leg_center(co, zt, lo=0.15, hi=0.32):
    """膝盖到大腿那一段（手垂下来也够不到）的水平中心。"""
    band = (co[:, 2] > lo * zt) & (co[:, 2] < hi * zt)
    p = co[band, :2]
    return 0.5 * (p.min(0) + p.max(0))


def place(ob, zt, center):
    """等比缩放到和代理一样高（脚底 0、头顶 zt），腿部中心对齐代理。"""
    co = mesh_co(ob)
    z0 = co[:, 2].min()
    k = zt / np.ptp(co[:, 2])
    co = (co - np.array((0, 0, z0))) * k
    co[:, :2] += np.asarray(center) - leg_center(co, zt)
    set_co(ob, co)
    return round(float(k), 4)


def ref_dir():
    for d in (REF_ALB, REF_FACE, REF_SR):
        if os.path.isdir(d):
            return d
    return P.REF


def umeyama(Pp, Qq):
    """相似变换 Q ≈ s·R·P + t（最小二乘）。"""
    mp, mq = Pp.mean(0), Qq.mean(0)
    A, B = Pp - mp, Qq - mq
    U, S, Vt = np.linalg.svd(B.T @ A / len(Pp))
    D = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (A ** 2).sum(1).mean()
    return s, R, mq - s * R @ mp


def attach_head(name, body, zt, report=None, overlap=0.03):
    """头部特写单独生成的网格换掉整身网格的头：
    1. 按特写的取景（头顶往下 HEAD_FRAC 身高）粗放，再用 ICP（带缩放）贴到整身网格的头上；
    2. 接缝放在嘴下面（下巴/胡子下），只换以头为轴的一个圆柱里面的部分（肩膀还用身体的，免得接缝跟着手臂动）；
    3. 两边在接缝处重叠 overlap：身体那一圈往里缩几毫米，让头部网格盖住。返回头部物体（已减面），没有特写就返回 None。"""
    path = os.path.join(SHAPES, name + '_head.glb')
    meta = os.path.join(HEADS, 'heads.json')
    if not (os.path.exists(path) and os.path.exists(meta)):
        return None
    with open(meta, encoding='utf8') as f:
        info = json.load(f)[name]
    hd = load_ai(name, path)
    hd.name = hd.data.name = name + '.head'
    H = mesh_co(hd)
    B = mesh_co(body)
    hz0, hz1 = H[:, 2].min(), H[:, 2].max()
    H = (H - np.array((0, 0, hz1))) * (HEAD_FRAC * zt / (hz1 - hz0)) + np.array((0, 0, zt))
    tb = B[B[:, 2] > 0.9 * zt]
    th = H[H[:, 2] > 0.9 * zt]
    H[:, :2] += (0.5 * (tb.min(0) + tb.max(0)) - 0.5 * (th.min(0) + th.max(0)))[:2]
    bvh = BVHTree.FromPolygons([Vector(v) for v in B], [list(p.vertices) for p in body.data.polygons])
    Ps = H[H[:, 2] > zt * (1 - 0.6 * HEAD_FRAC)][::5]
    s, R, t = 1.0, np.eye(3), np.zeros(3)
    for _ in range(25):
        X = s * Ps @ R.T + t
        Q = np.array([bvh.find_nearest(Vector(p))[0][:] for p in X])
        d = np.linalg.norm(Q - X, axis=1)
        keep = d <= np.percentile(d, 80)
        s, R, t = umeyama(Ps[keep], Q[keep])
    H = s * H @ R.T + t
    X = s * Ps @ R.T + t
    err = np.median([np.linalg.norm(np.array(bvh.find_nearest(Vector(p))[0][:]) - p) for p in X])
    # 接缝高度：嘴（正面五点里两个嘴角）往下 CUT_BELOW_MOUTH
    a = P.load_rgba(os.path.join(ref_dir(), name + '_front.png'))[..., 3] > 0.5
    rows = np.nonzero(a.any(1))[0]
    mouth = 0.5 * (info['points'][3][1] + info['points'][4][1])
    z_mouth = zt * (1 - (mouth - rows[0]) / (rows[-1] - rows[0]))
    z_cut = z_mouth - CUT_BELOW_MOUTH.get(name, 0.07)
    top = H[H[:, 2] > zt - 0.1 * zt]
    axis = 0.5 * (top.min(0) + top.max(0))[:2]
    ring = H[(H[:, 2] > z_cut) & (H[:, 2] < z_cut + 0.08)]
    R_h = float(np.clip(np.percentile(np.linalg.norm(ring[:, :2] - axis, axis=1), 98) + 0.01, 0.1, 0.2))

    def wfield(co):
        r = np.linalg.norm(co[:, :2] - axis, axis=1)
        return smoothstep((co[:, 2] - (z_cut - overlap)) / overlap) * smoothstep((R_h + overlap - r) / overlap)

    # 身体：完全在头部范围里的删掉，接缝那一圈往里缩
    delete_verts(body, wfield(B) > 0.999)
    B = mesh_co(body)
    nb = np.array([v.normal[:] for v in body.data.vertices])
    w = wfield(B)
    set_co(body, B - nb * (0.004 * w)[:, None])
    # 头部：范围外的删掉，减面
    set_co(hd, H)
    delete_verts(hd, wfield(H) < 0.001)
    nf = decimate(hd, HEAD_FACES)
    if report is not None:
        report['head'] = dict(scale=round(float(s), 3), icp_mm=round(float(err) * 1000, 1), z_cut=round(float(z_cut), 3),
                              radius=round(R_h, 3), faces=nf)
    return hd, z_cut - overlap, z_mouth


def decimate(ob, faces=FACES):
    n = len(ob.data.polygons)
    if n > faces:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = faces / n
        m.use_collapse_triangulate = True
        select(ob)
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons:
        p.use_smooth = True
    return len(ob.data.polygons)


# ---------------- 投影上色 ----------------
def refine_align(view, alpha, X, s, cx, hc, r0, zt, sub=3):
    """在 P.align 的结果上微调：左右平移、上下平移、横向缩放，让模型投到图上的轮廓和图上的人重合得最多（IoU）。
    返回 (横向缩放, 竖向缩放, cx, r0, IoU)。"""
    fg = alpha > 0.5
    H, W = fg.shape
    Xs = X[::sub]
    h = P.hcoord(view, Xs)
    z = Xs[:, 2]

    def iou(kx, cx_, r0_):
        x = ((h - hc) * s * kx + cx_).astype(np.int64)
        y = ((zt - z) * s + r0_).astype(np.int64)
        ok = (x >= 0) & (x < W) & (y >= 0) & (y < H)
        mk = np.zeros((H, W), bool)
        mk[y[ok], x[ok]] = True
        mk |= np.roll(mk, 1, 0) | np.roll(mk, 1, 1)
        return (mk & fg).sum() / max(1, (mk | fg).sum())

    kx, best = 1.0, iou(1.0, cx, r0)
    for step in (3, 1):
        for _ in range(3):
            moved = False
            for d in (-step, step):
                while True:
                    v = iou(kx, cx + d, r0)
                    if v <= best:
                        break
                    best, cx, moved = v, cx + d, True
            for d in (-step, step):
                while True:
                    v = iou(kx, cx, r0 + d)
                    if v <= best:
                        break
                    best, r0, moved = v, r0 + d, True
            for d in (-0.005 * step, 0.005 * step):
                while 0.92 < kx + d < 1.08:
                    v = iou(kx + d, cx, r0)
                    if v <= best:
                        break
                    best, kx, moved = v, kx + d, True
            if not moved:
                break
    return s * kx, s, cx, r0, best


def box(a, r, ax):
    """沿一个轴的滑动平均（窗口 2r+1，边缘按最近值延伸）。"""
    pad = [(0, 0)] * a.ndim
    pad[ax] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax)
    n = a.shape[ax]
    return (np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=ax) - np.take(c, np.arange(n), axis=ax)) / (2 * r + 1)


def blur(a, r):
    for _ in range(3):
        a = box(box(a, r, 0), r, 1)
    return a


def outline(mask):
    """轮廓像素 (行, 列) 和朝外的法线方向。"""
    m = mask
    inner = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
    pts = np.argwhere(m & ~inner)
    sm = blur(m.astype(np.float64), 2)
    gr, gc = np.gradient(sm)
    n = -np.stack([gr[pts[:, 0], pts[:, 1]], gc[pts[:, 0], pts[:, 1]]], 1)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    return pts, n


def silhouette_warp(mesh_mask, fg, maxd=20, r=10):
    """模型轮廓 → 图上轮廓的二维位移场：模型轮廓上每点找图上朝向相近、互为最近的轮廓点，位移再平滑铺开。
    手臂这种细的部位，模型和图差一两厘米就会取到旁边裙子的颜色，用它把取色位置挪回去。返回 (行位移, 列位移)。"""
    from mathutils.kdtree import KDTree
    pm, nm = outline(mesh_mask)
    pf, nf = outline(fg)
    if not len(pm) or not len(pf):
        return None
    kf = KDTree(len(pf))
    for i, p in enumerate(pf):
        kf.insert((float(p[0]), float(p[1]), 0.0), i)
    kf.balance()
    km = KDTree(len(pm))
    for i, p in enumerate(pm):
        km.insert((float(p[0]), float(p[1]), 0.0), i)
    km.balance()
    H, W = fg.shape
    D = np.zeros((H, W, 2))
    Wt = np.zeros((H, W))
    for i, p in enumerate(pm):
        for co, j, dist in kf.find_n((float(p[0]), float(p[1]), 0.0), 6):
            if dist > maxd:
                break
            if nm[i] @ nf[j] < 0.6:
                continue
            # 反过来也得是最近（排除手臂对到裙边这种错配）
            _, i2, _ = km.find(co)
            if np.abs(pm[i2] - p).sum() > 4:
                break
            D[p[0], p[1]] = pf[j] - p
            Wt[p[0], p[1]] = 1
            break
    den = blur(Wt, r)
    num = np.stack([blur(D[..., 0] * Wt, r), blur(D[..., 1] * Wt, r)], 2)
    F = num / np.maximum(den, 1e-6)[..., None]
    F *= np.clip(den / 0.02, 0, 1)[..., None]          # 离轮廓远（没有可靠对应）的地方不动
    return F


def unwrap_weighted(ob, mask, k=HEAD_UV):
    """展 UV；mask 里的顶点（头部）所在的岛放大 k 倍再统一排布，让脸在贴图上分到更多像素。"""
    import bmesh
    P.unwrap(ob)
    if mask is None or not mask.any():
        return
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv['proj']
    for f in bm.faces:
        if all(mask[v.index] for v in f.verts):
            for l in f.loops:
                l[uv].uv = l[uv].uv * k
    bm.to_mesh(me)
    bm.free()
    select(ob)
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')


def fit_points(px, py, fg, sub=3):
    """二维点集（投到图上的模型）整体平移 + 绕中心缩放，让它的轮廓和图上的 fg 重合最多。返回 (dx, dy, k, cx, cy, IoU)。"""
    H, W = fg.shape
    qx, qy = px[::sub], py[::sub]
    cx, cy = float(qx.mean()), float(qy.mean())

    def iou(dx, dy, k):
        x = ((qx - cx) * k + cx + dx).astype(np.int64)
        y = ((qy - cy) * k + cy + dy).astype(np.int64)
        ok = (x >= 0) & (x < W) & (y >= 0) & (y < H)
        mk = np.zeros((H, W), bool)
        mk[y[ok], x[ok]] = True
        mk |= np.roll(mk, 1, 0) | np.roll(mk, 1, 1)
        return (mk & fg).sum() / max(1, (mk | fg).sum())

    dx = dy = 0.0
    k = 1.0
    best = iou(dx, dy, k)
    for step in (4, 2, 1):
        for _ in range(4):
            moved = False
            for cand in ((dx + step, dy, k), (dx - step, dy, k), (dx, dy + step, k), (dx, dy - step, k),
                         (dx, dy, k * (1 + 0.004 * step)), (dx, dy, k / (1 + 0.004 * step))):
                v = iou(*cand)
                if v > best:
                    best, (dx, dy, k), moved = v, cand, True
            if not moved:
                break
    return dx, dy, k, cx, cy, best


def edge_depth(alpha, n):
    """每个像素离图上人物轮廓有几个像素（最多 n）。设定图的人四周有一圈深色描边/阴影，取色要躲开它。"""
    m = alpha > 0.5
    acc = np.zeros(m.shape, np.float32)
    for _ in range(n):
        m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
        acc += m
    return acc


def load_normals(tag, name, fname, flip):
    """Marigold 法线（相机坐标），没有就返回 None。左右镜像的视图：列反过来、x 取反。"""
    p = os.path.join(NORMALS, '%s_%s_%s.npy' % (tag, name, fname))
    if not os.path.exists(p):
        return None
    n = np.load(p).astype(np.float32)
    if flip:
        n = n[:, ::-1].copy()
        n[..., 0] *= -1
    return n


# 每个视图里，图片的“右”和“上”在世界坐标里是哪个方向
IMG_AXES = {'front': ((1, 0, 0), (0, 0, 1)), 'back': ((-1, 0, 0), (0, 0, 1)),
            'right': ((0, -1, 0), (0, 0, 1)), 'left': ((0, 1, 0), (0, 0, 1))}


def tangent_frame(pos, cover, idx, N, jump=0.02):
    """每个贴图像素的切线（u 方向）和副切线（v 方向，Blender 的 OpenGL 约定），由位置图在相邻像素间的差算出。"""
    def grad(axis):
        a = np.roll(pos, -1, axis)
        b = np.roll(pos, 1, axis)
        da, db = a - pos, pos - b
        oa = np.roll(cover, -1, axis) & (np.linalg.norm(da, axis=2) < jump)
        ob = np.roll(cover, 1, axis) & (np.linalg.norm(db, axis=2) < jump)
        g = np.where((oa & ob)[..., None], 0.5 * (da + db), np.where(oa[..., None], da, np.where(ob[..., None], db, 0)))
        return g[idx].astype(np.float64)
    Tu, Tv = grad(1), grad(0)
    T = Tu - (Tu * N).sum(1)[:, None] * N
    # 很小的 UV 岛、岛的边上算不出可靠的方向：这些像素就不加凹凸（不然是一块块乱色）
    lu, lv = np.linalg.norm(Tu, axis=1), np.linalg.norm(Tv, axis=1)
    ok = (np.linalg.norm(T, axis=1) > 2e-5) & (lv > 2e-5) & (np.abs((Tu * Tv).sum(1)) < 0.7 * lu * lv)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    B = np.cross(N, T)
    sg = np.sign((B * Tv).sum(1))
    sg[sg == 0] = 1
    return T, B * sg[:, None], ok


def integrate_normals(n, fg):
    """法线图（相机坐标：x 右、y 上、z 朝看图的人）积分成高度图（像素单位，朝看图的人为正）：Frankot–Chellappa，用 FFT 解泊松方程。"""
    nz = np.clip(n[..., 2], 0.25, 1.0)
    p = np.where(fg, -n[..., 0] / nz, 0.0)          # 高度沿列的斜率
    q = np.where(fg, n[..., 1] / nz, 0.0)           # 沿行（往下）的斜率
    H, W = p.shape
    S = 2 * max(H, W)
    Pp = np.zeros((S, S))
    Qq = np.zeros((S, S))
    Pp[:H, :W] = p
    Qq[:H, :W] = q
    w = np.fft.fftfreq(S) * 2 * np.pi
    WX, WY = np.meshgrid(w, w)
    den = WX ** 2 + WY ** 2
    den[0, 0] = 1.0
    Z = np.real(np.fft.ifft2((-1j * WX * np.fft.fft2(Pp) - 1j * WY * np.fft.fft2(Qq)) / den))[:H, :W]
    return Z - Z[fg].mean()


def front_head_coords(name, ob, head):
    """每个顶点投到正面头部特写上的像素坐标（和 paint() 正面取色同一套对齐：整体对齐 → 轮廓微调 → 特写里再对一次头部轮廓）。
    返回 (hx, hy, 特写上每米多少像素, 特写的 alpha)。"""
    V = mesh_co(ob)
    img = P.load_rgba(os.path.join(ref_dir(), name + '_front.png'))
    s, cx, hc, r0, zt = P.align('front', img[..., 3], V)
    sh, s, cx, r0, _ = refine_align('front', img[..., 3], V, s, cx, hc, r0, zt)
    x = (P.hcoord('front', V) - hc) * sh + cx
    y = (zt - V[:, 2]) * s + r0
    with open(os.path.join(HEADS, 'heads.json'), encoding='utf8') as f:
        cr = json.load(f)[name]['crops']['front']
    k = cr['k']
    hx, hy = (x - cr['c0']) * k, (y - cr['top']) * k
    ha = P.load_rgba(os.path.join(HEADS, name + '_front.png'))[..., 3]
    hsel = head['mask'] & (V[:, 2] > head['z_lo'] + 0.06)
    fgh = ha > 0.5
    ylo = float(np.percentile(hy[hsel], 99.5))
    fgh[int(min(ylo, fgh.shape[0])):] = False
    ddx, ddy, kk, ccx, ccy, _ = fit_points(hx[hsel], hy[hsel], fgh)
    hx = (hx - ccx) * kk + ccx + ddx
    hy = (hy - ccy) * kk + ccy + ddy
    return hx, hy, s * k * kk, ha


def sculpt_face(name, ob, head, gain=1.0, sigma=0.022, limit=0.012, report=None):
    """让脸上的五官长在照片里对应的位置（不然照片里的鼻子阴影画在模型的脸颊上，看着像一张照片糊在面具上）。
    正面头部特写的 Marigold 法线积分成浮雕（和照片逐像素对齐）。在脸的范围里（关键点圈出的整张脸 + 皮肤，朝前的部分）
    目标形状 = 模型的大轮廓（比 sigma 大的起伏，额头、脸颊的弧度）+ 照片的五官层（比 sigma 小的）；
    再加一个平滑的修正量让它在边界上和模型原来的形状接上（修正量在边界上等于差值、里面是调和插值，和修图里的无缝克隆一个道理）。
    眼眶里照片把深色的眼珠当成了坑，用四周眼皮的起伏补平。顶点只沿前后方向移动：正面投影取色的位置不变，颜色和形状正好对上。"""
    hn_path = os.path.join(NORMALS, 'head_%s_front.npy' % name)
    mpath = os.path.join(HEAD_MATS, name + '_front.png')
    fpath = os.path.join(HEAD_MATS, name + '_face.png')
    if head is None or not all(os.path.exists(p) for p in (hn_path, mpath, fpath)):
        return None
    me = ob.data
    me.update()
    V = mesh_co(ob)
    Nv = np.empty(len(V) * 3)
    me.vertices.foreach_get('normal', Nv)
    Nv = Nv.reshape(-1, 3)
    hx, hy, ppm, ha = front_head_coords(name, ob, head)
    fg = ha > 0.5
    Hh, Ww = fg.shape
    mat = P.load_rgba(mpath)
    Zm = integrate_normals(np.load(hn_path).astype(np.float64), fg) * gain / ppm      # 照片浮雕（米）
    eye = blur(((mat[..., 1] < 0.2) & (mat[..., 3] > 0.5)).astype(np.float64), 2) > 0.05
    Zm = np.where(eye, P.pull_push(np.where(eye, 0.0, Zm)[..., None], (~eye).astype(np.float64))[..., 0], Zm)
    # 模型朝正面相机的深度，铺成特写像素格子上的一张深度图（只取朝前、最前面那层顶点）
    depth = -V[:, 1]
    ff = -Nv[:, 1]
    xi = np.clip(np.round(hx).astype(np.int64), 0, Ww - 1)
    yi = np.clip(np.round(hy).astype(np.int64), 0, Hh - 1)
    cand = head['mask'] & (hx >= 0) & (hx < Ww) & (hy >= 0) & (hy < Hh) & (ff > 0.15)
    buf = np.full((Hh, Ww), -np.inf)
    np.maximum.at(buf, (yi[cand], xi[cand]), depth[cand])
    for _ in range(3):                               # 顶点比像素稀：空格子取周围的最前值
        b2 = buf.copy()
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                b2 = np.maximum(b2, np.roll(np.roll(buf, di, 0), dj, 1))
        buf = np.where(np.isfinite(buf), buf, b2)
    vis = cand & (depth > buf[yi, xi] - 0.004)
    Ds = np.zeros((Hh, Ww))
    Fs = np.zeros((Hh, Ww))
    Ws = np.zeros((Hh, Ww))
    np.add.at(Ds, (yi[vis], xi[vis]), depth[vis])
    np.add.at(Fs, (yi[vis], xi[vis]), ff[vis])
    np.add.at(Ws, (yi[vis], xi[vis]), 1.0)
    wb = blur(Ws, 3)
    valid = wb > 0.02
    Dm = np.where(valid, blur(Ds, 3) / np.maximum(wb, 1e-9), 0.0)
    Fm = blur(Fs, 3) / np.maximum(wb, 1e-9)
    # 范围：整张脸（关键点凸包）+ 皮肤，补上小洞；只要朝前的（侧面浮雕不准），边上往里收一点
    face = P.load_rgba(fpath)[..., 0] > 0.5
    reg = blur(((mat[..., 0] > 0.3) | face).astype(np.float64), 10) > 0.25
    om = blur((reg & valid & (Fm > 0.45)).astype(np.float64), 3) > 0.97
    if om.sum() < 500:
        return None
    r = max(2, int(round(sigma * ppm)))
    vf = valid.astype(np.float64)
    nc = lambda a: blur(a * vf, r) / np.maximum(blur(vf, r), 1e-9)       # 只在模型有的地方求平均
    T = nc(Dm) + (Zm - nc(Zm))
    C = np.where(valid & ~om, Dm - T, 0.0)
    C = P.pull_push(C[..., None], (valid & ~om).astype(np.float64))[..., 0]
    for _ in range(400):
        Cn = 0.25 * (np.roll(C, 1, 0) + np.roll(C, -1, 0) + np.roll(C, 1, 1) + np.roll(C, -1, 1))
        C = np.where(om, Cn, C)
    Dn = np.where(om, T + C, Dm)
    diff = blur((Dn - Dm) * blur(om.astype(np.float64), 8), 1)
    diff = limit * np.tanh(diff / limit)               # 软限幅：最多前后移动 limit
    # 顶点按差值移动；离最前层太远的（嘴里、耳后）不动；往侧面渐渐不动
    move = cand & (depth > buf[yi, xi] - 0.015)
    dv = np.where(move, P.bilinear(diff[..., None], hx, hy)[:, 0], 0.0) * smoothstep((ff - 0.15) / 0.2)
    V2 = V.copy()
    V2[:, 1] = -(depth + dv)
    set_co(ob, V2)
    sel = np.abs(dv) > 1e-5
    out = dict(verts=int(sel.sum()), move_mm=round(float(np.abs(dv[sel]).mean() * 1000), 2) if sel.any() else 0,
               max_mm=round(float(np.abs(dv).max() * 1000), 1), region_px=int(om.sum()))
    if SCULPT_DEBUG:
        np.savez_compressed(os.path.join(SCULPT_DEBUG, name + '_sculpt.npz'), hx=hx, hy=hy, depth=depth, ff=ff, vis=vis,
                            Z=Zm * ppm, ppm=ppm, dv=dv, Dm=Dm, Dn=Dn, om=om)
    if report is not None:
        report['sculpt'] = out
    return out


def fill3d(X, vals, good, vox):
    """没看到的像素（~good）按三维位置补值：vox 大小的格子记下看到的，空格子从周围一圈圈往外补，再抹匀几遍，最后三线性插值。"""
    vals = vals.copy()
    C = vals.shape[1]
    key = np.floor((X - X.min(0)) / vox).astype(np.int64)
    dims = key.max(0) + 1
    G = np.zeros(tuple(dims) + (C,))
    Gw = np.zeros(tuple(dims))
    kg = key[good]
    np.add.at(G, (kg[:, 0], kg[:, 1], kg[:, 2]), vals[good])
    np.add.at(Gw, (kg[:, 0], kg[:, 1], kg[:, 2]), 1.0)
    Cg = G / np.maximum(Gw, 1)[..., None]
    M = (Gw > 0).astype(np.float64)
    for _ in range(30):
        if M.all() or not (~good).any():
            break
        S = np.zeros_like(Cg)
        Sm = np.zeros_like(M)
        for ax in range(3):
            for sh in (-1, 1):
                S += np.roll(Cg * M[..., None], sh, ax)
                Sm += np.roll(M, sh, ax)
        new = (M == 0) & (Sm > 0)
        if not new.any():
            break
        Cg[new] = S[new] / Sm[new][:, None]
        M[new] = 1
    # 再抹匀几遍（只在有值的格子之间），补出来的地方不会是一块块 1 厘米的方格
    for _ in range(3):
        S = Cg * M[..., None]
        Sm = M.copy()
        for ax in range(3):
            for sh in (-1, 1):
                S += np.roll(Cg * M[..., None], sh, ax)
                Sm += np.roll(M, sh, ax)
        Cg = np.where(M[..., None] > 0, S / np.maximum(Sm, 1)[..., None], Cg)
    # 三线性插值（格子中心之间平滑过渡）
    fk = (X[~good] - X.min(0)) / vox - 0.5
    k0 = np.clip(np.floor(fk).astype(np.int64), 0, np.maximum(dims - 2, 0))
    t = np.clip(fk - k0, 0, 1)
    out = np.zeros((len(fk), C))
    wtot = np.zeros(len(fk))
    for o in ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0), (1, 0, 1), (0, 1, 1), (1, 1, 1)):
        kk = np.minimum(k0 + np.array(o), dims - 1)
        wc = np.prod(np.where(np.array(o) == 1, t, 1 - t), axis=1) * M[kk[:, 0], kk[:, 1], kk[:, 2]]
        out += Cg[kk[:, 0], kk[:, 1], kk[:, 2]] * wc[:, None]
        wtot += wc
    ku = key[~good]
    near = Cg[ku[:, 0], ku[:, 1], ku[:, 2]]
    vals[~good] = np.where(wtot[:, None] > 1e-6, out / np.maximum(wtot, 1e-6)[:, None], near)
    return vals


def paint(name, ob, size=2048, report=None, head=None, cell=0.002, tol=0.01, vox=0.01, relief=1.7):
    """三视图投影上色（ob 现在就是设定图的站姿）。遮挡用深度缓冲：每个视图把所有贴图像素按离相机远近记下最前面的，
    比它靠后 tol 以上的就是被挡住了。哪个视图都没看到的像素，按三维位置从附近看到的像素取色。
    head = {'mask': 头部顶点, 'z_lo': 头部网格最低处}：头部的 UV 放大，颜色和法线从头部特写图里取（分辨率是整身视图的 2 倍，正面是修复过的脸）。
    法线贴图：Marigold 估出的法线去掉大的起伏（网格本身有）只留细节，转到每个像素的切线空间。"""
    unwrap_weighted(ob, head['mask'] if head else None)
    pos, cover = P.bake_attr(ob, 'pos', size)
    nrm, _ = P.bake_attr(ob, 'nrm', size)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-6)
    idx = np.nonzero(cover)
    X = pos[idx].astype(np.float64)
    N = nrm[idx].astype(np.float64)
    V = mesh_co(ob)
    ff = -(N @ np.array(P.DIRS['front'][:], dtype=np.float64))     # 每个像素朝正面相机的程度
    side = P.SIDE[name]
    other = 'left' if side == 'right' else 'right'
    views = [('front', 'front', False, 1.0), ('back', 'back', False, 1.0), (side, 'side', False, 1.0), (other, 'side', True, 0.6)]
    acc = np.zeros((len(X), 3))
    dacc = np.zeros((len(X), 3))
    wsum = np.zeros(len(X))
    macc = np.zeros((len(X), 3))        # 材质图（只从正面取：侧面、背面认不准哪里是皮肤）
    mwsum = np.zeros(len(X))
    info = {}
    ref = ref_dir()
    crops = None
    if head:
        with open(os.path.join(HEADS, 'heads.json'), encoding='utf8') as f:
            crops = json.load(f)[name]['crops']
    has_n = False
    for view, fname, flip, vw in views:
        img = P.load_rgba(os.path.join(ref, '%s_%s.png' % (name, fname)), flip)
        s, cx, hc, r0, zt = P.align(view, img[..., 3], V)
        sh, s, cx, r0, _ = refine_align(view, img[..., 3], X, s, cx, hc, r0, zt)
        d = np.array(P.DIRS[view][:], dtype=np.float64)
        facing = -(N @ d)
        depth = -(X @ d)
        h = P.hcoord(view, X)
        gi = ((h - h.min()) / cell).astype(np.int64)
        gj = ((X[:, 2] - X[:, 2].min()) / cell).astype(np.int64)
        buf = np.full((gi.max() + 1, gj.max() + 1), -np.inf)
        np.maximum.at(buf, (gi, gj), depth)
        # 只补空格子（贴图像素没落到的小洞），不把挡在前面的东西往外扩：不然鼻子两侧一圈都算“被挡住”，颜色改从侧面取，脸上出深色条纹
        b2 = buf.copy()
        hole = ~np.isfinite(buf)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                b2 = np.where(hole, np.maximum(b2, np.roll(np.roll(buf, di, 0), dj, 1)), b2)
        vis = depth > b2[gi, gj] - tol
        x = (h - hc) * sh + cx
        y = (zt - X[:, 2]) * s + r0
        # 局部修正：模型轮廓和图上轮廓之间的小偏差（手臂、裙边）
        Hh, Ww = img.shape[:2]
        xi = np.clip(x.astype(np.int64), 0, Ww - 1)
        yi = np.clip(y.astype(np.int64), 0, Hh - 1)
        mm = np.zeros((Hh, Ww), bool)
        mm[yi, xi] = True
        mm |= np.roll(mm, 1, 0) | np.roll(mm, 1, 1)
        Fw = silhouette_warp(mm, img[..., 3] > 0.5)
        if Fw is not None:
            y = y + Fw[yi, xi, 0]
            x = x + Fw[yi, xi, 1]
        smp = P.bilinear(img, x, y)
        mpath = os.path.join(MATS, name + '_front.png')
        msmp = P.bilinear(P.load_rgba(mpath), x, y) if view == 'front' and os.path.exists(mpath) else None
        edge = np.clip(edge_depth(img[..., 3], 6)[np.clip(y.astype(np.int64), 0, Hh - 1), np.clip(x.astype(np.int64), 0, Ww - 1)] / 5, 0, 1)
        nimg = load_normals('view', name, fname, flip)
        nsm = None
        if nimg is not None:
            has_n = True
            nsm = P.bilinear(nimg - blur(nimg, 6), x, y)
        # 头部：改从特写图取（特写是这个视图的一块放大 k 倍）
        if crops and fname in crops:
            cr = crops[fname]
            k = cr['k']
            c0 = cr['c0'] if not flip else Ww - cr['c1']
            hx, hy = (x - c0) * k, (y - cr['top']) * k
            hpath = os.path.join(HEADS_ALB, '%s_%s.png' % (name, fname))
            himg = P.load_rgba(hpath if os.path.exists(hpath) else os.path.join(HEADS, '%s_%s.png' % (name, fname)), flip)
            # 头部网格就是照这张特写生成的：只拿头部（接缝以上）和特写里同一段的轮廓再对一次齐（整体平移、缩放）
            hsel = X[:, 2] > head['z_lo'] + 0.06     # 下巴以上：这一段头部网格是完整的（没被圆柱切过）
            fgh = himg[..., 3] > 0.5
            ylo = float(np.percentile(hy[hsel], 99.5))
            fgh[int(min(ylo, fgh.shape[0])):] = False
            ddx, ddy, kk, ccx, ccy, hiou = fit_points(hx[hsel], hy[hsel], fgh)
            hx = (hx - ccx) * kk + ccx + ddx
            hy = (hy - ccy) * kk + ccy + ddy
            info['head_' + view] = round(float(hiou), 3)
            inh = (X[:, 2] > head['z_lo'] - 0.01) & (hx >= 0) & (hx < himg.shape[1] - 1) & (hy >= 0) & (hy < himg.shape[0] - 1)
            smp[inh] = P.bilinear(himg, hx[inh], hy[inh])
            hmpath = os.path.join(HEAD_MATS, name + '_front.png')
            if msmp is not None and os.path.exists(hmpath):
                msmp[inh] = P.bilinear(P.load_rgba(hmpath), hx[inh], hy[inh])
            he = edge_depth(himg[..., 3], 12)
            edge[inh] = np.clip(he[hy[inh].astype(np.int64), hx[inh].astype(np.int64)] / 10, 0, 1)
            hn = load_normals('head', name, fname, flip)
            if hn is not None and nsm is not None:
                nsm[inh] = 0.4 * P.bilinear(hn - blur(hn, 3), hx[inh], hy[inh])     # 头部网格已有五官的形状：只留很细的（眼皮、发丝、皱纹），否则鼻子会出现两层
        a = smp[:, 3]
        w = vis * np.clip(facing, 0, 1) ** 3 * np.clip((a - 0.35) / 0.5, 0, 1) * vw * (0.03 + 0.97 * edge)
        # 头部：正面看得到的地方（脸）只用正面特写（GFPGAN 修复过、最清楚）；侧面特写只给耳朵、头发两侧和后脑。
        # 不然鼻翼、脸颊会混进侧面那张很糊的侧脸和它轮廓上的深色描边
        if head and view != 'front':
            w = w * np.where(X[:, 2] > head['z_lo'], 1 - smoothstep((ff - 0.25) / 0.35), 1.0)
        acc += smp[:, :3] * w[:, None]
        wsum += w
        if msmp is not None:
            macc += msmp[:, :3] * w[:, None]
            mwsum += w
        if nsm is not None:
            R_img, U_img = (np.array(v, dtype=np.float64) for v in IMG_AXES[view])
            dw = nsm[:, 0:1] * R_img + nsm[:, 1:2] * U_img
            dw -= (dw * N).sum(1)[:, None] * N
            dacc += dw * w[:, None]
        # 对齐检查：模型投到图上的轮廓和图上的人重合多少
        xi, yi = np.clip(x.astype(int), 0, Ww - 1), np.clip(y.astype(int), 0, Hh - 1)
        mk = np.zeros((Hh, Ww), bool)
        mk[yi, xi] = True
        fg = img[..., 3] > 0.5
        info[view] = round(float((mk & fg).sum() / max(1, (mk | fg).sum())), 3)
    good = wsum > 0.02          # 只被斜着擦边看到的（肩头等）不算看到：从附近看清楚的地方取色，免得取到设定图边缘的浅色背景
    if head:
        # 头部（脸上鼻翼这种只有正面斜着看得到的地方也要留着自己的颜色）；只有头顶朝上的那一片：
        # 设定图没有一张是从上往下看的，那里的颜色都是擦边猜的（常常取到浅色背景），一律从周围的头发/帽子补
        hp = X[:, 2] > head['z_lo']
        crown = (X[:, 2] > X[hp, 2].max() - 0.08) & (N[:, 2] > 0.55)       # 只算头顶最上面 8 厘米（鼻翼、眼皮也有朝上的面，别动）
        good = np.where(hp, (wsum > 1e-4) & ~crown, good)
    colv = np.zeros((len(X), 3))
    colv[good] = acc[good] / wsum[good][:, None]
    colv = fill3d(X, colv, good, vox)
    col = np.zeros((size, size, 3), dtype=np.float32)
    wt = np.zeros((size, size), dtype=np.float32)
    col[idx] = colv.astype(np.float32)
    wt[idx] = 1.0
    filled = P.pull_push(col, wt)
    col_img = P.save_image(name + '_ai', filled, size)
    if has_n:
        nd = N + relief * np.where(good[:, None], dacc / np.maximum(wsum, 1e-9)[:, None], 0)
        nd /= np.maximum(np.linalg.norm(nd, axis=1, keepdims=True), 1e-9)
        T, B, ok = tangent_frame(pos, cover, idx, N)
        tn = np.stack([(nd * T).sum(1), (nd * B).sum(1), (nd * N).sum(1)], 1)
        tn[~ok] = (0, 0, 1)
        nmap = np.zeros((size, size, 3), dtype=np.float32)
        nmap[idx] = (tn * 0.5 + 0.5).astype(np.float32)
        nmap = P.pull_push(nmap, wt)
        nrm_img = P.save_image(name + '_ai_n', nmap, size)
    else:
        nrm_img = P.save_image(name + '_ai_n', P.height_normal(filled, 2.0), size)
    # 材质图：R = 皮肤（游戏里做次表面散射和皮肤高光）、G = 粗糙度（眼睛、嘴唇、T 区更光）、B = 0
    mat_img = None
    if mwsum.any():
        mgood = mwsum > 0.02
        matv = np.zeros((len(X), 3))
        matv[mgood] = macc[mgood] / mwsum[mgood][:, None]
        matv = fill3d(X, matv, mgood, vox)
        bad = matv[:, 1] < 0.05                       # 补不到的（离正面看到的地方太远）：当衣服
        matv[bad] = (0.0, 0.86, 0.0)
        mm = np.zeros((size, size, 3), dtype=np.float32)
        mm[idx] = matv.astype(np.float32)
        mat_img = P.save_image(name + '_ai_m', P.pull_push(mm, wt), size)
        mat_img.colorspace_settings.name = 'Non-Color'
    mat = P.outfit_material(name + '.ai', col_img, nrm_img)
    # 衣服：设定图本身带着光影，材质要哑一点，免得酒馆的灯在皮衣上打出一片片亮斑
    b = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = 0.86
    b.inputs['Specular IOR Level'].default_value = 0.2
    if has_n:
        next(n for n in mat.node_tree.nodes if n.type == 'NORMAL_MAP').inputs['Strength'].default_value = 1.0
    if mat_img is not None:
        # 粗糙度接材质图的 G、金属度接 B（全是 0）：两个都从同一张图的对应通道来，导出 GLB 时整张图原样当
        # metallicRoughness 贴图（R 通道的皮肤遮罩跟着进游戏）；只接粗糙度的话，导出插件会把 R、B 填成白色
        nt = mat.node_tree
        tm = nt.nodes.new('ShaderNodeTexImage')
        tm.image = mat_img
        nt.links.new(next(n for n in nt.nodes if n.type == 'UVMAP').outputs['UV'], tm.inputs['Vector'])
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(tm.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    if report is not None:
        report['paint'] = dict(texels=int(len(X)), seen=round(float(good.mean()), 3), iou=info, normals=has_n,
                               skin=round(float((matv[:, 0] > 0.5).mean()), 3) if mat_img is not None else None)
    return filled


def uv_color(ob, img, verts):
    """这些顶点在贴图上的平均颜色（按它们所在的面角取 UV）。"""
    me = ob.data
    uv = me.uv_layers['proj'].data
    size = img.shape[0]
    vs = set(int(i) for i in verts)
    cs = []
    for lp in me.loops:
        if lp.vertex_index in vs:
            u, v = uv[lp.index].uv
            cs.append(img[min(size - 1, int(v * size)), min(size - 1, int(u * size))])
    if not cs:
        return None
    cs = np.array(cs)
    lum = cs @ np.array((0.3, 0.59, 0.11))
    return np.median(cs[lum >= np.median(lum)], 0)     # 只取亮的一半（暗的是阴影、手指缝）


# ---------------- 手臂对齐 ----------------
def slice_comps(cloud, z, sx, band=0.012, cell=0.012):
    """高度 z 附近一层薄片里、这一侧（sx）的顶点（连同边的中点，够密），放进 1.2 厘米的格子，
    相邻（八方向）的格子连成一块：[(外框中心, x 宽, y 宽)]。外框中心不受截面上顶点疏密影响。"""
    p = cloud[(np.abs(cloud[:, 2] - z) < band) & (cloud[:, 0] * sx > 0.04)]
    if not len(p):
        return []
    g = np.floor((p[:, :2] - p[:, :2].min(0)) / cell).astype(np.int64) + 1
    W, H = g.max(0) + 2
    big = W * H + 1
    lab = np.full((W, H), big, np.int64)
    lab[g[:, 0], g[:, 1]] = g[:, 0] * H + g[:, 1]
    occ = lab < big
    while True:
        new = lab.copy()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx or dy:
                    new = np.minimum(new, np.roll(np.roll(lab, dx, 0), dy, 1))
        new[~occ] = big
        if np.array_equal(new, lab):
            break
        lab = new
    pl = lab[g[:, 0], g[:, 1]]
    out = []
    for l in np.unique(pl):
        q = p[pl == l]
        out.append((0.5 * (q.min(0) + q.max(0)), float(np.ptp(q[:, 0])), float(np.ptp(q[:, 1]))))
    return out


def inside(bvh, p):
    """点在不在网格里面：往四个水平方向打射线，至少三条打到网格就算在里面（网格不一定封闭）。"""
    hits = 0
    for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)):
        if bvh.ray_cast(Vector(p), Vector(d), 0.4)[0] is not None:
            hits += 1
    return hits >= 3


def along(p0, L, pts):
    """折线 pts（从上往下）上第一个离 p0 正好 L 的点（插值）；够不着返回 None。"""
    d = np.linalg.norm(pts - p0, axis=1)
    k = np.nonzero(d >= L)[0]
    if not len(k) or k[0] == 0:
        return None
    k = k[0]
    t = (L - d[k - 1]) / max(d[k] - d[k - 1], 1e-9)
    return pts[k - 1] + (pts[k] - pts[k - 1]) * t


def fit_arms(ai, rig, report=None, step=0.01):
    """AI 网格的手臂垂得和预设的站姿不完全一样：一层层横切 AI 网格，跟踪手臂截面的中心线，
    再把骨架的上臂、前臂、手对准这条线（肘、腕按骨头长度落在线上）。骨架必须先摆成 REF 站姿（当作起点）。"""
    co = mesh_co(ai)
    E = edges(ai)
    bvh = BVHTree.FromPolygons([Vector(v) for v in co], [list(p.vertices) for p in ai.data.polygons])
    cloud = np.concatenate([co, 0.5 * (co[E[:, 0]] + co[E[:, 1]])])
    pb = rig.pose.bones
    for s in 'lr':
        sx = 1 if s == 'l' else -1
        S = np.array(pb['upperarm_' + s].head)
        chain = [S, np.array(pb['lowerarm_' + s].head), np.array(pb['hand_' + s].head), np.array(pb['hand_' + s].tail)]

        def prior(z):
            for p, q in zip(chain, chain[1:]):
                if p[2] >= z >= q[2]:
                    return p + (q - p) * (p[2] - z) / max(p[2] - q[2], 1e-9)
            return chain[-1]

        def pick(z, prev, maxd):
            best = None
            for c, wx, wy in slice_comps(cloud, z, sx):
                d = np.linalg.norm(c[:2] - prev[:2])
                if d < maxd and wx < 0.17 and wy < 0.17 and (best is None or d < best[0]):
                    best = (d, c)
            return None if best is None else np.array((best[1][0], best[1][1], z))

        start = None
        for z0 in np.linspace(chain[1][2], chain[2][2], 5):
            start = pick(z0, prior(z0), 0.08)
            if start is not None:
                break
        if start is None:
            if report is not None:
                report.setdefault('arms', {})[s] = 'not found'
            continue
        pts = [start]
        for sign in (-1, 1):                       # 往下到指尖，往上到腋下
            prev = start
            z = start[2] + sign * step
            while True:
                c = pick(z, prev, 0.04)
                if c is None or (sign > 0 and z > S[2] - 0.05):
                    break
                pts.append(c)
                prev = c
                z += sign * step
        pts = np.array(sorted(pts, key=lambda p: -p[2]))
        if len(pts) < 8:                           # 手臂贴着身体、跟踪不出来：保持预设站姿
            if report is not None:
                report.setdefault('arms', {})[s] = dict(n=len(pts), kept='ref')
            continue
        L1 = rig.data.bones['upperarm_' + s].length
        L2 = rig.data.bones['lowerarm_' + s].length
        el = along(S, L1, pts)
        if el is None and len(pts) > 4:
            # 线从肘以下才开始（上臂贴着身体切不开）：把最上面一段往上延长，和以肩为心、上臂长为半径的球相交
            u = pts[min(len(pts) - 1, 8)] - pts[0]
            u /= np.linalg.norm(u)
            q = pts[0] - S
            b = q @ u
            disc = b * b - (q @ q - L1 * L1)
            if disc >= 0 and b - math.sqrt(disc) >= 0:
                el = pts[0] - u * (b - math.sqrt(disc))
            else:
                # 延长线够不着球面（厚外套里手臂离身体远）：取球面上离延长线最近的点
                foot = pts[0] - u * b
                el = S + (foot - S) / max(np.linalg.norm(foot - S), 1e-6) * L1
        if el is None:
            el = chain[1]
        below = pts[pts[:, 2] < el[2]]
        wr = along(el, L2, below) if len(below) > 1 else None
        if wr is None:
            wr = el + (chain[2] - chain[1])
        below = pts[pts[:, 2] < wr[2]]
        hd = along(wr, 0.08, below) if len(below) > 1 else None
        if hd is None:
            hd = wr + (chain[3] - chain[2])
        # 拟合出来的肘、腕必须在 AI 网格里面，不然就退回预设的位置
        bad = []
        if not inside(bvh, el):
            el = chain[1]
            bad.append('elbow')
        if not inside(bvh, wr):
            wr = chain[2]
            hd = chain[3]
            bad.append('wrist')
        PS.aim(rig, 'upperarm_' + s, Vector(el - S))
        e2 = np.array(pb['lowerarm_' + s].head)
        PS.aim(rig, 'lowerarm_' + s, Vector(wr - e2))
        w2 = np.array(pb['hand_' + s].head)
        PS.aim(rig, 'hand_' + s, Vector(hd - w2))
        if report is not None:
            report.setdefault('arms', {})[s] = dict(n=len(pts), top=round(float(pts[0][2]), 3), tip=round(float(pts[-1][2]), 3),
                                                     d_elbow=round(float(np.linalg.norm(el - chain[1])), 3),
                                                     d_wrist=round(float(np.linalg.norm(w2 - chain[2])), 3), bad=bad)


# ---------------- 绑定到骨架 ----------------
def posed_copy(o):
    """复制一个物体，按骨架当前姿势把修改器应用掉（形态键先清掉），解除父子关系：带权重的“定格”网格。"""
    c = o.copy()
    c.data = o.data.copy()
    bpy.context.scene.collection.objects.link(c)
    M = o.matrix_world.copy()
    if c.data.shape_keys:
        c.shape_key_clear()
    select(c)
    for m in list(c.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            c.modifiers.remove(m)
    c.parent = None
    c.matrix_world = M
    if 'henry_char' in c:
        del c['henry_char']
    return c


def reweight_head(ob, full, rig, mask):
    """头部网格（帽子、兜帽、长发、胡子都连在头上）的权重改从完整的 MPFB 身体传：
    离头骨近的跟头，垂到脖子、肩膀、后背的兜帽 / 长发 / 披肩跟脖子和上身走。
    （从代理传时最近的往往是头发、兜帽这些挂在头上的件，整块都跟着头转，一转头就扫过肩膀穿模，头一晃整片跟着抖。）"""
    W1, n1 = weights(ob)
    tmp = ob.copy()
    tmp.data = ob.data.copy()
    bpy.context.scene.collection.objects.link(tmp)
    src = posed_copy(full)
    transfer_weights(tmp, src, rig, smooth=2)
    W2, n2 = weights(tmp)
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.objects.remove(src, do_unlink=True)
    names = sorted(set(n1) | set(n2))
    A = np.zeros((len(W1), len(names)))
    B = np.zeros_like(A)
    for j, n in enumerate(n1):
        A[:, names.index(n)] = W1[:, j]
    for j, n in enumerate(n2):
        B[:, names.index(n)] = W2[:, j]
    m = mask.astype(np.float64)[:, None]
    set_weights(ob, A * (1 - m) + B * m, names)
    hi = names.index('head') if 'head' in names else None
    return None if hi is None else round(float((B[mask, hi] > 0.9).mean()), 3)


def proxy_source(name, objs, ref=True):
    """代理（MPFB 身体 + 程序衣服 + 头发胡子）摆成设定图站姿（ref=False：用骨架当前的姿势）、应用掉修改器，合成一个带权重的物体。"""
    rig = objs['rig']
    if ref:
        P.pose_ref(rig, name)
    skip = {objs[k] for k in SKIP if k in objs}
    parts = [posed_copy(o) for o in P.char_meshes(name) if o not in skip and o.vertex_groups]
    bpy.ops.object.select_all(action='DESELECT')
    for c in parts:
        c.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    src = bpy.context.view_layer.objects.active
    src.name = src.data.name = name + '.proxy'
    select(src)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return src


def weights(ob):
    """稠密权重矩阵 (顶点数, 组数) 和组名。"""
    names = [g.name for g in ob.vertex_groups]
    W = np.zeros((len(ob.data.vertices), len(names)))
    for v in ob.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return W, names


def transfer_weights(ob, src, rig, smooth=2):
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    m = ob.modifiers.new('wt', 'DATA_TRANSFER')
    m.object = src
    m.use_object_transform = True
    m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}
    m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'
    m.layers_vgroup_select_dst = 'NAME'
    select(ob)
    bpy.ops.object.datalayout_transfer(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)
    deform = {b.name for b in rig.data.bones if b.use_deform}
    for g in list(ob.vertex_groups):
        if g.name not in deform:
            ob.vertex_groups.remove(g)
    W, names = weights(ob)
    if smooth:
        E = edges(ob)
        cnt = np.zeros(len(W))
        np.add.at(cnt, E[:, 0], 1)
        np.add.at(cnt, E[:, 1], 1)
        for _ in range(smooth):
            S = np.zeros_like(W)
            np.add.at(S, E[:, 0], W[E[:, 1]])
            np.add.at(S, E[:, 1], W[E[:, 0]])
            W = W + (S / np.maximum(cnt, 1)[:, None] - W) * 0.5 * (cnt > 0)[:, None]
    set_weights(ob, W, names)


def set_weights(ob, W, names, limit=4):
    """每个顶点只留最大的 limit 个权重、归一化，整体写回顶点组。"""
    W = np.asarray(W, dtype=np.float64).copy()
    if W.shape[1] > limit:
        thr = -np.sort(-W, 1)[:, limit - 1:limit]
        W[W < thr] = 0
    W[W < 1e-3] = 0
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    groups = [ob.vertex_groups.new(name=n) for n in names]
    for i, j in zip(*np.nonzero(W)):
        groups[j].add([int(i)], float(W[i, j]), 'REPLACE')


def skin_mats(ob, rig):
    """每个顶点的蒙皮矩阵 Σ w·(姿势矩阵 · 静止矩阵⁻¹)（按当前姿势）。"""
    W, names = weights(ob)
    R = rig.matrix_world
    Ri = R.inverted()
    Ms = np.zeros((len(names), 4, 4))
    for i, n in enumerate(names):
        pb = rig.pose.bones[n]
        Ms[i] = np.array(R @ pb.matrix @ pb.bone.matrix_local.inverted() @ Ri)
    tot = W.sum(1)
    Wn = W / np.maximum(tot, 1e-9)[:, None]
    return np.einsum('vb,bij->vij', Wn, Ms), tot > 1e-6


def unpose(ob, rig):
    """ob 是骨架摆成设定图站姿时的形状 → 反算静止姿势下的顶点（骨架回到站姿时正好还原）。返回最大误差（米）。"""
    co = mesh_co(ob)
    M, has = skin_mats(ob, rig)
    rest = co.copy()
    rest[has] = np.linalg.solve(M[has, :3, :3], (co[has] - M[has, :3, 3])[..., None])[..., 0]
    set_co(ob, rest)
    back = np.einsum('vij,vj->vi', M[:, :3, :3], rest) + M[:, :3, 3]
    err = np.linalg.norm(np.where(has[:, None], back, co) - co, axis=1).max()
    return round(float(err), 6)


def edges(ob):
    E = np.empty(len(ob.data.edges) * 2, dtype=np.int64)
    ob.data.edges.foreach_get('vertices', E)
    return E.reshape(-1, 2)


def islands(n, E):
    """按边连通给每个顶点一个块编号（同一块里最小的顶点号）。"""
    lab = np.arange(n)
    a, b = E[:, 0], E[:, 1]
    while True:
        m = np.minimum(lab[a], lab[b])
        new = lab.copy()
        np.minimum.at(new, a, m)
        np.minimum.at(new, b, m)
        new = new[new]
        if np.array_equal(new, lab):
            return lab
        lab = new


def flood(seed, mask, E):
    reg = np.zeros(len(mask), bool)
    reg[seed] = True
    while True:
        a = reg[E[:, 0]] & mask[E[:, 1]] & ~reg[E[:, 1]]
        b = reg[E[:, 1]] & mask[E[:, 0]] & ~reg[E[:, 0]]
        new = np.concatenate([E[a, 1], E[b, 0]])
        if not len(new):
            return reg
        reg[new] = True


def delete_verts(ob, dead):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(dead)[0]], context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def wrist(rig, s, posed=True):
    """手腕位置和前臂方向（肘 → 手腕）。posed：当前姿势；否则静止姿势。"""
    if posed:
        R = rig.matrix_world
        w = np.array(R @ rig.pose.bones['hand_' + s].head)
        e = np.array(R @ rig.pose.bones['lowerarm_' + s].head)
    else:
        w = np.array(rig.data.bones['hand_' + s].head_local)
        e = np.array(rig.data.bones['lowerarm_' + s].head_local)
    a = w - e
    return w, a / np.linalg.norm(a)


def make_hands(name, objs, ai, rig, filled=None, cut=0.012, band=0.05, inner=0.045, report=None):
    """AI 的手（手指粘在一起）换成 MPFB 的手：在设定图站姿下，从手腕往外切掉 AI 的手，
    把 AI 前臂末端收口到 MPFB 手腕的粗细（再大 2.5 毫米包住），手腕附近的权重跟 MPFB 手一致，颜色调成设定图上手的颜色。"""
    body = objs['body']
    # 1. MPFB 手：复制身体，只留手腕以下（再往上多留 inner 一段，藏进 AI 前臂里）
    hand = body.copy()
    hand.data = body.data.copy()
    bpy.context.scene.collection.objects.link(hand)
    hand.name = hand.data.name = name + '.hands'
    if hand.data.shape_keys:
        hand.shape_key_clear()
    hco = np.array([body.matrix_world @ v.co for v in body.data.vertices], dtype=np.float64)
    keep = np.zeros(len(hco), bool)
    for s in 'lr':
        w0, a0 = wrist(rig, s, posed=False)
        t = (hco - w0) @ a0
        keep |= (hco[:, 0] * (1 if s == 'l' else -1) > 0.1) & (np.linalg.norm(hco - w0, axis=1) < 0.35) & (t > -inner)
    delete_verts(hand, ~keep)
    # 2. 当前（设定图站姿）下 MPFB 手的表面，用来量手腕粗细
    dg = bpy.context.evaluated_depsgraph_get()
    ev = hand.evaluated_get(dg)
    tm = ev.to_mesh()
    HV = [hand.matrix_world @ v.co for v in tm.vertices]
    HP = [list(p.vertices) for p in tm.polygons]
    ev.to_mesh_clear()
    bvh = BVHTree.FromPolygons(HV, HP)
    HVn = np.array([v[:] for v in HV])
    # 3. 切掉 AI 的手、前臂末端收口
    co = mesh_co(ai)
    E = edges(ai)
    dead = np.zeros(len(co), bool)
    taper = []
    for s in 'lr':
        w, a = wrist(rig, s)
        d = co - w
        t = d @ a
        radial = d - t[:, None] * a
        rad = np.linalg.norm(radial, axis=1)
        cand = (t > cut) & (t < 0.3) & (rad < 0.09)
        palm = w + a * 0.07
        ci = np.nonzero(cand)[0]
        if not len(ci):
            continue
        seed = ci[np.argmin(np.linalg.norm(co[ci] - palm, axis=1))]
        reg = flood(seed, cand, E)
        dead |= reg
        # 收口：和切口相连的前臂一段。切口一圈先推到同一个平面上（删顶点留下的边是锯齿状的）
        ring = np.zeros(len(co), bool)
        ring[E[reg[E[:, 0]] & ~reg[E[:, 1]], 1]] = True
        ring[E[reg[E[:, 1]] & ~reg[E[:, 0]], 0]] = True
        ring &= ~reg
        co[ring] += np.outer(cut - t[ring], a)
        d = co - w
        t = d @ a
        radial = d - t[:, None] * a
        rad = np.linalg.norm(radial, axis=1)
        bandm = (t > cut - band) & (t <= cut + 0.002) & (rad < 0.1) & ~reg
        seedr = np.nonzero(ring & bandm)[0]
        mrad = []
        if len(seedr):
            arm = np.zeros(len(co), bool)
            for sd in seedr:
                if not arm[sd]:
                    arm |= flood(sd, bandm, E)
            for i in np.nonzero(arm)[0]:
                if rad[i] < 1e-5:
                    continue
                u = radial[i] / rad[i]
                o = w + a * t[i]
                hit = bvh.ray_cast(Vector(o), Vector(u), 0.15)
                if hit[0] is None:
                    continue
                rm = hit[3] + 0.0025
                f = float(smoothstep((t[i] - (cut - band)) / band))
                co[i] = o + u * (rad[i] + (rm - rad[i]) * f)
                taper.append((int(i), f))
                mrad.append(rm)
        if report is not None:
            report.setdefault('hands', {})[s] = dict(cut=int(reg.sum()), taper=len(mrad), wrist_r=round(float(np.median(mrad)), 4) if mrad else None)
    set_co(ai, co)
    # 4. 收口那一段的权重向 MPFB 手腕靠拢（两边一起弯，接缝不裂）
    if taper:
        from mathutils.kdtree import KDTree
        kd = KDTree(len(HVn))
        for i, p in enumerate(HVn):
            kd.insert(Vector(p), i)
        kd.balance()
        Wh, nh = weights(hand)
        na = [g.name for g in ai.vertex_groups]
        for n in nh:
            if n not in na and n in rig.data.bones and rig.data.bones[n].use_deform:
                ai.vertex_groups.new(name=n)
        Wa, na = weights(ai)
        col = {n: j for j, n in enumerate(na)}
        for i, f in taper:
            _, j, _ = kd.find(Vector(co[i]))
            wv = Wa[i] * (1 - f)
            for k, n in enumerate(nh):
                if n in col and Wh[j, k] > 0:
                    wv[col[n]] += Wh[j, k] * f
            Wa[i] = wv
        set_weights(ai, Wa, na)
    # 5. 手的颜色：设定图上手的颜色（切掉之前 AI 手上的投影色）
    if filled is not None:
        tint_hands(name, hand, uv_color(ai, filled, np.nonzero(dead)[0]), report)
    # 切完剩下的碎片（手指之间没连上的小块）也删掉
    left = ~dead
    lab = islands(len(co), E[left[E[:, 0]] & left[E[:, 1]]])
    sizes = np.bincount(lab[left], minlength=len(co))
    small = left & (sizes[lab] < 300)
    for s in 'lr':
        w, _ = wrist(rig, s)
        dead |= small & (np.linalg.norm(co - w, axis=1) < 0.3)
    if report is not None:
        report['hand_bits'] = int((small & dead).sum())
    delete_verts(ai, dead)
    # 6. MPFB 手插进前臂的那一段往里缩，免得从 AI 前臂里穿出来
    hc = mesh_co(hand)
    for s in 'lr':
        w0, a0 = wrist(rig, s, posed=False)
        d = hc - w0
        t = d @ a0
        mine = hc[:, 0] * (1 if s == 'l' else -1) > 0.1
        k = 1 - 0.3 * np.clip((cut - t) / 0.03, 0, 1)
        radial = d - t[:, None] * a0
        nw = w0 + a0 * t[:, None] + radial * k[:, None]
        hc[mine] = nw[mine]
    set_co(hand, hc)
    hand['henry_char'] = name
    return hand


def tint_hands(name, hand, target, report=None):
    """把 MPFB 皮肤贴图调成设定图上手的颜色（中位数对齐），给手单独一个材质。"""
    if target is None:
        return
    mat = hand.data.materials[0]
    tex = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    src = tex.image
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    me = hand.data
    uv = me.uv_layers.active.data
    cs = [px[min(h - 1, int(uv[lp.index].uv[1] * h)), min(w - 1, int(uv[lp.index].uv[0] * w)), :3] for lp in me.loops]
    cur = np.median(np.array(cs), 0)
    k = np.clip(np.asarray(target[:3]) / np.maximum(cur, 1e-3), 0.4, 2.5)
    out = px.copy()
    out[..., :3] = np.clip(px[..., :3] * k, 0, 1)
    img = bpy.data.images.new(name + '_hands', w, h, alpha=True)
    img.pixels.foreach_set(out.ravel())
    img.filepath_raw = os.path.join(P.TEX, name + '_hands.png')
    img.file_format = 'PNG'
    img.save()
    m2 = mat.copy()
    m2.name = name + '.skin_hands'
    for n in m2.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image == src:
            n.image = img
    me.materials.clear()
    me.materials.append(m2)
    if report is not None:
        report['hand_tint'] = np.round(k, 3).tolist()


def build_one(name, x=0.0, report=None, size=2048):
    """完整造一个 AI 人物：MPFB 骨架 + 代理（只用来对齐和传权重）→ AI 网格 → 投影上色 → 绑定 → 换手 → 动作。
    返回 (objs, {}, anim)，和 chars_outfits.build_one 一样。"""
    import chars_build as CB
    import chars_outfits as O
    rep = report if report is not None else {}
    objs = CB.build(name, x)
    rig = objs['rig']
    st = dict(A.STYLE[name])
    z_sit = A.seat_height(rig, objs['body'], A.measure(rig), st) + 0.008
    A.reset(rig)
    # 穿衣服前留一份完整的身体（衣服会删掉被盖住的身体面）：头部网格的权重从它传
    full = objs['body'].copy()
    full.data = objs['body'].data.copy()
    bpy.context.scene.collection.objects.link(full)
    full.name = full.data.name = name + '.fullbody'
    if 'henry_char' in full:
        del full['henry_char']
    info = C.body_info(objs['body'], rig)
    mats = CB.materials()
    clothes = O.OUTFITS[name](objs, info, mats)
    for ob in clothes.values():
        C.add_armature(ob, rig)
        ob['henry_char'] = name
    P.fit_silhouette(name, objs)
    src = proxy_source(name, objs)
    S = mesh_co(src)
    zt = float(S[:, 2].max())
    ai = load_ai(name)
    rep['front'] = orient(ai)
    rep['scale'] = place(ai, zt, leg_center(S, zt))
    rep['faces'] = decimate(ai)
    # 头换成头部特写单独生成的网格（五官、头发、胡子更细），合成一个物体；记下哪些顶点是头部的
    head = None
    res = attach_head(name, ai, zt, rep)
    if res:
        hd, z_lo, z_mouth = res
        hd.vertex_groups.new(name='headpart').add(list(range(len(hd.data.vertices))), 1.0, 'REPLACE')
        bpy.ops.object.select_all(action='DESELECT')
        hd.select_set(True)
        ai.select_set(True)
        bpy.context.view_layer.objects.active = ai
        bpy.ops.object.join()
        W, names = weights(ai)
        head = dict(mask=W[:, names.index('headpart')] > 0.5, z_lo=z_lo, z_mouth=z_mouth)
        ai.vertex_groups.remove(ai.vertex_groups['headpart'])
        sculpt_face(name, ai, head, report=rep)
    filled = paint(name, ai, size, rep, head=head)
    # 骨架的手臂对准 AI 网格的手臂，代理也按这个姿势重做一遍再传权重
    P.pose_ref(rig, name)
    fit_arms(ai, rig, rep)
    bpy.data.objects.remove(src, do_unlink=True)
    src = proxy_source(name, objs, ref=False)
    transfer_weights(ai, src, rig)
    if head is not None:
        rep['head_bone_share'] = reweight_head(ai, full, rig, head['mask'])
    bpy.data.objects.remove(full, do_unlink=True)
    hands = make_hands(name, objs, ai, rig, filled, report=rep)
    rep['unpose_err'] = unpose(ai, rig)
    C.add_armature(ai, rig)
    ai['henry_char'] = name
    A.reset(rig)
    # 喝酒时杯子举到的位置：按 AI 头部真实的脸（嘴那个高度最前面的嘴唇 / 胡子）往前 4 厘米，杯子不会插进胡子里
    mouth = None
    if head is not None:
        co = mesh_co(ai)
        col = co[(np.abs(co[:, 0]) < 0.02) & (np.abs(co[:, 2] - head['z_mouth']) < 0.012)]
        if len(col):
            mouth = Vector((0.0, float(col[:, 1].min()) - 0.04, head['z_mouth']))
            rep['mouth'] = [round(v, 3) for v in mouth]
    anim = A.make_all(name, rig, objs, z_sit=z_sit, mouth=mouth)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.get('henry_char') == name and o not in (ai, hands):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.objects.remove(src, do_unlink=True)
    return {'rig': rig, 'ai': ai, 'hands': hands}, {}, anim
