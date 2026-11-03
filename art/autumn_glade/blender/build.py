"""The autumn glade in 3D, object by object (2026-11-01): ff physics hq 2.mp4 10:26 (626.0 s), seen through the game's camera.

  Blender -b --python art/autumn_glade/blender/build.py -- <out_dir> [render]

  ground    one sand sheet (lit); over it the fitted sand shading (sand.py: soft patches and the light shafts), the green tree shadows, the
            dashed border (24 px dashes on a 36 px period, measured), the fallen leaves (props.py: where the frame has them)
  trees     a pale spotted birch trunk and scalloped umbrella canopies, red or gold, one per lump (props.py), at the heights measured
  logs      three cylinders of dark red-brown wood with a paler cut end
  rocks     two smooth blue-lavender boulders (superellipsoids, lit by the game's light: a side lands at 0.74 of a top, as the frame's does)
  portals   a vertical sheet of cyan zigzag on the rock's field side, with a white-cyan glow on the sand
Plan coordinates (layout.json) are relative to the ground point under the frame's centre: Blender's y = Yc + plan y. Exports glade.glb;
with `render`, also render.png through the HQ's camera and the game's light.
"""
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER = args[0], 'render' in args[1:]
J = lambda p: json.load(open(os.path.join(ROOT, p)))
L, CAM, A = J('art/autumn_glade/layout.json'), J('art/sky_islands/camera.json'), J('art/autumn_glade/arena.json')
YC, COL = L['Yc'], L['colours']
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
rng = random.Random(5)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


LIFT = J('art/autumn_glade/lift.json')        # (lift.py: the light shafts' green lift over the frame, 240 x 135)
LIFT['data'] = [[0.0] * LIFT['w'] for _ in range(LIFT['h'])]      # (off: the game's light beams add the shafts over everything now, fit_beams.py)
_pth = math.radians(CAM['pitchDeg'])
_PR = [[1, 0, 0], [0, -math.sin(_pth), -math.cos(_pth)], [0, math.cos(_pth), -math.sin(_pth)]]


def to_px(x, yb, z):
    """A point (Blender x, y, z) -> its pixel in the HQ frame (measure.py's rig)."""
    v = [x / 100 - CAM['centre'][0], yb / 100 - CAM['centre'][1], z / 100 - CAM['centre'][2]]
    w = [sum(_PR[i][j] * v[j] for j in range(3)) for i in range(3)]
    cx, cy = CAM['focalPx'] * w[0] / w[2] + 960, CAM['focalPx'] * w[1] / w[2] + 540
    return 960 + (cx - 960) * CAM['referenceZoom'], 540 + (cy - 540) * CAM['referenceZoom']


def shaft_lift(co):
    """The shafts' light at a point (bilinear in lift.json; none outside the frame), sRGB 0..255 per channel."""
    px, py = to_px(co[0], co[1], co[2])
    if not (0 <= px < 1919 and 0 <= py < 1079): return (0.0, 0.0, 0.0)
    gx, gy = px / 1920 * LIFT['w'] - 0.5, py / 1080 * LIFT['h'] - 0.5
    x0, y0 = max(0, min(LIFT['w'] - 2, int(gx))), max(0, min(LIFT['h'] - 2, int(gy)))
    fx, fy = max(0.0, min(1.0, gx - x0)), max(0.0, min(1.0, gy - y0))
    d = LIFT['data']
    g = (d[y0][x0] * (1 - fx) + d[y0][x0 + 1] * fx) * (1 - fy) + (d[y0 + 1][x0] * (1 - fx) + d[y0 + 1][x0 + 1] * fx) * fy
    return tuple(g * a for a in LIFT['add'])


def srgb(v): return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
def linear(v): return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lit_up(rgb_lin, co):
    """A linear colour with the shafts' light added where the point is (in sRGB, as the frame adds it)."""
    l = shaft_lift(co)
    return [linear(min(1.0, srgb(rgb_lin[i]) + l[i] / 255)) for i in range(3)] + [1.0]


def scale_hex(h, k):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(int(h[i:i + 2], 16) * k))) for i in (1, 3, 5))


def lit(name, hex_colour):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 1.0; bsdf.inputs['Base Color'].default_value = lin(hex_colour)
    return m


