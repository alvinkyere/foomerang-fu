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


SAND_BGR = [0x93, 0xe9, 0xff]
_KBS = J('art/canal_court/kerb.json')['bands']


def _inside(p, poly):
    x, y = p; c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


KERB_IN = lambda p: _inside(p, _KBS[-1]['pts'])          # (on the court, inside the kerb)
KERB_OUT = lambda p: _inside(p, _KBS[0]['pts'])          # (inside the kerb's outer edge)
WEST_SAND = -25.5
SEEN = J('art/canal_court/seen.json') if HAS('art/canal_court/seen.json') else [1] * (G['nx'] * G['ny'])


def base_at(x, y):
    """The ground's base field (ground.json), bilinear, as linear RGB."""
    gx = min(max((x - G['x0']) / G['dx'], 0), G['nx'] - 1.001); gy = min(max((y - G['y0']) / G['dx'], 0), G['ny'] - 1.001)
    i, j = int(gx), int(gy); fx, fy = gx - i, gy - j
    c = lambda ii, jj: G['bgr'][jj * G['nx'] + ii] if sum(G["bgr"][jj * G["nx"] + ii]) > 380 and SEEN[jj * G['nx'] + ii] and not (G['x0'] + ii * G['dx'] < WEST_SAND and -17 < G['y0'] + jj * G['dx'] < 17) else SAND_BGR       # (what no frame saw: the sand)
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
def chaikin(pts, n=2):
    """A traced outline's pixel steps rounded off (Chaikin corner cutting): the HQ's patches and shadows have smooth edges."""
    P = [tuple(p) for p in pts]
    for _ in range(n):
        Q = []
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            Q += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        P = Q
    return P


sh = Mesh('GROUND_SHAPES')
for k, s in enumerate(G['shapes']):
    if sum(int(s['colour'][i:i + 2], 16) for i in (1, 3, 5)) < 200: continue      # (the unseen black, and its blend with the sand)
    _r, _g, _b = (int(s['colour'][i:i + 2], 16) for i in (1, 3, 5))
    _cx = sum(p[0] for p in s['pts']) / len(s['pts']); _cy = sum(p[1] for p in s['pts']) / len(s['pts'])
    if _cx < WEST_SAND and -17 < _cy < 17: continue        # (west of the kerb: under the names in every frame; the HQ's sand)
    # (shapes the kerb crosses: the kerb's bands are drawn exactly (kerb.py); a traced patch straddling them is the names' box's smear)
    _in = sum(1 for p in s['pts'] if KERB_IN(p)); _out = sum(1 for p in s['pts'] if not KERB_OUT(p))
    if _in == 0 and _out == 0: continue
    if (_b > _r + 15 and _b > _g + 10) or (max(_r, _g, _b) - min(_r, _g, _b) < 25 and _r + _g + _b < 520): continue   # (a tree's trunk smeared into the round's mosaic: the trees are models)
    # (small stains the players' trails and icons left in the round's mosaic: pinks and blues the court never has, in small spots)
    import colorsys
    _h, _s, _v = colorsys.rgb_to_hsv(_r / 255, _g / 255, _b / 255); _P = s['pts']
    _area = abs(sum(_P[i][0] * _P[(i + 1) % len(_P)][1] - _P[(i + 1) % len(_P)][0] * _P[i][1] for i in range(len(_P)))) / 2
    if _area < 3.0 and _s > 0.06 and not (0.08 < _h < 0.45): continue
    sh.poly(chaikin(s['pts']), 0.004 + 0.02 * k / max(1, len(G["shapes"])), s['colour'], [chaikin(h) for h in s.get('holes', [])])
sh.done()
# the paving's joints (tiles.py): thin ribbons over the traced court, its own colour under each
if HAS('art/canal_court/tiles.json'):
    tj = Mesh('GROUND_JOINTS')
    for t in J('art/canal_court/tiles.json'):
        # (the HQ's joints are straight: each traced piece as a straight band along its long axis, its length and a thin width)
        P = [Vector(p) for p in t['pts']]; c = sum(P, Vector((0, 0))) / len(P)
        sxx = sum((p - c).x ** 2 for p in P); syy = sum((p - c).y ** 2 for p in P); sxy = sum((p - c).x * (p - c).y for p in P)
        a_ = 0.5 * math.atan2(2 * sxy, sxx - syy); u = Vector((math.cos(a_), math.sin(a_))); v = Vector((-u.y, u.x))
        us = [(p - c).dot(u) for p in P]; L0_, L1_ = min(us), max(us); hw = 0.045
        tj.poly([tuple(c + u * L0_ - v * hw), tuple(c + u * L1_ - v * hw), tuple(c + u * L1_ + v * hw), tuple(c + u * L0_ + v * hw)], 0.07, t['colour'])
    tj.done()
