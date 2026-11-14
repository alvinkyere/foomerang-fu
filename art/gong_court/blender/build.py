"""The gong court in 3D (2026-11-12): foomerang-fu physics hq.mp4 0:35 (the round's READY frame), seen through the game's camera. Our own
models, flat-coloured as the HQ's are (unlit vertex colours, each face its measured tone; after art/warm_up/blender/build.py):

  ground   the grass as ground.py measures it: a smooth base field, crisp flat shapes over it (sun patches, shadows, the darker outskirts)
  stone    every wall, platform, block and boulder (fit_stones.py) a prism: its top light lavender, its faces darkening towards the grass
           in the measured steps (stone_colours.py), the platforms' mint tops
  cards    the maples, bamboo, pots, aloes, the gong and the tufts as traced cards (cards.py): upright planes through each foot
Exports gong_court.glb; with `render`, render.png through the HQ's camera (`wide`: the round's mosaic's own view, for objects.py/cards.py).

  Blender -b --python art/gong_court/blender/build.py -- <out_dir> [render] [wide] [nocards]
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'art', 'gong_court'))
os.chdir(ROOT)
from geom import prisms
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER, WIDE, NOCARDS = args[0], 'render' in args[1:], 'wide' in args[1:], 'nocards' in args[1:]
NOSTONE = 'nostone' in args[1:]          # (the ground alone: refine_outlines.py paints the stone over it)
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
CAM = J('art/sky_islands/camera.json'); ZOOM = CAM['referenceZoom'] * 1.34          # (measure.py: K)
YC = 73.72                                                                           # (measure.py: the ground point under the frame's centre)
G = J('art/gong_court/ground.json'); SC = J('art/gong_court/stone_colours.json')
TOPS = J('art/gong_court/tops.json') if HAS('art/gong_court/tops.json') else {}
MOS = J('art/gong_court/output/mosaic.json') if HAS('art/gong_court/output/mosaic.json') else dict(origin=[-185, -111])
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
    gx = min(max((x - G['x0']) / G['dx'], 0), G['nx'] - 1.001); gy = min(max((y - G['y0']) / G['dx'], 0), G['ny'] - 1.001)
    i, j = int(gx), int(gy); fx, fy = gx - i, gy - j
    c = lambda ii, jj: G['bgr'][jj * G['nx'] + ii]
    v = [(c(i, j)[k] * (1 - fx) + c(i + 1, j)[k] * fx) * (1 - fy) + (c(i, j + 1)[k] * (1 - fx) + c(i + 1, j + 1)[k] * fx) * fy for k in range(3)]
    return lin(bgr_hex([int(round(q)) for q in v]))


# ---------------------------------------------------------------------------------------------------------------- ground
DG = 0.5
g = Mesh('GROUND'); X0, Y0 = G['x0'], G['y0']; nx, ny = int((G['nx'] - 1) * G['dx'] / DG), int((G['ny'] - 1) * G['dx'] / DG)
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

# ---------------------------------------------------------------------------------------------------------------- stone
FACE = SC['face']; NS = len(FACE)
BEVEL = float(os.environ.get('BEVEL', '0'))      # (a soft band from the top down to the face: off; 0.1 and 0.2 both scored worse, 4.96 and 5.12 vs 4.87)


def mixhex(a, b, t):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(x + (y - x) * t) for x, y in zip(ca, cb))


def inset_ccw(poly, d):
    n = len(poly); out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n0, n1 = Vector((-e0.y, e0.x)), Vector((-e1.y, e1.x))
        b = n0 + n1; b = b / max(1e-6, b.length); c = max(0.3, b.dot(n0))
        out.append((p1.x + b.x * d / c, p1.y + b.y * d / c))
    return out


BYF = {int(k): v for k, v in SC.get('by_facing', {}).items()}
hexrgb = lambda c: [int(c[i:i + 2], 16) for i in (1, 3, 5)]
_mean_face = [sum(hexrgb(c)[j] for c in FACE) / len(FACE) for j in range(3)]


def faced(colour, nx, ny):
    """A face's step colour turned to its facing (stone_colours.py by_facing: the HQ's light from the east): the measured colour for
    its facing, interpolated between the two nearest measured ways, less the steps' mean, added to this step."""
    if not BYF: return colour
    ang = math.degrees(math.atan2(ny, nx)) % 360; ks = sorted(BYF)
    best = sorted(ks, key=lambda k: min(abs(ang - 45 * k), 360 - abs(ang - 45 * k)))[:2]
    d = [min(abs(ang - 45 * k), 360 - abs(ang - 45 * k)) for k in best]
    t = d[0] / max(1e-6, d[0] + d[1])
    target = [hexrgb(BYF[best[0]])[j] * (1 - t) + hexrgb(BYF[best[1]])[j] * t for j in range(3)]
    c = hexrgb(colour)
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c[j] + target[j] - _mean_face[j]))) for j in range(3))


