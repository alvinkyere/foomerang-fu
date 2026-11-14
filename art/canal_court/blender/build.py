"""The canal court in 3D, object by object (2026-11-13): foomerang-fu physics hq.mp4 10:55 (the READY frame, 654.5 s), seen through the
game's camera. Our own models, flat-coloured as the HQ's are (unlit vertex colours, each vertex its measured tone by which way it faces):

  ground    the paved court, its kerb, the grass patches, the soft shadows and the sandy outskirts as ground.py measures them
  aqueduct  the lavender octagonal tower (its pool on top), the zigzag channel from it (a water run in its top) and the stub
            (fit_aqueduct.py); soft, rounded edges
  basin     the octagon of brown blocks on a navy footing, its pool (fit_solids.py)
  rocks     four lavender blocks (fit_solids.py)
  water     FLOW_pool (the tower's), FLOW_run (the channel's), FLOW_basin: the game animates them (render/three/canalWater.ts)
  cards     what stands (cards.py): barrels, bucket, bench, rack, plank, urns, trees, post
Exports canal_court.glb; with `render`, also render.png through the HQ's camera; with `wide`, the mosaic's view (cards.py traces
against it).

  Blender -b --python art/canal_court/blender/build.py -- <out_dir> [render] [wide]
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER, WIDE = args[0], 'render' in args[1:], 'wide' in args[1:]      # (wide: the round's mosaic's view, 2625 x 1431)
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
CAM = J('art/sky_islands/camera.json'); ZOOM = J('art/canal_court/zoom.json')['zoom']
YC = 73.72                                                     # (measure.py: the ground point under the frame's centre)
G = J('art/canal_court/ground.json'); AQ = J('art/canal_court/aqueduct.json'); SO = J('art/canal_court/solids.json')
bpy.ops.wm.read_factory_settings(use_empty=True)
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


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
bgr_hex = lambda c: '#%02x%02x%02x' % (c[2], c[1], c[0])


class Mesh:
    def __init__(self, name):
        self.name, self.bm = name, bmesh.new(); self.col = self.bm.loops.layers.float_color.new('Col')

    def face(self, pts, colour):
        vs = [self.bm.verts.new(p) for p in pts]
        try: f = self.bm.faces.new(vs)
        except ValueError: return None
        cs = colour if isinstance(colour, list) else [colour] * len(vs)
        for loop, c in zip(f.loops, cs): loop[self.col] = lin(c) if isinstance(c, str) else c
        return f

    def poly(self, pts2, z, colour, holes=()):
        loops = [pts2] + [h for h in holes]
        flat_ = [p for lp in loops for p in lp]
        vs = [self.bm.verts.new((x, YC + y, z)) for x, y in flat_]
        for tri in tessellate_polygon([[Vector((x, y, 0)) for x, y in lp] for lp in loops]):
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


def base_at(x, y):
    """The ground's base field (ground.json), bilinear, as linear RGB."""
    gx = min(max((x - G['x0']) / G['dx'], 0), G['nx'] - 1.001); gy = min(max((y - G['y0']) / G['dx'], 0), G['ny'] - 1.001)
    i, j = int(gx), int(gy); fx, fy = gx - i, gy - j
    c = lambda ii, jj: G['bgr'][jj * G['nx'] + ii]
    v = [(c(i, j)[k] * (1 - fx) + c(i + 1, j)[k] * fx) * (1 - fy) + (c(i, j + 1)[k] * (1 - fx) + c(i + 1, j + 1)[k] * fx) * fy for k in range(3)]
    return lin(bgr_hex([int(round(q)) for q in v]))


# ---------------------------------------------------------------------------------------------------------------- ground
DG = 0.5
g = Mesh('GROUND'); X0, Y0 = G['x0'], G['y0']; nx, ny = int((G['nx'] - 1) * G['dx'] / DG), int((G['ny'] - 1) * G['dx'] / DG)
vs = [[None] * (nx + 1) for _ in range(ny + 1)]
for j in range(ny):
    for i in range(nx):
        x0, y0 = X0 + i * DG, Y0 + j * DG
        pts = [(x0, y0), (x0 + DG, y0), (x0 + DG, y0 + DG), (x0, y0 + DG)]
        g.face([(x, YC + y, 0.0) for x, y in pts], [base_at(x, y) for x, y in pts])
g.done()
sh = Mesh('GROUND_SHAPES')
for k, s in enumerate(G['shapes']):
    sh.poly(s['pts'], 0.004 + 0.0004 * k, s['colour'], s.get('holes', []))
