"""The warm-up in 3D, object by object (2026-11-12): foomerang-fu physics hq.mp4 0:00 (the warm-up round's READY frame), seen through the
game's camera. Our own models, flat-coloured as the HQ's are (unlit vertex colours: each face its measured tone):

  ground    the grass as ground.py measures it: a smooth base field, crisp flat shapes over it (patches, shadows, the dark outskirts);
            a hole where the moat runs
  moat      its banks' pale green glow on the grass, the lavender kerb (a light rim on top, a darker face down to the water), the water
            (one sheet, FOUNTAIN_water: the game draws its water on it, waterShader.ts)
Exports warm_up.glb; with `render`, also render.png through the HQ's camera.

  Blender -b --python art/warm_up/blender/build.py -- <out_dir> [render]
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER, WIDE = args[0], 'render' in args[1:], 'wide' in args[1:]      # (wide: the round's mosaic's view, 2160 x 1240, the frame in its middle)
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
CAM = J('art/sky_islands/camera.json'); ZOOM = J('art/warm_up/zoom.json')['zoom']
YC = 73.72                                                     # (measure.py: the ground point under the frame's centre)
G = J('art/warm_up/ground.json'); MOAT = J('art/warm_up/moat.json')
bpy.ops.wm.read_factory_settings(use_empty=True)
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

WATER_Z = -0.8            # (the far banks' lavender faces: 15-22 px tall in the frame)
RIM = 0.3                 # (the far banks' kerb's light top)
GLOW = 0.5                # (the grass's pale green glow along every bank)
GLOW_FLAT = 0.3           # (its full width: the frame's #bdea9c from the edge 0.3 in, gone by 0.5)
FILL = 0.8                # (the grass strip along every bank over the ground grid's left-out cells: more than a cell's diagonal)
COL = dict(rim='#a6b4e9', face='#8694d1', face_sw='#6c8ad0', water='#64a8e8', glow='#bdea9c', glow_edge='#bce6ab', line='#aee0fe')
# (a far bank's face turned south-west, the water south-west of it, is darker and bluer in the frame: #6c91d3, #6b84cc; one turned
# south-east as `face`, #8796d3)


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


def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


def in_moat(pt): return inside(pt, MOAT['outer']) and not inside(pt, MOAT['inner'])


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
        # (a cell the moat's outline crosses is left out: the grid's steps would show as teeth along the diagonal banks; the banks'
        # filler strip, MOAT_BANKS, lays the grass there up to the outline exactly)
        if in_moat((x0 + DG / 2, y0 + DG / 2)) or any(in_moat(q) for q in pts): continue
        g.face([(x, YC + y, 0.0) for x, y in pts], [base_at(x, y) for x, y in pts])
g.done()
sh = Mesh('GROUND_SHAPES')
for k, s in enumerate(G['shapes']):
    sh.poly(s['pts'], 0.004 + 0.0004 * k, s['colour'], s.get('holes', []))
sh.done()


# ---------------------------------------------------------------------------------------------------------------- the moat
def ring_edges(poly, island):
    """The polygon's edges with the outward normal pointing into the water: for the outer outline, inwards; for the island, outwards."""
    n = len(poly); a2 = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    ccw = a2 > 0
    out = []
    for i in range(n):
        a, b = Vector(poly[i]), Vector(poly[(i + 1) % n]); d = (b - a).normalized()
        left = Vector((-d.y, d.x))                      # (the polygon's inside, when it runs counter-clockwise)
        into_water = (left if ccw else -left) * (-1 if island else 1)
        out.append((a, b, into_water))
    return out


def offset(poly, dist, island):
    """The outline moved `dist` into the water, corners on the bisectors (rectilinear outlines: exact)."""
    E = ring_edges(poly, island); n = len(E); pts = []
    for i in range(n):
        (a0, b0, n0), (a1, b1, n1) = E[i - 1], E[i]
        bis = n0 + n1; cosh = max(0.3, bis.normalized().dot(n0)) if bis.length > 1e-6 else 1.0
        pts.append(a1 + bis.normalized() * dist / cosh if bis.length > 1e-6 else a1 + n0 * dist)
    return pts


