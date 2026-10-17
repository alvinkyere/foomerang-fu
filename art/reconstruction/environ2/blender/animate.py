"""Bring the 3D plaza to life: a seamless loop in which every motion starts from rest, so frame 0 is still the image, pixel for pixel.
Each motion has the form  A * (sin(2 pi t / T + phase) - sin(phase))  : zero at t = 0, the same at t = T.
 * the bunting's pennants swing on the rope, each a little behind the one before (a wave running along the rope); the rope sways
 * the banners' cloths ripple, more toward their free edge
 * the hex canopies sway gently on their legs; the round tree's leaf clumps breathe
 * the fountain's water ripples: rings spreading from the juicer, white glints drifting across, a moving light pattern
   (the only motion present at rest: the water is never still)
The small fill pieces that complete each outline are attached to the part they belong to (the nearest one), so they move with it.
Blender -b --python animate.py -- <plaza.blend> <out_dir> [frames]"""
import sys, os, math
import bpy, bmesh
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[:2]
FRAMES = int(args[2]) if len(args) > 2 else 120          # 4 s at 30 fps
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 0, FRAMES - 1
sc.render.fps = 30
T = FRAMES
objs = {o.name: o for o in sc.objects if o.type == 'MESH'}


def wave(amp, phase, speed=1):
    """The loop curve as a driver expression of the frame."""
    return f"{amp:.6f} * (sin(2 * pi * {speed} * frame / {T} + {phase:.4f}) - sin({phase:.4f}))"


def drive(o, path, index, expr):
    """Drive one channel as its rest value plus the motion (the rest value is read now, after the origin moves)."""
    rest = getattr(o, path)[index]
    expr = f"{rest:.6f} + {expr}"
    fc = o.driver_add(path, index)
    fc.driver.type = 'SCRIPTED'
    fc.driver.expression = expr


def set_origin(o, point):
    """Move the object's origin to `point` (world) without moving its geometry."""
    mw = o.matrix_world.copy()
    local = mw.inverted() @ Vector(point)
    o.data.transform(Matrix.Translation(-local))
    o.matrix_world = mw @ Matrix.Translation(local)


def world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]


# ---- pennants: swing about their top edge on the rope ------------------------------------------------------------------------
pennants = sorted([o for n, o in objs.items() if n.startswith('BUNTING_pennant')], key=lambda o: o.name)
for i, o in enumerate(pennants):
    V = world_verts(o)
    top = max(v.z for v in V)
    hinge = [v for v in V if v.z > top - 0.15]
    set_origin(o, sum(hinge, Vector()) / len(hinge))
    o.rotation_mode = 'XYZ'
    drive(o, 'rotation_euler', 0, wave(math.radians(14), -0.7 * i))          # swing toward / away from the viewer
    drive(o, 'rotation_euler', 1, wave(math.radians(5), -0.7 * i + 1.3))     # and a little sideways
rope = objs.get('BUNTING_rope')
if rope:
    V = world_verts(rope)
    set_origin(rope, Vector((sum(v.x for v in V) / len(V), sum(v.y for v in V) / len(V), max(v.z for v in V))))
    drive(rope, 'location', 1, wave(0.08, 0.4))

# ---- banners: the cloth ripples, more toward its free edge -----------------------------------------------------------------------
for n, o in objs.items():
    if not n.endswith('_cloth'):
        continue
    bpy.context.view_layer.objects.active = o
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=8, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    pole_x = max(v.co.x for v in o.data.vertices)                 # the cloth hangs west of its pole
    span = pole_x - min(v.co.x for v in o.data.vertices)
    o.shape_key_add(name='rest')
    for k, ph in enumerate((0.0, 2.1)):
        sk = o.shape_key_add(name=f'ripple{k}')
        for v, d in zip(sk.data, o.data.vertices):
            f = (pole_x - d.co.x) / span
            d_amp = 0.35 * f * math.sin(4.0 * f * math.pi + ph)
            v.co = d.co + Vector((0, d_amp, 0.05 * f * math.sin(3 * f * math.pi + ph)))
        fc = sk.driver_add('value')
        fc.driver.type = 'SCRIPTED'
        fc.driver.expression = f"(sin(2 * pi * frame / {T} + {ph}) - sin({ph})) * 0.5"
        sk.slider_min = -1

# ---- canopies: a gentle sway about the canopy's middle; the round tree's clumps breathe ----------------------------------------
for i, (n, o) in enumerate(sorted((n, o) for n, o in objs.items() if '_canopy' in n)):
    V = world_verts(o)
    set_origin(o, sum(V, Vector()) / len(V))
    drive(o, 'rotation_euler', 0, wave(math.radians(1.6), 0.9 * i))
    drive(o, 'rotation_euler', 1, wave(math.radians(1.2), 0.9 * i + 1.7))
    drive(o, 'location', 0, wave(0.06, 0.9 * i + 0.5))
for i, (n, o) in enumerate(sorted((n, o) for n, o in objs.items() if n.startswith('TREE29_leaf'))):
    V = world_verts(o)
    set_origin(o, sum(V, Vector()) / len(V))
    for ax in range(3):
        drive(o, 'scale', ax, wave(0.035, 0.45 * i))
    drive(o, 'location', 0, wave(0.05, 0.45 * i + 1.0))