# the fallen leaves round the trees (leaves.py): crisp gold ovals over the ground (ground.py leaves the gold out)
if HAS('art/canal_court/leaves.json'):
    lv = Mesh('GROUND_LEAVES')
    for t in J('art/canal_court/leaves.json'): lv.poly(t['pts'], 0.08, t['colour'])
    lv.done()
# the dashed border round the kerb's skirt (the HQ's, READY frame: 0.41-unit dashes on a 1.06 period, 0.25 out from the skirt's
# outline's box, the sand under them darkened ~6%: #f5d988 on #ffe894); the rules' safeZone is that box (arena.py)
_KB = J('art/canal_court/kerb.json')['bands'][0]['pts']; BD_OUT = float(os.environ.get('BD_OUT', '0.03'))
_bx0, _bx1 = min(p[0] for p in _KB) - BD_OUT, max(p[0] for p in _KB) + BD_OUT
_by0, _by1 = min(p[1] for p in _KB) - BD_OUT, max(p[1] for p in _KB) + BD_OUT
DASH, PERIOD, THICK, DARKEN = 0.6, float(os.environ.get('BD_P', '1.13')), 0.17, 0.94
bd = Mesh('BORDER_DASHES')
for (ax_, ay_), (bx_, by_) in (((_bx0, _by1), (_bx1, _by1)), ((_bx1, _by1), (_bx1, _by0)), ((_bx1, _by0), (_bx0, _by0)), ((_bx0, _by0), (_bx0, _by1))):
    a_, b_ = Vector((ax_, ay_)), Vector((bx_, by_)); ln = (b_ - a_).length; u_ = (b_ - a_) / ln
    n_ = Vector((-u_.y, u_.x)) * (THICK if abs(u_.x) > 0.5 else THICK * 0.5) / 2      # (as thin on screen at the sides: a unit is 30 px across, 18 deep)
    t = (ln % PERIOD) / 2
    while t + DASH <= ln:
        q = [a_ + u_ * t + n_, a_ + u_ * (t + DASH) + n_, a_ + u_ * (t + DASH) - n_, a_ + u_ * t - n_]
        bd.face([(p.x, YC + p.y, 0.09) for p in q], [[c * DARKEN ** 2.2 for c in base_at(p.x, p.y)[:3]] + [1.0] for p in q]); t += PERIOD
bd.done()
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
    bush=dict(top='#fe8a62', south='#e8664c', west='#ee6c50', east='#f07052', north='#f67a58'),
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


POOL_K = float(os.environ.get('POOL_K', '0.76'))      # (the hole's size against the tower's: the HQ's dark pool with its soft ring, 0.69)
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
def rect_of(poly):
    """The rectangle round an outline along its long axis (its points' principal direction)."""
    P = [Vector(p) for p in poly]; c = sum(P, Vector((0, 0))) / len(P)
    sxx = sum((p - c).x ** 2 for p in P); syy = sum((p - c).y ** 2 for p in P); sxy = sum((p - c).x * (p - c).y for p in P)
    a = 0.5 * math.atan2(2 * sxy, sxx - syy); u = Vector((math.cos(a), math.sin(a))); v = Vector((-u.y, u.x))
    us = [(p - c).dot(u) for p in P]; vs = [(p - c).dot(v) for p in P]
    return [tuple(c + u * x + v * y) for x, y in ((min(us), min(vs)), (max(us), min(vs)), (max(us), max(vs)), (min(us), max(vs)))]


def half(poly, x0, east):
    """The outline's part east (or west) of x = x0 (clipped against the one line)."""
    keep = (lambda p: p[0] >= x0) if east else (lambda p: p[0] <= x0)
    out = []
    for i in range(len(poly)):
        a, b = poly[i - 1], poly[i]
        if keep(b):
            if not keep(a): t = (x0 - a[0]) / (b[0] - a[0]); out.append((x0, a[1] + t * (b[1] - a[1])))
            out.append(b)
        elif keep(a): t = (x0 - a[0]) / (b[0] - a[0]); out.append((x0, a[1] + t * (b[1] - a[1])))
    return out


# (the east rock is two blocks in the HQ: a taller one west, a lower one east of the notch at frame x 1690 (plan x 23.6))
ROCK_E_SPLIT, ROCK_E_LOW = 23.63, float(os.environ.get('ROCK_E_LOW', '0.88'))
ROCK_BEVEL = float(os.environ.get('ROCK_BEVEL', '0.22'))      # (the rocks' edges)
for name in ('rock_sw', 'rock_n', 'rock_e', 'rock_se'):
    pts = [tuple(p) for p in TOPS[name]['pts']]
    if name == 'rock_e' and ROCK_E_LOW < 1:
        # (each block a box: the HQ's are square-ended)
        soft_prism('ROCK_E', ccw(rect_of(half(pts, ROCK_E_SPLIT + 0.04, False))), -0.05, TOPS[name]['h'], name, bevel=ROCK_BEVEL)
        soft_prism('ROCK_E_low', ccw(rect_of(half(pts, ROCK_E_SPLIT - 0.04, True))), -0.05, TOPS[name]['h'] * ROCK_E_LOW, name, bevel=ROCK_BEVEL)
        continue
    soft_prism(name.upper(), ccw([tuple(p) for p in TOPS[name]['pts']]), -0.05, TOPS[name]['h'], name, keep=CORNERS[name], bevel=ROCK_BEVEL)