def unlit(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(attr.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


# The game's soft light lands a top at ~0.98 of its base colour and a side at ~0.9: bases are the measured colours over that.
TOP = 0.52 + 0.4812 * 0.9111      # the game's light on a top: ambient + sun x its up component (0.958)
SAND, ROCK = lit('sand', scale_hex(J('art/autumn_glade/ground_field.json')['base'], 1 / TOP)), lit('rock', scale_hex('#9ea8e1', 1 / TOP))
# (the frame's rock sides are ~0.70 of its tops, #6872a5 to #9ca6e0; the game's light alone gives ~0.85 on these rounded sides: the sides' base is darker)
ROCK_SIDE = lit('rock_side', scale_hex('#9ea8e1', 0.8 / TOP))
LOG_SIDE, LOG_END = lit('log', scale_hex('#7a4c52', 1 / TOP)), lit('log_end', scale_hex('#b49285', 1 / TOP))
FLAT = unlit('flat')


def obj(name, me, mats):
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    return o


def at(p, z=0.0):
    return (p[0], YC + p[1], z)


def flat(name, poly, hex_, z):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    vs = [bm.verts.new((x, YC + y, z)) for x, y in poly]
    face = bm.faces.new(vs); face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    for loop in face.loops: loop[col] = lin(hex_)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


# ---------------------------------------------------------------------------------------------------------------- flat shapes
def flat(name, poly, hex_, z, lift=False):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    face = bm.faces.new([bm.verts.new((x, YC + y, z)) for x, y in poly]); face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='EAR_CLIP')
    for f in bm.faces:
        for loop in f.loops: loop[col] = lit_up(lin(hex_), loop.vert.co) if lift else lin(hex_)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


def oval(cx, cy, a, b, ang_deg, n=10):
    t = math.radians(ang_deg)
    return [(cx + math.cos(2 * math.pi * i / n) * a / 2 * math.cos(t) - math.sin(2 * math.pi * i / n) * b / 2 * math.sin(t),
             cy + math.cos(2 * math.pi * i / n) * a / 2 * math.sin(t) + math.sin(2 * math.pi * i / n) * b / 2 * math.cos(t)) for i in range(n)]


# ---------------------------------------------------------------------------------------------------------------- ground
me = bpy.data.meshes.new('GROUND'); me.from_pydata([(-90, YC - 70, 0), (90, YC - 70, 0), (90, YC + 70, 0), (-90, YC + 70, 0)], [], [(0, 1, 2, 3)])
obj('GROUND', me, [SAND])
# the sand where the frame shows it: ground_field.py's smooth measured field (vertex colours, unlit: shown as measured), easing to the
# plain sand at the frame's edges; beyond it the lit plane above, in the field's plain colour
GF = J('art/autumn_glade/ground_field.json')
bm = bmesh.new(); colL = bm.loops.layers.float_color.new('Col')
vs = [[bm.verts.new((GF['x0'] + i * GF['dx'], YC + GF['y0'] + j * GF['dx'], 0.005)) for i in range(GF['nx'])] for j in range(GF['ny'])]
for j in range(GF['ny'] - 1):
    for i in range(GF['nx'] - 1):
        f = bm.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]])
        for loop in f.loops:
            ii = round((loop.vert.co.x - GF['x0']) / GF['dx']); jj = round((loop.vert.co.y - YC - GF['y0']) / GF['dx'])
            b_, g_, r_ = GF['bgr'][jj * GF['nx'] + ii]
            loop[colL] = lin('#%02x%02x%02x' % (r_, g_, b_))
me = bpy.data.meshes.new('SAND_FIELD'); bm.to_mesh(me); bm.free(); obj('SAND_FIELD', me, [FLAT])
for k, poly in enumerate(L['shadows']):
    try: flat(f'SHADOW_{k}', poly, COL['shadow'], 0.03)
    except ValueError: pass
# the dashed border: 24 px dashes on a 36 px period at the bottom edge, 4 px thick (measured at 626.0 s: 0.81 / 0.40 / 0.14 plan units)
B = A['border']; DASH, PERIOD, THICK = 0.81, 1.21, 0.14
edges = [((B['x0'], B['y0']), (B['x1'], B['y0'])), ((B['x1'], B['y0']), (B['x1'], B['y1'])), ((B['x1'], B['y1']), (B['x0'], B['y1'])), ((B['x0'], B['y1']), (B['x0'], B['y0']))]
nd = 0
for (ax_, ay_), (bx_, by_) in edges:
    ln = math.hypot(bx_ - ax_, by_ - ay_); ux, uy = (bx_ - ax_) / ln, (by_ - ay_) / ln
    t = 0.0
    while t + DASH <= ln:
        x0_, y0_, x1_, y1_ = ax_ + ux * t, ay_ + uy * t, ax_ + ux * (t + DASH), ay_ + uy * (t + DASH)
        px_, py_ = -uy * THICK / 2, ux * THICK / 2
        flat(f'DASH_{nd}', [(x0_ + px_, y0_ + py_), (x1_ + px_, y1_ + py_), (x1_ - px_, y1_ - py_), (x0_ - px_, y0_ - py_)], '#aca157', 0.05); nd += 1
        t += PERIOD