def shift(c, o):
    """A colour moved by a body's own measured offset (stone_colours.py offsets, RGB)."""
    if not o: return c
    v = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v[j] + o[j]))) for j in range(3))


for name, (poly, h, mint, kind) in ([] if NOSTONE else prisms().items()):
    m = Mesh(f'STONE_{name}'); OFF = SC.get('offsets', {}).get(name, {})
    n = len(poly)
    bv = min(BEVEL, h * 0.3)
    inner = inset_ccw(poly, bv) if bv > 0 else list(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        hf = h - bv
        for k in range(NS):          # (the face in NS bands, each its measured step, top to bottom)
            za, zb = hf * (1 - k / NS), hf * (1 - (k + 1) / NS)
            fc = SC['wall_face'][k] if kind == 'wall' and 'wall_face' in SC else shift(faced(FACE[k], y1 - y0, -(x1 - x0)), OFF.get('face'))
            m.face([(x0, YC + y0, zb), (x1, YC + y1, zb), (x1, YC + y1, za), (x0, YC + y0, za)], fc)
        if bv > 0:                   # the bevel: from the face's top edge in and up to the top, its colour between the two
            (u0, v0), (u1, v1) = inner[i], inner[(i + 1) % n]
            m.face([(x0, YC + y0, hf), (x1, YC + y1, hf), (u1, YC + v1, h), (u0, YC + v0, h)], mixhex(SC['top'], FACE[0], 0.45))
    m.poly(inner, h, SC['wall_top'] if kind == 'wall' and 'wall_top' in SC else shift(SC['top'], OFF.get('top')))
    if mint:
        # the mint in its own measured colour, and what lies on it (tops.py: shadows, fallen leaves), each a hair above the last
        tp = TOPS.get(name, {})
        # (0.03 above the top, what lies on it 0.06: at 0.004 apart they fought in the depth buffer, the stone showing through the mint
        # in patches and the mint over the gong's shadow)
        m.poly(mint, h + 0.03, tp.get('colour', SC['mint']))
        for k, s_ in enumerate(tp.get('shapes', [])):
            m.poly(s_['pts'], h + 0.06 + 0.0004 * k, s_['colour'], s_.get('holes', []))
    m.done()

# ---------------------------------------------------------------------------------------------------------------- cards
CAMV = Vector(tuple(v * 100 for v in CAM['centre'])); _pth = math.radians(CAM['pitchDeg'])
TOWARD = Vector((0, -math.cos(_pth), math.sin(_pth)))
if HAS('art/gong_court/cards.json') and not NOCARDS:
    for c in J('art/gong_court/cards.json'):
        m = Mesh(f'CARD_{c["name"]}')
        for s_ in c['shapes']:
            off = Vector((0, -0.004 * s_['layer'], 0))     # (the later tones a hair to the south: nearer the camera)
            for q in s_.get('strips', []):                 # (a crown's backing: quads, cards.py)
                m.face([tuple(Vector((x, YC + y, z)) + off) for x, y, z in q], s_['colour'])
            if not s_['loops']: continue
            loops = [[Vector((x, YC + y, z)) + off for x, y, z in lp] for lp in s_['loops']]
            flat_ = [[Vector((v.x, v.z + (v.y - loops[0][0].y), 0)) for v in lp] for lp in loops]
            verts = [v for lp in loops for v in lp]
            for tri in tessellate_polygon(flat_):
                m.face([tuple(verts[i]) for i in tri], s_['colour'])
        m.done()

# ---------------------------------------------------------------------------------------------------------------- bamboo
# (props.py: each stalk read off the still view) a six-sided stalk turned a face to the camera, as the HQ's: its faces shading smoothly
# from the west's #8fc56a to the east's #b0dd80 (the light from the east, measured across C3 and W1), a darker ring at each node
# (#6eb45d, a thin line ~1.6 apart), a dark sleeve round its foot (#5ea162 -> #6bac61, 1.1 tall, 1.2 wide), its cut top a rim round a deep hollow (#519855)
STALK_W, STALK_M, STALK_E = Vector(lin('#8fc56a')[:3]), Vector(lin('#a0d478')[:3]), Vector(lin('#b0dd80')[:3])
SLEEVE_W, SLEEVE_E = Vector(lin('#5b9f5f')[:3]), Vector(lin('#6fae63')[:3])


def shade(nx, west, mid, east):
    """A colour for a face turned `nx` towards the east (-1 west .. 1 east)."""
    t = (nx + 1) / 2
    c = west.lerp(mid, t / 0.5) if t < 0.5 else mid.lerp(east, (t - 0.5) / 0.5)
    return list(c) + [1.0]


def stalk(m, foot, top, r):
    a, b = Vector(foot), Vector(top); ax = (b - a).normalized(); ln = (b - a).length
    side = Vector((1, 0, 0)); side = (side - ax * side.dot(ax)).normalized(); fwd = ax.cross(side).normalized()   # (fwd: south)
    # the six corners: a face square to the camera (corners at 0, 60 .. deg from east, so the faces' middles at 30, 90 ..)
    ang = [math.radians(60 * k) for k in range(6)]
    ring = lambda c, rr: [c + (side * math.cos(t) - fwd * math.sin(t)) * rr for t in ang]
    nodes = max(1, round((ln - 1.1) / 1.6))
    cuts = [(0.0, 'sleeve', 1.2), (1.1 / ln, 'stalk', 1.2), (1.1 / ln + 0.01, 'stalk', 1.0)]
    for n in range(1, nodes + 1):
        t = (1.1 + (ln - 1.1) * n / (nodes + 0.6)) / ln
        cuts += [(t - 0.06 / ln, 'node', 1.0), (t, 'node', 1.04), (t + 0.06 / ln, 'stalk', 1.0)]
    cuts.append((1.0, 'top', 1.0))
    cuts.sort(key=lambda q: q[0])
    for (t0, kind, s0), (t1, _, s1) in zip(cuts, cuts[1:]):
        r0, r1 = ring(a.lerp(b, t0), r * s0), ring(a.lerp(b, t1), r * s1)
        for k in range(6):
            j = (k + 1) % 6
            ca = [shade(math.cos(ang[q]), *((SLEEVE_W, SLEEVE_W.lerp(SLEEVE_E, 0.5), SLEEVE_E) if kind == 'sleeve' else
                                            (STALK_W * 0.66, STALK_M * 0.66, STALK_E * 0.66) if kind == 'node' else
                                            (STALK_W, STALK_M, STALK_E))) for q in (k, j, j, k)]
            m.face([tuple(r0[k]), tuple(r0[j]), tuple(r1[j]), tuple(r1[k])], ca)
    # the cut top: a rim (the stalk's light) round a hollow sunk a little
    rim, hol = ring(b, r), ring(b - ax * 0.12, r * 0.55)
    for k in range(6):
        j = (k + 1) % 6
        m.face([tuple(rim[k]), tuple(rim[j]), tuple(hol[j]), tuple(hol[k])], '#8cc874')
    m.face([tuple(p) for p in hol], '#519855')


def spray(m, base, angle, length, y, r=0.0):
    """A spray of leaves at a node, as read on screen: five blades fanned 70 deg about `angle` (0 right, 90 down), the middle one
    longest; on the upright plane y (a hair nearer the camera than the stalk), a screen px down there 36.5/20.4 of one across."""
    asp = 36.5 / 20.4
    for q, (da, f) in enumerate(((-34, 0.74), (-17, 0.92), (0, 1.0), (17, 0.9), (34, 0.72))):
        a_ = math.radians(angle + da); L = length * f * 1.3      # (the sprays' lengths read to the leaves' bulk; their tips run ~1.3x)
        # (screen directions laid on the plane: across 1:1, down x asp, so each blade shows on screen as read, its width too)
        d = Vector((math.cos(a_), 0, -math.sin(a_) * asp)); w = Vector((-math.sin(a_), 0, -math.cos(a_) * asp)) * L * 0.09
        stem = Vector((math.cos(math.radians(angle)), 0, -math.sin(math.radians(angle)) * asp))
        p0 = Vector((base.x, y, base.z)) + stem * (r + length * 0.12)     # (the blades leave a short stem, not one point)
        pts = [p0, p0 + d * L * 0.5 + w, p0 + d * L, p0 + d * L * 0.55 - w]
        m.face([tuple(p + Vector((0, -0.0006 * q, 0))) for p in pts], '#5ea964' if q % 2 else '#529f5b')


if HAS('art/gong_court/props.json') and 'nobamboo' not in args[1:]:
    for s_ in J('art/gong_court/props.json')['bamboo']:
        m = Mesh(f'BAMBOO_{s_["name"]}')
        foot = (s_['foot'][0], YC + s_['foot'][1], s_['foot'][2]); top = (s_['top'][0], YC + s_['top'][1], s_['top'][2])
        stalk(m, foot, top, s_['r'])
        for sp in s_['sprays']:
            base = Vector(foot).lerp(Vector(top), sp['t'])
            spray(m, base, sp['angle'], sp['length'], foot[1] - s_['r'] * 1.2, s_['r'])
        m.done()

# ---------------------------------------------------------------------------------------------------------------- the gong
# (props.py: posts, beam and disc read off the still view) the frame dark navy, lit from above and the west as measured (a post's west
# side #434f6e, its east #3b4862; the beam's top #5a628d); the disc gold #b5ad6b with pale studs #e5db7e round it and its dark slot,
# hung on two ropes #85714e
GLIGHT = Vector((-0.5, -0.25, 0.83)).normalized()


def lit(nrm, shade_hex, lit_hex):
    t = max(0.0, min(1.0, nrm.dot(GLIGHT) * 0.5 + 0.5))
    return list(Vector(lin(shade_hex)[:3]).lerp(Vector(lin(lit_hex)[:3]), t)) + [1.0]


def cylinder(m, a, b, r, shade_hex, lit_hex, seg=20, caps=True):
    a, b = Vector(a), Vector(b); ax = (b - a).normalized()
    u = ax.cross(Vector((0, 0, 1))) if abs(ax.z) < 0.9 else ax.cross(Vector((1, 0, 0))); u.normalize(); v = ax.cross(u).normalized()
    dirs = [u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg) for k in range(seg)]
    for k in range(seg):
        j = (k + 1) % seg
        m.face([tuple(a + dirs[k] * r), tuple(a + dirs[j] * r), tuple(b + dirs[j] * r), tuple(b + dirs[k] * r)],
               [lit(dirs[q], shade_hex, lit_hex) for q in (k, j, j, k)])
    if caps:
        for c, s_ in ((a, -1), (b, 1)):
            m.face([tuple(c + d * r) for d in (dirs if s_ > 0 else dirs[::-1])], [lit(ax * s_, shade_hex, lit_hex)] * seg)