# the water: the tower's pool and the channel's run as the frame's (water.json), a hair over their tops
# (the pool's water reaches up over the rim's soft inner slope, just under the top: the game's shader lightens it to the lavender
# there, as the HQ's soft ring; POOL_REACH out from the hole's edge)
POOL_REACH = 0.65
w = Mesh('FLOW_pool'); w.poly(ccw(octagon(AQ['tower']['cx'], AQ['tower']['cy'], AQ['tower']['r'] * POOL_K + POOL_REACH)), TOPS['tower']['h'] - 0.06, '#4470c3'); w.done()
json.dump(dict(cx=AQ['tower']['cx'], cy=AQ['tower']['cy'], r=AQ['tower']['r'] * POOL_K), open(os.path.join(OUT, 'pool.json'), 'w'))   # (the hole's)
w = Mesh('FLOW_run'); w.poly(ccw([tuple(p) for p in WAT['run']['pts']]), WAT['run']['h'] + 0.02, '#8ad7e9')
# the spout: the pool spills over the tower's south rim, along the run's first leg, and falls down the tower's face onto the channel
# (the HQ's: one stream from the pool to the run, no gap); SPOUT_W across, its points from the pool's edge out to the tower's
SPOUT_W, SPOUT_W_LOW = 0.65, 1.1
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
# (over the rim exactly as it is built: across its top, round its rounded edge a hair outside it, straight down its face, onto the
# channel's top)
R_ = BEVEL + 0.3
steps = [(rp - 0.6, HT - 0.04), (rp + 0.05, HT + 0.03)] + \
        [(rt - BEVEL + R_ * math.sin(a), HT - BEVEL + R_ * math.cos(a)) for a in [k * math.pi / 2 / 6 for k in range(7)]] + \
        [(rt + 0.04, HC + 0.03), (rt + 0.7, HC + 0.03)]
wid = lambda k: SPOUT_W + (SPOUT_W_LOW - SPOUT_W) * k / (len(steps) - 1)
for k, ((t0, z0), (t1, z1)) in enumerate(zip(steps, steps[1:])):
    a0, a1 = c0 + u_ * t0, c0 + u_ * t1; h0, h1 = n_ * wid(k) / 2, n_ * wid(k + 1) / 2
    w.face([(a0.x - h0.x, YC + a0.y - h0.y, z0), (a1.x - h1.x, YC + a1.y - h1.y, z1), (a1.x + h1.x, YC + a1.y + h1.y, z1), (a0.x + h0.x, YC + a0.y + h0.y, z0)], '#8ad7e9')
# the inlet: the stream runs on off the channel's end and down into the basin (the HQ's: one sheet from the run to the basin's water,
# widening as it falls), from the channel's last point along its last leg
e1, e0 = Vector(L0[-1]), Vector(L0[-2]); ue = (e1 - e0).normalized(); ne = Vector((-ue.y, ue.x)); BAJ = J('art/canal_court/basin.json')
# (the HQ's channel runs on into the basin's opening, its end against the blocks' inner edge: CH_EXT on past the fitted end, its water
# with it, then down into the basin at once)
CH_EXT = float(os.environ.get('CH_EXT', '0.0')); CW = TOPS['channel'].get('width', 3.3)
if CH_EXT > 0:
    q = [e1 - ue * 0.3 - ne * CW / 2, e1 + ue * CH_EXT - ne * CW / 2, e1 + ue * CH_EXT + ne * CW / 2, e1 - ue * 0.3 + ne * CW / 2]
    soft_prism('AQUEDUCT_channel_end', ccw([(v.x, v.y) for v in q]), -0.05, HC, 'channel', bevel=0.3)
    e1 = e1 + ue * CH_EXT
    rq = [e1 - ue * (CH_EXT + 0.3) - ne * 0.5, e1 - ne * 0.5, e1 + ne * 0.5, e1 - ue * (CH_EXT + 0.3) + ne * 0.5]
    w.face([(v.x, YC + v.y, HC + 0.03) for v in rq], '#8ad7e9')
reach_in = (Vector((BAJ['cx'], BAJ['cy'])) - e1).length - BAJ['rin'] + 0.4
fall = [(0.0, HC + 0.03, 0.48), (0.12, HC - 0.05, 0.48), (reach_in, BAJ['hw'] + 0.4, 0.5), (reach_in + 0.6, BAJ['hw'] + 0.03, 0.5)]      # (within the run's width: the shader draws it as the stream)
for (t0, z0, w0), (t1, z1, w1) in zip(fall, fall[1:]):
    a0, a1 = e1 + ue * t0, e1 + ue * t1
    w.face([(a0.x - ne.x * w0, YC + a0.y - ne.y * w0, z0), (a1.x - ne.x * w1, YC + a1.y - ne.y * w1, z1), (a1.x + ne.x * w1, YC + a1.y + ne.y * w1, z1), (a0.x + ne.x * w0, YC + a0.y + ne.y * w0, z0)], '#8ad7e9')
