"""The temple court in 3D, object by object (2026-11-07): ff physics hq 2.mp4 2:01 (121.5 s), seen through the game's camera.

  Blender -b --python art/temple_court/blender/build.py -- <out_dir> [render [plants]]

Our own models, flat-coloured as the HQ's are (unlit vertex colours: each face its measured tone, lit from the east as the frame's
shadows fall west): the paving and its painted border (floor.py), the lavender planters (fit_planters.py), the three trees, the
buildings' wings (plinth, shoji wall, red tiled roof), the corner towers, the east wall's arch gate, the two gates at the bottom,
the statues' slab with its fork and knife, the banners, the lanterns, the still shadows, and the outskirts. The hex fields are the
game's (render/three/hexPlantsView.ts, manifest `plants`); with `plants` the render adds them at rest, for comparing with the frame.
Exports court.glb; with `render`, also render.png through the HQ's camera.
"""
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER, PLANTS = args[0], 'render' in args[1:], 'plants' in args[1:]
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
CAM = J('art/sky_islands/camera.json')
L = J('art/temple_court/layout.json')
FL = J('art/temple_court/floor.json')
PL = J('art/temple_court/planters.json')
YC = 73.72                                       # (measure.py: the ground point under the frame's centre)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
rng = random.Random(7)
SUN = Vector((0.8, 0.25, 0.75)).normalized()     # (towards the light: the frame's shadows fall west, a little south)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def mix(a, b, t):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(x + (y - x) * t))) for x, y in zip(ca, cb))


