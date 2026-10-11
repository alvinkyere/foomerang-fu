"""Teal jelly character, reconstructed from the footage (no licensed asset exists).  Shared by the scene builder and the orientation solver.
Measured from the plaza shots: face-on it is a rounded block, slightly wider at the top (dome), the face sits low with two dark eyes and a short
mouth; edge-on it is thin (depth / width ~0.35 from the apparent-width extremes in take B); mint body, darker underside.
build(parent, mat_fn) creates the meshes parented to `parent` (origin at the ground contact, face toward -Y) and returns them."""
import bpy, bmesh, math
from mathutils import Vector

W, D, H = (float(v) for v in __import__('os').environ.get('FOO_TEAL_WDH', '3.8,1.4,5.6').split(','))          # BU before the character scale; fitted by silhouette statistics

def build(parent, mat_fn, prefix='TEAL'):
    body = mat_fn('teal_body', (98, 214, 183)); under = mat_fn('teal_under', (62, 150, 150)); eye = mat_fn('teal_eye', (22, 52, 56))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, H / 2)); o = bpy.context.active_object; o.name = prefix + '_BODY'; o.scale = (W, D, H)
    bpy.ops.object.transform_apply(scale=True)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in bm.verts:            # dome: the top widens slightly and rounds off; the bottom narrows a little
        t = v.co.z / H
        v.co.x *= 0.92 + 0.12 * t
    bm.to_mesh(o.data); bm.free()
    bv = o.modifiers.new('bv', 'BEVEL'); bv.width = 1.1; bv.segments = 6; bv.limit_method = 'NONE'
    ss = o.modifiers.new('ss', 'SUBSURF'); ss.levels = 2; ss.render_levels = 2
    o.data.materials.append(body); o.data.materials.append(under)
    for p in o.data.polygons:
        p.use_smooth = True
        if p.center.z < 0.25 * H: p.material_index = 1
    o.parent = parent; parts = [o]
    for s in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.26, segments=12, ring_count=8, location=(s * 0.85, -D / 2 - 0.02, 1.45)); e = bpy.context.active_object
        e.name = prefix + '_EYE'; e.scale = (1, 0.4, 1.15); e.data.materials.append(eye); e.parent = parent; parts.append(e)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -D / 2 - 0.02, 1.0)); m = bpy.context.active_object; m.name = prefix + '_MOUTH'; m.scale = (0.8, 0.1, 0.13)
    m.data.materials.append(eye); m.parent = parent; parts.append(m)
    return parts
