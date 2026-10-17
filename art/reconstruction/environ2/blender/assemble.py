"""The whole plaza as one 3D scene of our own assets: every baked model group (its meshes and its painted texture) and the ground
plane with its floor texture, under environ2's camera; rendered as the assets render (unlit, 1 sample per pixel).
Blender -b --python assemble.py -- <bake_dir> <ground_dir> <out_dir>"""
import sys, os, json
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

BAKE, GROUND, OUT = sys.argv[sys.argv.index('--') + 1:][:3]
os.makedirs(OUT, exist_ok=True)
sc, cam = stage.setup(engine='CYCLES')
GROUPS = ['archway', 'fountain', 'stalls', 'props', 'trees', 'tree29', 'structures']
for g in GROUPS:
    path = os.path.join(BAKE, g, f'{g}.blend')
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = [n for n in src.objects]
    for o in dst.objects:
        if o is not None and o.type == 'MESH' and not o.name.startswith(('CONE', 'CARVE')):
            sc.collection.objects.link(o)
# the ground plane: a quad over the plan extent, its floor texture mapped straight on (texture row 0 = the far edge)
G = json.load(open(os.path.join(GROUND, 'ground.json')))
me = bpy.data.meshes.new('ground')
Z = -0.003       # a hair under the models' bases (which stand at 0): no fight over the same depth; 1/50 px on screen
me.from_pydata([(G['x0'], G['y0'], Z), (G['x1'], G['y0'], Z), (G['x1'], G['y1'], Z), (G['x0'], G['y1'], Z)], [], [(0, 1, 2, 3)])
uv = me.uv_layers.new(name='uv')
for loop, t in zip(me.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    uv.data[loop.index].uv = t
ground = bpy.data.objects.new('GROUND', me)
sc.collection.objects.link(ground)
m = bpy.data.materials.new('ground_paint')
m.use_nodes = True
nt = m.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(os.path.join(GROUND, 'ground.png'))
tex.interpolation = 'Closest'
em = nt.nodes.new('ShaderNodeEmission')
out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(tex.outputs['Color'], em.inputs['Color'])
nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
me.materials.append(m)
sc.cycles.samples = 1
sc.cycles.use_denoising = False
sc.cycles.use_adaptive_sampling = False
sc.render.filter_size = 0.01
sc.render.dither_intensity = 0.0
sc.world = None
sc.render.filepath = os.path.join(OUT, 'plaza_render.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'plaza.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'plaza.fbx'), use_selection=True, object_types={'MESH'}, path_mode='COPY',
                         embed_textures=True)
print('plaza assembled')