def unlit(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(attr.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


FLAT = unlit('flat')


class Mesh:
    """A mesh built face by face, each face one colour (hex) or a colour per corner."""

    def __init__(self, name):
        self.name, self.bm = name, bmesh.new(); self.col = self.bm.loops.layers.float_color.new('Col')

    def face(self, pts, colour, flip_up=False):
        vs = [self.bm.verts.new(p) for p in pts]
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        f.normal_update()
        if flip_up and f.normal.z < 0: f.normal_flip()
        cs = colour if isinstance(colour, list) else [colour] * len(vs)
        for loop, c in zip(f.loops, cs if not (flip_up and f.normal.z < 0) else cs): loop[self.col] = lin(c)
        return f

    def poly(self, pts2, z, colour):
        """A flat polygon (plan x, y) at height z, facing up, triangulated."""
        vs = [self.bm.verts.new((x, YC + y, z)) for x, y in pts2]
        for tri in tessellate_polygon([[Vector((x, y, 0)) for x, y in pts2]]):
            try: f = self.bm.faces.new([vs[i] for i in tri])
            except ValueError: continue
            f.normal_update()
            if f.normal.z < 0: f.normal_flip()
            for loop in f.loops: loop[self.col] = lin(colour)

    def done(self, parent=None):
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        o = bpy.data.objects.new(self.name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
        if parent is not None: o.parent = parent
        return o


def shade(top, side, n, back=None):
    """A face's tone from its normal: `top` facing up, `side` facing us (south), lighter to the east, darker to the west."""
    n = Vector(n).normalized()
    t = max(0.0, n.z)
    c = mix(side, top, t)
    lit = n.x * 0.5                                  # (east +, west -)
    if lit > 0: c = mix(c, top, min(1, lit * 0.6))
    elif back is not None: c = mix(c, back, min(1, -lit * 1.2))
    return c


def prism(m, poly, z0, z1, top, side, back=None, top_colour=None):
    """A vertical prism over a plan polygon (counter-clockwise), its sides toned by their facing."""
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        nx, ny = (y1 - y0), -(x1 - x0)
        m.face([(x0, YC + y0, z0), (x1, YC + y1, z0), (x1, YC + y1, z1), (x0, YC + y0, z1)], shade(top, side, (nx, ny, 0), back))
    m.poly(poly, z1, top_colour or top)


def offset_poly(poly, d):
    """A convex counter-clockwise polygon moved in by d (its corners on the bisectors)."""
    n = len(poly); out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n0, n1 = Vector((-e0.y, e0.x)), Vector((-e1.y, e1.x))
        b = (n0 + n1); b = b / max(1e-6, b.length); cosh = max(0.3, b.dot(n0))
        out.append(tuple(p1 + b * d / cosh))
    return out


def stone(m, poly, z0, z1, bevel=0.3, jitter=0.08, top=None, side=None, back=None):
    """A soft lavender pillow stone (owner, 2026-11-11: the HQ's look; the frame's slab, gate bases and plinths at 3x): a rounded,
    slightly uneven outline with a chip here and there, its sides bulging a little, its top edges rounded off into a broad top;
    each face toned by its facing. A four-cornered footprint (a rectangle, turned or not); any other: the old bevelled prism."""
    if len(poly) != 4: return stone_prism(m, poly, z0, z1, bevel, jitter, top, side, back)
    top, side, back = top or P['stone_top'], side or P['stone_side'], back or P['stone_back']
    poly = ccw(poly); c = sum((Vector(q) for q in poly), Vector((0, 0))) / 4
    ux = (Vector(poly[1]) - Vector(poly[0])); hw = ux.length / 2; ux.normalize()
    uy = (Vector(poly[3]) - Vector(poly[0])); hd = uy.length / 2; uy.normalize()
    rc = min(hw, hd) * 0.28; N = 64
    ph = [rng.uniform(0, 6.28) for _ in range(3)]
    chips = [(rng.uniform(0, 1), rng.uniform(0.04, 0.09), rng.uniform(0.08, 0.2)) for _ in range(rng.choice((1, 2, 3)))]
    def outline(d):
        """The rounded rectangle d in from the footprint (N points, counter-clockwise), with the stone's own unevenness."""
        a_, b_, r_ = hw - d, hd - d, max(0.02, rc - d); pts = []
        for i in range(N):
            t = i / N; th = 2 * math.pi * t
            # (a point of the rounded rectangle: the perimeter walked by length, straight sides and quarter circles r_ at the corners)
            x, y = rounded_rect(a_, b_, r_, t)
            n = 1 + jitter * 0.5 * (math.sin(3 * th + ph[0]) + 0.6 * math.sin(7 * th + ph[1]) + 0.4 * math.sin(13 * th + ph[2])) / max(a_, b_)
            for at, w, depth in chips:
                dt = min(abs(t - at), 1 - abs(t - at))
                if dt < w: n -= depth * (1 - dt / w) / max(a_, b_)
            pts.append(c + ux * x * n + uy * y * n)
        return pts
    H_ = z1 - z0; bv = min(bevel, H_ * 0.45)
    rings = [(outline(0.0), z0), (outline(-0.04), z0 + H_ * 0.35), (outline(0.0), z1 - bv), (outline(bv * 0.45), z1 - bv * 0.2), (outline(bv), z1)]
    for (ra, za), (rb, zb) in zip(rings, rings[1:]):
        for i in range(N):
            j = (i + 1) % N
            q = [(ra[i].x, YC + ra[i].y, za), (ra[j].x, YC + ra[j].y, za), (rb[j].x, YC + rb[j].y, zb), (rb[i].x, YC + rb[i].y, zb)]
            n_ = (Vector(q[1]) - Vector(q[0])).cross(Vector(q[3]) - Vector(q[0]))
            if n_.length < 1e-9: continue
            m.face(q, shade(top, side, tuple(n_.normalized()), back))
    m.poly([(v.x, v.y) for v in rings[-1][0]], z1, top)


def rounded_rect(a, b, r, t):
    """The point at fraction t round a rectangle 2a x 2b with corners rounded by r (counter-clockwise, from its east side's middle):
    each quarter is a straight run then a quarter circle then a straight run, by arc length."""
    r = max(1e-4, min(r, a, b)); t = t % 1.0
    q = int(t * 4); u = t * 4 - q                                  # (which quarter, and how far into it)
    sx, sy = [(1, 1), (-1, 1), (-1, -1), (1, -1)][q]
    l1, l2, arc = b - r, a - r, math.pi * r / 2                    # (the quarter: up the side, round the corner, along the top)
    if q % 2: l1, l2 = l2, l1
    d = u * (l1 + arc + l2)
    if q % 2 == 0:
        if d <= l1: return sx * a, sy * d
        if d <= l1 + arc: th = (d - l1) / r; return sx * ((a - r) + r * math.cos(th)), sy * ((b - r) + r * math.sin(th))
        return sx * (a - r - (d - l1 - arc)), sy * b
    if d <= l1: return sx * d, sy * b
    if d <= l1 + arc: th = (d - l1) / r; return sx * ((a - r) + r * math.sin(th)), sy * ((b - r) + r * math.cos(th))
    return sx * a, sy * (b - r - (d - l1 - arc))


def stone_prism(m, poly, z0, z1, bevel=0.3, jitter=0.08, top=None, side=None, back=None):
    """A rough lavender stone: a prism whose top edges are bevelled, its corners a little uneven (the HQ's chunky stones)."""
    top, side, back = top or P['stone_top'], side or P['stone_side'], back or P['stone_back']
    poly = ccw(poly); n = len(poly)
    J = lambda: rng.uniform(-jitter, jitter)
    lo = [(x + J(), y + J(), z0) for x, y in poly]
    mid = [(x + J(), y + J(), z1 - bevel + J()) for x, y in poly]
    up = [(x + J(), y + J(), z1 + J() * 0.5) for x, y in offset_poly(poly, bevel)]
    for i in range(n):
        j = (i + 1) % n
        nx, ny = (poly[j][1] - poly[i][1]), -(poly[j][0] - poly[i][0])
        c = shade(top, side, (nx, ny, 0), back)
        m.face([(a[0], YC + a[1], a[2]) for a in (lo[i], lo[j], mid[j], mid[i])], c)
        m.face([(a[0], YC + a[1], a[2]) for a in (mid[i], mid[j], up[j], up[i])], mix(c, top, 0.55))
    m.poly([(u[0], u[1]) for u in up], sum(u[2] for u in up) / n, top)


def ccw(poly):
    a = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return poly if a > 0 else poly[::-1]


def box(m, cx, cy, hw, hd, z0, z1, top, side, back=None, yaw=0.0):
    c, s = math.cos(yaw), math.sin(yaw)
    pts = [(cx + c * x - s * y, cy + s * x + c * y) for x, y in [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]]
    prism(m, pts, z0, z1, top, side, back)


# ------------------------------------------------------------------------------------------------------------------------ palette
P = dict(ground='#f8e68a', ground_shadow='#cbcb81', court='#f9f7e4', court_joint='#efecd8', court_shadow='#f3e8a9', tree_shadow='#d6e3df',
         stone_top='#a28cb4', stone_side='#7d6f9f', stone_back='#6c5f8c', stone_inner='#6a5f80', soil='#dbda7d', soil_leaf='#c9cf6a',
         trunk='#7a6c9d', trunk_dark='#615683', leaf=['#cdd986', '#bccb6e', '#adc161', '#9db657'],
         shoji='#f2e8cf', shoji_shade='#e0d4b8', timber='#3e2c2f', roof='#d0545a', roof_light='#e06664', roof_dark='#a83e47', ridge='#3e2c2f',
         beam='#584846', beam_dark='#3f3232', fork='#8fb08f', fork_dark='#76987a', blade='#7fa088', handle='#6e4b3a', eye='#1a1a1a',
         cloth='#efe9dc', cloth_shade='#d7d0c2', pole='#3a2f2e', lantern='#f3a032', lantern_light='#ffcf5a', lamp_stone='#8f86a6')

# ------------------------------------------------------------------------------------------------------------------------ ground
GF = J('art/temple_court/ground_field.json')
bgr_hex = lambda c: '#%02x%02x%02x' % (c[2], c[1], c[0])
edge = bgr_hex(GF['bgr'][0])
g = Mesh('GROUND')
g.poly([(-140, -100), (140, -100), (140, 110), (-140, 110)], -0.01, bgr_hex(GF['bgr'][GF['nx'] * (GF['ny'] // 2)]))
# the measured field (ground_field.py): each corner its cell's colour, smooth across the faces
for j in range(GF['ny'] - 1):
    for i in range(GF['nx'] - 1):
        x0, y0 = GF['x0'] + i * GF['dx'], GF['y0'] + j * GF['dx']; x1, y1 = x0 + GF['dx'], y0 + GF['dx']
        c = lambda ii, jj: bgr_hex(GF['bgr'][jj * GF['nx'] + ii])
        g.face([(x0, YC + y0, 0), (x1, YC + y0, 0), (x1, YC + y1, 0), (x0, YC + y1, 0)], [c(i, j), c(i + 1, j), c(i + 1, j + 1), c(i, j + 1)])
g.done()
fl = Mesh('PAVING')
for k, band in enumerate(FL['bands']):
    for poly in band['polys']: fl.poly(poly, 0.02 + 0.015 * k, band['colour'])
for x0, y0, x1, y1 in J('art/temple_court/joints.json'):          # (the flagstones' faint joints: joints.py)
    d = Vector((x1 - x0, y1 - y0)); n = Vector((-d.y, d.x)).normalized() * 0.045
    fl.poly([(x0 - n.x, y0 - n.y), (x1 - n.x, y1 - n.y), (x1 + n.x, y1 + n.y), (x0 + n.x, y0 + n.y)], 0.125, P['court_joint'])
fl.done()
# the still shadows (shadow_mass.py): warm and cool on the paving, olive on the yellow ground under it
SM = J('art/temple_court/shadow_mass.json'); sh = Mesh('SHADOWS')
for name, z in (('olive', 0.008), ('warm', 0.14), ('cool', 0.15)):
    for poly in SM[name]['polys']: sh.poly(poly['pts'], z, SM[name]['colour'])
sh.done()

# ------------------------------------------------------------------------------------------------------------------------ planters
SOIL_DROP, RING = 0.45, 0.72                       # (the soil below the rim; the ring's width: planter 17's top at 4x)


def octagon(cx, cy, a, b, k):
    return [(cx + sx, cy + sy) for sx, sy in [(a, b * (1 - k)), (a * (1 - k), b), (-a * (1 - k), b), (-a, b * (1 - k)), (-a, -b * (1 - k)),
                                             (-a * (1 - k), -b), (a * (1 - k), -b), (a, -b * (1 - k))]]


for name, p in PL.items():
    m = Mesh(f'PLANTER_{name}')
    h = p['h']; outer = octagon(p['cx'], p['cy'], p['a'], p['b'], p['k'])
    # (the small rings' width and soil depth fitted with them: fit_rings.py; the big ones' measured at 4x)
    ring, SOIL_DROP = p.get('ring', RING), p.get('drop', 0.45)
    ia, ib = p['a'] - ring, p['b'] - ring
    inner = octagon(p['cx'], p['cy'], ia, ib, p['k']) if 'ring' in p else octagon(p['cx'], p['cy'], ia, ib, p['k'] * min(1.0, (p['a'] / ia)) * 0.9)
    # the ring: eight chunky stones, each its own block (owner, 2026-11-11: the HQ's look; the frame's rings at 3x): a dark seam
    # between neighbours, each top edge rounded off (a bevel a little lighter than the side), each block's height and tone its own
    G_, BV = 0.05, 0.16
    for i in range(8):
        o0, o1, i0, i1 = outer[i], outer[(i + 1) % 8], inner[i], inner[(i + 1) % 8]
        # (each block pulled back from its ends by half the seam)
        sh = lambda a, b, t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        lo0, lo1 = math.hypot(o1[0] - o0[0], o1[1] - o0[1]), math.hypot(i1[0] - i0[0], i1[1] - i0[1])
        o0, o1 = sh(o0, o1, G_ / lo0), sh(o0, o1, 1 - G_ / lo0); i0, i1 = sh(i0, i1, G_ / lo1), sh(i0, i1, 1 - G_ / lo1)
        dz = rng.uniform(-0.07, 0.07); hz = h + dz
        nx, ny = (o1[1] - o0[1]), -(o1[0] - o0[0]); nl = math.hypot(nx, ny); nx, ny = nx / nl, ny / nl
        tone = mix(P['stone_top'], '#ffffff', rng.uniform(-0.03, 0.06))
        side = shade(P['stone_top'], P['stone_side'], (nx, ny, 0), P['stone_back'])
        # the top, set in from the outer edge by the bevel; the bevel; the outer side
        oi0, oi1 = (o0[0] - nx * BV, o0[1] - ny * BV), (o1[0] - nx * BV, o1[1] - ny * BV)
        m.face([(oi0[0], YC + oi0[1], hz), (oi1[0], YC + oi1[1], hz), (i1[0], YC + i1[1], hz), (i0[0], YC + i0[1], hz)][::-1], tone, flip_up=True)
        m.face([(o0[0], YC + o0[1], hz - BV), (o1[0], YC + o1[1], hz - BV), (oi1[0], YC + oi1[1], hz), (oi0[0], YC + oi0[1], hz)], mix(side, tone, 0.5), flip_up=True)
        m.face([(o0[0], YC + o0[1], 0), (o1[0], YC + o1[1], 0), (o1[0], YC + o1[1], hz - BV), (o0[0], YC + o0[1], hz - BV)], side)
        m.face([(i1[0], YC + i1[1], h - SOIL_DROP), (i0[0], YC + i0[1], h - SOIL_DROP), (i0[0], YC + i0[1], hz), (i1[0], YC + i1[1], hz)],
               mix(P['stone_inner'], P['stone_side'], 0.4 if ny > 0 else 0.0))
        # the block's ends (seen through the seam: dark)
        for a_, b_ in ((o0, i0), (o1, i1)):
            m.face([(a_[0], YC + a_[1], 0), (b_[0], YC + b_[1], 0), (b_[0], YC + b_[1], hz), (a_[0], YC + a_[1], hz)], P['stone_back'])
    # the seams' dark floor, under the ring (what shows between two blocks)
    for i in range(8):
        a_, b_ = outer[i], inner[i]
        m.face([(a_[0], YC + a_[1], 0.05), (b_[0], YC + b_[1], 0.05), (b_[0], YC + b_[1], h - 0.1), (a_[0], YC + a_[1], h - 0.1)], '#5a4f78')
    m.poly(inner, h - SOIL_DROP, P['soil'])
    # fallen leaves on the big planters' soil
    if name.startswith('big'):
        for _ in range(int(ia * ib * 3.2)):
            x, y = p['cx'] + rng.uniform(-ia * 0.9, ia * 0.9), p['cy'] + rng.uniform(-ib * 0.85, ib * 0.85)
            r, a0 = rng.uniform(0.24, 0.38), rng.uniform(0, math.pi)
            m.poly([(x + r * math.cos(a0 + t) * (1 if j % 2 == 0 else 0.55), y + r * 0.6 * math.sin(a0 + t)) for j, t in enumerate([i * math.pi / 4 for i in range(8)])],
                   h - SOIL_DROP + 0.01, rng.choice(['#b9c65c', '#b1c158', '#c2cb62', '#a9bc55']))
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ trees
def tube(m, path, r0, r1, col, col_dark, seg=7):
    rings = []
    for i, p in enumerate(path):
        t = i / (len(path) - 1); r = r0 + (r1 - r0) * t
        d = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        a = d.orthogonal().normalized(); b = d.cross(a)
        rings.append([Vector(p) + (a * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            q = [rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]]
            n = (q[1] - q[0]).cross(q[3] - q[0])
            m.face([tuple(v) for v in q], col if n.x + 0.3 * n.y < 0.2 else col_dark)


def bezier(p0, p1, p2, n=8):
    return [tuple((1 - t) ** 2 * Vector(p0) + 2 * (1 - t) * t * Vector(p1) + t * t * Vector(p2)) for t in [i / (n - 1) for i in range(n)]]


def leaf_tone(lit):
    """The leaves' green for a facing (lit: its normal against the sun), blended smoothly between the measured four."""
    stops = [(-0.6, P['leaf'][3]), (-0.1, P['leaf'][2]), (0.35, P['leaf'][1]), (0.85, P['leaf'][0])]
    if lit <= stops[0][0]: return stops[0][1]
    for (a0, c0), (a1, c1) in zip(stops, stops[1:]):
        if lit <= a1: return mix(c0, c1, (lit - a0) / (a1 - a0))
    return stops[-1][1]


CROWN = [None]                                   # (the crown being built: its middle and size, for toning it as one mass)


def blob(m, centre, r, squash=0.8, detail=2):
    """A soft leafy lump: an icosphere, uneven, each corner toned mostly by where it is on the whole crown (lit from the sun's side)
    and a little by its own facing: the HQ's crowns read as one soft mass with lumps, not as balls."""
    tmp = bmesh.new(); bmesh.ops.create_icosphere(tmp, subdivisions=detail, radius=r)
    for v in tmp.verts:
        v.co.z *= squash; v.co *= rng.uniform(0.9, 1.08)
    tmp.normal_update()
    cc, cr = CROWN[0] if CROWN[0] is not None else (Vector(centre), r)
    def tone(v):
        p = Vector(centre) + v.co; g = ((p - cc) / cr)
        g.z *= 1.2
        return leaf_tone(0.7 * g.normalized().dot(SUN) * min(1.0, g.length) + 0.3 * v.normal.dot(SUN))
    for f in tmp.faces:
        m.face([tuple(Vector(centre) + v.co) for v in f.verts], [tone(v) for v in f.verts])
    tmp.free()


TM = J('art/temple_court/tree_mass.json') if HAS('art/temple_court/tree_mass.json') else None      # (tree_mass.py)


def smooth_boundary(bm, iters=3):
    bnd = {}
    for e in bm.edges:
        if len(e.link_faces) == 1:
            a, b = e.verts; bnd.setdefault(a, []).append(b); bnd.setdefault(b, []).append(a)
    for _ in range(iters):
        new = {v: v.co.copy() for v in bnd}
        for v, nb in bnd.items():
            if len(nb) == 2: new[v] = v.co * 0.5 + (nb[0].co + nb[1].co) * 0.25
        for v, c in new.items(): v.co = c


for k, t in enumerate(L['trees'] if TM is not None else []):
    # the trees as the frame shows them (tree_mass.py): the crown its outline and its traced leaf tones on the fitted volume, the trunk
    # forking into its arms (the frame's: #746e97 lit, a darker shaded side)
    root = bpy.data.objects.new(f'TREE_{k}_tree', None); sc.collection.objects.link(root)
    tm = TM[k]; m = Mesh(f'TREE_{k}_trunk')
    for j, arm in enumerate(tm['arms']):
        path = [(x, YC + y, z) for x, y, z in arm]      # (its upper part back in the crown: tree_mass.py)
        if j == 0: path = [(path[0][0], path[0][1], 0.0)] + path
        # (the frame's trunk ~20 px across at the soil, its arms about half that)
        tube(m, path, 0.55 if j == 0 else 0.27, 0.4 if j == 0 else 0.15, '#746e97', '#5f5a80')
    m.done(root)
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    vs = [bm.verts.new((x, YC + y, z)) for x, y, z in tm['verts']]; tone_of = {v: tm['tones'][q] for v, q in zip(vs, tm['tone'])}
    for q in tm['faces']:
        try: f_ = bm.faces.new([vs[i] for i in q])
        except ValueError: continue
        f_.normal_update()
        for loop in f_.loops: loop[col] = lin(tone_of[loop.vert])
    smooth_boundary(bm)
    me = bpy.data.meshes.new(f'TREE_{k}_crown'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f'TREE_{k}_crown', me); sc.collection.objects.link(o); me.materials.append(FLAT); o.parent = root

for k, t in enumerate(L['trees'] if TM is None else []):
    root = bpy.data.objects.new(f'TREE_{k}_tree', None); sc.collection.objects.link(root)
    fx, fy = t['foot']; cx, cy, cz = t['crown']; r = t['r']
    m = Mesh(f'TREE_{k}_trunk')
    rz_ = t.get('rz', r); foot = (fx, YC + fy, 0.9); top = (cx, YC + cy, cz - rz_ * 0.4)
    mid = ((fx + cx) / 2 + 0.6, YC + (fy + cy) / 2 - 0.2, (0.9 + cz) / 2)
    tube(m, bezier(foot, mid, top), 0.32, 0.16, P['trunk'], P['trunk_dark'])
    fork = bezier(foot, mid, top)[4]
    tube(m, bezier(fork, (fork[0] - 0.9, fork[1] + 0.2, fork[2] + 0.9), (cx - r * 0.55, YC + cy - 0.4, cz - rz_ * 0.65), 5), 0.15, 0.08, P['trunk'], P['trunk_dark'])
    m.done(root)
    m = Mesh(f'TREE_{k}_crown')
    # leafy clusters stacked upright, filling the crown's fitted ellipsoid (fit_crowns.py: r across, rz up; the HQ's crowns are taller
    # than wide): a lower ring, a middle ring, a top lump, one hanging low on the left by the side branch
    rz = t.get('rz', r); CROWN[0] = (Vector((cx, YC + cy, cz)), max(r, rz))
    for j in range(5):
        a = 2 * math.pi * j / 5 + rng.uniform(-0.3, 0.3)
        blob(m, (cx + math.cos(a) * r * 0.48, YC + cy + math.sin(a) * r * 0.36, cz - rz * 0.42 + rng.uniform(-0.1, 0.1)), r * rng.uniform(0.46, 0.54), 0.95, 2)
    for j in range(4):
        a = 2 * math.pi * j / 4 + rng.uniform(-0.3, 0.3) + 0.4
        blob(m, (cx + math.cos(a) * r * 0.36, YC + cy + math.sin(a) * r * 0.28, cz + rz * 0.12), r * rng.uniform(0.46, 0.52), 0.95, 2)
    blob(m, (cx + 0.08 * r, YC + cy + 0.08 * r, cz + rz * 0.55), r * 0.46, 1.0, 2)
    blob(m, (cx - r * 0.6, YC + cy - 0.4, cz - rz * 0.72), r * 0.36, 0.9, 2)
    CROWN[0] = None
    m.done(root)

# ------------------------------------------------------------------------------------------------------------------------ buildings
W = L['wall']; WW, WH, PH, PO = W['w'], W['h'], W['plinth_h'], W['plinth_out']
FACE = dict(N=(0, 1), S=(0, -1), E=(1, 0), W=(-1, 0))


def shoji(m, a, b, n, z0, z1, off):
    """Cream panels in dark timber on a wall's face from a to b (plan), n its outward normal: two tall panels a bay over a lower row
    of three, the middle one slatted (frame 131.8 s, the north-east wing)."""
    ax, ay = a; bx, by = b; L_ = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L_, (by - ay) / L_
    ox, oy = n[0] * off, n[1] * off
    P3 = lambda s, z, o=0.0: (ax + ux * s + ox + n[0] * o, YC + ay + uy * s + oy + n[1] * o, z)
    quad = lambda s0, s1, za, zb, c, o=0.0: m.face([P3(s0, za, o), P3(s1, za, o), P3(s1, zb, o), P3(s0, zb, o)] if (ux * n[1] - uy * n[0]) < 0 else
                                                  [P3(s1, za, o), P3(s0, za, o), P3(s0, zb, o), P3(s1, zb, o)], c)
    quad(0, L_, z0, z1, P['timber'])
    T = 0.13; bays = max(1, round(L_ / 4.2)); bw = L_ / bays
    zl = z0 + (z1 - z0) * 0.36
    for i in range(bays):
        s0 = i * bw
        quad(s0 + T, s0 + bw / 2 - T / 2, zl + T / 2, z1 - T, P['shoji'], 0.01)
        quad(s0 + bw / 2 + T / 2, s0 + bw - T, zl + T / 2, z1 - T, P['shoji'], 0.01)
        thirds = [s0 + T, s0 + bw * 0.3, s0 + bw * 0.7, s0 + bw - T]
        for j in range(3):
            quad(thirds[j] + (T / 2 if j else 0), thirds[j + 1] - (T / 2 if j < 2 else 0), z0 + T, zl - T / 2, P['shoji'], 0.01)
        for zz in (z0 + (zl - z0) * 0.4, z0 + (zl - z0) * 0.62):
            quad(thirds[1] + T / 2, thirds[2] - T / 2, zz - 0.05, zz + 0.05, P['timber'], 0.02)


def wing(w):
    m = Mesh(f'WING_{w["name"]}')
    (ax, ay), (bx, by) = w['a'], w['b']; nx, ny = FACE[w['face']]
    L_ = math.hypot(bx - ax, by - ay); ux, uy = (bx - ax) / L_, (by - ay) / L_
    # the plinth: from behind the wall out to the face side
    back, front = -WW / 2 - 0.25, WW / 2 + PO
    ea, eb = 0.3 + w.get('plinth_a', 0.0), 0.3 + w.get('plinth_b', 0.0)
    corners = [(ax + nx * back - ux * ea, ay + ny * back - uy * ea), (bx + nx * back + ux * eb, by + ny * back + uy * eb),
               (bx + nx * front + ux * eb, by + ny * front + uy * eb), (ax + nx * front - ux * ea, ay + ny * front - uy * ea)]
    stone(m, corners, 0, PH, 0.28, 0.07)
    # the wall
    wc = [(ax + nx * -WW / 2, ay + ny * -WW / 2), (bx + nx * -WW / 2, by + ny * -WW / 2), (bx + nx * WW / 2, by + ny * WW / 2), (ax + nx * WW / 2, ay + ny * WW / 2)]
    prism(m, ccw(wc), PH, PH + WH, P['timber'], P['shoji_shade'], P['shoji_shade'], top_colour=P['timber'])
    for s in (1, -1):
        shoji(m, (ax, ay), (bx, by), (nx * s, ny * s), PH, PH + WH, WW / 2)
    # the roof: red tiles over the wall, a dark ridge; shed (sloping down to the face side) or gable (both ways)
    z0 = PH + WH; over = 0.35
    A = (ax - ux * over, ay - uy * over); B = (bx + ux * over, by + uy * over)
    P3 = lambda p, o, z: (p[0] + nx * o, YC + p[1] + ny * o, z)
    if w['roof'] == 'shed':
        hi, lo = (-WW / 2 - 0.2, z0 + 1.0), (WW / 2 + 1.1, z0 + 0.1)
        slope = [P3(A, hi[0], hi[1]), P3(B, hi[0], hi[1]), P3(B, lo[0], lo[1]), P3(A, lo[0], lo[1])]
        m.face(slope, P['roof'], flip_up=True)
        m.face([P3(A, lo[0], lo[1]), P3(B, lo[0], lo[1]), P3(B, lo[0], lo[1] - 0.3), P3(A, lo[0], lo[1] - 0.3)], P['roof_dark'])
        m.face([P3(A, hi[0], hi[1] + 0.12), P3(B, hi[0], hi[1] + 0.12), P3(B, hi[0] + 0.25, hi[1] + 0.02), P3(A, hi[0] + 0.25, hi[1] + 0.02)], P['ridge'], flip_up=True)
        m.face([P3(A, hi[0], hi[1] + 0.12), P3(B, hi[0], hi[1] + 0.12), P3(B, hi[0], z0), P3(A, hi[0], z0)], P['ridge'])
        for e in (A, B):
            m.face([P3(e, hi[0], hi[1]), P3(e, lo[0], lo[1]), P3(e, lo[0], lo[1] - 0.3), P3(e, hi[0], z0)], P['roof_dark'])
        ribs = int(L_ / 0.75)
        for i in range(1, ribs):
            s = i / ribs; p = (A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s)
            m.face([(P3(p, hi[0] + 0.05, hi[1] + 0.01)[0] - ux * 0.05, P3(p, hi[0] + 0.05, hi[1] + 0.01)[1] - uy * 0.05, hi[1] + 0.01),
                    (P3(p, hi[0] + 0.05, hi[1] + 0.01)[0] + ux * 0.05, P3(p, hi[0] + 0.05, hi[1] + 0.01)[1] + uy * 0.05, hi[1] + 0.01),
                    (P3(p, lo[0], lo[1])[0] + ux * 0.05, P3(p, lo[0], lo[1])[1] + uy * 0.05, lo[1] + 0.01),
                    (P3(p, lo[0], lo[1])[0] - ux * 0.05, P3(p, lo[0], lo[1])[1] - uy * 0.05, lo[1] + 0.01)], P['roof_dark'], flip_up=True)
    else:
        half = WW / 2 + 0.48; zr = z0 + 0.75
        for s, col in ((1, P['roof']), (-1, P['roof_light'] if nx * -1 > 0 else P['roof'])):
            m.face([P3(A, 0, zr), P3(B, 0, zr), P3(B, s * half, z0 + 0.05), P3(A, s * half, z0 + 0.05)], col, flip_up=True)
            m.face([P3(A, s * half, z0 + 0.05), P3(B, s * half, z0 + 0.05), P3(B, s * half, z0 - 0.2), P3(A, s * half, z0 - 0.2)], P['roof_dark'])
        m.face([P3(A, -0.13, zr + 0.13), P3(B, -0.13, zr + 0.13), P3(B, 0.13, zr + 0.13), P3(A, 0.13, zr + 0.13)], P['ridge'], flip_up=True)
        for e in (A, B):
            m.face([P3(e, -half, z0 + 0.05), P3(e, half, z0 + 0.05), P3(e, 0, zr)], P['roof_dark'])
        ribs = int(L_ / 0.75)
        for i in range(1, ribs):
            s_ = i / ribs; p = (A[0] + (B[0] - A[0]) * s_, A[1] + (B[1] - A[1]) * s_)
            for s in (1, -1):
                m.face([(P3(p, 0, 0)[0] - ux * 0.05, P3(p, 0, 0)[1] - uy * 0.05, zr + 0.01), (P3(p, 0, 0)[0] + ux * 0.05, P3(p, 0, 0)[1] + uy * 0.05, zr + 0.01),
                        (P3(p, s * half, 0)[0] + ux * 0.05, P3(p, s * half, 0)[1] + uy * 0.05, z0 + 0.06), (P3(p, s * half, 0)[0] - ux * 0.05, P3(p, s * half, 0)[1] - uy * 0.05, z0 + 0.06)],
                       P['roof_dark'], flip_up=True)
    m.done()


for w in L['wings']: wing(w)

for k, (x, y) in enumerate(L['towers']):
    # the corner caps as the HQ's (the round's mosaic, 3x): no tower, a small red gabled house on the corner of the walls: a red block on
    # the wall's top, a steep gable roof whose ridge runs east-west, each gable end a cream triangle framed in dark timber, a dark post
    # standing up from the ridge
    m = Mesh(f'TOWER_{k}')
    s = 0.95; zb = PH + WH; zc = zb + 3.0; zr = zc + 1.8      # (the gables' windows ~10 up: the mosaic's caps through the camera)
    box(m, x, y, 0.45, 0.45, PH, zb, P['timber'], P['timber'])      # (the corner post the walls meet at)
    box(m, x, y, s, s, zb, zc, P['roof_light'], P['roof'], P['roof_dark'])
    for zz in (zb + 0.9, zb + 2.1):      # (dark timber bands round the red body)
        box(m, x, y, s + 0.02, s + 0.02, zz, zz + 0.16, P['timber'], P['timber'])
    o = s + 0.25
    for sx, col in ((1, P['roof_light']), (-1, P['roof_dark'])):
        m.face([(x, YC + y - o, zr), (x, YC + y + o, zr), (x + sx * o, YC + y + o, zc - 0.1), (x + sx * o, YC + y - o, zc - 0.1)], col, flip_up=True)
    for sy in (1, -1):
        yy = y + sy * (o - 0.02)
        tri = [(x - o, YC + yy, zc - 0.1), (x + o, YC + yy, zc - 0.1), (x, YC + yy, zr)]
        m.face(tri if sy < 0 else tri[::-1], P['roof'])
        # the gable's window: a dark frame, a cream triangle in it
        yw = y + sy * (o + 0.01); k1, k2 = 0.62, 0.42
        fr = [(x - o * k1, YC + yw, zc + 0.05), (x + o * k1, YC + yw, zc + 0.05), (x, YC + yw, zc + 0.05 + (zr - zc) * 0.78)]
        m.face(fr if sy < 0 else fr[::-1], P['timber'])
        yw2 = y + sy * (o + 0.02); zt = zc + 0.05 + (zr - zc) * 0.78
        cr = [(x - o * k2, YC + yw2, zc + 0.2), (x + o * k2, YC + yw2, zc + 0.2), (x, YC + yw2, zt - 0.28)]
        m.face(cr if sy < 0 else cr[::-1], P['shoji'])
    box(m, x, y, o + 0.02, 0.1, zr - 0.05, zr + 0.12, P['ridge'], P['ridge'])
    box(m, x + 0.25, y, 0.14, 0.14, zr, zr + 1.0, P['timber'], P['timber'], P['beam_dark'])
    m.done()

# the east wall's arch gate: posts each side of the lane, a curved red roof over it
EG = L['east_gate']; m = Mesh('EAST_GATE')
x = EG['x']
for y in (EG['y0'], EG['y1']):
    box(m, x, y, 0.35, 0.35, 0, PH + WH + 0.3, P['timber'], P['timber'], P['beam_dark'])
# its roof: the wall's gable roof sweeping up into an arch over the lane (frame 131.8 s), ribbed, its eaves dark
n = 20; zb = PH + WH; ylo, yhi = EG['y0'] - 1.6, EG['y1'] + 1.6; half = WW / 2 + 0.6
for i in range(n):
    t0, t1 = i / n, (i + 1) / n
    ya, yb = ylo + (yhi - ylo) * t0, ylo + (yhi - ylo) * t1
    za, zb_ = zb + 1.8 * math.sin(math.pi * t0) ** 0.8, zb + 1.8 * math.sin(math.pi * t1) ** 0.8
    for s_ in (1, -1):
        col = P['roof'] if s_ < 0 else P['roof_dark']
        if i % 2: col = mix(col, P['roof_dark'], 0.35)
        m.face([(x, YC + ya, za + 0.85), (x, YC + yb, zb_ + 0.85), (x + s_ * half, YC + yb, zb_ + 0.05), (x + s_ * half, YC + ya, za + 0.05)], col, flip_up=True)
        m.face([(x + s_ * half, YC + ya, za + 0.05), (x + s_ * half, YC + yb, zb_ + 0.05), (x + s_ * half, YC + yb, zb_ - 0.25), (x + s_ * half, YC + ya, za - 0.25)], P['roof_dark'])
    m.face([(x - 0.12, YC + ya, za + 0.97), (x + 0.12, YC + ya, za + 0.97), (x + 0.12, YC + yb, zb_ + 0.97), (x - 0.12, YC + yb, zb_ + 0.97)], P['ridge'], flip_up=True)
box(m, x, (EG['y0'] + EG['y1']) / 2, 0.2, (EG['y1'] - EG['y0']) / 2, zb - 0.4, zb, P['beam'], P['beam'], P['beam_dark'])
m.done()

# ------------------------------------------------------------------------------------------------------------------------ the gates
G = L['gate']
for k, gate in enumerate(L['gates']):
    m = Mesh(f'GATE_{k}')
    xa, xb = gate['posts']; y = gate['y']
    bw, bd, bh = G['base']
    for xp in (xa, xb):
        stone(m, [(xp - bw / 2, y - bd / 2), (xp + bw / 2, y - bd / 2), (xp + bw / 2, y + bd / 2), (xp - bw / 2, y + bd / 2)], 0, bh, 0.35, 0.12)
        box(m, xp, y, G['post_r'], G['post_r'], bh, G['beam_z'], P['beam'], P['beam'], P['beam_dark'])
    x0, x1 = min(xa, xb) - G['beam_over'], max(xa, xb) + G['beam_over']
    # the beam: deep and dark, in front of the roof, pale end caps, a row of round knobs under it (frame 121.5 s, 4x)
    box(m, (x0 + x1) / 2, y, (x1 - x0) / 2, G['beam_d'] / 2, G['beam_z'], G['beam_z'] + G['beam_h'], '#4f403f', P['beam'], P['beam_dark'])
    for xe in (x0, x1):
        m.face([(xe + (0.01 if xe > x0 else -0.01), YC + y - G['beam_d'] / 2, G['beam_z']), (xe + (0.01 if xe > x0 else -0.01), YC + y + G['beam_d'] / 2, G['beam_z']),
                (xe + (0.01 if xe > x0 else -0.01), YC + y + G['beam_d'] / 2, G['beam_z'] + G['beam_h']), (xe + (0.01 if xe > x0 else -0.01), YC + y - G['beam_d'] / 2, G['beam_z'] + G['beam_h'])][::(1 if xe > x0 else -1)], '#e9c9b3')
    for i in range(9):
        u = x0 + 1.0 + (x1 - x0 - 2.0) * i / 8
        box(m, u, y - G['beam_d'] / 2 + 0.12, 0.13, 0.13, G['beam_z'] - 0.22, G['beam_z'], P['beam_dark'], P['beam_dark'])
    # the tiled roof (frame 121.5 s, 4x): a red roof on the beam, its front 1.3 high, its top a row of seven rounded tiles, a dark
    # knob where two meet; it runs back 1.2 and is lower behind
    zr = G['beam_z'] + 0.2; xs0, xs1 = x0 + 0.9, x1 - 0.9; nb = 7; H0, HUMP = 1.35, 0.4
    yf, yb = y + G['beam_d'] / 2 + 0.05, y + 1.6
    prof = []
    for i in range(nb):
        for j in range(8):
            t = j / 8; prof.append((xs0 + (xs1 - xs0) * (i + t) / nb, zr + H0 + HUMP * math.sin(math.pi * t) ** 0.6))
    prof.append((xs1, zr + H0))
    for (xa_, za_), (xb_, zb2) in zip(prof, prof[1:]):
        m.face([(xa_, YC + yf, zr), (xb_, YC + yf, zr), (xb_, YC + yf, zb2), (xa_, YC + yf, za_)], P['roof'])
        up = (zb2 - za_) / max(1e-6, xb_ - xa_)
        m.face([(xa_, YC + yf, za_), (xb_, YC + yf, zb2), (xb_, YC + yb, zb2 - 0.35), (xa_, YC + yb, za_ - 0.35)],
               P['roof_light'] if up > 0.3 else P['roof_dark'] if up < -0.3 else mix(P['roof'], P['roof_light'], 0.4), flip_up=True)
    for xe in (xs0, xs1):
        m.face([(xe, YC + yf, zr), (xe, YC + yb, zr), (xe, YC + yb, zr + H0 - 0.35), (xe, YC + yf, zr + H0)], P['roof_dark'])
    m.face([(xs0, YC + yf - 0.01, zr), (xs1, YC + yf - 0.01, zr), (xs1, YC + yf - 0.01, zr + 0.18), (xs0, YC + yf - 0.01, zr + 0.18)], P['roof_dark'])
    for i in range(nb + 1):
        u = xs0 + (xs1 - xs0) * i / nb
        box(m, u, yf + 0.15, 0.13, 0.13, zr + H0 - 0.05, zr + H0 + 0.22, P['beam_dark'], P['beam_dark'])
    # the posts' pale rope rings under the beam
    for xp in (xa, xb):
        box(m, xp, y, G['post_r'] + 0.04, G['post_r'] + 0.04, G['beam_z'] - 0.65, G['beam_z'] - 0.5, '#efe6d2', '#e2d8c2')
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ statues
S = L['slab']; m = Mesh('SLAB')
stone(m, [(S['x0'], S['y0']), (S['x1'], S['y0']), (S['x1'], S['y1']), (S['x0'], S['y1'])], 0, S['h'], 0.35, 0.15)
m.done()


def face_eyes(m, x, y, z, w):
    for s in (-1, 1):
        cxe = x + s * w
        m.face([(cxe + 0.17 * math.cos(a), YC + y - 0.3, z + 0.17 * math.sin(a)) for a in [i * math.pi / 5 for i in range(10)]][::-1], '#ffffff')
        m.face([(cxe + 0.12 * math.cos(a), YC + y - 0.32, z + 0.12 * math.sin(a)) for a in [i * math.pi / 5 for i in range(10)]][::-1], P['eye'])
    m.face([(x - 0.25, YC + y - 0.31, z - 0.12), (x + 0.25, YC + y - 0.31, z - 0.12), (x + 0.2, YC + y - 0.31, z - 0.2), (x - 0.2, YC + y - 0.31, z - 0.2)], P['eye'])


for st in L['statues']:
    m = Mesh(f'STATUE_{st["kind"]}')
    x, y = st['x'], st['y']; z0 = S['h']
    # (round, as the frame's: soft shading across; and each throws its shadow over the slab, south-west, as the frame's at 3x)
    m.poly([(x - 0.3, y + 0.05), (x + 0.3, y - 0.05), (x - 2.4, y - 1.5), (x - 3.0, y - 1.3)], z0 + 0.012, '#9584b6')
    if st['kind'] == 'fork':
        tube(m, [(x, YC + y, z0), (x, YC + y, z0 + 4.2)], 0.3, 0.3, P['fork'], P['fork_dark'], seg=12)
        box(m, x, y, 0.85, 0.25, z0 + 4.2, z0 + 4.8, P['fork'], P['fork'], P['fork_dark'])
        for dx in (-0.72, -0.24, 0.24, 0.72):
            box(m, x + dx, y, 0.12, 0.2, z0 + 4.8, z0 + 6.4, P['fork'], P['fork'], P['fork_dark'])
        face_eyes(m, x, y, z0 + 5.4, 0.5)
    else:
        tube(m, [(x, YC + y, z0), (x, YC + y, z0 + 2.4)], 0.4, 0.4, P['handle'], '#563a2e', seg=12)
        blade = [(x - 0.45, z0 + 2.4), (x + 0.5, z0 + 2.4), (x + 0.55, z0 + 5.6), (x - 0.05, z0 + 6.6), (x - 0.45, z0 + 5.4)]
        for yy, c in ((y - 0.15, P['blade']), (y + 0.15, P['blade'])):
            m.face([(bx_, YC + yy, bz) for bx_, bz in (blade if yy > y else blade[::-1])], c)
        for i in range(len(blade)):
            (a, za), (b, zb3) = blade[i], blade[(i + 1) % len(blade)]
            m.face([(a, YC + y - 0.15, za), (b, YC + y - 0.15, zb3), (b, YC + y + 0.15, zb3), (a, YC + y + 0.15, za)], mix(P['blade'], '#ffffff', 0.1))
        face_eyes(m, x, y, z0 + 5.0, 0.48)
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ banners
for k, b in enumerate(L['banners']):
    m = Mesh(f'BANNER_{k}_pole')
    x, y = b['x'], b['y']; ht = 6.0
    box(m, x, y, 0.09, 0.09, 0, ht, P['pole'], P['pole'])
    box(m, x - 0.8, y, 1.05, 0.08, ht - 0.35, ht - 0.2, P['pole'], P['pole'])
    m.done()
    m = Mesh(f'BUNTING_pennant_banner_{k}')
    x0, x1 = x - 1.6, x - 0.15; zt, zb_ = ht - 0.4, ht - 2.6
    m.face([(x0, YC + y, zb_), (x1, YC + y, zb_ + 0.15), (x1, YC + y, zt), (x0, YC + y, zt)], P['cloth'])
    m.face([(x0, YC + y + 0.02, zb_), (x0, YC + y + 0.02, zt), (x1, YC + y + 0.02, zt), (x1, YC + y + 0.02, zb_ + 0.15)], P['cloth_shade'])
    cx_, cz = (x0 + x1) / 2, (zt + zb_) / 2
    m.face([(cx_ - 0.35 + 0.25 * math.cos(a) * 0.6, YC + y - 0.02, cz + 0.3 * math.sin(a)) for a in [math.pi / 2 + i * math.pi / 6 for i in range(7)]], '#a19b90')
    for zz in (zb_ + 0.35, zb_ + 0.6):
        m.face([(x0 + 0.25, YC + y - 0.02, zz), (x1 - 0.25, YC + y - 0.02, zz), (x1 - 0.25, YC + y - 0.02, zz + 0.07), (x0 + 0.25, YC + y - 0.02, zz + 0.07)], '#c9c2b4')
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ lanterns
for k, (x, y, z) in enumerate(L['lanterns']):
    m = Mesh(f'LANTERN_{k}')
    box(m, x, y, 0.3, 0.3, z, z + 0.55, P['lantern_light'], P['lantern'], '#d27c22')
    box(m, x, y, 0.34, 0.34, z + 0.55, z + 0.68, P['beam_dark'], P['beam_dark'])
    box(m, x, y, 0.05, 0.05, z + 0.68, z + 1.0, P['beam_dark'], P['beam_dark'])
    m.done()
for k, (x, y) in enumerate(L['stone_lanterns']):
    m = Mesh(f'STONELAMP_{k}')
    stone(m, [(x - 0.9, y - 0.9), (x + 0.9, y - 0.9), (x + 0.9, y + 0.9), (x - 0.9, y + 0.9)], 0, 0.75, 0.2, 0.06)
    box(m, x, y, 0.22, 0.22, 0.75, 1.5, P['lamp_stone'], '#756c8c', '#61597a')
    box(m, x, y, 0.4, 0.4, 1.5, 1.7, P['lamp_stone'], '#756c8c', '#61597a')
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ outskirts
# the big navy block behind the north-east corner (the round's mosaic: its foot on the ochre ground from (32.9, 19.4) to (37.8, 21.8),
# its top ~8 up; its tones k-means of its pixels: #5b5c95 sides, #4b4c79 the shaded, a lighter top)
m = Mesh('NAVY_BLOCK')
stone(m, [(28.0, 21.0), (44.0, 21.0), (44.0, 31.0), (28.0, 31.0)], 0, 8.0, 0.9, 0.35, top='#6d6eb0', side='#5b5c95', back='#4b4c79')
m.done()
# big autumn trees round the court (layout.py OUTER_TREES): a lavender trunk, a soft crown of red or golden lumps, leaves under it
CROWNS = dict(red=['#f26a55', '#e8584d', '#d64a47', '#c03f45'], gold=['#f6c45c', '#eeb24f', '#e2a046', '#cf8e40'])
for k, t in enumerate(L['outer_trees']):
    fx, fy = t['foot']; lx, ly = t['lean']; r = t['r']
    root = bpy.data.objects.new(f'TREE_{10 + k}_tree', None); sc.collection.objects.link(root)
    m = Mesh(f'OTREE_{k}_trunk'); top = (fx + lx, YC + fy + ly, 8.5)
    tube(m, bezier((fx, YC + fy, 0), (fx + lx * 0.3, YC + fy + ly * 0.4, 4.5), top), 0.75, 0.45, P['trunk'], '#5b5490')
    m.done(root)
    m = Mesh(f'OTREE_{k}_crown'); keep = P['leaf']; P['leaf'] = list(reversed(CROWNS[t['crown']]))[::-1]
    CROWN[0] = (Vector((top[0], top[1], 10.0)), r)
    for j in range(7):
        a = 2 * math.pi * j / 7 + rng.uniform(-0.3, 0.3)
        blob(m, (top[0] + math.cos(a) * r * 0.55, top[1] + math.sin(a) * r * 0.45, 9.8 + rng.uniform(-0.5, 0.8)), r * rng.uniform(0.45, 0.6), 0.8, 2)
    blob(m, (top[0], top[1], 10.8), r * 0.6, 0.8, 2)
    CROWN[0] = None; P['leaf'] = keep
    m.done(root)
    m = Mesh(f'OLEAVES_{k}')
    for _ in range(26):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.5, r * 1.3)
        x, y = fx + lx * 0.7 + math.cos(a) * d, fy + ly * 0.5 + math.sin(a) * d * 0.8
        lr, a0 = rng.uniform(0.25, 0.4), rng.uniform(0, math.pi)
        m.poly([(x + lr * math.cos(a0 + q) * (1 if i % 2 == 0 else 0.55), y + lr * 0.6 * math.sin(a0 + q)) for i, q in enumerate([i * math.pi / 4 for i in range(8)])],
               0.02, rng.choice(CROWNS[t['crown']][1:]))
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ the plants at rest (render only)
if PLANTS:
    HF = J('art/temple_court/hexfields.json'); s_, HH = HF['s'], HF['H']; th = HF['turn']
    hexpts = lambda x, y, r: [(x + r * math.cos(th + k * math.pi / 3), y + r * math.sin(th + k * math.pi / 3)) for k in range(6)]
    m = Mesh('PLANTS_render')
    for p in HF['pads']: m.poly(hexpts(p['x'] - 0.75 * HH, p['y'] - 0.1 * HH, s_), 0.009, '#c2c883')
    for p in sorted(HF['pads'], key=lambda p: -p['y']):
        x, y = p['x'], p['y']
        box(m, x, y, 0.06, 0.06, 0, HH, '#b5683f', '#b5683f')
        m.poly(hexpts(x, y, s_ * 1.04), HH, HF['shade'][p['shade']])
        if p['flower']: m.poly([(x + 0.1 * math.cos(a), y + 0.1 * math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]], HH + 0.01, '#f6b88a')
    m.done()

# ------------------------------------------------------------------------------------------------------------------------ camera, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * CAM['referenceZoom'] / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
for o in bpy.data.objects:
    if o.name.startswith('PLANTS_render'): o.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'court.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
print('court built: polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
