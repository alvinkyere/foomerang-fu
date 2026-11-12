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

WATER_Z = -0.95           # (the far banks' lavender faces: ~15 px tall at the frame's middle)
RIM = 0.4                 # (the kerb's light top, as wide on every bank)
GLOW = 0.5                # (the grass's pale green glow along every bank)
COL = dict(rim='#a6b4e9', face='#8694d1', water='#64a8e8', glow='#c3ec9f', line='#aee0fe')


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
        if in_moat((x0 + DG / 2, y0 + DG / 2)): continue
        pts = [(x0, y0), (x0 + DG, y0), (x0 + DG, y0 + DG), (x0, y0 + DG)]
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
    Pr = offset(poly, RIM, island); Pg = offset(poly, -GLOW, island)
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        # the glow on the grass: the edge pale green, fading to the ground's base GLOW in
        m.face([(Pg[i].x, YC + Pg[i].y, 0.006), (Pg[j].x, YC + Pg[j].y, 0.006), (P0[j].x, YC + P0[j].y, 0.006), (P0[i].x, YC + P0[i].y, 0.006)],
               [base_at(Pg[i].x, Pg[i].y), base_at(Pg[j].x, Pg[j].y), COL['glow'], COL['glow']])
        # the kerb's top (over the grass's ragged hole) and its face down to the water
        m.face([(P0[i].x, YC + P0[i].y, 0.02), (P0[j].x, YC + P0[j].y, 0.02), (Pr[j].x, YC + Pr[j].y, 0.02), (Pr[i].x, YC + Pr[i].y, 0.02)], COL['rim'])
        m.face([(Pr[i].x, YC + Pr[i].y, 0.02), (Pr[j].x, YC + Pr[j].y, 0.02), (Pr[j].x, YC + Pr[j].y, WATER_Z), (Pr[i].x, YC + Pr[i].y, WATER_Z)], COL['face'])
        # the bright line where a far wall (its face turned to the camera: the water south of it) meets the water (frame 0.0 s: 1-2 px
        # of #aee0fe under the face)
        dwat = (Pr[i] - P0[i]); dwat = dwat.normalized() if dwat.length > 1e-6 else dwat
        if dwat.y < -0.3:
            Pw = [Pr[i] + dwat * 0.09, Pr[j] + (Pr[j] - P0[j]).normalized() * 0.09]
            m.face([(Pr[i].x, YC + Pr[i].y, WATER_Z + 0.01), (Pr[j].x, YC + Pr[j].y, WATER_Z + 0.01), (Pw[1].x, YC + Pw[1].y, WATER_Z + 0.01),
                    (Pw[0].x, YC + Pw[0].y, WATER_Z + 0.01)], COL['line'])
m.done()
w = Mesh('FOUNTAIN_water')
outer_w = offset(MOAT['outer'], RIM, False); inner_w = offset(MOAT['inner'], RIM, True)
# (the ring as one sheet: a quad strip between the two outlines would cross; a coarse grid of the ring's cells instead)
for j in range(int(90 / 0.5)):
    for i in range(int(90 / 0.5)):
        x0, y0 = -45 + i * 0.5, -45 + j * 0.5
        if in_moat((x0 + 0.25, y0 + 0.25)) or any(in_moat(p) for p in ((x0, y0), (x0 + 0.5, y0 + 0.5), (x0 + 0.5, y0), (x0, y0 + 0.5))):
            w.face([(x0, YC + y0, WATER_Z), (x0 + 0.5, YC + y0, WATER_Z), (x0 + 0.5, YC + y0 + 0.5, WATER_Z), (x0, YC + y0 + 0.5, WATER_Z)], COL['water'])
# (the game reads the water's field over a square: the sheet's x-half widened 3% about its middle (ThreePlaza.ts); the sheet reaches as
# far in x as in y, under the land where the moat is narrower: hidden there)
xs = [v.co.x for v in w.bm.verts]; ys = [v.co.y - YC for v in w.bm.verts]
span = max(max(xs) - min(xs), max(ys) - min(ys)); mx = (max(xs) + min(xs)) / 2; my = (max(ys) + min(ys)) / 2
for sx in (-1, 1):
    x0 = mx + sx * span / 2 - (0.5 if sx > 0 else 0)
    w.face([(x0, YC + my, WATER_Z - 0.05), (x0 + 0.5, YC + my, WATER_Z - 0.05), (x0 + 0.5, YC + my + 0.5, WATER_Z - 0.05), (x0, YC + my + 0.5, WATER_Z - 0.05)], COL['water'])
json.dump(dict(cx=mx, cy=my, half=span / 2 * 1.03), open(os.path.join(OUT, 'water_box.json'), 'w'))
w.done()

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
    hq = [Vector((hx, hy)) + d * sx * 0.35 + e * sy * 0.5 for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    box3(m, [(q.x, q.y) for q in hq], 1.35, 2.2, '#e6c3a0', '#d2a785', '#dcb592', bevel=0.12)
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