w.done()

# the red bushes along the south (bushes.py): soft mounds over their traced tops
if HAS('art/canal_court/bushes.json'):
    BU = J('art/canal_court/bushes.json')
    for k, piece in enumerate(BU['pieces']):
        # (their outline's spikes (the mosaic's ragged edge) smoothed away: the HQ's bushes are soft mounds)
        P_ = [Vector(p) for p in piece]
        for _ in range(3): P_ = [(P_[i - 1] + P_[i] * 2 + P_[(i + 1) % len(P_)]) / 4 for i in range(len(P_))]
        soft_prism(f'BUSH_{k}', ccw([(v.x, v.y) for v in P_]), -0.05, BU['h'], 'bush', bevel=0.7)

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
BASIN_W = float(os.environ.get('BASIN_W', str(B['hw'])))
w = Mesh('FLOW_basin'); w.poly(octagon(B['cx'], B['cy'], RIN + 0.15, B['turn']), BASIN_W, '#76cde6'); w.done()

# ---------------------------------------------------------------------------------------------------------------- the props in 3D
# the barrels, the bucket, the urns, the bench and the plank as models (fit_props.py: where and how big; the tones the frame shows them
# in, as cards.py measured them), each face lit as the HQ's soft light falls: its tone between the side's and the top's by how far it
# faces up, a little darker turned away from the light (from the north-west, above)
PROPS = J('art/canal_court/props.json') if HAS('art/canal_court/props.json') else {}
CARDS_ = {c['name']: c for c in J('art/canal_court/cards.json')} if HAS('art/canal_court/cards.json') else {}
PROPS3D = {'barrel_nw', 'barrel_n', 'barrel_s', 'bucket', 'bench', 'plank', 'rack', 'urn_n', 'urn_s', 'tree_w', 'tree_ne', 'tree_se', 'post_n', 'tree_e', 'tree_red_sw'} if PROPS else set()      # (tree_e: a crown's edge the frame barely shows: left out)      # (the urns stay traced: too small to fit)
LIGHT = Vector((-0.35, 0.45, 0.82)).normalized()


def lit(colour, n):
    """sRGB tone of a face of `colour` turned to normal n: full where it faces the light, 0.78 of it facing away."""
    c = hexrgb(colour); k = 0.9 + 0.12 * max(0.0, n.dot(LIGHT))
    return '#%02x%02x%02x' % tuple(int(round(min(255, v * k))) for v in c)


def urn_marks(m, cx, cy, z0, R, H, handles, md, dk):
    """An urn's loop handles and its darker spots, drawn as the HQ's: flat shapes on the camera-facing plane through its middle (each
    handle a thick ring from the neck out past the body's side and back to the shoulder; a few round spots on its front)."""
    c = Vector((cx, YC + cy, z0 + H * 0.5)); side = Vector((1, 0, 0)); up = TOWARD.cross(side).normalized() * -1
    if up.z < 0: up = -up
    front = c + TOWARD * (R + 0.02)
    P = lambda x, y, base=c, o=0.0: tuple(base + side * x + up * y + TOWARD * o)
    for sx, reach in handles:
        k = 14; ro, ri = 0.27, 0.11
        cxh, cyh = sx * (R * 0.72 + 0.05), H * 0.02
        outer = [(cxh + sx * ro * math.cos(t), cyh + ro * 1.3 * math.sin(t)) for t in [-math.pi / 2 + math.pi * i / k for i in range(k + 1)]]
        inner = [(cxh + sx * ri * math.cos(t), cyh + ri * 1.3 * math.sin(t)) for t in [-math.pi / 2 + math.pi * i / k for i in range(k + 1)]]
        for i in range(k):
            m.face([P(*outer[i], o=R * 0.3), P(*outer[i + 1], o=R * 0.3), P(*inner[i + 1], o=R * 0.3), P(*inner[i], o=R * 0.3)], md if i < k // 2 else dk)
    for (x, y, r) in ((-0.22, -0.05, 0.06), (0.15, 0.1, 0.05), (0.05, -0.28, 0.055), (-0.05, 0.25, 0.045)):
        m.face([P(x * R / 0.5 + r * math.cos(t), y * H / 1.5 + r * math.sin(t), base=front) for t in [2 * math.pi * i / 10 for i in range(10)]], dk)


def lathe(m, cx, cy, z0, prof, colours, seg=20):
    """A turned shape: the profile [(r, z)] about (cx, cy) from z0, band i (between profile points i and i+1) in colours[i]."""
    for i in range(len(prof) - 1):
        (r0, za), (r1, zb) = prof[i], prof[i + 1]
        for k in range(seg):
            a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
            q = [(cx + r0 * math.cos(a0), cy + r0 * math.sin(a0), z0 + za), (cx + r0 * math.cos(a1), cy + r0 * math.sin(a1), z0 + za),
                 (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1), z0 + zb), (cx + r1 * math.cos(a0), cy + r1 * math.sin(a0), z0 + zb)]
            am = (a0 + a1) / 2; dr, dz = r1 - r0, zb - za; L = math.hypot(dr, dz) or 1
            n = Vector((math.cos(am) * dz / L, math.sin(am) * dz / L, -dr / L))
            m.face([(x, YC + y, z) for x, y, z in q], lit(colours[i], n))


