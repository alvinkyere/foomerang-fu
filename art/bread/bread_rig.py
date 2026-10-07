"""Foomerang Fu — BREAD vertical art test (Blender 5.x). Original character; built entirely from code.

Run inside Blender (e.g. exec(open(path).read()) through Blender MCP). 1 Blender unit = 100 game units.
Scene structure (empties are the rig; all animation is keyframes on them, so it exports cleanly):
  BREAD_ROOT (place, yaw)  -> BREAD_LEAN (lean/roll) -> BREAD_SQUASH (squash & stretch about the feet) -> body, face, ARM_L/R
                                                      -> LEG_L/R pivots (do not squash)
  CAM_GAMEPLAY (orthographic, 40 degrees below horizontal = the game's camera pitch), SUN_KEY, AREA_RIM, world fill, SHADOW_FLOOR.
"""
import math, bpy, bmesh
from mathutils import Vector, Euler

FPS = 30
STATES = {  # name: (first frame, frame count)
    'idle': (1, 48), 'run': (101, 16), 'turn': (201, 14), 'dash': (301, 16),
    'slash': (401, 20), 'throw': (501, 22), 'death': (601, 40), 'victory': (701, 40),
}

def clean():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.actions):
        for x in list(c): c.remove(x)

# ---------- materials ----------
def mat(name, color, rough=0.6, sss=0.25, sheen=0.5, coat=0.0, bump=0.0, spec=0.35):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    r, g, bl = [((color >> s) & 255) / 255 for s in (16, 8, 0)]
    lin = lambda c: c ** 2.2
    b.inputs['Base Color'].default_value = (lin(r), lin(g), lin(bl), 1)
    b.inputs['Roughness'].default_value = rough
    for k, v in (('Subsurface Weight', sss), ('Sheen Weight', sheen), ('Sheen Roughness', 0.5), ('Coat Weight', coat),
                 ('Coat Roughness', 0.15), ('Specular IOR Level', spec)):
        if k in b.inputs: b.inputs[k].default_value = v
    if 'Subsurface Radius' in b.inputs: b.inputs['Subsurface Radius'].default_value = (0.5, 0.25, 0.12)
    b.inputs['Subsurface Scale'].default_value = 0.05
    if bump:
        n = m.node_tree.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 90; n.inputs['Detail'].default_value = 6
        bp = m.node_tree.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.004
        m.node_tree.links.new(n.outputs['Fac'], bp.inputs['Height']); m.node_tree.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

def catmull(pts, n=10):
    out = []
    for i in range(len(pts)):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % len(pts)], pts[(i + 2) % len(pts)]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                     + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    return out

# slice silhouette (x, z): flat base, straight sides, a mushroom top of two lobes with a dip
SLICE = [(-0.27, 0.04), (-0.18, 0.0), (0.18, 0.0), (0.27, 0.04), (0.285, 0.24), (0.30, 0.42), (0.35, 0.53), (0.30, 0.63),
         (0.17, 0.655), (0.06, 0.60), (0.0, 0.585), (-0.06, 0.60), (-0.17, 0.655), (-0.30, 0.63), (-0.35, 0.53), (-0.30, 0.42), (-0.285, 0.24)]

