"""Foomerang Fu — BREAD vertical art test (Blender 5.x). Original character; built entirely from code.

Run inside Blender (e.g. exec(open(path).read()) through Blender MCP). 1 Blender unit = 100 game units.
Scene structure (empties are the rig; all animation is keyframes on them, so it exports cleanly):
  BREAD_ROOT (place, yaw)  -> BREAD_LEAN (lean/roll) -> BREAD_SQUASH (squash & stretch about the feet) -> body, face, ARM_L/R
                                                      -> LEG_L/R pivots (do not squash)
  CAM_GAMEPLAY (PERSPECTIVE pinhole fitted to the Garden camera: pitch 40 deg, focal 7106 px @1999 px, ~104 px/unit at the target), SUN_KEY, AREA_RIM, world fill, SHADOW_FLOOR.
"""
import math, bpy, bmesh
from mathutils import Vector, Euler, Matrix

FPS = 30

def clean():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights, bpy.data.cameras, bpy.data.actions):
        for x in list(c): c.remove(x)

# ---------- materials ----------
def mat(name, color, rough=0.6, sss=0.25, sheen=0.5, coat=0.0, bump=0.0, spec=0.35, grain=0.0):
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
    if grain:  # restrained painterly mottling: low-frequency value drift on the base colour
        nt = m.node_tree; g = nt.nodes.new('ShaderNodeTexNoise'); g.inputs['Scale'].default_value = 14; g.inputs['Detail'].default_value = 3
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = grain * 4
        mx.inputs['A'].default_value = b.inputs['Base Color'].default_value
        mx.inputs['B'].default_value = (0.8, 0.78, 0.74, 1)
        nt.links.new(g.outputs['Fac'], mx.inputs['Factor']); nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    if bump:
        n = m.node_tree.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 60; n.inputs['Detail'].default_value = 8
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

# --- the game's fitted camera (apps/console/src/render/garden/camera.ts): pinhole, pitch 40 deg, focal 7106 px for a 1999 px canvas,
# 1.04 px per world unit at the centre, camera height 4393 units. 1 Blender unit = 100 world units.
PITCH = math.radians(40); FOCAL_PX = (569 + 5394) / math.tan(PITCH); PX_PER_UNIT = 1.04
CAM_HEIGHT_BU = ((569 + 5394) * math.cos(PITCH) / PX_PER_UNIT) / 100
CAM_DIST_BU = CAM_HEIGHT_BU / math.sin(PITCH)
SS = 2.0                 # supersample: sprite px per game px (retina-sharp; the sprite is displayed at 1/SS)
FRAME = 288              # sprite frame, px: 1.38 BU wide at SS=2 (covers the raised-arm / slash / death extents)

def set_camera(co, target=(0, 0, 0.3)):
    tgt = Vector(target)
    co.location = tgt + Vector((0, -math.cos(PITCH), math.sin(PITCH))) * CAM_DIST_BU
    co.rotation_euler = (math.pi / 2 - PITCH, 0, 0)
    fx = PX_PER_UNIT * 100 * SS * CAM_DIST_BU          # px focal for the sprite's own pixel density
    co.data.lens = fx / FRAME * 36; co.data.clip_start = 5; co.data.clip_end = 200