if HAS('art/gong_court/props.json') and 'gong' in J('art/gong_court/props.json') and 'nogong' not in args[1:]:
    G_ = J('art/gong_court/props.json')['gong']; m = Mesh('GONG')
    for p_ in G_['posts']:
        f = Vector((p_['foot'][0], YC + p_['foot'][1], p_['foot'][2] - 0.2))
        cylinder(m, f, (f.x, f.y, p_['top'] + G_['beam_r'] * 0.5), G_['post_r'], '#363f5a', '#4a5677')
    (ax_, ay_, az_), (bx_, by_, bz_) = G_['beam']
    A_, B_ = Vector((ax_, YC + ay_, az_)), Vector((bx_, YC + by_, bz_))
    cylinder(m, A_, B_, G_['beam_r'], '#3a4360', '#5c6590')
    along = (B_ - A_); along.z = 0; along.normalize(); nrm = Vector((-along.y, along.x, 0))
    if nrm.y > 0: nrm = -nrm                       # (its face to the south: the camera's side)
    c_ = Vector((G_['disc'][0], YC + G_['disc'][1], G_['disc'][2])); R_ = G_['disc_r']
    cylinder(m, c_ - nrm * 0.25, c_ + nrm * 0.15, R_, '#a39a5e', '#bab170', seg=28)      # (thick: its rim shows at the lower right)
    up = Vector((0, 0, 1)); face_ = c_ + nrm * 0.155
    ring = lambda q, rr, n=28: [face_ + (along * math.cos(2 * math.pi * k / n) + up * math.sin(2 * math.pi * k / n)) * rr for k in range(n)]
    for k in range(7):                              # the studs: rounded pale squares round the disc, square to its radius
        a0 = 2 * math.pi * (k + 0.25) / 7; rad = along * math.cos(a0) + up * math.sin(a0); tan_ = along * -math.sin(a0) + up * math.cos(a0)
        ctr = face_ + rad * R_ * 0.52 + up * R_ * 0.06 + nrm * 0.005; hr, ht, cut = R_ * 0.2, R_ * 0.19, 0.45
        sq = [ctr + rad * (hr * u) + tan_ * (ht * v) for u, v in ((1, cut), (cut, 1), (-cut, 1), (-1, cut), (-1, -cut), (-cut, -1), (cut, -1), (1, -cut))]
        m.face([tuple(p) for p in sq], '#e5db7e' if math.sin(a0) > -0.5 else '#cfc574')      # (the lower ones in the disc's shade)
    slot = face_ + nrm * 0.01 - along * R_ * 0.12 - up * R_ * 0.22      # the dark slot below and west of the middle
    m.face([tuple(slot + along * R_ * 0.09 * math.cos(2 * math.pi * k / 10) + up * R_ * 0.14 * math.sin(2 * math.pi * k / 10)) for k in range(10)],
           '#2b2f3d')
    for s_ in (-0.62, 0.62):                        # the ropes
        top_ = A_.lerp(B_, 0.5) + along * (s_ * R_ * 1.05)
        top_ = A_ + along * ((top_ - A_).dot(along)); top_.z = A_.z + (B_.z - A_.z) * ((top_ - A_).dot(along) / max(1e-6, (B_ - A_).length))
        cylinder(m, top_, c_ + along * (s_ * R_ * 0.7) + up * (R_ * 0.75), 0.06, '#6f5d3f', '#8d7752', seg=8, caps=False)
    m.done()