def slab(name, outline, y0, y1, material, bevel=0.03, subsurf=2):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    ring = [bm.verts.new((x, y0, z)) for x, z in outline]
    f = bm.faces.new(ring)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    vs = [v for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    for v in vs: v.co.y = y1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 5; bv.limit_method = 'ANGLE'
    ss = o.modifiers.new('soft', 'SUBSURF'); ss.levels = 2; ss.render_levels = subsurf
    for p in me.polygons: p.use_smooth = True
    return o

def ball(name, loc, scale, material, parent, seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale; o.parent = parent
    o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = True
    return o

def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.05
    bpy.context.collection.objects.link(e); e.parent = parent; e.location = loc
    return e

def build():
    clean()
    sc = bpy.context.scene
    crust = mat('BreadCrust', 0xC4813B, rough=0.62, sss=0.2, sheen=0.5, bump=0.05)
    crumb = mat('BreadCrumb', 0xF7DDA2, rough=0.7, sss=0.45, sheen=0.7, bump=0.03)
    limb = mat('BreadLimb', 0xB9793A, rough=0.55, sss=0.2, sheen=0.4)
    eye = mat('EyeGloss', 0x020204, rough=0.22, sss=0, sheen=0, coat=0.35, spec=0.25)
    white = mat('EyeSpec', 0xFFFFFF, rough=0.2, sss=0, sheen=0)
    white.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1)
    white.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0
    blush = mat('Blush', 0xF08C8C, rough=0.9, sss=0, sheen=0)
    mouthm = mat('Mouth', 0x4A2210, rough=0.5, sss=0, sheen=0)
    R = {}
    R['root'] = empty('BREAD_ROOT'); R['lean'] = empty('BREAD_LEAN', R['root']); R['squash'] = empty('BREAD_SQUASH', R['lean'])
    inner = [(x * 0.86, 0.01 + (z - 0.01) * 0.86 + 0.0) for x, z in SLICE]
    body = slab('BODY_CRUST', SLICE, -0.15, 0.15, crust, bevel=0.045); body.parent = R['squash']
    panel = slab('BODY_CRUMB', [(x * 0.84, 0.045 + z * 0.84) for x, z in SLICE], -0.175, -0.07, crumb, bevel=0.03); panel.parent = R['squash']
    # face (faces -Y, toward the camera)
    for s, side in ((-1, 'L'), (1, 'R')):
        R['eye' + side] = ball('EYE_' + side, (s * 0.115, -0.205, 0.33), (0.052, 0.034, 0.064), eye, R['squash'])
        ball('EYE_SPEC1_' + side, (s * 0.115 + 0.016, -0.236, 0.35), (0.016, 0.01, 0.018), white, R['squash'], 16)
        ball('EYE_SPEC2_' + side, (s * 0.115 - 0.014, -0.236, 0.31), (0.008, 0.006, 0.009), white, R['squash'], 12)
        ball('BLUSH_' + side, (s * 0.205, -0.19, 0.255), (0.05, 0.012, 0.03), blush, R['squash'], 16)
    cv = bpy.data.curves.new('mouthc', 'CURVE'); cv.dimensions = '3D'; sp = cv.splines.new('BEZIER'); sp.bezier_points.add(2)
    for p, (x, z) in zip(sp.bezier_points, ((-0.05, 0.255), (0.0, 0.215), (0.05, 0.255))):
        p.co = (x, -0.195, z); p.handle_left_type = p.handle_right_type = 'AUTO'
    cv.bevel_depth = 0.0075; cv.bevel_resolution = 4
    mo = bpy.data.objects.new('MOUTH', cv); bpy.context.collection.objects.link(mo); mo.parent = R['squash']; cv.materials.append(mouthm)
    R['mouth'] = mo
    # limbs on pivots: stubby capsules in the crust tone
    for s, side in ((-1, 'L'), (1, 'R')):
        pv = empty('ARM_' + side, R['squash'], (s * 0.305, -0.01, 0.29)); R['arm' + side] = pv
        ball('ARM_MESH_' + side, (s * 0.035, 0, -0.06), (0.062, 0.066, 0.105), limb, pv)
        lp = empty('LEG_' + side, R['lean'], (s * 0.13, -0.06, 0.08)); R['leg' + side] = lp
        ball('LEG_MESH_' + side, (0, -0.02, -0.035), (0.10, 0.125, 0.075), limb, lp)
    # light + camera
    sc.world = bpy.data.worlds.new('W') if sc.world is None else sc.world
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.62, 0.66, 0.82, 1); bg.inputs['Strength'].default_value = 0.75
    sun = bpy.data.lights.new('SUN_KEY', 'SUN'); sun.energy = 3.0; sun.angle = math.radians(24); sun.color = (1.0, 0.95, 0.84)
    so = bpy.data.objects.new('SUN_KEY', sun); bpy.context.collection.objects.link(so)
    so.rotation_euler = (Vector((0.55, -0.5, -1.5))).to_track_quat('-Z', 'Y').to_euler()   # from upper left: shadow to lower right
    rim = bpy.data.lights.new('AREA_RIM', 'AREA'); rim.energy = 40; rim.size = 1.2; rim.color = (0.7, 0.72, 1.0)
    ro = bpy.data.objects.new('AREA_RIM', rim); bpy.context.collection.objects.link(ro); ro.location = (0.9, 1.6, 1.0)
    ro.rotation_euler = (Vector((-0.9, -1.6, -0.9))).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('CAM_GAMEPLAY'); cam.type = 'ORTHO'; cam.ortho_scale = 1.75
    co = bpy.data.objects.new('CAM_GAMEPLAY', cam); bpy.context.collection.objects.link(co)
    pit = math.radians(40); tgt = Vector((0, 0, 0.28))
    co.location = tgt + Vector((0, -math.cos(pit), math.sin(pit))) * 8; co.rotation_euler = (math.pi / 2 - pit, 0, 0)
    sc.camera = co
    bpy.ops.mesh.primitive_plane_add(size=8); fl = bpy.context.active_object; fl.name = 'SHADOW_FLOOR'; fl.is_shadow_catcher = True
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    sc.render.film_transparent = True; sc.render.resolution_x = 512; sc.render.resolution_y = 512
    sc.view_settings.view_transform = 'Standard'; sc.render.fps = FPS
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    return R

