"""environ2's raised terrace (the plaza's north end) as our own model, measured in environ2 through its camera: a white platform
whose front wall runs from the west leg (x 440) to the east leg (x 871), its top edge at row 76 under a red bead trim and its foot
at row 120; a flight of stairs down the middle (x 580-720, to row 145); small dark slots along the wall; the purple buildings
with doors along the back; and two terracotta pots standing on top (x 552, 742).
Blender -b --python archway.py -- <out_dir> [materials.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
DEFAULT = {'terrace_top': (0.95, 0.92, 0.80), 'terrace_wall': (0.85, 0.80, 0.70), 'trim': (0.70, 0.18, 0.15), 'slot': (0.10, 0.07, 0.08),
           'stair': (0.92, 0.90, 0.82), 'building': (0.30, 0.22, 0.42), 'door': (0.80, 0.78, 0.72), 'pot': (0.45, 0.16, 0.08),
           'pot_mouth': (0.03, 0.012, 0.012), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
M = {k: stage.material(k, v, 0.8) for k, v in COL.items()}


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.05):
    bpy.ops.mesh.primitive_cube_add(location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object
    o.name = name
    o.scale = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments = bevel, 2
    o.data.materials.append(mat)
    return o


# the front wall: its foot (row 120) and top edge (row 76) seen straight above each other at x 460
g, H = stage.height_at((460, 120), 76)
FRONT = g.y
west, east = stage.ray_to_z(440, 120, 0).x, stage.ray_to_z(871, 120, 0).x
BACK = FRONT + 40.0                                  # the terrace runs on out of the frame
t = box('ARCH_terrace', west, east, FRONT, BACK, 0, H, M['terrace_wall'], bevel=0.1)
t.data.materials.append(M['terrace_top'])
for f in t.data.polygons:
    f.material_index = 1 if f.normal.z > 0.5 else 0
# the red bead trim along the front top edge
n = 70
for i in range(n):
    x = west + (east - west) * (i + 0.5) / n
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=0.17, location=(x, FRONT + 0.3, H + 0.05))
    o = bpy.context.object
    o.name = f'ARCH_bead{i}'
    o.data.materials.append(M['trim'])
# small dark slots on the west wall (image x 475..535 at row 92)
for i, sx in enumerate((475, 495, 515, 535)):           # (the east wall has none)
    p = stage.ray_to_vertical_plane(sx, 92, (west, FRONT - 0.01), (east, FRONT - 0.01))
    box(f'ARCH_slot{i}', p.x - 0.3, p.x + 0.3, FRONT - 0.06, FRONT, p.z - 0.25, p.z + 0.25, M['slot'], bevel=0)
# the stairs: from the terrace top down to the ground in front (their foot at row 145, between x 580 and 720)
s_west, s_east = stage.ray_to_z(580, 145, 0).x, stage.ray_to_z(720, 145, 0).x
foot = stage.ray_to_z(650, 145, 0).y
STEPS = 6
for i in range(STEPS):
    y0 = foot + (FRONT - foot) * i / STEPS
    box(f'ARCH_stair{i}', s_west, s_east, y0, FRONT + 1.0, 0, H * (i + 1) / STEPS, M['stair'], bevel=0.04)
# the purple buildings along the back (their front at row 20), with pale doors at the centre
bfront = stage.ray_to_z(500, 20, H).y
for name, x0, x1 in (('west', 450, 640), ('east', 690, 860)):
    a, b = stage.ray_to_z(x0, 20, H).x, stage.ray_to_z(x1, 20, H).x
    box(f'ARCH_building_{name}', a, b, bfront, bfront + 8, H, H + 6, M['building'], bevel=0.1)
d0, d1 = stage.ray_to_z(628, 10, H).x, stage.ray_to_z(676, 10, H).x
box('ARCH_doors', d0, d1, bfront - 0.1, bfront + 0.2, H, H + 4.5, M['door'], bevel=0.05)
# the two pots on the terrace: turned jars standing at its top
for i, (px, py, r, h) in enumerate(((552, 44, 0.75, 1.7), (742, 39, 0.6, 1.4))):
    c = stage.ray_to_z(px, py, H)
    bm = bmesh.new()
    prof = [(0.001, 0), (r * 0.7, 0), (r, h * 0.35), (r * 0.95, h * 0.6), (r * 0.6, h * 0.85), (r * 0.65, h), (r * 0.45, h)]
    rings = [[bm.verts.new((rr * math.cos(2 * math.pi * k / 24), rr * math.sin(2 * math.pi * k / 24), z)) for k in range(24)] for rr, z in prof]
    for A, B in zip(rings, rings[1:]):
        for k in range(24):
            bm.faces.new((A[k], A[(k + 1) % 24], B[(k + 1) % 24], B[k]))
    me = bpy.data.meshes.new('pot')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(f'ARCH_pot{i}', me)
    sc.collection.objects.link(o)
    o.location = (c.x, c.y, H)
    for f in o.data.polygons:
        f.use_smooth = True
    o.data.materials.append(M['pot'])
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=r * 0.45, fill_type='NGON', location=(c.x, c.y, H + h - 0.02))
    bpy.context.object.data.materials.append(M['pot_mouth'])
    bpy.context.object.name = f'ARCH_pot{i}_mouth'

bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
stage.light()
PARTS = {'terrace_top': (1, 0, 0), 'terrace_wall': (0, 1, 0), 'trim': (0, 0, 1), 'slot': (1, 1, 0), 'stair': (1, 0, 1), 'building': (0, 1, 1),
         'door': (1, 1, 1), 'pot': (0.5, 0, 0)}
stage.render_with_ids(OUT, 'archway', PARTS, (0, 0, 1280, 720))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith('ARCH'):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'archway.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'archway.fbx'), use_selection=True)
print('archway built: height', round(H, 2), 'BU')