# ---------------------------------------------------------------------------------------------------------------- the pots
# (props.py) terracotta turned shapes lit from the east and above as the HQ's (lit #c28f78, mid #a8725b, the foot's shade #835d47), a
# darker band low down, a few dark spots on the side facing the camera, an open urn's thick rim (#b99080) round its dark mouth
# (#645650) with a lug each side, the jug's dome lid and knob and its two loop handles
PLIGHT = Vector((0.45, -0.35, 0.82)).normalized()
PROFILES = {'urn': [(0.4, 0.0), (0.62, 0.1), (0.85, 0.32), (1.0, 0.6), (0.97, 0.76), (0.8, 0.87), (0.72, 0.91), (0.8, 0.96), (0.8, 1.0)],
            'jug': [(0.6, 0.0), (0.9, 0.14), (1.0, 0.44), (0.88, 0.72), (0.6, 0.88), (0.46, 0.94)]}


def pot_colour(nrm, zf):
    t = max(0.0, min(1.0, nrm.dot(PLIGHT) * 0.6 + 0.45))
    c = Vector(lin('#835d47')[:3]).lerp(Vector(lin('#a8725b')[:3]), min(1, t / 0.6)) if t < 0.6 else \
        Vector(lin('#a8725b')[:3]).lerp(Vector(lin('#c79079')[:3]), (t - 0.6) / 0.4)
    return list(c * (0.72 + 0.28 * min(1.0, zf / 0.55))) + [1.0]      # (the lower half in shade: #835d47 under the body's #a8725b)