for k, lf in enumerate(L['leaves']):
    flat(f'LEAF_{k}', oval(lf['plan'][0], lf['plan'][1], min(0.62, max(lf['a'], lf['b'])), min(0.36, min(lf['a'], lf['b'])), lf['ang']), '#cf6753' if lf['kind'] == 'r' else '#c9ad55', 0.06, lift=True)


# ---------------------------------------------------------------------------------------------------------------- trees
def mix(a, b, t):
    return [a[i] + (b[i] - a[i]) * max(0.0, min(1.0, t)) for i in range(3)] + [1.0]


def trunk(name, foot, top, r0, r1, rings=10, seg=10):
    """A tapered spotted trunk from the foot (on the ground) to `top` = (x, y, z)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    a, b = Vector((foot[0], foot[1], 0)), Vector(top)
    grid = []
    for i in range(rings):
        t = i / (rings - 1); c = a + (b - a) * t; r = r0 + (r1 - r0) * t
        grid.append([bm.verts.new((c.x + math.cos(2 * math.pi * k / seg) * r, c.y + math.sin(2 * math.pi * k / seg) * r, c.z)) for k in range(seg)])
    for i in range(rings - 1):
        for k in range(seg):
            f = bm.faces.new([grid[i][k], grid[i][(k + 1) % seg], grid[i + 1][(k + 1) % seg], grid[i + 1][k]])
            spot = rng.random() < (0.32 if k % 3 else 0.12)                  # (the frame's birch: irregular dark dashes on white)
            for loop in f.loops: loop[col] = lit_up(lin('#5b618b' if spot else '#bbc3e6'), loop.vert.co)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


def umbrella(name, c, r, hi, mid, lo, scallops=7):
    """A scalloped umbrella of leaves: a shallow dome whose rim is a wave of lobes with ragged leaf tips, and a short skirt under the rim.
    Shaded as the frame's clumps are: lightest on the far (north) side of its top, darkening towards the camera and to the rim, the skirt
    darkest; wedge by wedge a little different (the clumps are fans of leaves)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    rings, seg = 4, 48
    ph = rng.uniform(0, 6.28); sk = 0.32 * r
    ch, cm, cl = Vector(lin(hi)[:3]), Vector(lin(mid)[:3]), Vector(lin(lo)[:3])
    tips = [rng.uniform(0.0, 1.0) for _ in range(seg)]
    grid = []
    for i in range(rings + 2):
        rho = min(i, rings) / rings
        row = []
        for j in range(seg):
            th = 2 * math.pi * j / seg
            lobe = 1 + 0.13 * abs(math.sin(scallops * th / 2 + ph)) ** 0.7 + 0.04 * math.sin(13 * th + ph * 2)
            if i >= rings: lobe *= 1 + 0.12 * (tips[j] - 0.35) * (1 if j % 2 else -0.5)         # (ragged leaf tips at the rim)
            rr = r * rho * (lobe if rho > 0.6 else 1.0) if i <= rings else r * lobe * 0.97
            zz = c[2] + 0.5 * r * (1 - rho ** 2) - 0.2 * r - (sk if i > rings else 0)
            row.append(bm.verts.new((c[0] + math.cos(th) * rr, c[1] + math.sin(th) * rr, zz)))
        grid.append(row)
    for i in range(rings + 1):
        for j in range(seg):
            f = bm.faces.new([grid[i][j], grid[i][(j + 1) % seg], grid[i + 1][(j + 1) % seg], grid[i + 1][j]]); f.smooth = True
            for loop in f.loops:
                v = loop.vert.co
                north = (v.y - c[1]) / r                                   # (-1 the camera's side .. +1 the far side)
                rho_ = math.hypot(v.x - c[0], v.y - c[1]) / (r * 1.1)
                # soft mottling in the plan (blobs ~0.4 units, as the frame's leaf masses), not wedges: the frame's clumps have no star
                mott = 0.11 * (math.sin(2.6 * v.x + ph) * math.sin(2.3 * v.y - ph * 1.3) + 0.6 * math.sin(4.1 * v.x - 3.7 * v.y + ph * 0.7))
                t = max(0.0, min(1.0, 0.45 - 0.4 * north + 0.35 * rho_ ** 2 + mott))
                base = ch.lerp(cm, t / 0.5) if t < 0.5 else cm.lerp(cl, (t - 0.5) / 0.5)
                loop[col] = lit_up(list(base * (0.72 if i > rings else 1.0)), v)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