def build():
    clean()
    sc = bpy.context.scene
    crust = mat('BreadCrust', 0xBF7C3A, rough=0.82, sss=0.1, sheen=0.25, bump=0.16, spec=0.2, grain=0.07)
    crumb = mat('BreadCrumb', 0xEDD39B, rough=0.88, sss=0.2, sheen=0.3, bump=0.1, spec=0.15, grain=0.05)
    backm = mat('BreadBack', 0xA9672D, rough=0.9, sss=0.05, sheen=0.2, bump=0.2, spec=0.15, grain=0.1)
    limb = mat('BreadLimb', 0x9C602B, rough=0.8, sss=0.1, sheen=0.2, bump=0.08, spec=0.2, grain=0.05)
    eye = mat('EyeGloss', 0x020204, rough=0.22, sss=0, sheen=0, coat=0.35, spec=0.25)
    white = mat('EyeSpec', 0xFFFFFF, rough=0.2, sss=0, sheen=0)
    white.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 1, 1, 1)
    white.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0
    blush = mat('Blush', 0xF08C8C, rough=0.9, sss=0, sheen=0)
    mouthm = mat('Mouth', 0x4A2210, rough=0.5, sss=0, sheen=0)
    R = {}
    R['root'] = empty('BREAD_ROOT'); R['lean'] = empty('BREAD_LEAN', R['root']); R['squash'] = empty('BREAD_SQUASH', R['lean'])
    inner = [(x * 0.86, 0.01 + (z - 0.01) * 0.86 + 0.0) for x, z in SLICE]
    body = slab('BODY_CRUST', SLICE, -0.2, 0.2, crust, bevel=0.09)
    back = slab('BODY_BACK', [(x * 0.8, 0.07 + z * 0.8) for x, z in SLICE], 0.17, 0.225, backm, bevel=0.03); back.parent = R['squash']; body.parent = R['squash']
    panel = slab('BODY_CRUMB', [(x * 0.84, 0.045 + z * 0.84) for x, z in SLICE], -0.225, -0.12, crumb, bevel=0.04); panel.parent = R['squash']
    # face (faces -Y, toward the camera)
    for s, side in ((-1, 'L'), (1, 'R')):   # restrained face: small dark eyes, ONE tiny highlight, no blush
        R['eye' + side] = ball('EYE_' + side, (s * 0.105, -0.2, 0.33), (0.042, 0.016, 0.054), eye, R['squash'])
        ball('EYE_SPEC_' + side, (s * 0.105 + 0.012, -0.21, 0.347), (0.011, 0.005, 0.012), white, R['squash'], 12)
    cv = bpy.data.curves.new('mouthc', 'CURVE'); cv.dimensions = '3D'; sp = cv.splines.new('BEZIER'); sp.bezier_points.add(2)
    for p, (x, z) in zip(sp.bezier_points, ((-0.04, 0.262), (0.0, 0.235), (0.04, 0.262))):
        p.co = (x, -0.232, z); p.handle_left_type = p.handle_right_type = 'AUTO'
    cv.bevel_depth = 0.006; cv.bevel_resolution = 4
    mo = bpy.data.objects.new('MOUTH', cv); bpy.context.collection.objects.link(mo); mo.parent = R['squash']; cv.materials.append(mouthm)
    R['mouth'] = mo
    # limbs on pivots: stubby capsules in the crust tone
    for s, side in ((-1, 'L'), (1, 'R')):
        pv = empty('ARM_' + side, R['squash'], (s * 0.305, -0.01, 0.29)); R['arm' + side] = pv
        ball('ARM_MESH_' + side, (s * 0.035, 0, -0.06), (0.062, 0.066, 0.105), limb, pv)
        hold = empty('HOLD_' + side, pv, (s * 0.035, 0, -0.16)); R['hold' + side] = hold
        ball('HAND_' + side, (0, 0, 0), (0.07, 0.07, 0.07), limb, hold)      # rounded mitten
        lp = empty('LEG_' + side, R['lean'], (s * 0.13, -0.06, 0.08)); R['leg' + side] = lp
        ball('LEG_MESH_' + side, (0, -0.02, -0.035), (0.10, 0.125, 0.075), limb, lp)
    # the held boomerang: a plush chevron in a NEUTRAL pale material (Phaser tints it to the player's colour), gripped by the LEFT mitten
    pale = mat('BoomerangPale', 0xEFE9DC, rough=0.7, sss=0.05, sheen=0.2, bump=0.05, spec=0.2)
    cvb = bpy.data.curves.new('boomc', 'CURVE'); cvb.dimensions = '3D'; spb = cvb.splines.new('BEZIER'); spb.bezier_points.add(2)
    for pp, co in zip(spb.bezier_points, ((0, 0, 0.03), (0, 0, -0.21), (0.23, 0, -0.30))):
        pp.co = co; pp.handle_left_type = pp.handle_right_type = 'VECTOR'
    cvb.bevel_depth = 0.075; cvb.bevel_resolution = 6; cvb.use_fill_caps = True; cvb.materials.append(pale)
    bo = bpy.data.objects.new('BOOMERANG', cvb); bpy.context.collection.objects.link(bo); bo.scale = (1, 0.62, 1)
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
    cam = bpy.data.cameras.new('CAM_GAMEPLAY'); cam.type = 'PERSP'; cam.sensor_width = 36; cam.sensor_fit = 'HORIZONTAL'
    co = bpy.data.objects.new('CAM_GAMEPLAY', cam); bpy.context.collection.objects.link(co)
    set_camera(co)
    sc.camera = co
    bpy.ops.mesh.primitive_plane_add(size=8); fl = bpy.context.active_object; fl.name = 'SHADOW_FLOOR'; fl.is_shadow_catcher = True; fl.hide_render = True
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    sc.render.film_transparent = True; sc.render.resolution_x = FRAME; sc.render.resolution_y = FRAME
    sc.view_settings.view_transform = 'Standard'; sc.render.fps = FPS
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    return R