def tube(m, path, r, colour, seg=8):
    for (a, b) in zip(path, path[1:]):
        cylinder(m, a, b, r, colour, colour, seg=seg, caps=False)


if HAS('art/gong_court/props.json') and 'pots' in J('art/gong_court/props.json') and 'nopots' not in args[1:]:
    for name, p_ in J('art/gong_court/props.json')['pots'].items():
        m = Mesh(f'POT_{name}'); R_, H_ = p_['r'], p_['h']; o = Vector((p_['foot'][0], YC + p_['foot'][1], 0.0)); seg = 24
        prof = PROFILES[p_['kind']]
        rings = [[o + Vector((math.cos(2 * math.pi * k / seg) * rr * R_, math.sin(2 * math.pi * k / seg) * rr * R_, zz * H_)) for k in range(seg)]
                 for rr, zz in prof]
        for i in range(len(prof) - 1):
            (r0, z0), (r1, z1) = prof[i], prof[i + 1]
            slope = (r0 - r1) * R_ / max(1e-6, (z1 - z0) * H_)
            for k in range(seg):
                j = (k + 1) % seg
                nk = [Vector((math.cos(2 * math.pi * q / seg), math.sin(2 * math.pi * q / seg), slope)).normalized() for q in (k, j, j, k)]
                m.face([tuple(rings[i][k]), tuple(rings[i][j]), tuple(rings[i + 1][j]), tuple(rings[i + 1][k])],
                       [pot_colour(nk[q], (z0 if q in (0, 1) else z1)) for q in range(4)])
        top_r, top_z = prof[-1][0] * R_, prof[-1][1] * H_
        if p_['kind'] == 'urn':
            inner = [o + Vector((math.cos(2 * math.pi * k / seg) * top_r * 0.68, math.sin(2 * math.pi * k / seg) * top_r * 0.68, top_z)) for k in range(seg)]
            for k in range(seg):
                j = (k + 1) % seg; m.face([tuple(rings[-1][k]), tuple(rings[-1][j]), tuple(inner[j]), tuple(inner[k])], '#b99080')
            m.face([tuple(v - Vector((0, 0, 0.05))) for v in inner], '#5a4846')
            for sgn in (-1, 1):                     # the lugs: a small loop each side at the shoulder
                c0 = o + Vector((sgn * R_ * 0.92, 0, H_ * 0.8))
                tube(m, [c0 + Vector((sgn * R_ * 0.22 * math.sin(math.pi * q / 6), 0, R_ * 0.2 * (math.cos(math.pi * q / 6) - 1))) for q in range(7)],
                     0.07, '#a8725b')
        else:
            ctr = o + Vector((0, 0, top_z)); dome = [(0.46, 0.0), (0.4, 0.06), (0.26, 0.12), (0.12, 0.14), (0.0, 0.15)]
            lr = [[ctr + Vector((math.cos(2 * math.pi * k / seg) * rr * R_, math.sin(2 * math.pi * k / seg) * rr * R_, zz * H_)) for k in range(seg)] for rr, zz in dome]
            for i in range(len(dome) - 1):
                for k in range(seg):
                    j = (k + 1) % seg
                    m.face([tuple(lr[i][k]), tuple(lr[i][j]), tuple(lr[i + 1][j]), tuple(lr[i + 1][k])], '#c38f75' if i < 2 else '#d9a78a')
            for sgn, big in ((-1, 0.7), (1, 1.0)):     # the loop handles, the east one the larger
                c0 = o + Vector((sgn * R_ * 0.95, 0.0, H_ * 0.62))
                tube(m, [c0 + Vector((sgn * R_ * 0.35 * big * math.sin(math.pi * q / 8), 0, R_ * 0.4 * big * (math.cos(math.pi * q / 8)))) for q in range(9)],
                     0.06, '#9a6650')
        rng_ = __import__('random').Random(hash(name) % 1000)
        for q in range(6):                          # dark spots on the side facing the camera
            a0 = math.radians(rng_.uniform(205, 335)); zf = rng_.uniform(0.25, 0.7); rr = 1.0 if zf < 0.62 else 0.95
            c0 = o + Vector((math.cos(a0) * R_ * rr * 1.01, math.sin(a0) * R_ * rr * 1.01, zf * H_)); tng = Vector((-math.sin(a0), math.cos(a0), 0))
            s0 = R_ * rng_.uniform(0.08, 0.14)
            m.face([tuple(c0 + tng * s0 * math.cos(2 * math.pi * k / 6) + Vector((0, 0, s0 * 0.8 * math.sin(2 * math.pi * k / 6)))) for k in range(6)], '#94604a')
        tilt, way = p_.get('lean', [0, 0])
        if tilt:                                    # its lean: turned about its foot, its top towards `way`
            from mathutils import Matrix
            axis = Vector((-math.sin(math.radians(way)), math.cos(math.radians(way)), 0))
            M_ = Matrix.Translation(o) @ Matrix.Rotation(math.radians(tilt), 4, axis) @ Matrix.Translation(-o)
            for v in m.bm.verts: v.co = M_ @ v.co
        m.done()

