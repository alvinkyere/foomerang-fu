"""Bake a map's runtime layers from its height-map meshes (analysis/dsm_mesh.py: ground.ply + one PLY per elevated group), through
the map's game camera (maps/<map>.json). The vertex colours already carry the footage's light and shadow, so the meshes render UNLIT
(emission = vertex colour, Standard view transform): the bake re-projects what the reference shows, it does not relight it.
blender -b --python bake_dsm.py -- <map> <mesh_dir> <outdir>
Outputs (outdir): ground.png (everything), occ_<group>.png (each group alone, RGBA), layers.json (group -> depth key = canvas y of
the group's front edge centre)."""
import bpy, json, math, os, sys, glob
from mathutils import Matrix, Vector
args = sys.argv[sys.argv.index('--') + 1:]; MAP, MESH, OUT = args[0], os.path.abspath(args[1]), os.path.abspath(args[2]); os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); cc = cfg['camera']
W, H = cc['canvas']; f640 = cc['f']; P = cc['pose']; U = 100.0
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100; sc.render.filter_size = 1.0
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
cd = bpy.data.cameras.new('C'); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36; cd.lens = f640 / 640 * 36; cd.clip_start = 1; cd.clip_end = 5000
co = bpy.data.objects.new('C', cd); bpy.context.collection.objects.link(co); sc.camera = co
th, yw, rl = (math.radians(P[k]) for k in ('pitch_deg', 'yaw_deg', 'roll_deg')); c_, s_ = math.cos(th), math.sin(th)
R0 = Matrix(((1, 0, 0), (0, -s_, -c_), (0, c_, -s_))); Rz = Matrix(((math.cos(yw), math.sin(yw), 0), (-math.sin(yw), math.cos(yw), 0), (0, 0, 1)))
Rr = Matrix(((math.cos(rl), -math.sin(rl), 0), (math.sin(rl), math.cos(rl), 0), (0, 0, 1)))
m = (Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ (Rr @ R0 @ Rz)).transposed().to_4x4(); m.translation = Vector(P['C']) * U; co.matrix_world = m
mat = bpy.data.materials.new('vc'); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
ca = nt.nodes.new('ShaderNodeVertexColor'); em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(ca.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
objs = {}
for p in sorted(glob.glob(os.path.join(MESH, '*.ply'))):
    name = os.path.splitext(os.path.basename(p))[0]; before = set(bpy.data.objects)
    bpy.ops.wm.ply_import(filepath=p); o = [x for x in bpy.data.objects if x not in before][0]
    o.name = name; o.scale = (U, U, U); o.data.materials.append(mat)
    ca.layer_name = o.data.color_attributes[0].name if o.data.color_attributes else ''; objs[name] = o
bpy.context.view_layer.update()
from bpy_extras.object_utils import world_to_camera_view as w2c
def screen_y(x, y): v = w2c(sc, co, Vector((x * U, y * U, 0.0))); return (1 - v.y) * H
def render(path): sc.render.filepath = path; bpy.ops.render.render(write_still=True)
sc.render.film_transparent = False; render(os.path.join(OUT, 'ground.png'))
groups = json.load(open(os.path.join(MESH, 'groups.json')))['groups']; layers = {}
sc.render.film_transparent = True
for g, meta in groups.items():
    if g not in objs: continue
    for k, o in objs.items(): o.visible_camera = (k == g)
    render(os.path.join(OUT, f'occ_{g}.png')); layers[g] = dict(depth_y=screen_y(*meta['front']), footprint=meta['front'])
for o in objs.values(): o.visible_camera = True
json.dump(layers, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1); print('baked', MAP, len(layers), 'layers ->', OUT)