SUN_TO = Vector((-0.095, -0.401, 0.911)).normalized()      # (towards the game's sun: its rays travel along (0.095, 0.401, -0.911))


def cauliflower(name, c, r, hi, mid, lo, n_rim=18, n_top=0):
    """A clump as the frame draws it (4x crops at 626.0 s): a soft flattened dome whose edge is a ring of small rounded bumps and whose
    top carries an inner ring of leaf bumps; shaded as a softly lit shape (the game's light on each vertex's normal, ambient 0.52 + sun
    0.48), the shade mapped onto the frame's palette (lo .. mid .. hi), mottled, with the shafts' light added."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    ph = rng.uniform(0, 6.28)
    parts = [((c[0], c[1], c[2]), (r * 1.0, r * 1.0, r * 0.6), 2),
             ((c[0] + r * 0.08, c[1] + r * 0.12, c[2] + 0.22 * r), (r * 0.66, r * 0.62, r * 0.42), 2)]      # (the dome, and its raised inner terrace: the frame's crescent of leaves)
    for i in range(n_rim):
        a = 2 * math.pi * i / n_rim + ph + rng.uniform(-0.1, 0.1); rr = r * rng.uniform(0.15, 0.21)
        parts.append(((c[0] + math.cos(a) * r * 0.93, c[1] + math.sin(a) * r * 0.93, c[2] - 0.08 * r), (rr, rr, rr * 0.75), 1))
    for i in range(n_top):
        a = 2 * math.pi * i / n_top + ph * 1.7; rr = r * rng.uniform(0.24, 0.32)
        parts.append(((c[0] + math.cos(a) * r * 0.48, c[1] + math.sin(a) * r * 0.48, c[2] + 0.38 * r), (rr, rr, rr * 0.7), 1))
    for (px, py, pz), (ax, ay, az), sub in parts:
        geom = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        for v in geom['verts']: v.co = Vector((px + v.co.x * ax, py + v.co.y * ay, pz + v.co.z * az))
    ch, cm, cl = Vector(lin(hi)[:3]), Vector(lin(mid)[:3]), Vector(lin(lo)[:3])
    for f in bm.faces:
        f.smooth = True
    bm.normal_update()
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co; n = loop.vert.normal
            shade = -0.32 + 1.0 * max(0.0, n.dot(SUN_TO)) - 0.42 * max(0.0, -n.z)        # (calibrated to the frame's lightness: red L p10/50/90 131/139/156)
            shade += 0.09 * (math.sin(2.6 * v.x + ph) * math.sin(2.3 * v.y - ph) + 0.6 * math.sin(4.1 * v.x - 3.7 * v.y + ph))
            t = max(0.0, min(1.0, shade + 0.9 * max(0.0, shade - 0.55)))      # (the sun-facing tops reach the light tone, as the frame's p90)
            base = cl.lerp(cm, t / 0.6) if t < 0.6 else cm.lerp(ch, (t - 0.6) / 0.4)
            loop[col] = lit_up(list(base), v)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


PAL = dict(r=('#f08b66', '#c96459', '#bb5e5c'), g=('#e6cc66', '#cdb35c', '#bca056'))      # (the frame's clusters, by share: mostly the middle two)
MASS = J('art/autumn_glade/canopy_mass.json') if os.path.exists(os.path.join(ROOT, 'art/autumn_glade/canopy_mass.json')) else None      # (canopy_mass.py)


def canopy_mass(name, data, hi, mid, lo):
    """canopy_mass.py's mesh: the frame's canopy outline, the fitted clumps' surface; shaded as a clump is (the game's light on its
    normals, calibrated to the frame's lightness, mottled)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    vs = [bm.verts.new((x, YC + y, z)) for x, y, z in data['verts']]
    dd = {v: d_ for v, d_ in zip(vs, data['d'])}
    for q in data['faces']:
        try: bm.faces.new([vs[i] for i in q])
        except ValueError: pass
    for f in bm.faces:
        f.smooth = True; f.normal_update()
        if f.normal.z < 0: f.normal_flip()
    bm.normal_update()
    ch, cm, cl = Vector(lin(hi)[:3]), Vector(lin(mid)[:3]), Vector(lin(lo)[:3]); ph = 1.3
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co; n = loop.vert.normal
            shade = -0.32 + 1.0 * max(0.0, n.dot(SUN_TO)) - 0.42 * max(0.0, -n.z)
            shade += 0.09 * (math.sin(2.6 * v.x + ph) * math.sin(2.3 * v.y - ph) + 0.6 * math.sin(4.1 * v.x - 3.7 * v.y + ph))
            d_ = dd[loop.vert]
            shade += 0.06 * (1 - min(d_, 1.0)) - 0.22 * max(0.0, min(d_, 1.1) - 0.72) / 0.38      # (a clump's heart lighter, its rim dark over the clump below)
            t = max(0.0, min(1.0, shade + 0.9 * max(0.0, shade - 0.55)))
            base = cl.lerp(cm, t / 0.6) if t < 0.6 else cm.lerp(ch, (t - 0.6) / 0.4)
            loop[col] = list(base) + [1.0]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