def get_rig():
    g = bpy.data.objects.get
    return dict(root=g('BREAD_ROOT'), lean=g('BREAD_LEAN'), squash=g('BREAD_SQUASH'), armL=g('ARM_L'), armR=g('ARM_R'), holdL=g('HOLD_L'), holdR=g('HOLD_R'),
                legL=g('LEG_L'), legR=g('LEG_R'), eyeL=g('EYE_L'), eyeR=g('EYE_R'), mouth=g('MOUTH'))

def ease(t): return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def seg(t, keys):
    """piecewise-smooth interpolation over [(t, value), ...]"""
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1: return lerp(v0, v1, ease(max(0, min(1, (t - t0) / (t1 - t0)))))
    return keys[-1][1]

HEADINGS = {'S': 0.0, 'SE': math.pi / 4, 'E': math.pi / 2, 'NE': 3 * math.pi / 4, 'N': math.pi,
            'NW': -3 * math.pi / 4, 'W': -math.pi / 2, 'SW': -math.pi / 4}
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}      # west-side headings are the east-side frames flipped horizontally
UNIQUE = ['N', 'NE', 'E', 'SE', 'S']
# state: (frames, loops, directional). Frame counts are the SMALLEST that read at gameplay scale (30 fps source, played at fps below).
BREAD_SCALE = 0.88         # measured against the existing plush (width ratio ~0.86) and validated in the composite
STATES = {'idle': (8, True, True, 8), 'run': (8, True, True, 12), 'turn': (6, False, False, 15), 'dash': (8, False, True, 15),
          'slash': (10, False, True, 20), 'throw': (10, False, True, 15), 'death': (7, False, False, 15), 'victory': (12, True, False, 10)}

def A(out, fwd, up):
    """An arm as a DIRECTION in the character's own frame: out (+ away from the midline), fwd (+ toward the face), up (+)."""
    return (out, fwd, up)

def P(**k):
    base = dict(x=0, y=0, z=0, fwd=0, yaw=0, pitch=0, roll=0, sx=1, sy=1, sz=1, aL=A(0.4, 0.0, -1.0), aR=A(0.4, 0.0, -1.0), aLs=1.0, aRs=1.0,
                armz=0.0, lL=(0, 0), lR=(0, 0), eyes=1.0, mouth=1.0, prop=False, pdir=None, pdirw=(-0.3, 0.6, 0.7))
    base.update(k); return base

