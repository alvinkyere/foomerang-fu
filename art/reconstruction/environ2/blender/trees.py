"""environ2's four hex trees as our own models: a canopy of hexagonal tiles (flat-topped prisms, each a little higher or lower and
a little lighter or darker, as painted) held up on thin legs, at the canopy height and over the plan outline measured in
environ2 (trees_fit.json; a tree's height is its tallest visible leg: legs under the canopy are partly hidden).
Blender -b --python trees.py -- <out_dir> [materials.json]"""
import sys, os, json, math, random
import bpy, bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
DEFAULT = {'hex_top': (0.85, 0.30, 0.10), 'hex_side': (0.60, 0.16, 0.06), 'leg': (0.85, 0.40, 0.15),
           'hex_top_lit': (1.0, 0.65, 0.20), 'hex_side_lit': (0.85, 0.40, 0.10), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
FIT = json.load(open(os.path.join(stage.HERE, 'trees_fit.json')))
sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
M = {k: stage.material(k, v, 0.7) for k, v in COL.items()}
THICK = 0.22


def hex_prism(name, x, y, z, r, mats, parent):
    bm = bmesh.new()
    top, bot = [], []
    for i in range(6):
        a = math.pi / 6 + i * math.pi / 3
        top.append(bm.verts.new((x + r * math.cos(a), y + r * math.sin(a), z)))
        bot.append(bm.verts.new((x + r * math.cos(a), y + r * math.sin(a), z - THICK)))
    bm.faces.new(top)
    bm.faces.new(bot[::-1])
    for i in range(6):
        j = (i + 1) % 6
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.parent = parent
    for m in mats:
        o.data.materials.append(m)
    for f in o.data.polygons:
        f.material_index = 0 if f.normal.z > 0.5 else 1
    b = o.modifiers.new('bevel', 'BEVEL')
    b.width, b.segments = 0.06, 2
    return o


for key, t in FIT.items():
    lit = key == '28_tree'
    hc = t['canopy_height']
    rnd = random.Random(key)
    root = bpy.data.objects.new('TREE_' + key, None)
    sc.collection.objects.link(root)
    tops, sides = M['hex_top_lit' if lit else 'hex_top'], M['hex_side_lit' if lit else 'hex_side']
    for n, (x, y) in enumerate(t['tiles']):
        hex_prism(f'TREE_{key}_hex{n}', x, y, hc + rnd.uniform(-0.12, 0.12), t['hex_radius'] * 0.985, (tops, sides), root)
    for i, (lx, ly) in enumerate(t['legs']):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.09, depth=hc, location=(lx, ly, hc / 2))
        leg = bpy.context.object
        leg.name = f'TREE_{key}_leg{i}'
        leg.data.materials.append(M['leg'])
        leg.parent = root

bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
stage.light()
PARTS = {'hex_top': (1, 0, 0), 'hex_side': (0, 1, 0), 'leg': (0, 0, 1), 'hex_top_lit': (1, 1, 0), 'hex_side_lit': (1, 0, 1)}
stage.render_with_ids(OUT, 'trees', PARTS, (0, 0, 1280, 720))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith('TREE'):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'trees.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'trees.fbx'), use_selection=True)
print('trees built')