def get_rig():
    g = bpy.data.objects.get
    return dict(root=g('BREAD_ROOT'), lean=g('BREAD_LEAN'), squash=g('BREAD_SQUASH'), armL=g('ARM_L'), armR=g('ARM_R'),
                legL=g('LEG_L'), legR=g('LEG_R'), eyeL=g('EYE_L'), eyeR=g('EYE_R'), mouth=g('MOUTH'))

def ease(t): return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def seg(t, keys):
    """piecewise-smooth interpolation over [(t, value), ...]"""
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1: return lerp(v0, v1, ease(max(0, min(1, (t - t0) / (t1 - t0)))))
    return keys[-1][1]

def P(**k):
    base = dict(x=0, y=0, z=0, yaw=0, pitch=0, roll=0, sx=1, sy=1, sz=1, aL=(0, 0, 0), aR=(0, 0, 0), lL=(0, 0), lR=(0, 0), eyes=1.0, mouth=1.0)
    base.update(k); return base

def pose(state, t):
    """t in [0, 1) across the state's frames. Returns the control values."""
    s = math.sin; c = math.cos; tau = 2 * math.pi
    if state == 'idle':
        b = s(t * tau)
        blink = 0.12 if 0.62 < t < 0.68 else 1.0
        return P(sz=1 + 0.028 * b, sx=1 - 0.014 * b, sy=1 - 0.014 * b, roll=0.025 * s(t * tau + 1), yaw=0.12 * s(t * tau * 0.5),
                 aL=(0.0, 0, 0.1 + 0.05 * b), aR=(0.0, 0, -0.1 - 0.05 * b), eyes=blink)
    if state == 'run':
        p = t * tau
        down = abs(s(p))                              # two footfalls per cycle
        return P(yaw=0.66, pitch=0.2, roll=-0.07 * s(p), z=0.035 * down, sz=1 - 0.05 * (1 - down) + 0.02 * down, sx=1 + 0.03 * (1 - down),
                 aL=(0.95 * c(p), 0, 0.25), aR=(-0.95 * c(p), 0, -0.25), lL=(0.9 * s(p), max(0, c(p)) * 0.05), lR=(-0.9 * s(p), max(0, -c(p)) * 0.05))
    if state == 'turn':
        yaw = seg(t, [(0, 0.66), (0.18, 0.66), (0.35, 0.42), (0.55, -0.1), (1, -0.66)]) if True else 0
        spin = s(min(1, t / 0.9) * math.pi)
        return P(yaw=yaw, pitch=0.1 + 0.08 * spin, roll=0.18 * spin, sx=1 - 0.12 * spin, sz=1 + 0.06 * spin, z=0.03 * spin,
                 aL=(0.3 * spin, 0, 0.5 * spin), aR=(0.3 * spin, 0, -0.5 * spin), lL=(0.4 * spin, 0), lR=(-0.4 * spin, 0))
    if state == 'dash':
        a = seg(t, [(0, 0), (0.2, 1), (0.55, 0), (1, 0)])            # anticipation squash
        d = seg(t, [(0.15, 0), (0.3, 1), (0.75, 1), (1, 0)])          # the lunge
        return P(yaw=0.7, pitch=0.2 + 0.5 * d, x=0.0, z=0.02 * d - 0.01 * a, sz=1 - 0.22 * a + 0.0 * d - 0.1 * d, sy=1 + 0.28 * d + 0.1 * a,
                 sx=1 + 0.12 * a - 0.1 * d, aL=(0.9 * d, 0, 0.9 * d), aR=(0.9 * d, 0, -0.9 * d), lL=(-0.9 * d, 0), lR=(-0.7 * d, 0), eyes=1 - 0.5 * d)
    if state == 'slash':
        w = seg(t, [(0, 0), (0.28, 1), (0.4, 1)]); sw = seg(t, [(0.38, 0), (0.58, 1), (1, 1)]); rec = seg(t, [(0.72, 0), (1, 1)])
        raise_ = seg(t, [(0, 0), (0.22, 1), (0.8, 1), (1, 0)])
        sweep = 1.35 * w - 2.7 * sw + 1.35 * rec           # right -> across the front -> left, then home
        return P(yaw=0.4 - 0.55 * w + 1.25 * sw - 0.7 * rec, pitch=0.1 - 0.1 * w + 0.4 * sw * (1 - rec), roll=0.12 * w - 0.14 * sw * (1 - rec),
                 z=0.03 * sw * (1 - rec), sz=1 - 0.1 * w + 0.07 * sw * (1 - rec), sx=1 + 0.06 * w, sy=1 + 0.12 * sw * (1 - rec),
                 aR=(-1.45 * raise_, 0, sweep), aL=(0.3 * w, 0, 0.7 + 0.4 * sw * (1 - rec)),
                 lL=(0.3 * sw, 0), lR=(-0.6 * sw * (1 - rec), 0), mouth=1.0 + 0.6 * sw * (1 - rec))
    if state == 'throw':
        w = seg(t, [(0, 0), (0.35, 1), (0.45, 1)]); r = seg(t, [(0.45, 0), (0.6, 1), (1, 1)]); rec = seg(t, [(0.75, 0), (1, 1)])
        hop = s(max(0, min(1, (t - 0.45) / 0.4)) * math.pi)
        return P(yaw=0.3 - 0.4 * w + 0.7 * r * (1 - rec), pitch=-0.1 * w + 0.25 * r * (1 - rec), z=0.08 * hop, sz=1 - 0.1 * w + 0.12 * hop - 0.05 * rec * 0,
                 sx=1 + 0.05 * w - 0.05 * hop, aR=(-2.6 * w + 4.6 * r * (1 - 0.35 * rec) - 0.4 * rec * 0, 0, -0.6 - 0.5 * r * (1 - rec)),
                 aL=(0.5 * w - 0.9 * r, 0, 0.5), lL=(-0.3 * r, 0), lR=(0.4 * w - 0.3 * r, 0))
    if state == 'death':
        hit = seg(t, [(0, 0), (0.08, 1), (0.2, 0.3)]); fly = seg(t, [(0.08, 0), (0.4, 1)]); flat = seg(t, [(0.35, 0), (0.55, 1), (0.62, 0.82), (0.72, 1)])
        up = s(min(1, max(0, (t - 0.08) / 0.32)) * math.pi)
        return P(yaw=0.2 + 0.5 * s(fly * math.pi), y=0.0 - 0.0 * fly + 0.2 * fly, z=0.13 * up, pitch=0.35 * hit - 1.4 * flat, roll=0.4 * up * (1 - flat),
                 sz=1 - 0.28 * hit + 0.05 * flat, sx=1 + 0.2 * hit + 0.05 * flat, sy=1 - 0.1 * flat,
                 aL=(0, 0, 1.4 * (1 - flat) + 0.5 * flat), aR=(0, 0, -1.4 * (1 - flat) - 0.5 * flat), lL=(0.9 * fly * (1 - flat), 0), lR=(-0.8 * fly * (1 - flat), 0),
                 eyes=0.18 if t > 0.06 else 1, mouth=-1.0 if t > 0.06 else 1)
    if state == 'victory':
        hop = abs(s(t * math.pi * 2 * 1.0 + 0.0)) ** 0.8 if t < 0.9 else 0
        ph = (t * 2) % 1
        air = s(ph * math.pi) ** 0.85
        land = seg(ph, [(0, 1), (0.14, 0), (0.86, 0), (1, 1)])
        return P(yaw=-0.1 + 0.25 * s(t * tau * 2), z=0.2 * air, sz=1 + 0.12 * air - 0.16 * land, sx=1 - 0.06 * air + 0.1 * land, sy=1 - 0.06 * air + 0.1 * land, roll=0.1 * s(t * tau * 2),
                 aL=(0.0, 0, 2.5 + 0.2 * air), aR=(0.0, 0, -2.5 - 0.2 * air), lL=(0.5 * air, 0), lR=(-0.5 * air, 0), mouth=1.7)
    raise KeyError(state)

