"""environ2's six market stalls as our own model: one stall asset (posts with capped tops, a red plank roof, a counter with a pink
body, magenta front, purple base and pale lip, and its wares), placed and turned as fitted to environ2 (stall_fit_near.json,
stall_fit_far.json: the far pair is a wider, front-facing variant with a white sign board and blue fish). Renders through the
camera, exports one FBX per variant.  Blender -b --python stalls.py -- <out_dir> [materials.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
DEFAULT = {'roof': (0.62, 0.08, 0.07), 'roof_edge': (0.40, 0.05, 0.05), 'post': (0.07, 0.05, 0.05), 'cap': (0.60, 0.38, 0.22),
           'body': (0.70, 0.22, 0.36), 'front': (0.55, 0.12, 0.30), 'base': (0.18, 0.08, 0.35), 'lip': (0.85, 0.75, 0.75),
           'sign': (0.85, 0.82, 0.75), 'fish': (0.20, 0.30, 0.75), 'ware': (0.10, 0.12, 0.12), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
M = {k: stage.material(k, v, 0.25 if k == 'fish' else 0.85) for k, v in COL.items()}


def cube(name, centre, size, mat, yaw=0.0, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=centre)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    o.rotation_euler = (0, 0, yaw)
    o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments = bevel, 2
    if parent:
        o.parent = parent
    return o


SIGNED = {'stall_far_w', 'stall_far_e', 'stall_sw'}      # the stalls whose sign board environ2 shows


def build(name, p, posts, variant):
    """One stall in its own local frame (x along its width, y toward its back), placed at (cx, cy) turned by yaw."""
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    root.location = (p['cx'], p['cy'], 0)
    root.rotation_euler = (0, 0, p['yaw'])
    c_, s_ = math.cos(p['yaw']), math.sin(p['yaw'])
    loc = [Vector((c_ * (x - p['cx']) + s_ * (y - p['cy']), -s_ * (x - p['cx']) + c_ * (y - p['cy']), 0)) for x, y in posts]
    pw = abs(loc[1].x - loc[0].x + loc[2].x - loc[3].x) / 2
    pd = abs(loc[3].y - loc[0].y + loc[2].y - loc[1].y) / 2
    rz, cap, pr = p['rz'], p['cap'], p['pr']
    rt = 0.28                                          # the roof is thin boards (the fit's 0.7 slab includes the boards' sag)
    for i, l in enumerate(loc):                       # posts and their round caps
        cube(f'{name}_post{i}', (l.x, l.y, (rz + 0.05) / 2), (pr, pr, rz + 0.05), M['post'], bevel=0.06, parent=root)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=pr * 0.62, depth=cap, location=(l.x, l.y, rz + cap / 2))
        c = bpy.context.object
        c.name = f'{name}_cap{i}'
        c.data.materials.append(M['cap'])
        c.parent = root
    # roof: planks running front to back, a slight gap between them, the front edge scalloped on the far variant
    planks = 5
    rw, rd = p['rw'], p['rd']
    for k in range(planks):
        x = -rw / 2 + (k + 0.5) * rw / planks
        tilt = 0.05 * (1 if k % 2 else -1)
        o = cube(f'{name}_plank{k}', (x, 0, rz - rt / 2), (rw / planks - 0.03, rd, rt), M['roof'], bevel=0.08, parent=root)
        o.rotation_euler = (tilt, 0, 0)
        o.data.materials.append(M['roof_edge'])
        for f in o.data.polygons:
            f.material_index = 0 if f.normal.z > 0.5 else 1
    # counter between the posts, toward the front
    cd = p['cd']
    cy = -pd / 2 + cd / 2 + p['coff'] * 0.0
    cz = p['cz']
    cube(f'{name}_base', (0, cy, 0.2), (pw - 0.1, cd, 0.4), M['base'], bevel=0.04, parent=root)
    cube(f'{name}_body', (0, cy, 0.4 + (cz - 0.55) / 2), (pw - 0.2, cd - 0.1, cz - 0.55), M['body'], bevel=0.04, parent=root)
    cube(f'{name}_front', (0, cy - cd / 2 + 0.02, 0.4 + (cz - 0.55) / 2), (pw - 0.3, 0.06, cz - 0.8), M['front'], parent=root)
    cube(f'{name}_lip', (0, cy, cz - 0.075), (pw - 0.05, cd + 0.05, 0.15), M['lip'], bevel=0.03, parent=root)
    # the sign board, mounted between the two front posts just under their caps (face-on on the far stalls, edge-on on the side
    # ones, where it reads as a white bar along the roof)
    f0, f1 = loc[0], loc[1]
    mid = (f0 + f1) / 2
    ang = math.atan2(f1.y - f0.y, f1.x - f0.x)
    if name in SIGNED:
        cube(f'{name}_sign', (mid.x, mid.y - 0.05, rz + 0.05), ((f1 - f0).length - pr, 0.12, 0.55), M['sign'], yaw=ang, bevel=0.04,
                parent=root)
    if variant == 'far' and name in SIGNED:
        for k, dx in enumerate((-0.25, 0.3)):            # the fish logo on the board
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.18, location=(mid.x + dx, mid.y - 0.13, rz + 0.05))
            g = bpy.context.object
            g.name = f'{name}_logo{k}'
            g.scale = (1.6, 0.3, 0.7)
            g.data.materials.append(M['fish'])
            g.parent = root
        for k, dx in enumerate((-0.45, 0.45)):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.35, location=(dx * pw / 2, cy - cd / 2 - 0.05, 1.3))
            f_ = bpy.context.object
            f_.name = f'{name}_fish{k}'
            f_.scale = (1.4, 0.4, 0.8)
            f_.data.materials.append(M['fish'])
            f_.parent = root
    else:
        for k in range(4):                            # wares on the counter: dark skewers lying across it
            x = -pw / 2 + 0.6 + k * (pw - 1.2) / 3
            cube(f'{name}_ware{k}', (x, cy, cz + 0.06), (0.12, cd * 0.8, 0.12), M['ware'], yaw=0.5, parent=root)
    return root


bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
for variant in ('near', 'far'):
    fit = json.load(open(os.path.join(stage.HERE, f'stall_fit_{variant}.json')))
    for s in fit['stalls']:
        build(s['name'], s['params'], s['posts'], variant)
stage.light()
PARTS = {'roof': (1, 0, 0), 'roof_edge': (0.5, 0, 0), 'post': (0, 1, 0), 'cap': (0, 0.5, 0), 'body': (0, 0, 1), 'front': (0, 0, 0.5),
         'base': (1, 1, 0), 'lip': (1, 0, 1), 'sign': (0, 1, 1), 'fish': (0.5, 0.5, 1), 'ware': (1, 0.5, 0)}
stage.render_with_ids(OUT, 'stalls', PARTS, (0, 0, 1280, 720))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith('stall'):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'stalls.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'stalls.fbx'), use_selection=True)
print('stalls built')