def disc(m, cx, cy, z, r, colour, seg=20):
    m.poly([(cx + r * math.cos(2 * math.pi * k / seg), cy + r * math.sin(2 * math.pi * k / seg)) for k in range(seg)], z, colour)


def tone(name, k, fallback):
    """The k-th most used tone of the prop's card (cards.py, from the READY frame)."""
    c = CARDS_.get(name)
    if c is None: return fallback
    count = {}
    for sh in c['shapes']: count[sh['colour']] = count.get(sh['colour'], 0) + sum(len(l) for l in sh['loops'])
    order = sorted(count, key=lambda q: -count[q])
    return order[k] if k < len(order) else fallback


_th = math.radians(CAM['pitchDeg'])
TOWARD = Vector((0, -math.cos(_th), math.sin(_th)))     # (from the scene towards the camera)
_R = [[1, 0, 0], [0, -math.sin(_th), -math.cos(_th)], [0, math.cos(_th), -math.sin(_th)]]
_RT = lambda v: Vector((sum(_R[i][0] * v[i] for i in range(3)), sum(_R[i][1] * v[i] for i in range(3)), sum(_R[i][2] * v[i] for i in range(3))))
_FZ = CAM['focalPx'] * ZOOM


def on_card(u, v, foot):
    """The frame pixel (u, v) put on the upright plane facing the camera through the plan point `foot` (as cards.py does): the camera
    never turns, so a shape drawn there shows exactly as drawn in the frame from every framing the game uses."""
    cam = Vector(tuple(c * 100 for c in CAM['centre'])); view = _RT((0, 0, 1))
    d = _RT(((u - 960) / _FZ, (v - 540) / _FZ, 1.0)).normalized(); A = Vector((foot[0], YC + foot[1], 0.0))
    t = (A - cam).dot(view) / d.dot(view); return tuple(cam + d * t)


def rack():
    """The utensil rack by the west kerb, drawn as the READY frame shows it (its pixels measured): two dark posts (their feet at frame
    x 193 and 304, y 432) with rounded tan caps, a bar across them at y 370-380 lashed with pale rope, and three green utensils hanging
    from it (a blade, a whisk, a slotted spatula), brown-handled; each part a crisp flat shape on the camera-facing plane through its foot,
    the nearer parts a hair towards the camera."""
    m = Mesh('PROP_rack'); foot = (-23.1, 4.22)
    post, postL, bar, cap, capD, rope, green, greenD, handle = '#645c5b', '#7a6f6c', '#65675d', '#d0b898', '#b89a78', '#f0dcbd', '#98a58e', '#7f8f78', '#9a8771'
    layer = [0]
    def shape(pts, col):
        off = TOWARD * (0.01 * layer[0]); layer[0] += 1
        P = [Vector(on_card(u, v, foot)) + off for u, v in pts]
        up_ = TOWARD.cross(Vector((1, 0, 0)))
        flat2 = [[Vector((q.x, (q - P[0]).dot(up_), 0)) for q in P]]
        for tri in tessellate_polygon(flat2): m.face([tuple(P[i]) for i in tri], col)
    ell = lambda cx, cy, rx, ry, n=20: [(cx + rx * math.cos(t), cy + ry * math.sin(t)) for t in [2 * math.pi * k / n for k in range(n)]]
    shape([(163, 370), (331, 370), (331, 380), (163, 380)], bar)                                    # the bar
    for u0 in (187, 297):                                                                           # the posts: a lit left edge
        shape([(u0, 350), (u0 + 13, 350), (u0 + 14, 432), (u0 + 1, 432)], post)
        shape([(u0, 350), (u0 + 3, 350), (u0 + 4, 432), (u0 + 1, 432)], postL)
        shape(ell(u0 + 6.5, 347, 7.5, 5), capD); shape(ell(u0 + 6, 346, 6, 3.8), cap)              # their caps (end grain)
        # the joint: a pale loop of rope round it, and the round tan end of a peg through it
        loop = [(u0 + 7 + 17 * math.cos(t), 381 + 11 * math.sin(t)) for t in [math.pi * (0.55 + 1.3 * k / 16) for k in range(17)]]
        inner_ = [(u0 + 7 + 14 * math.cos(t), 381 + 8.5 * math.sin(t)) for t in [math.pi * (0.55 + 1.3 * k / 16) for k in range(17)]]
        for i in range(16): shape([loop[i], loop[i + 1], inner_[i + 1], inner_[i]], rope)
        shape(ell(u0 + 9, 385, 8, 8.5), capD); shape(ell(u0 + 8.5, 384, 6.8, 7), cap)
    shape([(208, 356), (219, 352), (223, 368), (224, 412), (217, 420), (211, 405), (209, 378)], green)   # the blade
    shape([(212, 360), (215, 358), (218, 410), (215, 414)], greenD)
    shape([(245, 356), (249, 356), (249, 382), (245, 382)], green)                                     # the whisk
    ring_o = ell(247, 368, 15, 14, 24); ring_i = ell(247, 368, 11, 10.5, 24)
    for i in range(24):
        j = (i + 1) % 24; shape([ring_o[i], ring_o[j], ring_i[j], ring_i[i]], green)
    shape(ell(253, 397, 6, 13), handle)
    shape([(276, 356), (298, 354), (299, 378), (290, 382), (279, 380)], green)                        # the spatula
    for u0 in (281, 286, 291): shape([(u0, 360), (u0 + 2.5, 360), (u0 + 2.5, 372), (u0, 372)], '#e8e2cf')
    shape(ell(294, 394, 5.5, 13), handle)
    m.done()