# ---- water: cartoon ripples over the painted water -- rings spreading out from the juicer, white glints drifting across, and a
# moving light pattern. They loop (every phase advances by whole turns per loop) and sit on top of the painted surface.
water = objs.get('FOUNTAIN_water')
if water:
    m = water.data.materials[0].copy()
    water.data.materials[0] = m
    nt = m.node_tree
    tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
    em = next(n for n in nt.nodes if n.type == 'EMISSION')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    V = world_verts(water)
    centre = sum(V, Vector()) / len(V)
    radius = max((v - centre).length for v in V)
    rel = nt.nodes.new('ShaderNodeVectorMath')
    rel.operation = 'SUBTRACT'
    rel.inputs[1].default_value = tuple(centre)
    nt.links.new(geo.outputs['Position'], rel.inputs[0])

    def val(expr):
        n = nt.nodes.new('ShaderNodeValue')
        d = n.outputs[0].driver_add('default_value')
        d.driver.type = 'SCRIPTED'
        d.driver.expression = expr
        return n.outputs[0]

    def mth(op, a, b=0.0, c=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        for i, x in enumerate((a, b) if c is None else (a, b, c)):
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                nt.links.new(x, n.inputs[i])
        return n.outputs[0]
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(rel.outputs['Vector'], sep.inputs['Vector'])
    dist = nt.nodes.new('ShaderNodeVectorMath')
    dist.operation = 'LENGTH'
    nt.links.new(rel.outputs['Vector'], dist.inputs[0])
    r = dist.outputs['Value']
    turn = val(f"2 * pi * frame / {T}")
    # rings: thin bright bands travelling outward (3 rings across the basin, 2 passes per loop), wobbling a little
    wob = mth('MULTIPLY', mth('SINE', mth('ADD', mth('MULTIPLY', mth('ARCTAN2', sep.outputs['Y'], sep.outputs['X']), 5.0),
                                             mth('MULTIPLY', turn, 1.0))), 0.25)
    ring_arg = mth('SUBTRACT', mth('ADD', mth('MULTIPLY', r, 2 * math.pi * 3 / radius), wob), mth('MULTIPLY', turn, 2.0))
    ring = mth('POWER', mth('MULTIPLY', mth('ADD', mth('SINE', ring_arg), 1.0), 0.5), 14.0)        # sharp bands
    inner = mth('SMOOTH_MAX', mth('SUBTRACT', r, radius * 0.48), 0.0, 0.3)                       # rings start outside the juicer
    ring = mth('MULTIPLY', ring, mth('MINIMUM', mth('MULTIPLY', inner, 1.5), 1.0))
    edge = mth('SUBTRACT', 1.0, mth('POWER', mth('DIVIDE', r, radius), 6.0))                     # fade out at the rim
    ring = mth('MULTIPLY', mth('MULTIPLY', ring, mth('MAXIMUM', edge, 0.0)), 0.55)
    # glints: small bright dashes drifting round the basin (a wave texture in angle and radius)
    ang = mth('ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    g_arg = mth('ADD', mth('ADD', mth('MULTIPLY', ang, 9.0), mth('MULTIPLY', r, 2.3)), turn)
    g2 = mth('SINE', mth('SUBTRACT', mth('MULTIPLY', r, 3.1), mth('MULTIPLY', turn, 3.0)))
    glint = mth('POWER', mth('MAXIMUM', mth('MULTIPLY', mth('SINE', g_arg), g2), 0.0), 18.0)
    glint = mth('MULTIPLY', mth('MULTIPLY', glint, mth('MAXIMUM', edge, 0.0)), 0.9)
    # light pattern: slow broad bright/dark drift
    caus = mth('MULTIPLY', mth('ADD', mth('SINE', mth('ADD', mth('MULTIPLY', sep.outputs['X'], 0.9), turn)),
                               mth('SINE', mth('SUBTRACT', mth('MULTIPLY', sep.outputs['Y'], 1.1), turn))), 0.06)
    white = mth('MINIMUM', mth('ADD', ring, glint), 0.8)
    lit = nt.nodes.new('ShaderNodeMix')
    lit.data_type = 'RGBA'
    lit.blend_type = 'MULTIPLY'
    lit.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], lit.inputs['A'])
    gcol = nt.nodes.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        nt.links.new(mth('ADD', caus, 1.0), gcol.inputs[ch])
    nt.links.new(gcol.outputs['Color'], lit.inputs['B'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MIX'
    nt.links.new(white, mix.inputs['Factor'])
    nt.links.new(lit.outputs['Result'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.92, 1.0, 1.0, 1.0)
    nt.links.new(mix.outputs['Result'], em.inputs['Color'])

# ---- fills follow the part they complete (attached last: moving a part's pivot must not drag them) --------------------------------------------------------------------------------
parts = [o for n, o in objs.items() if 'FILL_fill' not in n and n != 'GROUND']
for n, o in objs.items():
    if 'FILL_fill' not in n:
        continue
    c = sum(world_verts(o), Vector()) / len(o.data.vertices)
    best, bd = None, 1e9
    for p in parts:
        ok, loc, *_ = p.closest_point_on_mesh(p.matrix_world.inverted() @ c)
        if ok:
            d = (p.matrix_world @ loc - c).length
            if d < bd:
                best, bd = p, d
    if best is not None and bd < 3.0:
        mw = o.matrix_world.copy()
        o.parent = best
        o.matrix_parent_inverse = best.matrix_world.inverted()
        o.matrix_world = mw

sc.render.engine = 'CYCLES'
sc.cycles.samples = 1
sc.cycles.use_denoising = False
sc.render.filter_size = 0.01
sc.render.dither_intensity = 0.0
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = os.path.join(OUT, 's')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'plaza_animated.blend'))
bpy.ops.render.render(animation=True)
print('animation rendered', FRAMES)