m = Mesh('MOAT_BANKS')
for key, island in (('outer', False), ('inner', True)):
    poly = MOAT[key]; P0 = [Vector(p) for p in poly]
    Pr = offset(poly, RIM, island); Pg = offset(poly, -GLOW, island); Pm = offset(poly, -GLOW_FLAT, island)
    n = len(poly)
    Pf = offset(poly, -FILL, island)
    for i in range(n):
        j = (i + 1) % n
        # the grass from the outline to past the ground's left-out cells (beneath the glow and the traced shapes)
        m.face([(Pf[i].x, YC + Pf[i].y, 0.001), (Pf[j].x, YC + Pf[j].y, 0.001), (P0[j].x, YC + P0[j].y, 0.001), (P0[i].x, YC + P0[i].y, 0.001)],
               [base_at(Pf[i].x, Pf[i].y), base_at(Pf[j].x, Pf[j].y), base_at(P0[j].x, P0[j].y), base_at(P0[i].x, P0[i].y)])
        # the glow on the grass (the frame, every bank alike: a band of #bdea9c GLOW_FLAT wide, a hair bluer at the edge, then gone
        # to the grass by GLOW in)
        m.face([(Pm[i].x, YC + Pm[i].y, 0.006), (Pm[j].x, YC + Pm[j].y, 0.006), (P0[j].x, YC + P0[j].y, 0.006), (P0[i].x, YC + P0[i].y, 0.006)],
               [COL['glow'], COL['glow'], COL['glow_edge'], COL['glow_edge']])
        m.face([(Pg[i].x, YC + Pg[i].y, 0.006), (Pg[j].x, YC + Pg[j].y, 0.006), (Pm[j].x, YC + Pm[j].y, 0.006), (Pm[i].x, YC + Pm[i].y, 0.006)],
               [base_at(Pg[i].x, Pg[i].y), base_at(Pg[j].x, Pg[j].y), COL['glow'], COL['glow']])
        # a far bank (the water south of it: its face turned to the camera) has the kerb's light top and its face down to the water;
        # a near bank shows neither (the frame: the water runs straight to the grass's glow there)
        dwat = (Pr[i] - P0[i]); dwat = dwat.normalized() if dwat.length > 1e-6 else dwat
        if dwat.y < -0.3:
            m.face([(P0[i].x, YC + P0[i].y, 0.02), (P0[j].x, YC + P0[j].y, 0.02), (Pr[j].x, YC + Pr[j].y, 0.02), (Pr[i].x, YC + Pr[i].y, 0.02)], COL['rim'])
            m.face([(Pr[i].x, YC + Pr[i].y, 0.02), (Pr[j].x, YC + Pr[j].y, 0.02), (Pr[j].x, YC + Pr[j].y, WATER_Z), (Pr[i].x, YC + Pr[i].y, WATER_Z)], COL['face_sw' if dwat.x < -0.3 else 'face'])
        # the bright line where a far wall meets the water (frame 0.0 s: 1-2 px of #aee0fe under the face)
        if dwat.y < -0.3:
            Pw = [Pr[i] + dwat * 0.09, Pr[j] + (Pr[j] - P0[j]).normalized() * 0.09]
            m.face([(Pr[i].x, YC + Pr[i].y, WATER_Z + 0.01), (Pr[j].x, YC + Pr[j].y, WATER_Z + 0.01), (Pw[1].x, YC + Pw[1].y, WATER_Z + 0.01),
                    (Pw[0].x, YC + Pw[0].y, WATER_Z + 0.01)], COL['line'])
m.done()
# the water's colour across its channel (water_across.py: lighter under a far bank, darker by a near one): how far across a spot
# lies, 0 at a far bank, 1 at a near one, from its distances to the outlines' far and near edges
ACROSS = J('art/warm_up/water_across.json')
BANK_EDGES = []
for key, island in (('outer', False), ('inner', True)):
    for a_, b_, nrm in ring_edges(MOAT[key], island):
        BANK_EDGES.append((a_, b_, nrm.y < -0.3))