# ---------------------------------------------------------------------------------------------------------------- the aloes
# (props.py) a grey-green pot narrowing a little to its foot (#7a8f88 lit, #687d77 shade), a paler rim band (#8aa098), dark soil in it,
# and broad leaves read on screen, laid on an upright plane in front of the pot's middle, in three measured greens
ALOE_TONES = {'dark': '#5f9e7c', 'mid': '#70b190', 'light': '#86c18e'}
if HAS('art/gong_court/props.json') and 'aloes' in J('art/gong_court/props.json') and 'noaloes' not in args[1:]:
    for name, a_ in J('art/gong_court/props.json')['aloes'].items():
        m = Mesh(f'ALOE_{name}'); fx_, fy_, fz_ = a_['foot']; R_ = a_['r']; seg = 24
        o = Vector((fx_, YC + fy_, fz_)); top_ = a_['top']
        rings = [(0.84, fz_), (1.0, top_ - 0.18), (1.0, top_ - 0.18), (1.0, top_)]      # (body, then the rim band)
        cols = ['shade', 'body', 'rim', 'rim']
        for i in range(len(rings) - 1):
            (r0, z0), (r1, z1) = rings[i], rings[i + 1]
            if z1 - z0 < 1e-4: continue
            for k in range(seg):
                j = (k + 1) % seg; a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * j / seg
                nrm = [Vector((math.cos(q), math.sin(q), 0.2)) for q in (a0, a1, a1, a0)]
                lit_, shade_ = ('#8aa098', '#76897f') if cols[i + 1] == 'rim' else ('#7a8f88', '#62766f')
                m.face([(o.x + math.cos(a0) * r0 * R_, o.y + math.sin(a0) * r0 * R_, z0), (o.x + math.cos(a1) * r0 * R_, o.y + math.sin(a1) * r0 * R_, z0),
                        (o.x + math.cos(a1) * r1 * R_, o.y + math.sin(a1) * r1 * R_, z1), (o.x + math.cos(a0) * r1 * R_, o.y + math.sin(a0) * r1 * R_, z1)],
                       [lit(n_, shade_, lit_) for n_ in nrm])
        ring_in = [(o.x + math.cos(2 * math.pi * k / seg) * R_ * 0.86, o.y + math.sin(2 * math.pi * k / seg) * R_ * 0.86, top_) for k in range(seg)]
        for k in range(seg):                         # the rim's top, and the soil sunk inside it
            j = (k + 1) % seg; a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * j / seg
            m.face([(o.x + math.cos(a0) * R_, o.y + math.sin(a0) * R_, top_), (o.x + math.cos(a1) * R_, o.y + math.sin(a1) * R_, top_),
                    ring_in[j], ring_in[k]], '#93a9a0')
        m.face([(x, y, z - 0.12) for x, y, z in ring_in], '#79b98d')      # (the rosette's leaf bases fill the pot: no soil shows)
        for q, lf in enumerate(a_['leaves']):        # the leaves, each a hair nearer the camera than the last
            m.face([(x, YC + y - 0.003 * q, z) for x, y, z in lf['pts']], ALOE_TONES[lf['tone']])
        m.done()

# ---------------------------------------------------------------------------------------------------------------- camera, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * ZOOM / 1920 * 36; cam.clip_end = 5000
if WIDE:   # (the mosaic's view: its size, the frame at its origin)
    (ox, oy) = MOS['origin']; Wm, Hm = MOS.get('size', [2217, 1372])
    sc.render.resolution_x, sc.render.resolution_y = Wm, Hm
    cam.sensor_width = 36 * Wm / 1920
    cx, cy = ox + Wm / 2, oy + Hm / 2
    cam.shift_x = (cx - 960) / Wm; cam.shift_y = -(cy - 540) / Wm
else:
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
sc.view_settings.view_transform = 'Standard'
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'gong_court.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
print('gong court built: polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
