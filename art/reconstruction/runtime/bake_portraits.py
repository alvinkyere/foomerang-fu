"""Bake the character-select portraits: every pack character facing the viewer, seen from a little above, as in the reference
video's character-select screen (game-setting.mp4). blender -b --python bake_portraits.py -- <outdir> <size> <char,...> [yaw_deg]
Each portrait is SIZE x SIZE px (RGBA, transparent), the model framed by its bounding sphere so every character fills its circle
alike. Materials as bake_chars.py (matte; Icecream desaturation). Facing: FRONT_YAW per model (found by test renders), or the
optional yaw argument for every character (to find a model's front)."""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from char_hands import add_hands
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]; OUT = os.path.abspath(args[0]); SIZE = int(args[1]); CHARS = args[2].split(',')
YAW_ALL = float(args[3]) if len(args) > 3 else None; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); LIC = os.path.join(HERE, '..', 'licensed')
FILES = {'bread': ('bread.blend', 'bread'), 'coffee': ('Coffee.blend', 'coffee'), 'watermelon': ('watermelon.blend', 'watermelon'), 'icecream': ('icecream.blend', 'Icecream'),
         'banana': ('banana.blend', 'NurbsPath.001'), 'carrot': ('Carrot.blend', 'carrot'), 'avocado': ('avocado.blend', 'Avocado'), 'donut': ('donut.blend', 'donut'),
         'milk': ('milk.blend', 'milk'), 'bacon': ('bacon.blend', 'bacon')}
FRONT_YAW = {}                      # every pack model faces -Y at yaw 0 (test renders at 0/90/180/270)
TURN = -20.0                        # a three-quarter turn, as the reference portraits stand
ELEVATION = math.radians(18)        # the reference portraits are seen from slightly above
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.render.film_transparent = True
sc.render.resolution_x = SIZE; sc.render.resolution_y = SIZE; sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; bg = wd.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.97, 0.98, 1.0, 1); bg.inputs['Strength'].default_value = 0.975
sun = bpy.data.lights.new('S', 'SUN'); sun.color = (1.0, 0.95, 0.85); sun.energy = 1.6; sun.angle = math.radians(14)
so = bpy.data.objects.new('S', sun); bpy.context.collection.objects.link(so); so.rotation_euler = (math.radians(40), 0, math.radians(-30))
cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; co = bpy.data.objects.new('C', cd); bpy.context.collection.objects.link(co); sc.camera = co
for name in CHARS:
    for o in list(bpy.data.objects):
        if o.type in ('MESH', 'CURVE', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
    blend, obj = FILES[name]
    with bpy.data.libraries.load(os.path.join(LIC, name, blend), link=False) as (s1, d1): d1.objects = [obj]
    mesh = d1.objects[0]; bpy.context.collection.objects.link(mesh)
    add_hands(mesh, name, LIC, 1.0)                                       # Bread, Coffee, Icecream, Carrot (char_hands.py)
    spin = bpy.data.objects.new('SPIN', None); bpy.context.collection.objects.link(spin); mesh.parent = spin
    for mt in mesh.data.materials:
        if not (mt and mt.node_tree): continue
        nt = mt.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Specular IOR Level'].default_value = 0.0; bs.inputs['Roughness'].default_value = 1.0
        lk = next((l for l in nt.links if l.to_socket == bs.inputs['Base Color']), None)
        if lk is not None and name == 'icecream':
            hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.79; hs.inputs['Value'].default_value = 0.96; nt.links.new(lk.from_socket, hs.inputs['Color']); nt.links.new(hs.outputs['Color'], bs.inputs['Base Color'])
    spin.rotation_euler = (0, 0, math.radians(YAW_ALL if YAW_ALL is not None else FRONT_YAW.get(name, 0.0) + TURN))
    bpy.context.view_layer.update()
    pts = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]; ctr = sum(pts, Vector()) / 8; r = max((p - ctr).length for p in pts)
    d = Vector((0, -math.cos(ELEVATION), math.sin(ELEVATION)))          # camera on -Y, looking at the model's centre
    co.location = ctr + d * (r * 6); co.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cd.ortho_scale = r * 2.1
    cd.clip_start = r * 0.5; cd.clip_end = r * 12
    sc.render.filepath = os.path.join(OUT, f'{name}.png' if YAW_ALL is None else f'{name}_{int(YAW_ALL):03d}.png'); bpy.ops.render.render(write_still=True)
print('portraits baked', OUT)