sh.done()
# the paving's joints (tiles.py): thin ribbons over the traced court, its own colour under each
if HAS('art/canal_court/tiles.json'):
    tj = Mesh('GROUND_JOINTS')
    for t in J('art/canal_court/tiles.json'): tj.poly(t['pts'], 0.07, t['colour'])
    tj.done()
# the court's stepped kerb (kerb.py): each band a ring from its outline in to the next one's, crisp, over the traced ground
KERB = J('art/canal_court/kerb.json')['bands']
kb = Mesh('KERB')
for j, b in enumerate(KERB):
    if j + 1 == len(KERB): break                     # (the innermost outline is the court's own edge: inside it, the traced court)
    kb.poly(b['pts'], 0.03 + 0.001 * j, b['colour'], [KERB[j + 1]['pts']])
kb.done()

# ---------------------------------------------------------------------------------------------------------------- the soft solids
# the HQ's lavender and brown solids are soft: every edge rounded (bevelled, BEVEL wide), each vertex coloured by which way its smoothed
# normal faces (SHADE: the frame's tones on the top, and on the sides facing south, west and east)
BEVEL = 0.45
CLAMP = os.environ.get('CLAMP', '1') == '1'
def hexrgb(h): return [int(h[i:i + 2], 16) for i in (1, 3, 5)]
SHADE = dict(
    lav=dict(top='#9ba6e3', south='#576cae', west='#5b6eb2', east='#6972aa', north='#8d98d8'),
    rock=dict(top='#9ba6e3', south='#5368ae', west='#5b6eb2', east='#6778ba', north='#8d98d8'),
    brown=dict(top='#986d70', south='#675464', west='#6a5260', east='#6d5562', north='#654952'),
    navy=dict(top='#4d5075', south='#2f3a4f', west='#323d55', east='#344058', north='#3a4560'),
)


KINDS = ['tower', 'channel', 'stub', 'rock_sw', 'rock_n', 'rock_e', 'rock_se', 'brown', 'navy']     # (each its own tones: fit_shade.py)
FIT = J('art/canal_court/shade.json') if HAS('art/canal_court/shade.json') else {}
DEBUG = os.environ.get('SHADE_DEBUG')       # ('normal' / 'height': each vertex's normal or height as its colour, for fit_shade.py)


def shade(kind, n, z=0.0):
    """sRGB tone for a unit normal: the top's by how far it faces up, the side's by its compass facing."""
    if DEBUG == 'normal': return [0.5 + 0.5 * n.x, 0.5 + 0.5 * n.y, 0.5 + 0.5 * n.z, 1.0]
    if DEBUG == 'height': return [min(1.0, z / 8), (KINDS.index(kind) + 1) / 12, 0.0, 1.0]
    if kind in FIT:          # (fit_shade.py: the HQ's own tones, a quadratic in the normal and a line in the height)
        q = [1, n.x, n.y, n.z, n.x * n.x, n.y * n.y, n.z * n.z, n.x * n.y, z, z * n.z]
        F_ = FIT[kind]; c = [max(F_['lo'][i], min(F_['hi'][i], sum(a * b for a, b in zip(row, q)))) for i, row in enumerate(F_['coef'])]
        return lin('#%02x%02x%02x' % tuple(int(round(v)) for v in c))
    s = SHADE[kind]; up = max(0.0, n.z)
    h = Vector((n.x, n.y)); hl = h.length
    if hl > 1e-6:
        h /= hl; w = dict(south=max(0, -h.y), north=max(0, h.y), west=max(0, -h.x), east=max(0, h.x)); tot = sum(w.values())
        side = [sum(hexrgb(s[k])[i] * w[k] for k in w) / tot for i in range(3)]
    else: side = hexrgb(s['top'])
    t = up ** 1.5
    c = [side[i] * (1 - t) + hexrgb(s['top'])[i] * t for i in range(3)]
    return lin('#%02x%02x%02x' % tuple(int(round(min(255, max(0, v)))) for v in c))


GROW = float(os.environ.get('GROW', '0.0'))        # (fit_tops.py grows each outline already)


