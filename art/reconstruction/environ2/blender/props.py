"""environ2's crates and pots as our own models, placed and shaped as fitted to environ2 (props_fit.json). A crate is a slatted box:
a light frame round every edge and darker inset panels with board lines; a pot is a turned terracotta jar (lathe of its fitted
profile) with a dark mouth and a rolled lip. Crates 14 and 15 stand in the sunlit glow by tree 28 and carry its warm colour.
Blender -b --python props.py -- <out_dir> [materials.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
DEFAULT = {'crate_frame': (0.30, 0.18, 0.20), 'crate_panel': (0.16, 0.09, 0.14), 'crate_frame_lit': (0.85, 0.45, 0.25),
           'crate_panel_lit': (0.60, 0.28, 0.20), 'pot': (0.35, 0.13, 0.08), 'pot_mouth': (0.03, 0.012, 0.012), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
FIT = json.load(open(os.path.join(stage.HERE, 'props_fit.json')))
sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
M = {k: stage.material(k, v, 0.6 if k.startswith('pot') else 0.85) for k, v in COL.items()}
LIT = ('14_crate', '15_crate')


def crate(c):
    lit = c['name'].startswith(LIT)
    frame, panel = M['crate_frame_lit' if lit else 'crate_frame'], M['crate_panel_lit' if lit else 'crate_panel']
    s, h, z0 = c['s'], c['h'], c['z0']
    root = bpy.data.objects.new('CRATE_' + c['name'], None)
    sc.collection.objects.link(root)
    root.location = (c['cx'], c['cy'], z0)
    root.rotation_euler = (0, 0, c['yaw'])
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, h / 2))
    body = bpy.context.object
    body.name = 'CRATE_' + c['name'] + '_panels'
    body.scale = (s / 2 - 0.06, s / 2 - 0.06, h / 2 - 0.06)
    body.data.materials.append(panel)
    body.parent = root
    t = 0.16 * s                                       # frame beams round every edge, trimmed so no two overlap (overlapping
    for ax in range(3):                                # coplanar faces render black)
        L = (s, s - 2 * t, h - 2 * t)[ax]
        for a in (-1, 1):
            for b in (-1, 1):
                pos = [0.0, 0.0, 0.0]
                o = [i for i in range(3) if i != ax]
                pos[o[0]] = a * ((s, s, h)[o[0]] / 2 - t / 2)
                pos[o[1]] = b * ((s, s, h)[o[1]] / 2 - t / 2)
                pos[2] += h / 2
                size = [t, t, t]
                size[ax] = L
                bpy.ops.mesh.primitive_cube_add(location=pos)
                e = bpy.context.object
                e.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
                bv = e.modifiers.new('bevel', 'BEVEL')
                bv.width, bv.segments = 0.03, 1
                e.data.materials.append(frame)
                e.parent = root
    return root


def pot(p):
    """A lathe: the fitted radius profile (base to rim), a rolled lip, and a dark mouth."""
    prof = p['r']
    h = p['h']
    zs = [h * i / (len(prof) - 1) for i in range(len(prof))]
    pts = [(0.001, 0.0)] + list(zip(prof, zs)) + [(prof[-1] + 0.08, h + 0.05), (prof[-1] - 0.05, h + 0.1), (prof[-1] * 0.7, h)]
    bm = bmesh.new()
    seg = 32
    rings = []
    for r, z in pts:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], a[j], b[j], b[i]))
    me = bpy.data.meshes.new('pot')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('POT_' + p['name'], me)
    sc.collection.objects.link(o)
    o.location = (p['cx'], p['cy'], 0)
    sub = o.modifiers.new('smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    for f in o.data.polygons:
        f.use_smooth = True
    o.data.materials.append(M['pot'])
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=prof[-1] * 0.72, fill_type='NGON', location=(p['cx'], p['cy'], h - 0.02))
    mo = bpy.context.object
    mo.name = 'POT_' + p['name'] + '_mouth'
    mo.data.materials.append(M['pot_mouth'])
    return o


bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
for c in FIT['crates']:
    crate(c)
for p in FIT['pots']:
    pot(p)
stage.light()
PARTS = {'crate_frame': (1, 0, 0), 'crate_panel': (0, 1, 0), 'crate_frame_lit': (0, 0, 1), 'crate_panel_lit': (1, 1, 0), 'pot': (1, 0, 1),
         'pot_mouth': (0, 1, 1)}
stage.render_with_ids(OUT, 'props', PARTS, (0, 0, 1280, 720))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith(('CRATE', 'POT')):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'props.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'props.fbx'), use_selection=True)
print('props built')