def pose(state, t):
    """t in [0, 1]. `yaw` is an offset from the heading; `fwd` a small lunge along it (BU). `prop`: the held boomerang is shown."""
    s = math.sin; c = math.cos; tau = 2 * math.pi
    if state == 'idle':
        b = s(t * tau)
        blink = 0.12 if 0.62 < t < 0.75 else 1.0
        return P(sz=1 + 0.03 * b, sx=1 - 0.015 * b, sy=1 - 0.015 * b, roll=0.02 * s(t * tau + 1), prop=True,
                 aL=A(0.55, 0.45 + 0.04 * b, -0.7), aR=A(0.4, 0.0, -1.0 + 0.04 * b), eyes=blink)
    if state == 'run':
        p = t * tau; down = abs(s(p))
        return P(pitch=0.2, roll=-0.07 * s(p), z=0.04 * (1 - down), sz=1 - 0.05 * down + 0.02 * (1 - down), sx=1 + 0.03 * down, prop=True,
                 aL=A(0.5, 0.4 + 0.45 * c(p), -0.75), aR=A(0.35, -0.9 * c(p), -0.8), lL=(0.95 * s(p), max(0, c(p)) * 0.05), lR=(-0.95 * s(p), max(0, -c(p)) * 0.05))
    if state == 'turn':
        spin = s(t * math.pi)
        return P(yaw=(math.pi / 2) * seg(t, [(0.1, 0), (0.75, 1)]), pitch=0.08 * spin, roll=0.16 * spin, sx=1 - 0.1 * spin,
                 sz=1 + 0.06 * spin - 0.1 * seg(t, [(0, 0), (0.12, 1), (0.3, 0)]), z=0.05 * spin, prop=True,
                 aL=A(0.6 + 0.6 * spin, 0.4, -0.6 + 0.6 * spin), aR=A(0.5 + 0.8 * spin, 0, -0.8 + 0.7 * spin), lL=(0.35 * spin, 0), lR=(-0.35 * spin, 0))
    if state == 'dash':   # crouch and coil back -> EXPLODE: long low forward-diving stretch, feet trailing, arms and boomerang streaming back -> skid -> settle
        a = seg(t, [(0, 0), (0.24, 1), (0.36, 0)])            # anticipation: deep crouch, leaning back
        d = seg(t, [(0.22, 0), (0.34, 1), (0.64, 1), (0.88, 0)])   # displacement pose
        rec = seg(t, [(0.82, 0), (0.92, 1), (1, 0)])          # skid squash on recovery
        return P(pitch=-0.35 * a + 0.75 * d, z=0.07 * d, sz=1 - 0.32 * a - 0.2 * d - 0.12 * rec, sy=1 + 0.22 * a + 0.5 * d, sx=1 + 0.2 * a - 0.18 * d + 0.1 * rec,
                 roll=0.0, prop=True, pdirw=None, pdir=(0.1, -1.0, 0.05 + 0.1 * a),
                 aL=A(0.6 + 0.2 * d, -0.6 * a - 1.5 * d, -0.4 - 0.1 * d + 0.5 * a), aR=A(0.6 + 0.3 * d, -0.6 * a - 1.5 * d, -0.4 + 0.5 * a),
                 lL=(-1.4 * d, 0.07 * d), lR=(-1.2 * d, 0.1 * d), eyes=1 - 0.55 * d, mouth=1 + 0.5 * d)
    if state == 'slash':  # coil: boomerang raised high at screen-left -> diagonal chop ACROSS the frame -> overshoot low -> settle
        w = seg(t, [(0, 0), (0.32, 1), (0.44, 1)]); k = seg(t, [(0.42, 0), (0.56, 1)]); rec = seg(t, [(0.7, 0), (1, 1)])
        live = k * (1 - rec)
        # arm direction in WORLD axes (x = screen right, y = away from camera, z = up): same readable sweep at every heading
        def mix(a_, b_, f): return tuple(lerp(x_, y_, f) for x_, y_ in zip(a_, b_))
        rest, windup, strike, over = (-0.45, -0.1, -0.9), (-0.75, 0.05, 0.75), (0.95, -0.35, -0.15), (0.75, -0.1, -0.65)
        v = mix(mix(rest, windup, w), strike, k)
        v = mix(v, over, seg(t, [(0.56, 0), (0.66, 1)]) * (1 - rec))
        v = mix(v, rest, rec)
        return P(yaw=-0.7 * w + 1.5 * k - 0.8 * rec, pitch=-0.2 * w + 0.35 * live, roll=0.2 * w - 0.25 * live, fwd=0.06 * live, z=0.04 * live,
                 sz=1 - 0.16 * w + 0.18 * live + 0.16 * w * k, sx=1 + 0.1 * w - 0.06 * live, sy=1 - 0.06 * w + 0.12 * live,
                 prop=True, aLw=v, pdirw=v, aLs=1 + 0.25 * (w + live), armz=0.1 * min(1.0, w + live),
                 aR=A(0.5 + 0.5 * live, 0.3 * w, -0.8 + 0.5 * w), lL=(0.45 * k, 0), lR=(-0.7 * live, 0), mouth=1.0 + 0.8 * live)
    if state == 'throw':  # overhand: boomerang cocked back/up with lean, release forward (prop leaves the hand), hop, follow through
        w = seg(t, [(0, 0), (0.38, 1), (0.48, 1)]); r = seg(t, [(0.46, 0), (0.62, 1)]); rec = seg(t, [(0.78, 0), (1, 1)])
        hop = s(max(0, min(1, (t - 0.46) / 0.4)) * math.pi); live = r * (1 - rec)
        aL = A(lerp(lerp(0.5, 0.5, w), 0.4, r), lerp(lerp(0.3, -0.9, w), 1.0, r) * (1 - 0.3 * rec), lerp(lerp(-0.6, 0.9, w), 0.5, r) * (1 - rec) - 0.7 * rec)
        return P(yaw=-0.5 * w + 0.8 * live, pitch=-0.25 * w + 0.4 * live, z=0.09 * hop, fwd=0.03 * live, sz=1 - 0.12 * w + 0.14 * hop, sx=1 + 0.06 * w - 0.05 * hop,
                 prop=t < 0.585, pdirw=None, pdir=aL, aL=aL, aLs=1 + 0.2 * (w + live), armz=0.1 * min(1.0, w + live),
                 aR=A(0.7, 0.3 * w - 0.2 * live, -0.4 + 0.3 * w), lL=(-0.35 * r, 0), lR=(0.45 * w - 0.35 * r, 0))
    if state == 'death':
        t = t * 0.8   # the pose timeline settles by 0.72; end the clip there instead of holding
        hit = seg(t, [(0, 0), (0.08, 1), (0.2, 0.3)]); fly = seg(t, [(0.08, 0), (0.4, 1)]); flat = seg(t, [(0.35, 0), (0.55, 1), (0.62, 0.82), (0.72, 1)])
        up = s(min(1, max(0, (t - 0.08) / 0.32)) * math.pi)
        return P(yaw=0.4 * s(fly * math.pi), y=0.22 * fly, z=0.13 * up, pitch=0.3 * hit - 1.45 * flat, roll=0.4 * up * (1 - flat),
                 sz=1 - 0.28 * hit + 0.05 * flat, sx=1 + 0.2 * hit + 0.05 * flat, sy=1 - 0.1 * flat,
                 aL=A(0.9 + 0.6 * flat, 0.0, 0.3 * (1 - flat) - 0.6 * flat), aR=A(0.9 + 0.6 * flat, 0.0, 0.3 * (1 - flat) - 0.6 * flat),
                 lL=(0.9 * fly * (1 - flat), 0), lR=(-0.8 * fly * (1 - flat), 0), eyes=0.16 if t > 0.06 else 1, mouth=-1.0 if t > 0.06 else 1)
    if state == 'victory':  # two big hops, BOTH mitten arms thrown up in a V, mouth open
        ph = (t * 2) % 1
        air = s(ph * math.pi) ** 0.85
        land = seg(ph, [(0, 1), (0.14, 0), (0.86, 0), (1, 1)])
        return P(z=0.22 * air, sz=1 + 0.12 * air - 0.16 * land, sx=1 - 0.06 * air + 0.1 * land, sy=1 - 0.06 * air + 0.1 * land, roll=0.07 * s(t * tau * 2),
                 aL=A(0.8, 0.0, 0.85 + 0.15 * air - 0.2 * land), aR=A(0.8, 0.0, 0.85 + 0.15 * air - 0.2 * land), aLs=1.55, aRs=1.55, armz=0.2,
                 lL=(0.5 * air, 0), lR=(-0.5 * air, 0), mouth=1.8)
    raise KeyError(state)