TM = J('art/autumn_glade/trunk_mass.json') if os.path.exists(os.path.join(ROOT, 'art/autumn_glade/trunk_mass.json')) else None      # (trunk_mass.py)


def trunk_mass(name, data):
    """trunk_mass.py's patch: the trunk where the frame shows it, on the vertical plane through it; our pale birch and its navy dashes,
    shaded across as a cylinder (lighter in the middle, darker to the sides, a little darker to the right)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    vs = [bm.verts.new((x, YC + y - 0.05, z)) for x, y, z in data['verts']]      # (a hair in front of its own core)
    info = {v: (nv, a) for v, nv, a in zip(vs, data['navy'], data['across'])}
    for q in data['faces']:
        try: bm.faces.new([vs[i] for i in q])
        except ValueError: pass
    pale_, navy_ = Vector(lin('#c7cbea')[:3]), Vector(lin('#5b618b')[:3])
    for f in bm.faces:
        for loop in f.loops:
            nv, a = info[loop.vert]
            k_ = 1.0 - 0.35 * abs(2 * a - 1) ** 2 - 0.1 * a
            loop[col] = list((navy_ if nv else pale_) * k_) + [1.0]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


FIT = J('art/autumn_glade/lumps.json') if os.path.exists(os.path.join(ROOT, 'art/autumn_glade/lumps.json')) else None      # (fit_trees.py)
for k, t in enumerate(L['trees']):
    foot = at(t['plan']); lumps = (FIT[k] if FIT else t.get('lumps')) or [dict(x=0, z=5.0, r=2.4)]
    hi, mid, lo = PAL[t['kind']]
    top = max(lumps, key=lambda q: q['z'])
    low = min(lumps, key=lambda q: q['z'])
    trunk(f'TRUNK_{k}', foot[:2], (foot[0], foot[1], low['z']), 0.42 if TM is None or TM[k] is None else 0.22, 0.32 if TM is None or TM[k] is None else 0.18)      # (a thin core where trunk_mass draws what the frame shows)
    if TM is not None and TM[k] is not None: trunk_mass(f'TRUNKMASS_{k}', TM[k])
    for j, lump in sorted(enumerate(lumps), key=lambda q: q[1]['z']):
        cpx, cpy = to_px(foot[0] + lump['x'], foot[1], lump['z'])
        if MASS is not None and 0 <= cpx < 1920 and 0 <= cpy < 1080: continue      # (in the frame: the measured canopy mass draws it)
        cauliflower(f'CANOPY_{k}_{j}', (foot[0] + lump['x'], foot[1], lump['z']), lump['r'] * 1.08, hi, mid, lo)


if MASS is not None:
    for kind_, data_ in MASS.items(): canopy_mass(f'CANOPY_MASS_{kind_}', data_, *PAL[kind_])


# ---------------------------------------------------------------------------------------------------------------- beyond the frame
# the big foreground foliage at the frame's corners (props.py 'foreground'): a few overlapping umbrellas high over the sand, no trunk
for k, fgm in enumerate(L['foreground']):
    c = at(fgm['plan']); base = fgm['colour']
    for j, (dx, dy, sc_) in enumerate(((0, 0, 1.0), (0.55, 0.2, 0.8), (-0.5, -0.25, 0.75), (0.1, 0.65, 0.7))):
        umbrella(f'FOREGROUND_{k}_{j}', (c[0] + dx * fgm['r'], c[1] + dy * fgm['r'], fgm['z'] + 0.3 * j), fgm['r'] * sc_, '#f2705c', base, '#d4503f', scallops=7)


_th = math.radians(CAM['pitchDeg'])
_R = [[1, 0, 0], [0, -math.sin(_th), -math.cos(_th)], [0, math.cos(_th), -math.sin(_th)]]


def on_screen(x, y, z, margin=-90):
    """Is the point (plan x, y, height z) inside the HQ frame, with `margin` px to spare (negative: only well inside)? The camera rig of measure.py."""
    v = [(x / 100 - CAM['centre'][0]), ((y + YC) / 100 - CAM['centre'][1]), (z / 100 - CAM['centre'][2])]
    w = [sum(_R[i][j] * v[j] for j in range(3)) for i in range(3)]
    cx, cy = CAM['focalPx'] * w[0] / w[2] + 960, CAM['focalPx'] * w[1] / w[2] + 540
    px_, py_ = 960 + (cx - 960) * CAM['referenceZoom'], 540 + (cy - 540) * CAM['referenceZoom']
    return -margin < px_ < 1920 + margin and -margin < py_ < 1080 + margin


def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


# the trees round the frame (the world goes on past it and the camera follows players out there): our own, in the frame's style, on a
# jittered grid outside the frame's footprint, a third gold; each with its trunk, two to four umbrellas and the shadow the frame's trees throw
FR = L['frame']; fcx = sum(p[0] for p in FR) / 4; fcy = sum(p[1] for p in FR) / 4
FRAME_WIDE = [(fcx + (p[0] - fcx) * 1.05, fcy + (p[1] - fcy) * 1.05) for p in FR]
orng = random.Random(77); no = 0
for gx in range(-56, 64, 11):
    for gy in range(-46, 48, 10):
        x, y = gx + orng.uniform(-2.5, 2.5), gy + orng.uniform(-2.2, 2.2)
        if not (-54 < x < 60 and -46 < y < 46): continue      # (a player is out of bounds long before this)
        if inside((x, y), FRAME_WIDE) or on_screen(x, y, 0.0, 140) or on_screen(x, y, 8.0, 140): continue      # (nor a canopy that reaches into the frame)
        kind = 'g' if orng.random() < 0.3 else 'r'; hi, mid, lo = PAL[kind]
        foot = at((x, y)); n = orng.choice((2, 2, 3)); zs = sorted(orng.uniform(5.0, 9.0) for _ in range(n))
        lumps = [dict(x=orng.uniform(-1.6, 1.6), z=zs[i], r=orng.uniform(2.0, 3.2)) for i in range(n)]
        trunk(f'OTRUNK_{no}', foot[:2], (foot[0] + sum(q['x'] for q in lumps) / n, foot[1], zs[-1] - 0.3), 0.62, 0.42, rings=4, seg=6)
        for j, lump in enumerate(lumps): umbrella(f'OCANOPY_{no}_{j}', (foot[0] + lump['x'], foot[1], lump['z']), lump['r'], hi, mid, lo, scallops=orng.choice((6, 7, 8)))
        flat(f'OSHADOW_{no}', oval(x - 1.7, y - 0.2, 7.0, 5.0, orng.uniform(-15, 15), 14), COL['shadow'], 0.03); no += 1


# ---------------------------------------------------------------------------------------------------------------- logs
def log(name, a, b, radius=0.65, mat=None):
    a, b = Vector(at(a, radius)), Vector(at(b, radius))
    bm = bmesh.new(); ax = (b - a).normalized(); side = ax.cross(Vector((0, 0, 1))).normalized(); up = ax.cross(side).normalized()
    seg = 14; rings = [bm.verts.new(a + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * radius) for k in range(seg)]
    rings2 = [bm.verts.new(b + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * radius) for k in range(seg)]
    for k in range(seg):
        f = bm.faces.new([rings[k], rings[(k + 1) % seg], rings2[(k + 1) % seg], rings2[k]]); f.smooth = True; f.material_index = 0
    for ring in (rings, rings2):
        f = bm.faces.new(ring); f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [mat or LOG_SIDE, LOG_END])


LOGS = J('art/autumn_glade/logs.json')[:2] + [dict(ends=L['log3']['ends'], r=0.62)]      # (fit_logs.py; the third lies in the shafts: its measured ends)
# the third log lies in a shaft: the frame shows it #8d5e50 where the other two are #7b4d52 (ours #7d5258): its own base, scaled by the ratio
LOG_SHAFT = lit('log_shaft', '#%02x%02x%02x' % tuple(min(255, round(int(scale_hex('#7a4c52', 1 / TOP)[i:i + 2], 16) * k)) for i, k in ((1, 141 / 125), (3, 94 / 82), (5, 80 / 88))))
for k, lg in enumerate(LOGS): log(f'LOG_{k}', lg['ends'][0], lg['ends'][1], lg['r'], LOG_SHAFT if k == 2 else None)


# ---------------------------------------------------------------------------------------------------------------- rocks and portals
def rock(name, b, e1, e2):
    """One block of a rock (fit_rocks.py: a superellipsoid, squarish in the plan, flat-topped with rounded edges), on the ground."""
    cx, cy, w, d, h = b['cx'], b['cy'], b['w'], b['d'], b['h']
    sg = lambda v: 1.0 if v >= 0 else -1.0
    bm = bmesh.new(); NU, NV = 12, 40; rows = []
    for i in range(NU + 1):
        u = (math.pi / 2) * i / NU
        row = []
        for j in range(NV):
            v = 2 * math.pi * j / NV
            fx, fy = sg(math.cos(v)) * abs(math.cos(v)) ** e2, sg(math.sin(v)) * abs(math.sin(v)) ** e2
            k_ = abs(math.cos(u)) ** e1
            row.append(bm.verts.new((cx + w * fx * k_, YC + cy + d * fy * k_, h * abs(math.sin(u)) ** e1)))
        rows.append(row)
    for i in range(NU):
        for j in range(NV):
            f = bm.faces.new([rows[i][j], rows[i][(j + 1) % NV], rows[i + 1][(j + 1) % NV], rows[i + 1][j]]); f.smooth = True
    f = bm.faces.new(rows[NU]); f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.material_index = 0 if f.normal.z > 0.55 else 1
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [ROCK, ROCK_SIDE])


RM = J('art/autumn_glade/rock_mass.json') if os.path.exists(os.path.join(ROOT, 'art/autumn_glade/rock_mass.json')) else None      # (rock_mass.py)
if RM is None:
    for r_ in J('art/autumn_glade/rocks.json'):
        for i, b_ in enumerate(r_['blocks']): rock(f"ROCK_{r_['side']}_{i}", b_, r_['e1'], r_['e2'])
else:
    # the rocks as the frame shows them: rock_mass.py's surface on the fitted blocks, the frame's outline; lit, tops and sides
    for rm in RM:
        bm = bmesh.new(); vs = [bm.verts.new((x, YC + y, z)) for x, y, z in rm['verts']]
        for q in rm['faces']:
            try: bm.faces.new([vs[i] for i in q])
            except ValueError: pass
        camv = Vector(tuple(v * 100 for v in CAM['centre']))
        for f in bm.faces:
            f.smooth = True; f.normal_update()
            if f.normal.dot(f.calc_center_median() - camv) > 0: f.normal_flip()      # (every face towards the camera: its grid was the screen's)
        bm.normal_update()
        for f in bm.faces: f.material_index = 0 if f.normal.z > 0.55 else 1
        me = bpy.data.meshes.new('ROCK_' + rm['side']); bm.to_mesh(me); bm.free(); obj('ROCK_' + rm['side'], me, [ROCK, ROCK_SIDE])


def portal(name, p):
    """A vertical sheet of cyan zigzag (an N) standing on the foot, face to the camera, and the glow it throws on the sand."""
    x0, y0 = p['foot']; hw, ht = p['halfWidth'], p['height']
    mir = 1 if p['side'] == 'W' else -1
    PF = J('art/autumn_glade/portal.json')      # (fit_portal.py: the N's proportions and each portal's shift, fitted to the frame's cyan)
    x0 += mir * PF['dx'][p['side']]
    # the glow first (fit_glow.py: measured round the west portal, the east's mirrored): a Gaussian of 2 sigma = GR plan units from the
    # sand's colour to a white-cyan heart, as concentric discs on the sand
    GW = next(g for g in J('art/autumn_glade/glow.json') if g['side'] == 'W'); WP = next(q for q in L['portals'] if q['side'] == 'W')
    off = (GW['centre'][0] - WP['foot'][0], GW['centre'][1] - WP['foot'][1]); GR = (GW['rx'] + GW['ry']) / 2
    gx, gy = p['foot'][0] + mir * off[0], p['foot'][1] + off[1]
    heart_, sand_ = Vector(lin(GW['heart'])[:3]), Vector(lin(J('art/autumn_glade/ground_field.json')['base'])[:3])
    for i in range(20):
        rad = GR * 1.1 * (1 - i / 20) + 0.05
        w_ = math.exp(-0.5 * (rad / (GR / 2)) ** 2)
        c_ = sand_.lerp(heart_, w_)
        pts = [(gx + math.cos(a * math.pi / 14) * rad, gy + math.sin(a * math.pi / 14) * rad) for a in range(28)]
        flat(f'GLOW_{name}_{i}', pts, '#%02x%02x%02x' % tuple(int(round(srgb(v) * 255)) for v in c_), 0.04 + 0.002 * i)
    def sheet(pts, hex_, dy):
        bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
        face = bm.faces.new([bm.verts.new((x0 + mir * px, YC + y0 - 0.02 * dy, pz)) for px, pz in pts])
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='EAR_CLIP')
        for f in bm.faces:
            f.normal_update()
            if f.normal.y > 0: f.normal_flip()
            for loop in f.loops: loop[col] = lin(hex_)
        me = bpy.data.meshes.new(name + '_s'); bm.to_mesh(me); bm.free()
        return obj(name + '_s', me, [FLAT])
    W, H_ = hw, ht
    # the frame's N (3x crops at 626.0 s): a thick bright left stroke with a pale heart, set in the rock's dark recess; a thin line from
    # its top down to the bottom middle and a thin line back up on the right; all within the cyan mask's box (-W .. W)
    sheet([(-W * 1.05, 0), (-W * 0.6, 0), (-W * 0.6, H_ * 1.02), (-W * 1.05, H_ * 1.02)], '#34437a', -1)          # (the recess, behind)
    t0, t1, d0, d1, r1 = PF['t0'], PF['t1'], PF['d0'], PF['d1'], PF['r1']
    sheet([(-W * t0, 0.05), (W * t1, 0.05), (W * t1 + 0.08 * W, H_ * 0.95), (-W * t0 + 0.07 * W, H_ * 0.97)], '#36dfee', 0)    # (the thick stroke)
    hl, hr = -W * t0 + 0.25 * (W * t1 + W * t0), W * t1 - 0.25 * (W * t1 + W * t0)
    sheet([(hl, 0.3), (hr, 0.3), (hr + 0.05 * W, H_ * 0.85), (hl + 0.05 * W, H_ * 0.87)], '#72ecf3', 1)                         # (its paler heart: still cyan, as the frame's)
    for (ax_, az_), (bx_, bz_), wd in (((W * d0, H_ * 0.95), (W * d1, 0.08), PF['wd']), ((W * d1, 0.08), (W * r1, H_ * 0.92), PF['wr'])):
        n = math.hypot(bx_ - ax_, bz_ - az_); nx, nz = -(bz_ - az_) / n * wd, (bx_ - ax_) / n * wd
        sheet([(ax_ - nx, az_ - nz), (ax_ + nx, az_ + nz), (bx_ + nx, bz_ + nz), (bx_ - nx, bz_ - nz)], '#3fe3ef', 1)


for k, p in enumerate(L['portals']): portal(f'PORTAL_{k}', p)
# the pale paving stones at the frame's top-right edge (props.py): low flat-topped slabs, lit
for k, ps in enumerate(L.get('pale_stones', [])):
    rock(f'PAVING_{k}', dict(cx=ps['plan'][0], cy=ps['plan'][1], w=ps['half'], d=ps['half'] * 0.8, h=0.6), 0.3, 0.3)
    bpy.data.objects[f'PAVING_{k}'].data.materials[0] = lit(f'paving_{k}', scale_hex(ps['colour'], 1 / TOP))

# ---------------------------------------------------------------------------------------------------------------- camera, light, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * CAM['referenceZoom'] / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
# the game's light (render/three/softLook.ts): ambient 0.52, a sun of 0.4812 toward [-0.0949, 0.9111, 0.4012]
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 0.4812 * math.pi; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(24.4), 0, math.radians(-13.3))
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False); so.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'glade.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
_g = {}
for _o in bpy.data.objects:
    if _o.type == 'MESH': _k = _o.name.split('_')[0]; _g[_k] = _g.get(_k, 0) + len(_o.data.polygons)
print('polygons by group:', dict(sorted(_g.items(), key=lambda t: -t[1])[:8]))
print('glade built:', len(L['trees']), 'trees,', len(L['shadows']), 'shadows, polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