def grown(poly, d):
    """The (counter-clockwise) outline moved d outwards, its corners on their bisectors."""
    P = [Vector(p) for p in poly]; n = len(P); out = []
    for i in range(n):
        e0 = (P[i] - P[i - 1]).normalized(); e1 = (P[(i + 1) % n] - P[i]).normalized()
        n0 = Vector((e0.y, -e0.x)); n1 = Vector((e1.y, -e1.x)); b = (n0 + n1)
        b = b.normalized() if b.length > 1e-6 else n0
        out.append(P[i] + b * d / max(0.35, b.dot(n0)))
    return [(v.x, v.y) for v in out]


def simplify(poly, eps=0.25, min_edge=1.0, keep=None):
    """The traced outline cleaned for rounding: Douglas-Peucker to `eps`, then the corner whose removal moves the outline least taken
    out while any edge is shorter than `min_edge` (a rounded edge can be no wider than half its shortest neighbour), or till `keep`
    corners are left (the HQ's solids are simple: a pentagon, an L, a slab)."""
    def dp(pts):
        if len(pts) < 3: return pts
        a, b = Vector(pts[0]), Vector(pts[-1]); ab = b - a; L = ab.length or 1e-9
        d = [abs((Vector(p) - a).cross(ab)) / L for p in pts[1:-1]]; i = max(range(len(d)), key=d.__getitem__)
        return dp(pts[:i + 2])[:-1] + dp(pts[i + 1:]) if d[i] > eps else [pts[0], pts[-1]]
    P = [tuple(p) for p in poly]; k = max(range(len(P)), key=lambda i: (Vector(P[i]) - Vector(P[0])).length)
    P = dp(P[:k + 1])[:-1] + dp(P[k:] + [P[0]])[:-1]
    while len(P) > max(3, keep or 3):
        n = len(P); short = [(Vector(P[(i + 1) % n]) - Vector(P[i])).length for i in range(n)]
        if keep is None and min(short) >= min_edge: break
        def cost(i):
            a, b, c = Vector(P[i - 1]), Vector(P[i]), Vector(P[(i + 1) % n]); ac = c - a
            return abs((b - a).cross(ac)) / (ac.length or 1e-9)
        i = min(range(n), key=lambda i: cost(i) if keep is not None or min(short[i - 1], short[i]) < min_edge else 1e9)
        P.pop(i)
    return P


def soft_prism(name, outline, z0, z1, kind, bevel=BEVEL, parent=None, keep=None):
    """A prism over a plan outline (counter-clockwise), its edges rounded, vertex-coloured by facing."""
    outline = ccw(simplify(outline, 0.2, 2.2 * bevel, keep))
    if GROW: outline = grown(outline, GROW)
    bm = bmesh.new()
    bot = [bm.verts.new((x, YC + y, z0)) for x, y in outline]; top = [bm.verts.new((x, YC + y, z1)) for x, y in outline]
    n = len(outline)
    bm.faces.new(top)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new([bot[i], bot[j], top[j], top[i]])
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median(); 
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    edges = [e for e in bm.edges if not all(v.co.z <= z0 + 1e-6 for v in e.verts)]
    bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=5, profile=0.5, affect='EDGES', clamp_overlap=CLAMP)
    bm.normal_update()
    col = bm.loops.layers.float_color.new('Col')
    for f in bm.faces:
        for loop in f.loops: loop[col] = shade(kind, loop.vert.normal, loop.vert.co.z)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    if parent is not None: o.parent = parent
    return o


def octagon(cx, cy, r, turn=math.pi / 8):
    return [(cx + r * math.cos(turn + k * math.pi / 4), cy + r * math.sin(turn + k * math.pi / 4)) for k in range(8)]


def ccw(p):
    a2 = sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))
    return p if a2 > 0 else p[::-1]


def ribbon(line, w):
    """The outline of a band `w` wide along a polyline (mitred corners)."""
    L = [Vector(p) for p in line]; left, right = [], []
    for i, p in enumerate(L):
        ds = []
        if i > 0: ds.append((p - L[i - 1]).normalized())
        if i < len(L) - 1: ds.append((L[i + 1] - p).normalized())
        nrm = [Vector((-d.y, d.x)) for d in ds]; b = sum(nrm, Vector((0, 0))).normalized()
        k = w / 2 / max(0.3, b.dot(nrm[0]))
        left.append(p + b * k); right.append(p - b * k)
    return [(v.x, v.y) for v in left + right[::-1]]


