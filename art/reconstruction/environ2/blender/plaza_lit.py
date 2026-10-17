"""The plaza as our own lit 3D scene, for the game's real-time renderer: every model group with its OWN materials (no painting),
our own floor (sand, the pavement shape traced from environ2 and mirrored, the three edge stripes, the sand ring round the fountain,
a tile grid, the six rugs, our dashed border lines), environ2's camera, a sun. Exports plaza.glb (Y up, metres = BU / 10) and
renders a preview through the camera.  Blender -b --python plaza_lit.py -- <models_dir> <out_dir>"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

MODELS, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(OUT, exist_ok=True)
sc, cam = stage.setup(engine='BLENDER_EEVEE_NEXT')
GROUPS = [('fountain', 'fountain'), ('stalls', 'stalls'), ('props', 'props'), ('trees', 'trees'), ('structures', 'structures'),
          ('archway', 'archway'), ('tree29', 'tree29')]
for d, stem in GROUPS:
    with bpy.data.libraries.load(os.path.join(MODELS, d, f'{stem}.blend')) as (src, dst):
        dst.objects = list(src.objects)
    for o in dst.objects:
        if o is None or o.type not in ('MESH', 'CURVE', 'EMPTY') or o.name.startswith(('Plane', 'CONE')):
            continue
        sc.collection.objects.link(o)


def mat(name, rgb, rough=0.85):
    m = bpy.data.materials.get(name) or stage.material(name, rgb, rough)
    return m


def flat(name, pts, z, material):
    """A flat polygon (plan BU points) at height z."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, y in pts]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='EAR_CLIP')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def offset(poly, d):
    """Offset a closed polygon by d (inward for d < 0 on a counter-clockwise outline), mitred."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) / 2
    s = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n0, n1 = Vector((e0.y, -e0.x)) * s, Vector((e1.y, -e1.x)) * s          # outward normals
        m = (n0 + n1)
        m = m.normalized() / max(0.35, m.normalized().dot(n0)) if m.length > 1e-6 else n0
        out.append(tuple(p1 + m * d))
    return out


FP = json.load(open(os.path.join(stage.HERE, 'floor_plan.json')))
# environ2's floor tones (its dominant colours, sRGB -> linear): deep sand (0.6038, 0.4179, 0.1529), light sand, cream pavement, grey stripes
SAND, SAND_LIGHT = (0.6724, 0.402, 0.117), (0.8388, 0.6172, 0.2016)
PAVE, STRIPE, TILE = (0.9216, 0.9047, 0.6584), (0.6724, 0.6584, 0.552), (0.8388, 0.8148, 0.5776)
G = json.load(open(os.path.join(stage.HERE, '..', 'step4_arena.json')))
flat('FLOOR_sand', [(-70, 30), (72, 30), (72, 140), (-70, 140)], -0.01, mat('sand', SAND, 0.95))
pave = FP['pavement']
flat('FLOOR_sand_light', offset(pave, 2.4), 0.0, mat('sand_light', SAND_LIGHT, 0.95))
for k, d in enumerate((0.9, 0.55, 0.2)):                               # three pale stripes along the edge
    flat(f'FLOOR_stripe{k}', offset(pave, d + 0.12), 0.002 + 0.002 * k, mat('stripe', STRIPE, 0.9))
    flat(f'FLOOR_gap{k}', offset(pave, d - 0.1), 0.003 + 0.002 * k, mat('pave', PAVE, 0.9))
# the sand ring round the fountain (an annulus)
F = json.load(open(os.path.join(stage.HERE, 'fountain_meas.json')))
fc, fr = Vector((F['cx'] * 100, F['cy'] * 100)), F['R0'] * 100
ring = [(fc.x + (fr + 0.9) * math.cos(a), fc.y + (fr + 1.6) * math.sin(a)) for a in [2 * math.pi * i / 96 for i in range(96)]]
flat('FLOOR_ring', ring, 0.013, mat('sand_ring', (0.9216, 0.7605, 0.2623), 0.9))
# the pavement's tiles: a repeating tile texture (one 5 BU tile, its grout at the edges), mapped by plan position
tile = bpy.data.images.new('pave_tile', 128, 128)
px = []
for yy in range(128):
    for xx in range(128):
        grout = xx < 3 or yy < 3
        c = TILE if grout else PAVE
        px += [c[0], c[1], c[2], 1.0]
tile.pixels = px
tile.filepath_raw = os.path.join(OUT, 'pave_tile.png')
tile.file_format = 'PNG'
tile.save()
pm = bpy.data.materials.new('pave_tiles')
pm.use_nodes = True
pn = next(n for n in pm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
pn.inputs['Roughness'].default_value = 0.9
tx = pm.node_tree.nodes.new('ShaderNodeTexImage')
tx.image = tile
pm.node_tree.links.new(tx.outputs['Color'], pn.inputs['Base Color'])
inner = flat('FLOOR_pavement', offset(pave, -0.1), 0.011, mat('pave_cream', PAVE, 0.9))   # environ2's tiles are barely visible
uvl = inner.data.uv_layers.new(name='uv')
for loop in inner.data.loops:
    v = inner.data.vertices[loop.vertex_index].co
    uvl.data[loop.index].uv = (v.x / 5.0, v.y / 5.0)
# our dashed border lines (world x 31 and 1699 -> plan), dashes 1.2 BU long
w = G['camera']['world']
for side, xw in (('w', 31), ('e', 1699)):
    X = (xw / w['unitsPerPlanUnit'] + w['planOriginX']) * 100
    for i, y in enumerate([53 + 2.4 * k for k in range(18)]):
        flat(f'FLOOR_dash_{side}{i}', [(X - 0.12, y), (X + 0.12, y), (X + 0.12, y + 1.2), (X - 0.12, y + 1.2)], 0.004, mat('dash', (0.45, 0.28, 0.10), 0.9))
# rugs: red with a darker border and pale fringes, a slab 0.05 BU thick
RUG, RUG_DARK, FRINGE = (0.62, 0.10, 0.08), (0.35, 0.05, 0.08), (0.85, 0.80, 0.70)


def rug(name, centre, length, width, angle):
    c, s = math.cos(angle), math.sin(angle)
    def pts(l, wd):
        return [(centre[0] + c * a - s * b, centre[1] + s * a + c * b) for a, b in ((-l / 2, -wd / 2), (l / 2, -wd / 2), (l / 2, wd / 2), (-l / 2, wd / 2))]
    flat(name + '_border', pts(length, width), 0.02, mat('rug_dark', RUG_DARK, 0.95))
    flat(name + '_body', pts(length - 0.5, width - 0.5), 0.03, mat('rug', RUG, 0.95))
    for e in (-1, 1):
        fc_ = (centre[0] + c * e * (length / 2 + 0.25), centre[1] + s * e * (length / 2 + 0.25))
        flat(name + f'_fringe{e}', [(fc_[0] + c * a - s * b, fc_[1] + s * a + c * b) for a, b in ((-0.25, -width / 2), (0.25, -width / 2), (0.25, width / 2), (-0.25, width / 2))], 0.015, mat('fringe', FRINGE, 0.95))


ax = FP['axis_x']
for i, (a, b) in enumerate(FP['rugs']):
    cx_, cy_ = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    L_, W_ = abs(b[0] - a[0]), abs(b[1] - a[1])
    ang = 0.0 if L_ >= W_ else math.pi / 2
    L_, W_ = max(L_, W_), min(L_, W_)
    rug(f'RUG_w{i}', (cx_, cy_), L_, W_, ang)
    rug(f'RUG_e{i}', (2 * ax - cx_, cy_), L_, W_, ang)
(a, b) = FP['rug_diag']
cx_, cy_ = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
rug('RUG_nw', (cx_, cy_), 5.2, 1.6, math.radians(45))
rug('RUG_ne', (2 * ax - cx_, cy_), 5.2, 1.6, math.radians(-45))

# light: environ2's warm sun with real shadows, and a cool sky
sun = bpy.data.lights.new('SUN', 'SUN')
sun.energy = 1.6
sun.color = (1.0, 0.95, 0.85)
sun.angle = math.radians(3)
so = bpy.data.objects.new('SUN', sun)
sc.collection.objects.link(so)
so.rotation_euler = Vector((-1.0, 0.25, -1.1)).to_track_quat('-Z', 'Y').to_euler()
wd = bpy.data.worlds.new('W')
wd.use_nodes = True
wd.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.80, 0.90, 1)
wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22
sc.world = wd
# environ2's cartoon look on everything: every material becomes the toon shading of its own base colour (TOON=0 keeps PBR)
if os.environ.get('TOON', '1') == '1':
    swap = {}
    for m in list(bpy.data.materials):
        if not m.use_nodes or m.name.startswith('toon_'):
            continue
        p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p is None:
            continue
        rgb = tuple(p.inputs['Base Color'].default_value)[:3]
        img = next((n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
        t = stage.toon_material('toon_' + m.name, rgb)
        if img is not None:                          # textured (the pavement tiles): the texture is the base colour
            nt = t.node_tree
            tx = nt.nodes.new('ShaderNodeTexImage')
            tx.image = img
            uvn = nt.nodes.new('ShaderNodeUVMap')
            nt.links.new(uvn.outputs['UV'], tx.inputs['Vector'])
            mix = next(n for n in nt.nodes if n.type == 'MIX' and n.inputs['A'].links and n.inputs['A'].links[0].from_node.type == 'RGB')
            nt.links.new(tx.outputs['Color'], mix.inputs['A'])
        swap[m.name] = t
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE'):
            for slot in o.material_slots:
                if slot.material and slot.material.name in swap:
                    slot.material = swap[slot.material.name]
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 32
    sun.angle = math.radians(14)
sc.render.filepath = os.path.join(OUT, 'preview.png')
sc.render.film_transparent = False
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'plaza_lit.blend'))
# for the game: every toon material exported as a plain base colour (the game's renderer draws the toon look itself)
for o in sc.objects:
    if o.type not in ('MESH', 'CURVE'):
        continue
    for slot in o.material_slots:
        m = slot.material
        if m is None or not m.use_nodes or any(n.type == 'BSDF_PRINCIPLED' for n in m.node_tree.nodes):
            continue
        rgbn = next((n for n in m.node_tree.nodes if n.type == 'RGB'), None)      # the toon material's own colour
        if rgbn is None:
            continue
        rgb = tuple(rgbn.outputs[0].default_value)[:3]
        flat_m = bpy.data.materials.get('base_' + m.name)
        if flat_m is None:
            flat_m = bpy.data.materials.new('base_' + m.name)
            flat_m.use_nodes = True
            pb = next(n for n in flat_m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            pb.inputs['Base Color'].default_value = (*rgb, 1)
            pb.inputs['Roughness'].default_value = 0.9
        slot.material = flat_m
bpy.ops.object.select_all(action='SELECT')
so.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'plaza.glb'), export_format='GLB', use_selection=True, export_cameras=True,
                          export_lights=False, export_apply=True, export_yup=True)
print('plaza_lit exported')