def seg_dist(p, a_, b_):
    d = b_ - a_; L2 = d.length_squared or 1e-9; t = max(0.0, min(1.0, (p - a_).dot(d) / L2)); return (a_ + d * t - p).length


def across_colour(x, y):
    p = Vector((x, y)); df = min(seg_dist(p, a_, b_) for a_, b_, far in BANK_EDGES if far)
    dn = min(seg_dist(p, a_, b_) for a_, b_, far in BANK_EDGES if not far); t = df / max(df + dn, 1e-6)
    for (t0, c0), (t1, c1) in zip(ACROSS, ACROSS[1:]):
        if t <= t1 or (t1, c1) == tuple(ACROSS[-1]):
            u = max(0.0, min(1.0, (t - t0) / (t1 - t0)))
            a0 = [int(c0[i:i + 2], 16) for i in (1, 3, 5)]; a1 = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
            return lin('#%02x%02x%02x' % tuple(int(round(a0[k] + (a1[k] - a0[k]) * u)) for k in range(3)))
    return lin(ACROSS[-1][1])


ACROSS_AT = {}
def across_at(x, y):
    k = (round(x, 3), round(y, 3))
    if k not in ACROSS_AT: ACROSS_AT[k] = across_colour(x, y)
    return ACROSS_AT[k]


w = Mesh('FOUNTAIN_water')
outer_w = offset(MOAT['outer'], RIM, False); inner_w = offset(MOAT['inner'], RIM, True)
# (the ring as one sheet: a quad strip between the two outlines would cross; a coarse grid of the ring's cells instead)
for j in range(int(90 / 0.5)):
    for i in range(int(90 / 0.5)):
        x0, y0 = -45 + i * 0.5, -45 + j * 0.5
        if in_moat((x0 + 0.25, y0 + 0.25)) or any(in_moat(p) for p in ((x0, y0), (x0 + 0.5, y0 + 0.5), (x0 + 0.5, y0), (x0, y0 + 0.5))):
            q = [(x0, y0), (x0 + 0.5, y0), (x0 + 0.5, y0 + 0.5), (x0, y0 + 0.5)]
            w.face([(x, YC + y, WATER_Z) for x, y in q], [across_at(x, y) for x, y in q])
# (the game reads the water's field over a square: the sheet's x-half widened 3% about its middle (ThreePlaza.ts); the sheet reaches as
# far in x as in y, under the land where the moat is narrower: hidden there)
xs = [v.co.x for v in w.bm.verts]; ys = [v.co.y - YC for v in w.bm.verts]
span = max(max(xs) - min(xs), max(ys) - min(ys)); mx = (max(xs) + min(xs)) / 2; my = (max(ys) + min(ys)) / 2
for sx in (-1, 1):
    x0 = mx + sx * span / 2 - (0.5 if sx > 0 else 0)
    w.face([(x0, YC + my, WATER_Z - 0.05), (x0 + 0.5, YC + my, WATER_Z - 0.05), (x0 + 0.5, YC + my + 0.5, WATER_Z - 0.05), (x0, YC + my + 0.5, WATER_Z - 0.05)], COL['water'])
json.dump(dict(cx=mx, cy=my, half=span / 2 * 1.03), open(os.path.join(OUT, 'water_box.json'), 'w'))
w.done()

