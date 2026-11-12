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
OUT, RENDER = args[0], 'render' in args[1:]
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
CAM = J('art/sky_islands/camera.json'); ZOOM = J('art/warm_up/zoom.json')['zoom']
YC = 73.72                                                     # (measure.py: the ground point under the frame's centre)
G = J('art/warm_up/ground.json'); MOAT = J('art/warm_up/moat.json')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

WATER_Z = -0.95           # (the far banks' lavender faces: ~15 px tall at the frame's middle)
RIM = 0.4                 # (the kerb's light top, as wide on every bank)
GLOW = 0.5                # (the grass's pale green glow along every bank)
COL = dict(rim='#a3b8e6', face='#8794d2', water='#5a96d9', glow='#c3ec9f')


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

    def poly(self, pts2, z, colour):
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
    if all(in_moat(p) for p in s['pts'][:3]): continue
    sh.poly(s['pts'], 0.004 + 0.0004 * k, s['colour'])
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

# ---------------------------------------------------------------------------------------------------------------- camera, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * ZOOM / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'warm_up.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
print('warm-up built: polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