# the autumn trees round the court, in 3D: a purple trunk from its foot, leaning as the frame draws it (its base and the point it leaves the
# frame, frame pixels, put on the camera-facing plane through the foot), and a crown of soft gold lobes over it (light on top, a deeper
# gold and orange below), as the HQ's maples; the game's camera only ever shows their trunks and the crowns' lower edges
TREES = {   # name: foot (plan), trunk base and top (frame px), trunk width px, crown: centre px, radius px (the mosaic's view of each)
    'tree_ne': ((28.34, 16.43), (1784, 141), (1829, 18), 36, (1835, -45), 95),
    'tree_w': ((-30.9, 9.59), (25, 271), (21, 158), 26, (45, 75), 80),
    'tree_se': ((29.29, -18.38), (1954, 1058), (1966, 950), 30, (1980, 896), 82),      # (its crown seen at 661 s: frame 39660)
    'post_n': ((-17.52, 22.09), (458, 14), (462, -60), 26, (470, -150), 85),
    'tree_red_sw': ((-27.6, -21.2), (60, 1250), (55, 1180), 26, (45, 1125), 80),      # (a red maple past the court's south-west corner: only its crown's top in the frame)
}


def crown_tone(nz, nx, red=False):
    if red: stops = [(-1.0, (0xd8, 0x50, 0x3c)), (-0.2, (0xe8, 0x62, 0x48)), (0.4, (0xf2, 0x74, 0x54)), (1.0, (0xfa, 0x8a, 0x62))]
    else: stops = [(-1.0, (0xdc, 0x8e, 0x48)), (-0.2, (0xe6, 0xa6, 0x56)), (0.4, (0xee, 0xbe, 0x62)), (1.0, (0xf4, 0xd2, 0x74))]
    t = max(-1.0, min(1.0, nz + 0.15 * nx))
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            u = max(0.0, min(1.0, (t - t0) / (t1 - t0))); return lin('#%02x%02x%02x' % tuple(int(c0[i] + (c1[i] - c0[i]) * u) for i in range(3)))
    return lin('#f6d87c')


