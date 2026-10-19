"""Foomerang Fu — BREAD vertical art test (Blender 5.x). Original character; built entirely from code.

Run inside Blender (e.g. exec(open(path).read()) through Blender MCP). 1 Blender unit = 100 game units.
Scene structure (empties are the rig; all animation is keyframes on them, so it exports cleanly):
  BREAD_ROOT (place, yaw)  -> BREAD_LEAN (lean/roll) -> BREAD_SQUASH (squash & stretch about the feet) -> body, face, ARM_L/R
                                                      -> LEG_L/R pivots (do not squash)
  CAM_GAMEPLAY (PERSPECTIVE pinhole fitted to the Garden camera: pitch 40 deg, focal 7106 px @1999 px, ~104 px/unit at the target), SUN_KEY, AREA_RIM, world fill, SHADOW_FLOOR.
"""
import math, bpy, bmesh
from mathutils import Vector, Euler

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
        R['eye' + side] = ball('EYE_' + side, (s * 0.105, -0.214, 0.33), (0.042, 0.016, 0.054), eye, R['squash'])
        ball('EYE_SPEC_' + side, (s * 0.105 + 0.012, -0.224, 0.347), (0.011, 0.005, 0.012), white, R['squash'], 12)
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
    return dict(root=g('BREAD_ROOT'), lean=g('BREAD_LEAN'), squash=g('BREAD_SQUASH'), armL=g('ARM_L'), armR=g('ARM_R'),
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
STATES = {'idle': (8, True, True, 8), 'run': (8, True, True, 12), 'turn': (6, False, False, 15), 'dash': (8, False, True, 15),
          'slash': (10, False, True, 20), 'throw': (10, False, True, 15), 'death': (12, False, False, 15), 'victory': (12, True, False, 10)}

def P(**k):
    """Arms are (fwd, 0, out): fwd < 0 swings the arm forward (toward the face), out >= 0 raises it away from the body
    (out ~ 1.57 = straight out, ~2.6 = overhead). apply() mirrors the sign for the right arm."""
    base = dict(x=0, y=0, z=0, fwd=0, yaw=0, pitch=0, roll=0, sx=1, sy=1, sz=1, aL=(0, 0, 0.12), aR=(0, 0, 0.12), aLs=1.0, aRs=1.0, armz=0.0,
                lL=(0, 0), lR=(0, 0), eyes=1.0, mouth=1.0)
    base.update(k); return base

def pose(state, t):
    """t in [0, 1] (looping states: [0, 1)). `yaw` is an offset from the heading; `fwd` a lunge along the heading (BU)."""
    s = math.sin; c = math.cos; tau = 2 * math.pi
    if state == 'idle':
        b = s(t * tau)
        blink = 0.12 if 0.62 < t < 0.75 else 1.0
        return P(sz=1 + 0.03 * b, sx=1 - 0.015 * b, sy=1 - 0.015 * b, roll=0.02 * s(t * tau + 1),
                 aL=(0.05 * b, 0, 0.16 + 0.05 * b), aR=(-0.05 * b, 0, 0.16 + 0.05 * b), eyes=blink)
    if state == 'run':
        p = t * tau
        down = abs(s(p))
        return P(pitch=0.2, roll=-0.07 * s(p), z=0.04 * (1 - down), sz=1 - 0.05 * down + 0.02 * (1 - down), sx=1 + 0.03 * down,
                 aL=(-1.0 * c(p), 0, 0.3), aR=(1.0 * c(p), 0, 0.3), lL=(0.95 * s(p), max(0, c(p)) * 0.05), lR=(-0.95 * s(p), max(0, -c(p)) * 0.05))
    if state == 'turn':   # pivot 90 degrees (S -> E): squash, hop, spin, land
        spin = s(t * math.pi)
        return P(yaw=(math.pi / 2) * seg(t, [(0.1, 0), (0.75, 1)]), pitch=0.08 * spin, roll=0.16 * spin, sx=1 - 0.1 * spin, sz=1 + 0.06 * spin - 0.1 * seg(t, [(0, 0), (0.12, 1), (0.3, 0)]) , z=0.05 * spin,
                 aL=(0, 0, 0.5 * spin + 0.12), aR=(0, 0, 0.5 * spin + 0.12), lL=(0.35 * spin, 0), lR=(-0.35 * spin, 0))
    if state == 'dash':   # anticipation (0-0.25) -> acceleration (0.25-0.7) -> recovery
        a = seg(t, [(0, 0), (0.22, 1), (0.34, 0)])
        d = seg(t, [(0.2, 0), (0.34, 1), (0.66, 1), (0.9, 0)])
        return P(pitch=0.1 * a + 0.3 * d,  z=0.015 * d, sz=1 - 0.2 * a - 0.07 * d, sy=1 + 0.12 * a + 0.2 * d,
                 sx=1 + 0.12 * a - 0.09 * d, aL=(0.9 * d - 0.3 * a, 0, 0.5 * d + 0.2 * a), aR=(0.9 * d - 0.3 * a, 0, 0.5 * d + 0.2 * a),
                 lL=(-0.9 * d, 0), lR=(-0.7 * d, 0), eyes=1 - 0.45 * d)
    if state == 'slash':  # vertical-plane chop (reads in profile AND from the front): arm up-and-back, whip forward-down, overshoot, settle
        w = seg(t, [(0, 0), (0.3, 1), (0.42, 1)])             # wind-up
        k = seg(t, [(0.4, 0), (0.56, 1)])                     # strike
        rec = seg(t, [(0.68, 0), (1, 1)])                     # recovery
        live = k * (1 - rec)
        big = min(1.0, w + live)
        return P(yaw=-0.5 * w + 1.0 * k - 0.6 * rec, pitch=-0.3 * w + 0.55 * live, roll=0.14 * w - 0.2 * live,
                 fwd=0.07 * k * (1 - rec), z=0.04 * live, sz=1 - 0.14 * w + 0.2 * live + 0.14 * w * k, sx=1 + 0.1 * w - 0.06 * live, sy=1 - 0.06 * w + 0.12 * live,
                 aL=(2.5 * w - 4.3 * live, 0, 0.7 + 0.5 * w - 0.2 * live), aLs=1 + 1.3 * big, armz=0.12 * big,
                 aR=(0.5 * w - 0.9 * live, 0, 0.5 + 0.3 * live), lL=(0.45 * k, 0), lR=(-0.7 * live, 0), mouth=1.0 + 0.8 * live)
    if state == 'throw':  # overhand: arm back and up, lean back, release forward, hop and follow through
        w = seg(t, [(0, 0), (0.38, 1), (0.48, 1)]); r = seg(t, [(0.46, 0), (0.62, 1)]); rec = seg(t, [(0.78, 0), (1, 1)])
        hop = s(max(0, min(1, (t - 0.46) / 0.4)) * math.pi)
        live = r * (1 - rec)
        big = min(1.0, w + live)
        return P(yaw=-0.4 * w + 0.7 * live, pitch=-0.25 * w + 0.4 * live, z=0.09 * hop, fwd=0.04 * live, sz=1 - 0.12 * w + 0.14 * hop, sx=1 + 0.06 * w - 0.05 * hop,
                 aL=(2.7 * w - 4.4 * live + 0.5 * rec * r, 0, 0.8 + 0.4 * w), aLs=1 + 1.3 * big, armz=0.12 * big,
                 aR=(-0.5 * w + 0.5 * live, 0, 0.5 + 0.3 * w), lL=(-0.35 * r, 0), lR=(0.45 * w - 0.35 * r, 0))
    if state == 'death':
        hit = seg(t, [(0, 0), (0.08, 1), (0.2, 0.3)]); fly = seg(t, [(0.08, 0), (0.4, 1)]); flat = seg(t, [(0.35, 0), (0.55, 1), (0.62, 0.82), (0.72, 1)])
        up = s(min(1, max(0, (t - 0.08) / 0.32)) * math.pi)
        return P(yaw=0.4 * s(fly * math.pi), y=0.22 * fly, z=0.13 * up, pitch=0.3 * hit - 1.45 * flat, roll=0.4 * up * (1 - flat),
                 sz=1 - 0.28 * hit + 0.05 * flat, sx=1 + 0.2 * hit + 0.05 * flat, sy=1 - 0.1 * flat,
                 aL=(0, 0, 1.6 * (1 - flat) + 0.6 * flat), aR=(0, 0, 1.6 * (1 - flat) + 0.6 * flat), lL=(0.9 * fly * (1 - flat), 0), lR=(-0.8 * fly * (1 - flat), 0),
                 eyes=0.16 if t > 0.06 else 1, mouth=-1.0 if t > 0.06 else 1)
    if state == 'victory':  # two big hops, BOTH arms thrown overhead in a V, mouth open
        ph = (t * 2) % 1
        air = s(ph * math.pi) ** 0.85
        land = seg(ph, [(0, 1), (0.14, 0), (0.86, 0), (1, 1)])
        return P(z=0.22 * air, sz=1 + 0.12 * air - 0.16 * land, sx=1 - 0.06 * air + 0.1 * land, sy=1 - 0.06 * air + 0.1 * land, roll=0.07 * s(t * tau * 2),
                 aL=(-0.1, 0, 2.3 + 0.2 * air - 0.3 * land), aR=(-0.1, 0, 2.3 + 0.2 * air - 0.3 * land), aLs=2.3, aRs=2.3, armz=0.1,
                 lL=(0.5 * air, 0), lR=(-0.5 * air, 0), mouth=1.8)
    raise KeyError(state)

def apply(p, heading=0.0):
    R = get_rig()
    yaw = heading + p['yaw']
    fx, fy = math.sin(heading), -math.cos(heading)                         # unit vector the character faces
    R['root'].location = (p['x'] + fx * p['fwd'], p['y'] + fy * p['fwd'] + (0 if p['y'] == 0 else 0), p['z'])
    if p['y']:   # death knock-back is along -heading (away from the hit), expressed in world +Y for the camera-facing death
        R['root'].location = (p['x'], p['y'], p['z'])
    R['root'].rotation_euler = (0, 0, yaw)
    R['lean'].rotation_euler = (p['pitch'], p['roll'], 0)
    R['squash'].scale = (p['sx'], p['sy'], p['sz'])
    for side, sign in (('L', 1), ('R', -1)):
        a = p['a' + side]
        R['arm' + side].rotation_euler = (a[0], sign * a[2], 0)
        L_ = p['a' + side + 's']; k_ = 1 + (L_ - 1) * 0.4; R['arm' + side].scale = (k_, k_, L_); R['arm' + side].location.z = 0.29 + p['armz']
        R['leg' + side].rotation_euler = (p['l' + side][0], 0, 0); R['leg' + side].location.z = 0.07 + p['l' + side][1]
    for e in ('eyeL', 'eyeR'): R[e].scale = (0.042, 0.016, 0.054 * p['eyes'])
    R['mouth'].scale = (1, 1, p['mouth']); R['mouth'].location = (0, 0, 0.245 * (1 - p['mouth']))

def frame_t(state, i):
    n, loops = STATES[state][0], STATES[state][1]
    return i / n if loops else i / (n - 1)

def render_frame(state, i, heading_name, path):
    apply(pose(state, frame_t(state, i)), HEADINGS[heading_name])
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
