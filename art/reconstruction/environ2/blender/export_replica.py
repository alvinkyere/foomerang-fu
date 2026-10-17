"""The plaza replica for the game: the outline-exact models (plaza3d/plaza.blend: each model snapped to its painted outline), as
plain geometry with their names. The game colours every surface by projecting environ2 (its clean plate) through the camera onto
the surface's RESTING position, so what the camera sees of each object is exactly environ2's design, and the design moves with
the object when it moves. Outline fill pieces are attached to the part they complete (the nearest), so they move with it.
Blender -b --python export_replica.py -- <plaza.blend> <out.glb>"""
import sys, os
import bpy

src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']
parts = [o for o in meshes if 'FILL_fill' not in o.name and o.name != 'GROUND']
for o in meshes:
    if 'FILL_fill' not in o.name:
        continue
    c = sum((o.matrix_world @ v.co for v in o.data.vertices), o.matrix_world.translation * 0) / len(o.data.vertices)
    best, bd = None, 1e9
    for p in parts:
        ok, loc, *_ = p.closest_point_on_mesh(p.matrix_world.inverted() @ c)
        if ok:
            d = (p.matrix_world @ loc - c).length
            if d < bd:
                best, bd = p, d
    if best is not None and bd < 3.0:
        mw = o.matrix_world.copy()
        o.parent = best
        o.matrix_parent_inverse = best.matrix_world.inverted()
        o.matrix_world = mw
for o in meshes:
    o.data.materials.clear()
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_cameras=False, export_lights=False,
                          export_apply=True, export_yup=True, export_materials='NONE', export_normals=False, export_texcoords=False)
print('replica exported', len(meshes), 'meshes')