def tree(name):
    foot, (bu, bv), (tu, tv), wpx, (cu, cv), rpx = TREES[name]
    m = Mesh(f'TREE_{name}')
    b = Vector(on_card(bu, bv, foot)); t = Vector(on_card(tu, tv, foot))
    ax = (t - b); L = ax.length; ax.normalize()
    t = b + ax * L * 1.45                                                        # (on up into the crown)
    px_unit = (Vector(on_card(bu + 100, bv, foot)) - b).length / 100            # (units a frame pixel, on this card)
    r0 = wpx * px_unit / 2
    side = ax.cross(TOWARD).normalized(); fwd = side.cross(ax).normalized()
    seg = 10
    for k in range(seg):                                                           # (the trunk: tapering a little upwards)
        a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
        ring = lambda a, rr, base: base + (side * math.cos(a) + fwd * math.sin(a)) * rr
        q = [ring(a0, r0, b - ax * 0.3), ring(a1, r0, b - ax * 0.3), ring(a1, r0 * 0.8, t), ring(a0, r0 * 0.8, t)]
        n = (side * math.cos((a0 + a1) / 2) + fwd * math.sin((a0 + a1) / 2))
        m.face([tuple(v) for v in q], lit('#7b78a6', n))
    if True:       # (each trunk forks high up: a second branch off to the left, as the frame's)
        fb = b + ax * L * 0.85; ft = Vector(on_card(tu - 25, tv - 40, foot)); ax2 = (ft - fb).normalized()
        side2 = ax2.cross(TOWARD).normalized(); fwd2 = side2.cross(ax2).normalized()
        for k in range(seg):
            a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
            ring2 = lambda a, rr, base: base + (side2 * math.cos(a) + fwd2 * math.sin(a)) * rr
            q = [ring2(a0, r0 * 0.7, fb), ring2(a1, r0 * 0.7, fb), ring2(a1, r0 * 0.55, ft), ring2(a0, r0 * 0.55, ft)]
            m.face([tuple(v) for v in q], lit('#7b78a6', side2 * math.cos((a0 + a1) / 2) + fwd2 * math.sin((a0 + a1) / 2)))
    C = Vector(on_card(cu, cv, foot)); R = rpx * px_unit
    tmp = bmesh.new(); bmesh.ops.create_icosphere(tmp, subdivisions=3, radius=1.0); tmp.normal_update()
    # (the HQ's maples: a rounded mass a little taller than wide, lobed, its edge leafy-rough: lobes stacked up the crown, each vertex
    # pushed in or out a little by a hash of where it is)
    lobes = [(Vector((0, 0, 0)), 1.0), (Vector((-0.5, 0.1, -0.4)), 0.72), (Vector((0.48, -0.05, -0.35)), 0.7), (Vector((0.0, -0.3, -0.55)), 0.66),
             (Vector((-0.3, 0.2, 0.45)), 0.66), (Vector((0.32, 0.15, 0.42)), 0.62), (Vector((0.05, 0.0, 0.8)), 0.5)]
    for off, sc_ in lobes:
        for f_ in tmp.faces:
            rough = lambda v: 1.0 + 0.07 * math.sin(v.co.x * 23.0 + v.co.y * 17.0 + v.co.z * 31.0 + sc_ * 9.0)
            pts = [C + (off * Vector((1.0, 1.0, 1.0)) + v.co * sc_ * rough(v) * Vector((0.95, 0.85, 1.0))) * R * 0.92 for v in f_.verts]
            # (each vertex its tone by how far it faces up: the HQ's crowns shade softly, light gold on top to orange under)
            m.face([tuple(p) for p in pts], [crown_tone(v.co.normalized().z, v.co.normalized().x, name == 'tree_red_sw') for v in f_.verts])
    tmp.free()
    m.done()


