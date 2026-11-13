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
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
CAM = J('art/sky_islands/camera.json'); ZOOM = CAM['referenceZoom'] * 1.34          # (measure.py: K)
YC = 73.72                                                                           # (measure.py: the ground point under the frame's centre)
G = J('art/gong_court/ground.json'); SC = J('art/gong_court/stone_colours.json')
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
for name, (poly, h, mint, kind) in prisms().items():
    m = Mesh(f'STONE_{name}')
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        for k in range(NS):          # (the face in NS bands, each its measured step, top to bottom)
            za, zb = h * (1 - k / NS), h * (1 - (k + 1) / NS)
            m.face([(x0, YC + y0, zb), (x1, YC + y1, zb), (x1, YC + y1, za), (x0, YC + y0, za)], FACE[k])
    m.poly(list(poly), h, SC['top'])
    if mint: m.poly(mint, h + 0.004, SC['mint'])
    m.done()

# ---------------------------------------------------------------------------------------------------------------- cards
CAMV = Vector(tuple(v * 100 for v in CAM['centre'])); _pth = math.radians(CAM['pitchDeg'])
TOWARD = Vector((0, -math.cos(_pth), math.sin(_pth)))
if HAS('art/gong_court/cards.json') and not NOCARDS:
    for c in J('art/gong_court/cards.json'):
        m = Mesh(f'CARD_{c["name"]}')
        for s_ in c['shapes']:
            off = TOWARD * (0.004 * s_['layer'])
            loops = [[Vector((x, YC + y, z)) + off for x, y, z in lp] for lp in s_['loops']]
            up_ = TOWARD.cross(Vector((1, 0, 0)))
            flat_ = [[Vector((v.x, (v - loops[0][0]).dot(up_), 0)) for v in lp] for lp in loops]
            verts = [v for lp in loops for v in lp]
            for tri in tessellate_polygon(flat_):
                m.face([tuple(verts[i]) for i in tri], s_['colour'])
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