# the aqueduct (tower, channel, stub) and the rocks: their outlines and heights as fit_tops.py traced them
TOPS = J('art/canal_court/tops.json'); WAT = J('art/canal_court/water.json'); BA = J('art/canal_court/basin.json')
def by_angle(poly, c, n, a0=0.0):
    """The outline's points where rays from c at n even angles leave it (its last crossing)."""
    out = []
    P = [Vector(p) for p in poly]
    for k in range(n):
        a = a0 + 2 * math.pi * k / n; d = Vector((math.cos(a), math.sin(a))); best = 0.0
        for i in range(len(P)):
            p0, p1 = P[i - 1] - c, P[i] - c; e = p1 - p0; den = d.x * e.y - d.y * e.x
            if abs(den) < 1e-9: continue
            t = (p0.x * e.y - p0.y * e.x) / den; u = (p0.x * d.y - p0.y * d.x) / den
            if t > 0 and 0 <= u <= 1: best = max(best, t)
        out.append(c + d * best)
    return out


def soft_ring(name, outer, inner, z0, z1, zin, kind, bevel=BEVEL, n=8, a0=math.pi / 8):
    """A prism over the outline `outer` with the hole `inner` in its top (its inner wall down to zin), the top's two edges rounded."""
    c = sum((Vector(p) for p in inner), Vector((0, 0))) / len(inner)
    O, I = by_angle(outer, c, n, a0), by_angle(inner, c, n, a0)      # (two concentric octagons: their corners)
    bm = bmesh.new()
    ob = [bm.verts.new((p.x, YC + p.y, z0)) for p in O]; ot = [bm.verts.new((p.x, YC + p.y, z1)) for p in O]
    it = [bm.verts.new((p.x, YC + p.y, z1)) for p in I]; ib = [bm.verts.new((p.x, YC + p.y, zin)) for p in I]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([ob[i], ob[j], ot[j], ot[i]]); bm.faces.new([ot[i], ot[j], it[j], it[i]]); bm.faces.new([it[i], it[j], ib[j], ib[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # (the outer wall faces out, the inner wall in towards the pool; the top up)
    for f in bm.faces:
        cen = f.calc_center_median(); r = Vector((cen.x - c.x, cen.y - YC - c.y))
        if abs(f.normal.z) < 0.5:
            outward = Vector((f.normal.x, f.normal.y)).dot(r) > 0
            want_out = any(v in ob for v in f.verts)
            if outward != want_out: f.normal_flip()
        elif f.normal.z < 0: f.normal_flip()
    # (the outer top edge rounded as every solid's; the pool's edge wider and softer: the HQ's rim fades into the pool over ~0.7 units)
    outer_e = [e for e in bm.edges if all(v.co.z == z1 for v in e.verts) and e.verts[0] in ot and e.verts[1] in ot]
    inner_e = [e for e in bm.edges if all(v.co.z == z1 for v in e.verts) and e.verts[0] in it and e.verts[1] in it]
    bmesh.ops.bevel(bm, geom=outer_e, offset=bevel, segments=5, profile=0.5, affect='EDGES', clamp_overlap=CLAMP)
    bmesh.ops.bevel(bm, geom=[e for e in inner_e if e.is_valid], offset=POOL_SOFT, segments=8, profile=0.5, affect='EDGES', clamp_overlap=CLAMP)
    bm.normal_update()
    col = bm.loops.layers.float_color.new('Col')
    for f in bm.faces:
        for loop in f.loops: loop[col] = shade(kind, loop.vert.normal, loop.vert.co.z)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


POOL_K = float(os.environ.get('POOL_K', '0.68'))      # (the hole's size against the tower's: the HQ's dark pool with its soft ring, 0.69)
POOL_SOFT = float(os.environ.get('POOL_SOFT', '0.6'))
POOL_DROP = 0.3            # (the pool's water a little below the tower's top: its inner wall shows as a dark ring round it)
TOWER_OCT = octagon(AQ['tower']['cx'], AQ['tower']['cy'], AQ['tower']['r'])      # (the HQ's tower is a crisp octagon: fit_aqueduct.py)
# (its pool: an octagon in the middle of its top, 0.57 of its size, as the HQ's: the traced water's outline is ragged with foam)
POOL_OCT = octagon(AQ['tower']['cx'], AQ['tower']['cy'], AQ['tower']['r'] * POOL_K)
soft_ring('AQUEDUCT_tower', TOWER_OCT, POOL_OCT, -0.05, TOPS['tower']['h'], TOPS['tower']['h'] - 1.6, 'tower')      # (its inner wall deep enough for the rim's wide soft edge)
CORNERS = dict(channel=12, stub=4, rock_sw=5, rock_n=6, rock_e=7, rock_se=4)       # (each solid's corners in the HQ's frame)
def into(poly, d):
    """A 4-cornered outline with its eastern end pushed `d` further east along its long axis (the stub runs on into the channel's side)."""
    P = [Vector(p) for p in poly]; c = sum(P, Vector((0, 0))) / 4
    axis = max(((P[i] + P[(i + 1) % 4]) / 2 - c for i in range(4)), key=lambda v: v.length).normalized()
    if axis.x < 0: axis = -axis
    return [tuple(p + axis * d) if (p - c).dot(axis) > 0 else tuple(p) for p in P]


for name in ('channel', 'stub'):
    pts = [tuple(p) for p in TOPS[name]['pts']]
    if name == 'stub': pts = into(pts, 1.2)
    soft_prism(f'AQUEDUCT_{name}', ccw(pts), -0.05, TOPS[name]['h'], name, keep=CORNERS[name], bevel=0.25 if name == 'stub' else BEVEL)   # (the HQ's stub: a box, its edges barely rounded)
for name in ('rock_sw', 'rock_n', 'rock_e', 'rock_se'):
    soft_prism(name.upper(), ccw([tuple(p) for p in TOPS[name]['pts']]), -0.05, TOPS[name]['h'], name, keep=CORNERS[name])
# the water: the tower's pool and the channel's run as the frame's (water.json), a hair over their tops
# (the pool's water reaches up over the rim's soft inner slope, just under the top: the game's shader lightens it to the lavender
# there, as the HQ's soft ring; POOL_REACH out from the hole's edge)
POOL_REACH = 0.65
w = Mesh('FLOW_pool'); w.poly(ccw(octagon(AQ['tower']['cx'], AQ['tower']['cy'], AQ['tower']['r'] * POOL_K + POOL_REACH)), TOPS['tower']['h'] - 0.06, '#4470c3'); w.done()
json.dump(dict(cx=AQ['tower']['cx'], cy=AQ['tower']['cy'], r=AQ['tower']['r'] * POOL_K), open(os.path.join(OUT, 'pool.json'), 'w'))   # (the hole's)
w = Mesh('FLOW_run'); w.poly(ccw([tuple(p) for p in WAT['run']['pts']]), WAT['run']['h'] + 0.02, '#8ad7e9')
# the spout: the pool spills over the tower's south rim, along the run's first leg, and falls down the tower's face onto the channel
# (the HQ's: one stream from the pool to the run, no gap); SPOUT_W across, its points from the pool's edge out to the tower's
SPOUT_W = 0.8
L0 = TOPS['channel']['line']; c0, c1 = Vector(L0[0]), Vector(L0[1]); u_ = (c1 - c0).normalized(); n_ = Vector((-u_.y, u_.x))
def reach(poly, c, u):
    best = 0.0; P = [Vector(p) for p in poly]
    for i in range(len(P)):
        p0, p1 = P[i - 1] - c, P[i] - c; e = p1 - p0; den = u.x * e.y - u.y * e.x
        if abs(den) < 1e-9: continue
        t = (p0.x * e.y - p0.y * e.x) / den; v = (p0.x * u.y - p0.y * u.x) / den
        if t > 0 and 0 <= v <= 1: best = max(best, t)
    return best
rp, rt = reach(POOL_OCT, c0, u_), reach(TOWER_OCT, c0, u_)
HT, HC = TOPS['tower']['h'], TOPS['channel']['h']
# (over the rounded rim: round its curve a hair outside it, then straight down the face onto the channel)
R_ = BEVEL + 0.4          # (the rounded rim reaches out further than its nominal curve: the stream falls just clear of it)
steps = [(rp - 0.3, HT - POOL_DROP + 0.01), (rp + 0.1, HT + 0.06)] + \
        [(rt - BEVEL + R_ * math.sin(a), HT - BEVEL + R_ * math.cos(a)) for a in [k * math.pi / 2 / 6 for k in range(7)]] + \
        [(rt + 0.06, HC + 0.03), (rt + 0.7, HC + 0.03)]
for (t0, z0), (t1, z1) in zip(steps, steps[1:]):
    a0, a1 = c0 + u_ * t0, c0 + u_ * t1; h_ = n_ * SPOUT_W / 2
    w.face([(a0.x - h_.x, YC + a0.y - h_.y, z0), (a1.x - h_.x, YC + a1.y - h_.y, z1), (a1.x + h_.x, YC + a1.y + h_.y, z1), (a0.x + h_.x, YC + a0.y + h_.y, z0)], '#8ad7e9')
w.done()

# the basin (fit_basin.py): a navy footing, seven brown blocks round the octagon (none on the side the channel comes in), the pool
B = BA; BR, RIN = B['r'], B['rin']; FOOT_R, FOOT_H, GAP = B['r'] + 0.6, 0.9, 0.06      # (the HQ's navy footing: its top shows 8 px south of the blocks, its side 16 px; under the pool's level)
soft_prism('BASIN_footing', ccw(octagon(B['cx'], B['cy'], FOOT_R, B['turn'])), -0.05, FOOT_H, 'navy', bevel=0.15)
end_ = TOPS['channel']['pts']; ex = max(end_, key=lambda p: p[0])
ent = math.atan2(ex[1] - B['cy'], ex[0] - B['cx']) if False else math.pi
for k in range(8):
    a0 = B['turn'] + k * math.pi / 4; a1 = a0 + math.pi / 4; mid_ = (a0 + a1) / 2
    if abs(math.atan2(math.sin(mid_ - ent), math.cos(mid_ - ent))) < math.pi / 8: continue
    po = [Vector((B['cx'] + BR * math.cos(a), B['cy'] + BR * math.sin(a))) for a in (a0, a1)]
    pi_ = [Vector((B['cx'] + RIN * math.cos(a), B['cy'] + RIN * math.sin(a))) for a in (a0, a1)]
    u0 = (po[1] - po[0]).normalized(); u1 = (pi_[1] - pi_[0]).normalized()
    q = [po[0] + u0 * GAP, po[1] - u0 * GAP, pi_[1] - u1 * GAP, pi_[0] + u1 * GAP]
    soft_prism(f'BASIN_block{k}', ccw([(v.x, v.y) for v in q]), FOOT_H - 0.05, B['hb'], 'brown', bevel=0.22)
w = Mesh('FLOW_basin'); w.poly(octagon(B['cx'], B['cy'], RIN + 0.15, B['turn']), B['hw'], '#76cde6'); w.done()

# ---------------------------------------------------------------------------------------------------------------- what stands
# the trees, stump, pots, bunting, aloe, tufts and bamboo as traced cards (cards.py): upright planes through each foot, facing the camera
# (the game's camera never turns), each tone a flat shape, the later tones a hair nearer the camera; the trees' named TREE_<k>_tree
CAMV = Vector(tuple(v * 100 for v in CAM['centre'])); _pth = math.radians(CAM['pitchDeg'])
TOWARD = Vector((0, -math.cos(_pth), math.sin(_pth)))     # (from the scene towards the camera: its view direction reversed)
if HAS('art/canal_court/cards.json'):
    for c in J('art/canal_court/cards.json'):
        m = Mesh(f'CARD_{c["name"]}')
        for sh in c['shapes']:
            off = TOWARD * (0.004 * sh['layer'] + (1.2 if c['name'].startswith('urn') else 0.0))   # (the urns stand on the blocks' tops)
            loops = [[Vector((x, YC + y, z)) + off for x, y, z in lp] for lp in sh['loops']]
            # (triangulated in the card's own plane: the points' screen layout)
            up_ = TOWARD.cross(Vector((1, 0, 0)))
            flat_ = [[Vector((v.x, (v - loops[0][0]).dot(up_), 0)) for v in lp] for lp in loops]
            verts = [v for lp in loops for v in lp]
            for tri in tessellate_polygon(flat_):
                f_ = m.face([tuple(verts[i]) for i in tri], sh['colour'])
        m.done()

# ---------------------------------------------------------------------------------------------------------------- camera, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * ZOOM / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = (2160, 1240) if WIDE else (1920, 1080)
if WIDE:      # (the mosaic: 2625 x 1431, the frame's (0, 0) at its (229, 97))
    sc.render.resolution_x, sc.render.resolution_y = 2625, 1431; cam.sensor_width = 36 * 2625 / 1920
    cam.shift_x = (2625 / 2 - (229 + 960)) / 2625; cam.shift_y = -(1431 / 2 - (97 + 540)) / 2625
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'canal_court.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if WIDE:      # (no cards: cards.py traces against it)
    for o in bpy.data.objects:
        if o.name.startswith('CARD_'): o.hide_render = True
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
print('canal court built: polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