import numpy as np
for name in sorted(PROPS3D):
    if name in TREES: tree(name); continue
    if name == 'tree_e': continue
    if name == 'rack': rack(); continue
    P = PROPS[name]; v = P['v']; z0 = P['z0']; m = Mesh(f'PROP_{name}')
    if name.startswith('barrel'):
        cx, cy, r, h = v
        body, light, inner, water, spark = '#96815b', '#a78c66', '#636161', '#72c7d4', '#c6e0e3'      # (the READY frame's, as Chrome shows it)
        # (staves in two tiers, a darker groove between and under them, a thick rim at the top, the water inside a little down)
        # (the HQ's: ten staves, two thin light hoops, a thick light rim on top, a dark inner wall down to the water well inside)
        prof = [(r * 0.92, 0.0), (r * 0.97, h * 0.3), (r * 0.99, h * 0.38), (r, h * 0.62), (r, h * 0.7), (r * 0.97, h)]
        lathe(m, cx, cy, z0, prof, [body, light, body, light, body], seg=10)
        lathe(m, cx, cy, z0, [(r * 0.97, h), (r * 0.62, h)], [light], seg=10)
        lathe(m, cx, cy, z0, [(r * 0.62, h), (r * 0.6, h * 0.72)], [inner], seg=10)
        disc(m, cx, cy, z0 + h * 0.72, r * 0.6, water, seg=10)
        m.poly([(cx + 0.05 + 0.13 * math.cos(2 * math.pi * k / 10), cy - 0.2 + 0.06 * math.sin(2 * math.pi * k / 10)) for k in range(10)], z0 + h * 0.72 + 0.01, spark)
    elif name == 'bucket':
        cx, cy, r, h = v
        body, rim, water = '#82706c', '#636a70', '#7dc9d7'
        lathe(m, cx, cy, z0, [(r * 0.85, 0.0), (r, h)], [body])
        lathe(m, cx, cy, z0, [(r, h), (r * 0.8, h)], [rim])
        lathe(m, cx, cy, z0, [(r * 0.8, h), (r * 0.78, h * 0.8)], [rim])
        disc(m, cx, cy, z0 + h * 0.8, r * 0.78, water)
    elif name.startswith('urn'):
        # (measured on the READY frame: their bodies' feet on the blocks' tops, widths and heights; the north one a round-lidded amphora
        # with two loop handles, the south one a jug with a wide dark mouth)
        cx, cy, R, H = (15.01, 1.3, 0.6, 1.55) if name == 'urn_n' else (10.73, -5.82, 0.5, 1.5)
        lt, md, dk = ('#c88e72', '#a8735d', '#8a5e4e') if name == 'urn_n' else ('#b37d69', '#9e6a51', '#7c5d57')
        if name == 'urn_n':
            prof = [(R * 0.5, 0.0), (R * 0.88, H * 0.15), (R, H * 0.38), (R * 0.9, H * 0.6), (R * 0.55, H * 0.76), (R * 0.5, H * 0.82),
                    (R * 0.62, H * 0.86), (R * 0.45, H * 0.96), (0.0, H)]
            lathe(m, cx, cy, z0, prof, [dk, md, md, md, md, lt, '#ecac88', '#ecac88'], seg=18)
            urn_marks(m, cx, cy, z0, R, H, [(-1, 0.62), (1, 0.62)], md, dk)
        else:
            prof = [(R * 0.55, 0.0), (R * 0.92, H * 0.2), (R, H * 0.45), (R * 0.85, H * 0.7), (R * 0.62, H * 0.86), (R * 0.72, H * 0.97), (R * 0.68, H)]
            lathe(m, cx, cy, z0, prof, [dk, md, lt, md, md, '#af8778'], seg=18)
            lathe(m, cx, cy, z0, [(R * 0.68, H), (R * 0.55, H)], ['#af8778'], seg=18)
            disc(m, cx, cy, z0 + H * 0.98, R * 0.55, '#66504c', seg=18)
            urn_marks(m, cx, cy, z0, R, H, [(1, 0.8)], md, dk)
    else:      # (bench, plank: boxes)
        cx, cy, a, b, t, h = v; a, b = abs(a), abs(b)
        if name == 'plank':      # (a little stool-bench, turned: its top on short legs (the frame shows a foot under its south end))
            h, a, cy = float(os.environ.get('PLANK_H', '0.8')), a * 1.25, cy - float(os.environ.get('PLANK_DY', '0.15'))
        if name == 'bench':      # (its silhouette fits a low box as well as the HQ's taller bench: its legs show it is ~1.1 high, 0.65 deep)
            h, b, cy = float(os.environ.get('BENCH_H', '1.3')), float(os.environ.get('BENCH_B', '0.85')), cy - float(os.environ.get('BENCH_DY', '0.55'))
        c_, s_ = math.cos(t), math.sin(t)
        P_ = lambda x, y: (cx + c_ * x - s_ * y, cy + s_ * x + c_ * y)
        top, side = ('#9c866e', '#86755a') if name == 'bench' else ('#9d8571', '#817463')
        def box(x0, y0, x1, y1, za, zb):
            q = [P_(x0, y0), P_(x1, y0), P_(x1, y1), P_(x0, y1)]
            for i in range(4):
                p0, p1 = Vector(q[i]), Vector(q[(i + 1) % 4]); d = p1 - p0; n = Vector((d.y, -d.x, 0)).normalized()
                if (p0 - Vector((cx, cy))).dot(n.xy) < 0: n = -n
                m.face([(p0.x, YC + p0.y, za), (p1.x, YC + p1.y, za), (p1.x, YC + p1.y, zb), (p0.x, YC + p0.y, zb)], lit(side, n))
            m.poly(q, zb, top)
        if name == 'bench':        # (a slab on two end legs, as the HQ's: a deep top, a thin slab, two square legs at its ends)
            box(-a, -b, a, b, h * 0.72, h)
            for sx in (-1, 1): box(sx * a * 0.78 - a * 0.14, -b * 0.85, sx * a * 0.78 + a * 0.14, b * 0.6, 0.0, h * 0.72)
        elif name == 'plank':      # (a thick top on two short legs at the ends of its long side)
            box(-a, -b, a, b, h * 0.4, h)
            for sy in (-1, 1): box(-a * 0.7, sy * b * 0.8 - b * 0.12, a * 0.7, sy * b * 0.8 + b * 0.12, 0.0, h * 0.4)
        else:
            box(-a, -b, a, b, 0.0, h)
    m.done()

# ---------------------------------------------------------------------------------------------------------------- what stands
# the trees, stump, pots, bunting, aloe, tufts and bamboo as traced cards (cards.py): upright planes through each foot, facing the camera
# (the game's camera never turns), each tone a flat shape, the later tones a hair nearer the camera; the trees' named TREE_<k>_tree
CAMV = Vector(tuple(v * 100 for v in CAM['centre'])); _pth = math.radians(CAM['pitchDeg'])
TOWARD = Vector((0, -math.cos(_pth), math.sin(_pth)))     # (from the scene towards the camera: its view direction reversed)
if HAS('art/canal_court/cards.json'):
    for c in J('art/canal_court/cards.json'):
        if c['name'] in PROPS3D: continue          # (built in 3D below)
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
HI = 'hi' in args[1:]          # (hi: the READY view at twice the size, for comparing with the round's zoomed-in frames)
if HI: sc.render.resolution_x, sc.render.resolution_y = 3840, 2160
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
