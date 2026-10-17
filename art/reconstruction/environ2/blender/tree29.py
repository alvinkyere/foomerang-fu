"""environ2's round olive tree (bottom-right, cut off by the frame) as our own model: a lumpy canopy of overlapping spheres over its
outline (tree29_fit.json: the outline unprojected at the canopy height) on a purple trunk.
Blender -b --python tree29.py -- <out_dir> [materials.json]"""
import sys, os, json, random
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
COL = dict({'leaves': (0.55, 0.42, 0.10), 'trunk': (0.20, 0.14, 0.30), 'ground': (0.93, 0.89, 0.62)},
           **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
FIT = json.load(open(os.path.join(stage.HERE, 'tree29_fit.json')))
sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
M = {k: stage.material(k, v, 0.9) for k, v in COL.items()}
rnd = random.Random(29)
hc = FIT['height']
for i, (x, y) in enumerate(FIT['blobs']):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.9 + rnd.uniform(-0.15, 0.2),
                                         location=(x, y, hc + rnd.uniform(-0.3, 0.3)))
    o = bpy.context.object
    o.name = f'TREE29_leaf{i}'
    o.scale = (1, 1, 0.8)
    for f in o.data.polygons:
        f.use_smooth = True
    o.data.materials.append(M['leaves'])
t = stage.ray_to_z(*FIT['trunk_px'], 0)
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.35, depth=hc, location=(t.x, t.y, hc / 2))
bpy.context.object.name = 'TREE29_trunk'
bpy.context.object.data.materials.append(M['trunk'])
bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
stage.light()
stage.render_with_ids(OUT, 'tree29', {'leaves': (1, 0, 0), 'trunk': (0, 1, 0)}, (1100, 560, 1280, 720))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith('TREE29'):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'tree29.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'tree29.fbx'), use_selection=True)
print('tree29 built')
