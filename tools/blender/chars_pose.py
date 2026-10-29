# 人物姿势工具：让骨骼指向某个方向、绕自身转、局部弯曲、两节 IK、读取当前姿势下的网格坐标
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


def evaluated_coords(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get('co', co)
    ev.to_mesh_clear()
    return co.reshape(-1, 3)
