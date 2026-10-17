"""Bake the painting into each model's own texture, so the exported model carries its paint wherever it moves.
Every mesh gets its own UV layout (smart projection); a shader computes, for each surface point, the exact pixel where environ2's
camera sees it (world -> camera transform, perspective divide: exact at every texel, unlike projected UVs on large faces) and
reads the clean plate there; that is baked into a texture per object group, which then becomes the model's material.
Blender -b --python bake_paint.py -- <in.blend> <out_dir> <name> [texture size]"""
import sys, os
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

args = sys.argv[sys.argv.index('--') + 1:]
src, OUT, NAME = args[:3]
SIZE = int(args[3]) if len(args) > 3 else 2048
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
plate = bpy.data.images.load(os.path.join(stage.ENV2, 'step2_clean.png'))
meshes = [o for o in sc.objects if o.type == 'MESH' and not o.name.startswith(('Plane', 'CONE'))]

# the projection shader: camera space point (x, y, z), pixel = principal + F * (x, y) / -z  ->  plate UV
proj = bpy.data.materials.new('project')
proj.use_nodes = True
nt = proj.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
geo = nt.nodes.new('ShaderNodeNewGeometry')
# camera space written out from the camera's own matrix (Cycles' "camera space" is not the scene camera while baking)
Mi = sc.camera.matrix_world.inverted()
L = nt.links.new
rows = []
for r in range(3):
    dn = nt.nodes.new('ShaderNodeVectorMath'); dn.operation = 'DOT_PRODUCT'
    dn.inputs[1].default_value = tuple(Mi.to_3x3()[r])
    rows.append(dn)
L(geo.outputs['Position'], rows[0].inputs[0]); L(geo.outputs['Position'], rows[1].inputs[0]); L(geo.outputs['Position'], rows[2].inputs[0])
# x_c = row0 . p + t0 ...
add = []
for r in range(3):
    a = nt.nodes.new('ShaderNodeMath'); a.operation = 'ADD'; a.inputs[1].default_value = Mi.translation[r]
    L(rows[r].outputs['Value'], a.inputs[0]); add.append(a)
negz = nt.nodes.new('ShaderNodeMath'); negz.operation = 'MULTIPLY'; negz.inputs[1].default_value = -1.0
du = nt.nodes.new('ShaderNodeMath'); du.operation = 'DIVIDE'
dv = nt.nodes.new('ShaderNodeMath'); dv.operation = 'DIVIDE'
su = nt.nodes.new('ShaderNodeMath'); su.operation = 'MULTIPLY_ADD'; su.inputs[1].default_value = stage.F / stage.W; su.inputs[2].default_value = stage.PP[0] / stage.W
sv = nt.nodes.new('ShaderNodeMath'); sv.operation = 'MULTIPLY_ADD'; sv.inputs[1].default_value = stage.F / stage.H; sv.inputs[2].default_value = 1 - stage.PP[1] / stage.H
L(add[2].outputs[0], negz.inputs[0])
L(add[0].outputs[0], du.inputs[0]); L(negz.outputs[0], du.inputs[1])
L(add[1].outputs[0], dv.inputs[0]); L(negz.outputs[0], dv.inputs[1])
L(du.outputs[0], su.inputs[0]); L(dv.outputs[0], sv.inputs[0])
comb = nt.nodes.new('ShaderNodeCombineXYZ')
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = plate; tex.interpolation = 'Closest'; tex.extension = 'EXTEND'
em = nt.nodes.new('ShaderNodeEmission')
out = nt.nodes.new('ShaderNodeOutputMaterial')
L(su.outputs[0], comb.inputs['X']); L(sv.outputs[0], comb.inputs['Y'])
L(comb.outputs['Vector'], tex.inputs['Vector']); L(tex.outputs['Color'], em.inputs['Color']); L(em.outputs['Emission'], out.inputs['Surface'])

# one UV layout across the whole group, one texture
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
    o.data.materials.clear()
    o.data.materials.append(proj)
    for uv in list(o.data.uv_layers):
        o.data.uv_layers.remove(uv)
    o.data.uv_layers.new(name='paint')
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.002)
bpy.ops.object.mode_set(mode='OBJECT')
baked = bpy.data.images.new(f'{NAME}_paint', SIZE, SIZE)
baked.colorspace_settings.name = 'sRGB'
bake_node = nt.nodes.new('ShaderNodeTexImage')
bake_node.image = baked
nt.nodes.active = bake_node
sc.render.engine = 'CYCLES'
sc.cycles.samples = 1
sc.cycles.bake_type = 'EMIT'
sc.render.bake.margin = 4
bpy.ops.object.bake(type='EMIT')
baked.filepath_raw = os.path.join(OUT, f'{NAME}_paint.png')
baked.file_format = 'PNG'
baked.save()

# the model's own material: its baked paint, unlit (the painting already holds its light)
mat = bpy.data.materials.new(f'{NAME}_paint')
mat.use_nodes = True
mt = mat.node_tree
for n in list(mt.nodes):
    mt.nodes.remove(n)
t2 = mt.nodes.new('ShaderNodeTexImage'); t2.image = baked; t2.interpolation = os.environ.get('PAINT_INTERP', 'Closest')
e2 = mt.nodes.new('ShaderNodeEmission'); o2 = mt.nodes.new('ShaderNodeOutputMaterial')
mt.links.new(t2.outputs['Color'], e2.inputs['Color']); mt.links.new(e2.outputs['Emission'], o2.inputs['Surface'])
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'{NAME}.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, f'{NAME}.fbx'), use_selection=True, path_mode='COPY', embed_textures=True)
print('baked', NAME, len(meshes), 'meshes')