def apply(p, frame=None):
    R = get_rig()
    R['root'].location = (p['x'], p['y'], p['z']); R['root'].rotation_euler = (0, 0, p['yaw'])
    R['lean'].rotation_euler = (p['pitch'], p['roll'], 0)
    R['squash'].scale = (p['sx'], p['sy'], p['sz'])
    for side in 'LR':
        R['arm' + side].rotation_euler = p['a' + side]
        R['leg' + side].rotation_euler = (p['l' + side][0], 0, 0); R['leg' + side].location.z = 0.07 + p['l' + side][1]
    for e in ('eyeL', 'eyeR'): R[e].scale = (0.052, 0.034, 0.064 * p['eyes'])
    R['mouth'].scale = (1, 1, p['mouth']); R['mouth'].location = (0, 0, 0.235 * (1 - p['mouth']))
    if frame is not None:
        for o, paths in ((R['root'], ('location', 'rotation_euler')), (R['lean'], ('rotation_euler',)), (R['squash'], ('scale',)),
                         (R['armL'], ('rotation_euler',)), (R['armR'], ('rotation_euler',)), (R['legL'], ('rotation_euler', 'location')),
                         (R['legR'], ('rotation_euler', 'location')), (R['eyeL'], ('scale',)), (R['eyeR'], ('scale',)), (R['mouth'], ('scale', 'location'))):
            for pth in paths: o.keyframe_insert(pth, frame=frame)

def bake():
    """Keyframes every state into one timeline (blocks at STATES' first frames), 30 fps."""
    for name, (f0, n) in STATES.items():
        for i in range(n):
            apply(pose(name, i / n if name not in ('death', 'victory', 'turn', 'dash', 'slash', 'throw') else i / (n - 1)), f0 + i)
    bpy.context.scene.frame_start = 1; bpy.context.scene.frame_end = 740

def render(state, i, path, n_per=None):
    f0, n = STATES[state]
    bpy.context.scene.frame_set(f0 + i)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
