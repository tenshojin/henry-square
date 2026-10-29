# 人物姿势工具：骨骼朝向、两节 IK、坐姿；把姿势烘进网格并设为新的静止姿势（保留形态键）
import bpy
import numpy as np
from mathutils import Vector, Matrix


def upd():
    bpy.context.view_layer.update()


def aim(rig, bname, direction, keep_axis='x'):
    """让骨骼的 Y 轴（头→尾）指向 direction（骨架空间），尽量保持原来的 X 轴（弯曲轴）。"""
    pb = rig.pose.bones[bname]
    M = pb.matrix.copy()
    head = M.translation.copy()
    y = Vector(direction).normalized()
    xc = M.col[0].xyz.normalized()
    x = (xc - y * xc.dot(y))
    if x.length < 1e-4:
        x = M.col[2].xyz.cross(y)
    x.normalize()
    z = x.cross(y).normalized()
    R = Matrix((x, y, z)).transposed().to_4x4()
    R.translation = head
    pb.matrix = R
    upd()


def twist(rig, bname, angle):
    """绕骨骼自身 Y 轴转一下（手掌朝下/朝内用）。"""
    pb = rig.pose.bones[bname]
    M = pb.matrix.copy()
    head = M.translation.copy()
    R = Matrix.Rotation(angle, 4, M.col[1].xyz.normalized()) @ M
    R.translation = head
    pb.matrix = R
    upd()


def bend(rig, bname, angle, axis='X'):
    """在骨骼局部轴上叠加旋转（手指弯曲用）。"""
    pb = rig.pose.bones[bname]
    pb.rotation_mode = 'QUATERNION'
    q = pb.rotation_quaternion.copy()
    ax = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis]
    from mathutils import Quaternion
    pb.rotation_quaternion = q @ Quaternion(ax, angle)
    upd()


def ik_arm(rig, side, target, pole):
    """用 Blender 的 IK 约束解两节手臂，再把结果写回 FK（相当于“应用视觉变换”）。target/pole 是骨架空间坐标。"""
    up, lo = 'upperarm_' + side, 'lowerarm_' + side
    t = bpy.data.objects.new('ik_t', None)
    p = bpy.data.objects.new('ik_p', None)
    for e in (t, p):
        bpy.context.scene.collection.objects.link(e)
    t.location = rig.matrix_world @ Vector(target)
    p.location = rig.matrix_world @ Vector(pole)
    c = rig.pose.bones[lo].constraints.new('IK')
    c.target = t
    c.pole_target = p
    c.pole_angle = -1.5708
    c.chain_count = 2
    upd()
    mu = rig.pose.bones[up].matrix.copy()
    ml = rig.pose.bones[lo].matrix.copy()
    rig.pose.bones[lo].constraints.remove(c)
    bpy.data.objects.remove(t, do_unlink=True)
    bpy.data.objects.remove(p, do_unlink=True)
    rig.pose.bones[up].matrix = mu
    upd()
    rig.pose.bones[lo].matrix = ml
    upd()


def bone_head(rig, bname):
    return rig.matrix_world @ rig.pose.bones[bname].head


def bone_tail(rig, bname):
    return rig.matrix_world @ rig.pose.bones[bname].tail


def evaluated_coords(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    ev.to_mesh_clear()
    return co.reshape(-1, 3)


def bake_pose_into_mesh(obj):
    """把骨骼姿势（和其它修改器）烘进网格；形态键逐个求值，保证表情在新姿势下依然正确。"""
    me = obj.data
    keys = me.shape_keys.key_blocks if me.shape_keys else None
    had_keys = bool(keys) and len(keys) > 0
    if had_keys:
        saved = {k.name: k.value for k in keys}
        for k in keys:
            k.value = 0.0
        upd()
        base = evaluated_coords(obj)
        per_key = {}
        for k in keys[1:]:
            k.value = 1.0
            upd()
            per_key[k.name] = evaluated_coords(obj)
            k.value = 0.0
        names = [k.name for k in keys]
        obj.shape_key_clear()
    else:
        base = evaluated_coords(obj)
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    if len(base) != len(me.vertices):
        raise RuntimeError('vertex count changed while baking ' + obj.name)
    me.vertices.foreach_set('co', base.ravel())
    me.update()
    if had_keys:
        obj.shape_key_add(name=names[0], from_mix=False)
        for n in names[1:]:
            sk = obj.shape_key_add(name=n, from_mix=False)
            sk.data.foreach_set('co', per_key[n].ravel())
            sk.value = 0.0
        me.update()


def apply_rest(rig, meshes):
    """所有网格烘进当前姿势，然后把当前姿势设为骨架的静止姿势，再重新挂上骨架修改器。"""
    for o in meshes:
        bake_pose_into_mesh(o)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes:
        m = o.modifiers.new('Armature', 'ARMATURE')
        m.object = rig
    upd()
