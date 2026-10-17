"""The 3D stage for environ2: its solved camera (../camera.json) in Blender, and the conversions every model builder shares.
World (as the solver): X right, Y away from the viewer, Z up, in plan units; Blender units = 100 x plan units (BU), so the camera
stands 110 BU above the ground. The game world maps to the plan through ../step4_arena.json's camera (world block).
Import from a builder run headless:  Blender -b --python <builder.py> -- <args>"""
import json, math, os
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ENV2 = os.path.dirname(HERE)
CAM = json.load(open(os.path.join(ENV2, 'camera.json')))
ARENA = json.load(open(os.path.join(ENV2, 'step4_arena.json')))
BU = 100.0                                   # Blender units per plan unit
W, H = 1280, 720
F = CAM['f_1280']
PP = CAM['principal_1280']


def plan_to_bu(X, Y, Z=0.0):
    return Vector((X * BU, Y * BU, Z * BU))


def world_to_bu(xw, yw, zw=0.0):
    """Game world units -> Blender units (through the arena's plan mapping)."""
    w = ARENA['camera']['world']
    u = w['unitsPerPlanUnit']
    return plan_to_bu(xw / u + w['planOriginX'], w['planOriginY'] - yw / u, zw / u)


def setup(engine='BLENDER_EEVEE_NEXT', samples=64):
    sc = bpy.context.scene
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    try:
        sc.render.engine = engine
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    cd = bpy.data.cameras.new('CAM')
    cd.sensor_fit = 'HORIZONTAL'
    cd.sensor_width = 36.0
    cd.lens = F / W * 36.0
    cd.shift_x = -(PP[0] - W / 2) / W
    cd.shift_y = (PP[1] - H / 2) / W
    cd.clip_start, cd.clip_end = 1, 5000
    co = bpy.data.objects.new('CAM', cd)
    sc.collection.objects.link(co)
    sc.camera = co
    th = math.radians(CAM['pitch_deg'])
    c, s = math.cos(th), math.sin(th)
    R = Matrix(((1, 0, 0), (0, -s, -c), (0, c, -s)))          # yaw 0, roll 0
    Rbl = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ R
    m = Rbl.transposed().to_4x4()
    m.translation = Vector(CAM['C']) * BU
    co.matrix_world = m
    return sc, co


def ray_to_z(px, py, z_bu=0.0):
    """The point at height z (BU) seen at image pixel (px, py) (1280 x 720)."""
    co = bpy.context.scene.camera
    m = co.matrix_world
    d = (m.to_3x3() @ Vector(((px - PP[0]) / F, -(py - PP[1]) / F, -1.0))).normalized()
    o = m.translation
    return o + d * ((z_bu - o.z) / d.z)


def project(p_bu):
    """Blender point -> image pixel (1280 x 720)."""
    co = bpy.context.scene.camera
    q = co.matrix_world.inverted() @ Vector(p_bu)
    return (PP[0] + F * q.x / -q.z, PP[1] - F * q.y / -q.z)
