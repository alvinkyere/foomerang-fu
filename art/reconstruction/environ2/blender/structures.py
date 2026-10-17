"""environ2's thin structures as our own models, every point measured in environ2 through its camera (camera rays meeting the
ground, or the vertical plane the structure stands in): the three purple fences (two posts with capped tops and a rail between),
the bunting (two round posts with pale tops, a sagging rope and nine red pennants), the two banner poles with their pale cloth,
and the sign on its post.  Blender -b --python structures.py -- <out_dir> [materials.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
DEFAULT = {'fence': (0.22, 0.16, 0.42), 'fence_cap': (0.42, 0.36, 0.65), 'bunt_post': (0.06, 0.04, 0.04), 'bunt_top': (0.55, 0.42, 0.30),
           'rope': (0.10, 0.08, 0.25), 'pennant': (0.85, 0.12, 0.10), 'pole': (0.10, 0.07, 0.06), 'cloth': (0.80, 0.78, 0.68),
           'sign': (0.85, 0.82, 0.74), 'emblem': (0.80, 0.10, 0.10), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))
sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
M = {k: stage.material(k, v, 0.7) for k, v in COL.items()}
MIRROR = 1302.5                     # x' = 1302.5 - x: the plaza's mirror axis (x = 651.25)


def bar(name, a, b, w, d, mat):
    """A box from point a to point b (its long axis), w x d in section."""
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cube_add(location=(a + b) / 2)
    o = bpy.context.object
    o.name = name
    v = b - a
    o.scale = (w / 2, d / 2, v.length / 2)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = v.to_track_quat('Z', 'Y')
    bv = o.modifiers.new('bevel', 'BEVEL')
    bv.width, bv.segments = min(w, d) * 0.2, 2
    o.data.materials.append(mat)
    return o


def quad(name, pts, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in pts], [], [list(range(len(pts)))])
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    o.data.materials.append(mat)
    s = o.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = 0.06
    return o


# ---- fences: front post foot, front post top, back post top (image px) on the fence's ground line ----------------------
FENCES = {'30_fence_w': ((42, 343), 318, (47, 229)), '31_fence_sw': ((4, 576), 551, (8, 468))}
FENCES['32_fence_e'] = ((MIRROR - 42, 343), 318, (MIRROR - 47, 229))
for key, (foot, top_row, back_top) in FENCES.items():
    g, h = stage.height_at(foot, top_row)
    gb = stage.ray_to_z(*back_top, h)               # the back post's top, at the same height: its foot is straight below
    for i, p in enumerate((g, gb)):
        bar(f'FENCE_{key}_post{i}', (p.x, p.y, 0), (p.x, p.y, h - 0.25), 0.55, 0.55, M['fence'])
        bar(f'FENCE_{key}_cap{i}', (p.x, p.y, h - 0.3), (p.x, p.y, h + 0.1), 0.85, 0.85, M['fence_cap'])
    bar(f'FENCE_{key}_rail', (g.x, g.y + 0.3, h * 0.85), (gb.x, gb.y - 0.3, h * 0.85), 0.38, 0.38, M['fence'])

# ---- bunting -----------------------------------------------------------------------------------------------------------------
gw, hw = stage.height_at((517, 690), 590)
ge, he = stage.height_at((787, 688), 588)
for i, (g, h) in enumerate(((gw, hw), (ge, he))):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.24, depth=h - 0.3, location=(g.x, g.y, (h - 0.3) / 2))
    o = bpy.context.object
    o.name = f'BUNTING_post{i}'
    o.data.materials.append(M['bunt_post'])
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.24, depth=0.3, location=(g.x, g.y, h - 0.15))
    o = bpy.context.object
    o.name = f'BUNTING_top{i}'
    o.data.materials.append(M['bunt_top'])
A, B = (gw.x, gw.y), (ge.x, ge.y)
rope_px = [(523, 605), (560, 609), (600, 613), (650, 615), (700, 613), (740, 609), (783, 604)]
rope = [stage.ray_to_vertical_plane(x, y, A, B) for x, y in rope_px]
cu = bpy.data.curves.new('rope', 'CURVE')
cu.dimensions = '3D'
sp = cu.splines.new('POLY')
sp.points.add(len(rope) - 1)
for p_, q in zip(sp.points, rope):
    p_.co = (q.x, q.y, q.z, 1)
cu.bevel_depth = 0.07
ro = bpy.data.objects.new('BUNTING_rope', cu)
sc.collection.objects.link(ro)
ro.data.materials.append(M['rope'])
for i, cx in enumerate(range(548, 760, 25)):
    sag = 605 + 10 * (1 - ((cx - 653) / 130) ** 2)
    pts = [stage.ray_to_vertical_plane(x, y, A, B) for x, y in ((cx - 9, sag), (cx + 9, sag), (cx, sag + 13))]
    quad(f'BUNTING_pennant{i}', pts, M['pennant'])

# ---- banners: a tall pole (its top above the frame) and a pale cloth hanging west of it -------------------------------------
BANNERS = {'02_banner_l': ((382, 73), [(334, -2), (370, -2), (371, 41), (336, 34)]),
           '03_banner_r': ((918, 81), [(884, -2), (926, -2), (915, 42), (890, 36)])}
for key, (foot, cloth_px) in BANNERS.items():
    g = stage.ray_to_z(*foot, 0)
    bar(f'BANNER_{key}_pole', (g.x, g.y, 0), (g.x, g.y, 14.0), 0.32, 0.32, M['pole'])
    A2, B2 = (g.x - 10, g.y), (g.x + 10, g.y)        # the cloth hangs in the east-west plane through the pole
    quad(f'BANNER_{key}_cloth', [stage.ray_to_vertical_plane(x, y, A2, B2) for x, y in cloth_px], M['cloth'])

# ---- the sign: a post and a board facing the viewer ----------------------------------------------------------------------
g = stage.ray_to_z(508, 139, 0)
A3, B3 = (g.x - 10, g.y), (g.x + 10, g.y)
top = stage.ray_to_vertical_plane(507, 76, A3, B3)
bar('SIGN_post', (g.x, g.y, 0), (g.x, g.y, top.z), 0.35, 0.35, M['pole'])
quad('SIGN_board', [stage.ray_to_vertical_plane(x, y, A3, B3) - Vector((0, 0.2, 0)) for x, y in ((483, 87), (531, 87), (531, 125), (483, 125))],
     M['sign'])
e = stage.ray_to_vertical_plane(503, 108, A3, B3)
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.35, location=(e.x, e.y - 0.3, e.z))
em = bpy.context.object
em.name = 'SIGN_emblem'
em.scale = (1.2, 0.25, 1.0)
em.data.materials.append(M['emblem'])

bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, 80, 0))
bpy.context.object.data.materials.append(M['ground'])
stage.light()
PARTS = {'fence': (1, 0, 0), 'fence_cap': (0, 1, 0), 'bunt_post': (0, 0, 1), 'bunt_top': (1, 1, 0), 'rope': (1, 0, 1),
         'pennant': (0, 1, 1), 'pole': (1, 1, 1), 'cloth': (0.5, 0, 0), 'sign': (0, 0.5, 0), 'emblem': (0, 0, 0.5)}
stage.render_with_ids(OUT, 'structures', PARTS, (0, 0, 1280, 720))
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith(('FENCE', 'BUNTING', 'BANNER', 'SIGN')):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'structures.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'structures.fbx'), use_selection=True)
print('structures built')
