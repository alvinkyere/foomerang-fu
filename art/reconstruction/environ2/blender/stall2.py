"""environ2's market stall, modelled in detail (second pass), placed as fitted (stall_fit_near.json / stall_fit_far.json):
 * round dark posts with beige end-grain caps standing above the roof
 * the roof: ONE thin red sheet, corrugated in five soft waves running front to back (so its front and back edges are scalloped),
   drooping a little at the overhang, darker in the troughs
 * the counter: a pink plank top (boards with gaps), a pale lavender lip strip with red dots, a deep purple plinth
 * per stall: a white sign board with blue lettering, black hooks and two blue fish on the far stalls; forks, knives and a white
   card on the side stalls
Look-dev render through environ2's camera (soft sun, bright sky), part ids for the colour fit, FBX/GLB of the models.
Blender -b --python stall2.py -- <out_dir> [materials.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
DEFAULT = {'roof': (0.62, 0.09, 0.08), 'roof_trough': (0.45, 0.06, 0.07), 'post': (0.07, 0.05, 0.05), 'cap': (0.60, 0.42, 0.24),
           'top': (0.75, 0.30, 0.45), 'front': (0.60, 0.14, 0.32), 'lip': (0.75, 0.62, 0.70), 'dot': (0.65, 0.07, 0.10),
           'plinth': (0.17, 0.10, 0.40), 'sign': (0.85, 0.82, 0.76), 'ink': (0.15, 0.20, 0.70), 'fish': (0.22, 0.32, 0.80),
           'metal': (0.25, 0.32, 0.36), 'card': (0.90, 0.88, 0.85), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
TOON = os.environ.get('TOON', '1') == '1'
sc, cam = stage.setup(engine='BLENDER_EEVEE_NEXT' if TOON else 'CYCLES')
if TOON:
    sc.eevee.taa_render_samples = 32
    sc.eevee.use_shadows = True
    M = {k: stage.toon_material(k, v) for k, v in COL.items()}
else:
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    M = {k: stage.material(k, v, 0.35 if k in ('metal', 'fish') else 0.8) for k, v in COL.items()}
SIGNED = {'stall_far_w', 'stall_far_e', 'stall_sw'}
FAR = {'stall_far_w', 'stall_far_e'}


def obj(name, me, mat, parent):
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.parent = parent
    if mat:
        o.data.materials.append(mat)
    return o


def box(name, parent, centre, size, mat, bevel=0.03, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(location=centre)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    o.rotation_euler = (0, 0, rot)
    o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments = bevel, 2
    o.parent = parent
    return o


def cyl(name, parent, centre, r, h, mat, taper=1.0, bevel=0.0, verts=20):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r * taper, depth=h, location=centre)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments = bevel, 3
    for f in o.data.polygons:
        f.use_smooth = True
    o.parent = parent
    return o


def roof(name, parent, rw, rd, z, waves=5, amp=0.07, droop=0.06, thick=0.06):
    """A thin corrugated sheet: waves across its width (ridges run front to back), drooping toward the overhang edges."""
    bm = bmesh.new()
    nx, ny = 100, 24
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y = (u - 0.5) * rw, (v - 0.5) * rd
            w = math.cos(2 * math.pi * waves * u)
            w = math.copysign(abs(w) ** 0.6, w)              # broad soft humps, narrow troughs
            zz = z + amp * w - droop * ((2 * v - 1) ** 2 * 0.6 + (2 * u - 1) ** 2 * 0.4)
            row.append(bm.verts.new((x, y, zz)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.material_index = 1 if math.cos(2 * math.pi * waves * (i + 0.5) / nx) < -0.92 else 0     # a thin dark seam in each trough
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = obj(name, me, None, parent)
    o.data.materials.append(M['roof'])
    o.data.materials.append(M['roof_trough'])
    s = o.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = thick
    for f in o.data.polygons:
        f.use_smooth = True
    return o


def build(name, p, posts, variant):
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    root.location = (p['cx'], p['cy'], 0)
    root.rotation_euler = (0, 0, p['yaw'])
    c_, s_ = math.cos(p['yaw']), math.sin(p['yaw'])
    loc = [Vector((c_ * (x - p['cx']) + s_ * (y - p['cy']), -s_ * (x - p['cx']) + c_ * (y - p['cy']), 0)) for x, y in posts]
    pw = abs(loc[1].x - loc[0].x + loc[2].x - loc[3].x) / 2
    pd = abs(loc[3].y - loc[0].y + loc[2].y - loc[1].y) / 2
    rz = p['rz']
    for i, l in enumerate(loc):
        cyl(f'{name}_post{i}', root, (l.x, l.y, rz / 2), 0.22, rz, M['post'], taper=0.92, verts=16)
        cyl(f'{name}_cap{i}', root, (l.x, l.y, rz + 0.22), 0.27, 0.48, M['cap'], bevel=0.08, verts=20)
    roof(f'{name}_roof', root, p['rw'], p['rd'], rz - 0.1)
    # the counter: purple plinth, pink body, plank top, lavender lip with red dots
    cd = p['cd']
    cy = -pd / 2 + cd / 2
    cz = p['cz']
    box(f'{name}_plinth', root, (0, cy, 0.22), (pw + 0.1, cd + 0.12, 0.44), M['plinth'], bevel=0.06)
    box(f'{name}_body', root, (0, cy, 0.44 + (cz - 0.7) / 2), (pw - 0.15, cd - 0.08, cz - 0.7), M['front'], bevel=0.04)
    boards = 6
    for k in range(boards):
        x = -pw / 2 + 0.1 + (k + 0.5) * (pw - 0.2) / boards
        box(f'{name}_board{k}', root, (x, cy, cz - 0.17), ((pw - 0.2) / boards - 0.05, cd + 0.02, 0.1), M['top'], bevel=0.02)
    box(f'{name}_lip', root, (0, cy - cd / 2 - 0.02, cz - 0.38), (pw - 0.05, 0.08, 0.28), M['lip'], bevel=0.02)
    for k in range(9):
        x = -pw / 2 + 0.35 + k * (pw - 0.7) / 8
        cyl(f'{name}_dot{k}', root, (x, cy - cd / 2 - 0.07, cz - 0.38), 0.06, 0.03, M['dot'], verts=10).rotation_euler = (math.pi / 2, 0, 0)
    f0, f1 = loc[0], loc[1]
    mid = (f0 + f1) / 2
    if name in SIGNED:                               # the sign board between the front posts, just under the caps
        ang = math.atan2(f1.y - f0.y, f1.x - f0.x)
        box(f'{name}_sign', root, (mid.x, mid.y - 0.06, rz - 0.15), ((f1 - f0).length - 0.3, 0.1, 0.5), M['sign'], bevel=0.03, rot=ang)
        for k, (dx, w) in enumerate(((-0.9, 1.2), (0.55, 0.35), (0.95, 0.25))):
            box(f'{name}_ink{k}', root, (mid.x + dx, mid.y - 0.12, rz - 0.15), (w, 0.02, 0.07), M['ink'], bevel=0, rot=ang)
    if name in FAR:
        for k in range(4):                           # hooks under the roof's front edge
            x = -pw / 2 + 0.6 + k * (pw - 1.2) / 3
            box(f'{name}_hook{k}', root, (x, -pd / 2 + 0.15, rz - 0.75), (0.07, 0.07, 0.45), M['post'], bevel=0)
        for k, dx in enumerate((-0.45, 0.45)):       # two blue fish on the front
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.32, location=(dx * pw / 2, cy - cd / 2 - 0.08, 1.15))
            g = bpy.context.object
            g.name = f'{name}_fish{k}'
            g.scale = (1.5, 0.35, 0.7)
            g.rotation_euler = (0, (0.5 if k else -0.5), 0)
            g.data.materials.append(M['fish'])
            g.parent = root
    else:
        for k in range(4):                           # forks and knives on the counter, and a white card
            x = -pw / 2 + 0.6 + k * (pw - 1.4) / 3
            box(f'{name}_tool{k}', root, (x, cy + 0.05, cz - 0.08), (0.1, cd * 0.7, 0.05), M['metal'], bevel=0, rot=0.45)
        box(f'{name}_card', root, (pw / 2 - 0.55, cy, cz - 0.06), (0.45, 0.35, 0.04), M['card'], bevel=0.01)
    return root


bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
for variant in ('near', 'far'):
    fit = json.load(open(os.path.join(stage.HERE, f'stall_fit_{variant}.json')))
    for s in fit['stalls']:
        build(s['name'], s['params'], s['posts'], variant)
stage.light()
bpy.data.lights['SUN'].angle = math.radians(18)          # environ2's shadows are soft
PARTS = {'roof': (1, 0, 0), 'roof_trough': (0.5, 0, 0), 'post': (0, 1, 0), 'cap': (0, 0.5, 0), 'top': (0, 0, 1), 'front': (0, 0, 0.5),
         'lip': (1, 1, 0), 'dot': (1, 0, 1), 'plinth': (0, 1, 1), 'sign': (1, 1, 1), 'ink': (0.5, 0.5, 0), 'fish': (0.5, 0, 0.5),
         'metal': (0, 0.5, 0.5), 'card': (0.5, 0.5, 1)}
stage.render_with_ids(OUT, 'stall2', PARTS, (0, 0, 1280, 720))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'stall2.blend'))
print('stall2 built')