# ---------------------------------------------------------------------------------------------------------------- the dashed border
# the square turned 45 degrees (layout.json: u, v the moat's axes), dashed: 0.45-unit dashes on a 1.29 period, ~3 px (0.11) thick, the
# ground they lie on darkened ~6% (the frame: #d0e98d on #ddf497; the water's colour where one crosses the moat)
BD = J('art/warm_up/layout.json')['border']; DASH, PERIOD, THICK = 0.45, 1.29, 0.11
R2_ = math.sqrt(2); uv_xy = lambda u, v: ((u - v) / R2_, (u + v) / R2_)
corners = [(BD['u0'], BD['v0']), (BD['u1'], BD['v0']), (BD['u1'], BD['v1']), (BD['u0'], BD['v1'])]
bd = Mesh('BORDER_DASHES')
DARK = 0.94 ** 2.2                      # (an sRGB x0.94 in linear)
for i in range(4):
    a_, b_ = Vector(uv_xy(*corners[i])), Vector(uv_xy(*corners[(i + 1) % 4])); ln = (b_ - a_).length; u_ = (b_ - a_) / ln
    n_ = Vector((-u_.y, u_.x)) * THICK / 2; t = 0.0
    while t + DASH <= ln:
        q = [a_ + u_ * t + n_, a_ + u_ * (t + DASH) + n_, a_ + u_ * (t + DASH) - n_, a_ + u_ * t - n_]
        cols = [[c * DARK for c in (across_at(p.x, p.y) if in_moat((p.x, p.y)) else base_at(p.x, p.y))[:3]] + [1.0] for p in q]
        bd.face([(p.x, YC + p.y, 0.05) for p in q], cols); t += PERIOD
bd.done()


# ---------------------------------------------------------------------------------------------------------------- what stands
# the trees, stump, pots, bunting, aloe, tufts and bamboo as traced cards (cards.py): upright planes through each foot, facing the camera
# (the game's camera never turns), each tone a flat shape, the later tones a hair nearer the camera; the trees' named TREE_<k>_tree
CAMV = Vector(tuple(v * 100 for v in CAM['centre'])); _pth = math.radians(CAM['pitchDeg'])
TOWARD = Vector((0, -math.cos(_pth), math.sin(_pth)))     # (from the scene towards the camera: its view direction reversed)
if HAS('art/warm_up/cards.json'):
    for c in J('art/warm_up/cards.json'):
        m = Mesh(f'CARD_{c["name"]}')
        for sh in c['shapes']:
            off = TOWARD * (0.004 * sh['layer'])
            loops = [[Vector((x, YC + y, z)) + off for x, y, z in lp] for lp in sh['loops']]
            # (triangulated in the card's own plane: the points' screen layout)
            up_ = TOWARD.cross(Vector((1, 0, 0)))
            flat_ = [[Vector((v.x, (v - loops[0][0]).dot(up_), 0)) for v in lp] for lp in loops]
            verts = [v for lp in loops for v in lp]
            for tri in tessellate_polygon(flat_):
                f_ = m.face([tuple(verts[i]) for i in tri], sh['colour'])
        m.done()

# ---------------------------------------------------------------------------------------------------------------- the pens
# each pen (fit_pens.py) four soft lavender walls round a player at the start, its lever (a tan box, a pink stem, a cyan knob) on the island
# end; named PEN_<k>_wall<j> and PEN_<k>_lever in the rules' order (warmUpArena.ts: W, N, E, S): the game tints and drops them when the
# lever is struck (render/penOpening.ts)
PENS = J('art/warm_up/pens.json'); LV = J('art/warm_up/layout.json')['levers']
PCOL = dict(top='#a8b5e3', side='#909ad5', back='#96a3dc')


def box3(m, corners, z0, z1, top, side, back, bevel=0.08):
    """A wall: a box over a plan quad (counter-clockwise), its top edges softly bevelled, each side toned by its facing."""
    n = 4; c = Vector((sum(p[0] for p in corners) / 4, sum(p[1] for p in corners) / 4))
    inset = [c + (Vector(p) - c) * (1 - bevel / max(0.2, (Vector(p) - c).length)) for p in corners]
    for i in range(n):
        j = (i + 1) % n; a_, b_ = Vector(corners[i]), Vector(corners[j]); d = b_ - a_; nrm = Vector((d.y, -d.x)).normalized()
        col = side if nrm.y < -0.3 else back
        m.face([(a_.x, YC + a_.y, z0), (b_.x, YC + b_.y, z0), (b_.x, YC + b_.y, z1 - bevel), (a_.x, YC + a_.y, z1 - bevel)], col)
        m.face([(a_.x, YC + a_.y, z1 - bevel), (b_.x, YC + b_.y, z1 - bevel), (inset[j].x, YC + inset[j].y, z1), (inset[i].x, YC + inset[i].y, z1)], top)
    m.face([(p.x, YC + p.y, z1) for p in inset], top)


