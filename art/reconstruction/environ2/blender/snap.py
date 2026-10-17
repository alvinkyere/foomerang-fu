"""Snap a model to its painted outline: every mesh of the model is intersected with the outline cone (the solid swept by the camera
rays through the outline: nothing of the model reaches outside what the painting shows), then the parts of the painted object the
model does not reach are filled with thin solids standing where the object stands.
Blender -b --python snap.py -- <model.blend> <cone.json> <out.blend> [fill.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

args = sys.argv[sys.argv.index('--') + 1:]
src, cone_json, out = args[:3]
fill_json = args[3] if len(args) > 3 else None
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
cam = sc.camera
O = cam.matrix_world.translation


def ray(px, py):
    m = cam.matrix_world
    return (m.to_3x3() @ Vector(((px - stage.PP[0]) / stage.F, -(py - stage.PP[1]) / stage.F, -1.0))).normalized()


def ray_solid(name, poly, near, far):
    """The solid between distances near and far along the camera rays through an image polygon (raster px)."""
    bm = bmesh.new()
    A = [bm.verts.new(O + ray(x, y) * near) for x, y in poly]
    B = [bm.verts.new(O + ray(x, y) * far) for x, y in poly]
    bm.faces.new(A)
    bm.faces.new(B[::-1])
    for i in range(len(A)):
        j = (i + 1) % len(A)
        bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    return o


# the ground plane and lights are not part of the model
for o in list(sc.objects):
    if o.type in ('LIGHT',) or (o.type == 'MESH' and o.name.startswith('Plane')):
        bpy.data.objects.remove(o, do_unlink=True)
# everything to plain meshes with their modifiers applied, parented transforms baked
for o in list(sc.objects):
    if o.type == 'CURVE':
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target='MESH')
meshes = [o for o in sc.objects if o.type == 'MESH']
for o in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

C = json.load(open(cone_json))
TRIM = os.environ.get('SKIP_TRIM') != '1'
def screen_box(o):
    xs, ys = [], []
    for v in o.data.vertices:
        x, y = stage.project(o.matrix_world @ v.co)
        xs.append(x)
        ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def poly_box(p):
    return min(q[0] for q in p), min(q[1] for q in p), max(q[0] for q in p), max(q[1] for q in p)


boxes = [poly_box(p) for p in C['cone']]
for o in (meshes if TRIM else []):
    # the cone for this mesh: only the outline polygons its screen box touches (an exact boolean against every outline in
    # the frame is needlessly slow); a mesh touching none lies wholly outside the painting and is removed
    x0, y0, x1, y1 = screen_box(o)
    near = [p for p, (a, b, c, d) in zip(C['cone'], boxes) if not (c < x0 - 2 or a > x1 + 2 or d < y0 - 2 or b > y1 + 2)]
    if not near:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    parts = [ray_solid('CONE', p, 5.0, 500.0) for p in near]
    bpy.ops.object.select_all(action='DESELECT')
    for c in parts:
        c.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    cone = bpy.context.object
    mod = o.modifiers.new('cone', 'BOOLEAN')
    mod.operation = 'INTERSECT'
    mod.solver = 'EXACT'
    mod.object = cone
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='cone')
    bpy.data.objects.remove(cone, do_unlink=True)
for o in list(sc.objects):
    if o.type == 'MESH' and len(o.data.polygons) == 0:
        bpy.data.objects.remove(o, do_unlink=True)

# fill: the painted object's pixels the model does not reach, as thin solids at the distance where the model is nearest
if fill_json:
    F = json.load(open(fill_json))
    dg = bpy.context.evaluated_depsgraph_get()

    def nearest_distance(poly):
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        for r in range(0, 40):                         # rings of rays around the gap until one meets the model
            for k in range(max(1, 8 * r)):
                a = 2 * math.pi * k / max(1, 8 * r)
                hit, loc, *_ = sc.ray_cast(dg, O, ray(cx + r * math.cos(a), cy + r * math.sin(a)))
                if hit:
                    return (loc - O).length
        return None

    # carve: model pixels on bare ground are cut away along their camera rays
    carves = [ray_solid('CARVE', p, 5.0, 500.0) for p in F.get('carve', [])]
    if carves:
        bpy.ops.object.select_all(action='DESELECT')
        for c in carves:
            c.select_set(True)
        bpy.context.view_layer.objects.active = carves[0]
        if len(carves) > 1:
            bpy.ops.object.join()
        cut = bpy.context.object
        cb = [poly_box(p) for p in F['carve']]
        for o in [o for o in sc.objects if o.type == 'MESH' and o is not cut]:
            x0, y0, x1, y1 = screen_box(o)
            if not any(not (c < x0 - 2 or a > x1 + 2 or d < y0 - 2 or b > y1 + 2) for a, b, c, d in cb):
                continue
            mod = o.modifiers.new('carve', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            mod.object = cut
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier='carve')
        bpy.data.objects.remove(cut, do_unlink=True)
    n = 0
    for poly in F['polys']:
        d = nearest_distance(poly)
        if d is None:
            continue
        # never below the ground (the floor would hide it): the fill's back stays short of where its rays meet the ground
        t_ground = min((0.02 - O.z) / ray(x, y).z for x, y in poly)
        front = min(d - 0.2, t_ground - 0.45)
        o = ray_solid(f'{F["prefix"]}_fill{n}', poly, front, front + 0.4)
        n += 1
    print('fills', n)
bpy.ops.wm.save_as_mainfile(filepath=out)
print('snapped:', len([o for o in sc.objects if o.type == 'MESH']), 'meshes')