def arm_quat(side, v):
    out, fwd, up = v
    d = Vector((-out if side == 'L' else out, -fwd, up))
    return d.normalized().to_track_quat('-Z', 'Y')

def apply(p, heading=0.0):
    R = get_rig()
    yaw = heading + p['yaw']
    fx, fy = math.sin(heading), -math.cos(heading)
    R['root'].location = (p['x'] + fx * p['fwd'], p['y'] + fy * p['fwd'], p['z'])
    if p['y']: R['root'].location = (p['x'], p['y'], p['z'])
    R['root'].rotation_euler = (0, 0, yaw); R['root'].scale = (BREAD_SCALE,) * 3
    R['lean'].rotation_euler = (p['pitch'], p['roll'], 0)
    R['squash'].scale = (p['sx'], p['sy'], p['sz'])
    for side in 'LR':
        arm = R['arm' + side]; L_ = p['a' + side + 's']; k_ = 1 + (L_ - 1) * 0.4
        arm.rotation_mode = 'QUATERNION'
        wv = p.get('a' + side + 'w')
        if wv is not None: arm.rotation_quaternion = (Matrix.Rotation(-yaw, 3, 'Z') @ Vector(wv)).normalized().to_track_quat('-Z', 'Y')
        else: arm.rotation_quaternion = arm_quat(side, p['a' + side])
        arm.scale = (k_, k_, L_); arm.location.z = 0.29 + p['armz']
        R['hold' + side].scale = (1 / k_, 1 / k_, 1 / L_)          # the mitten and the prop do not stretch with the arm
        R['leg' + side].rotation_euler = (p['l' + side][0], 0, 0); R['leg' + side].location.z = 0.07 + p['l' + side][1]
    bpy.context.view_layer.update()
    bo = bpy.data.objects['BOOMERANG']; loc = R['holdL'].matrix_world.translation.copy()
    if p.get('pdirw') is not None: dw = Vector(p['pdirw']).normalized()
    else:
        ro, rf, ru = p['pdir']; dl = Vector((-ro, -rf, ru)).normalized()          # L-side convention, as the arms
        dw = Matrix.Rotation(yaw, 3, 'Z') @ dl                                    # extension direction in the world
    cam = bpy.context.scene.camera.matrix_world.translation - loc; cam.normalize()
    zax = -dw                                                                 # the chevron extends along its local -Z
    yax = cam - zax * cam.dot(zax)
    if yax.length < 1e-3: yax = Vector((0, 0, 1)) - zax * zax.z
    yax.normalize(); xax = yax.cross(zax).normalized()
    m = Matrix((xax, yax, zax)).transposed().to_4x4()
    m = Matrix.Translation(loc) @ m @ Matrix.Diagonal((BREAD_SCALE, BREAD_SCALE * 0.62, BREAD_SCALE, 1))
    bo.matrix_world = m
    for e in ('eyeL', 'eyeR'): R[e].scale = (0.042, 0.016, 0.054 * p['eyes'])
    R['mouth'].scale = (1, 1, p['mouth']); R['mouth'].location = (0, 0, 0.245 * (1 - p['mouth']))

def frame_t(state, i):
    n, loops = STATES[state][0], STATES[state][1]
    return i / n if loops else i / (n - 1)

PROP_HOLDOUT = False   # the near-side mitten holds the prop IN FRONT of the body at every heading; holdout would wrongly hide it

def set_pass(prop_pass):
    """Body pass: boomerang hidden. Prop pass: everything else is a HOLDOUT, so the prop is occluded correctly where the body is in front."""
    for o in bpy.data.objects:
        if o.type in ('MESH', 'CURVE') and o.name != 'SHADOW_FLOOR':
            if o.name == 'BOOMERANG': o.hide_render = not prop_pass
            else:
                o.is_holdout = prop_pass and PROP_HOLDOUT
                o.hide_render = prop_pass and not PROP_HOLDOUT      # prop-only layer: composited over the body

def render_frame(state, i, heading_name, path, prop_path=None):
    p = pose(state, frame_t(state, i)); apply(p, HEADINGS[heading_name])
    sc = bpy.context.scene
    set_pass(False); sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    if prop_path and p['prop']:
        set_pass(True); sc.render.filepath = prop_path; bpy.ops.render.render(write_still=True); set_pass(False)
    return p['prop']