for k, name in enumerate(('W', 'N', 'E', 'S')):
    p = PENS['pens'][name]; a_, b_, t_, h_ = PENS['a'], PENS['b'], PENS['t'], PENS['h']
    ang = math.radians(45 + p['turn']); ux, uy = math.cos(ang), math.sin(ang); vx, vy = -uy, ux
    P = lambda s_, r_: (p['cx'] + ux * s_ + vx * r_, p['cy'] + uy * s_ + vy * r_)
    root = bpy.data.objects.new(f'PEN_{k}', None); sc.collection.objects.link(root)
    walls = [(-a_, -b_, a_, -b_ + t_), (-a_, b_ - t_, a_, b_), (-a_, -b_ + t_, -a_ + t_, b_ - t_), (a_ - t_, -b_ + t_, a_, b_ - t_)]
    for j, (s0, r0, s1, r1) in enumerate(walls):
        m = Mesh(f'PEN_{k}_wall{j}')
        box3(m, [P(s0, r0), P(s1, r0), P(s1, r1), P(s0, r1)], WATER_Z if False else -0.05, h_, PCOL['top'], PCOL['side'], PCOL['back'])
        m.done(root)
    # the lever where the frame has it (layout.py): its tan housing 1.8 up, its knob in front of it 1.4 up
    kx, ky = LV[name]; hx, hy = J('art/warm_up/layout.json')['housings'][name]
    m = Mesh(f'PEN_{k}_lever')
    d = Vector((kx - hx, ky - hy)); dl = d.length or 1; d /= dl; e = Vector((-d.y, d.x))
    # (the frame's housings: ~39 x 42 px, a rounded block a little wider than deep)
    hq = [Vector((hx, hy)) + d * sx * 0.38 + e * sy * 0.55 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    box3(m, [(q.x, q.y) for q in hq], 1.35, 2.25, '#e6c3a0', '#d2a785', '#dcb592', bevel=0.2)
    # the slot in its face to the knob, where the stem comes out (the frame: #a08575)
    f0 = Vector((hx, hy)) + d * 0.395
    m.face([(f0.x + e.x * sg * 0.3, YC + f0.y + e.y * sg * 0.3, z) for sg, z in ((-1, 1.45), (1, 1.45), (1, 2.0), (-1, 2.0))], '#a08575')
    # the stem: a short pink bar from the housing down to the knob
    s0 = Vector((hx, hy)); s1 = Vector((kx, ky))
    sq = [s0 + e * 0.1, s1 + e * 0.1, s1 - e * 0.1, s0 - e * 0.1]
    box3(m, [(q.x, q.y) for q in sq], 1.45, 1.65, '#efcfd6', '#d9a9b5', '#e2b8c3', bevel=0.04)
    tmp = bmesh.new(); bmesh.ops.create_uvsphere(tmp, u_segments=16, v_segments=10, radius=0.33)
    tmp.normal_update()
    for f_ in tmp.faces:
        pts = [(kx + v.co.x, YC + ky + v.co.y, 1.4 + v.co.z) for v in f_.verts]
        lit_ = max(0.0, f_.normal.dot(Vector((-0.3, -0.5, 0.8)).normalized()))
        m.face(pts, '#8aeaff' if lit_ > 0.6 else '#62d6f6' if lit_ > 0.2 else '#45b8de')
    tmp.free()
    m.done(root)

# ---------------------------------------------------------------------------------------------------------------- camera, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * ZOOM / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = (2160, 1240) if WIDE else (1920, 1080)
if WIDE: cam.sensor_width = 36 * 2160 / 1920
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'warm_up.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if WIDE:      # (the mosaic has no pens: the round opened them)
    for o in bpy.data.objects:
        if o.name.startswith(('PEN_', 'CARD_')): o.hide_render = True      # (and no cards: cards.py traces against it)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
print('warm-up built: polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
