"""Bake character sprite atlases for the runtime: every pack character in the roster, seen through the frozen take-A camera at the
screen centre, at N_YAW headings x the solved tilts (standing / airborne).  blender -b --python bake_chars.py -- <outdir> <width> <char,...>
Each cell is CELL x CELL px (RGBA); cells.json records, per character, the scale used and the ground-anchor pixel inside a cell.
Materials follow the reconstruction (matte; Bread crust/crumb gains; Icecream desaturation)."""
import bpy, json, math, os, sys
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:]; OUT = os.path.abspath(args[0]); WIDTH = int(args[1]); CHARS = args[2].split(','); os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis'); LIC = os.path.join(HERE, '..', 'licensed')
SCALE_PX = WIDTH / 640; HEIGHT = round(360 * SCALE_PX); CELL = int(64 * SCALE_PX); N_YAW = 16; TILTS = {'stand': -20.0, 'air': -70.0}
FILES = {'bread': ('bread.blend', 'bread'), 'coffee': ('Coffee.blend', 'coffee'), 'watermelon': ('watermelon.blend', 'watermelon'), 'icecream': ('icecream.blend', 'Icecream'),
         'banana': ('banana.blend', 'NurbsPath.001'), 'carrot': ('Carrot.blend', 'carrot'), 'avocado': ('avocado.blend', 'Avocado'), 'donut': ('donut.blend', 'donut'),
         'milk': ('milk.blend', 'milk'), 'bacon': ('bacon.blend', 'bacon')}
CSCALE = {'bread': 1.25, 'coffee': 1.0, 'watermelon': 1.14, 'icecream': 1.1}          # fitted on the plaza footage; others 1.0 until fitted on their maps
cam = json.load(open(os.path.join(AN, 'camera_takeA.json'))); P = {p['frame']: p for p in cam['poses']}[233]; U = 100.0
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True; sc.render.film_transparent = True
sc.render.resolution_x = WIDTH; sc.render.resolution_y = HEIGHT; sc.render.use_border = True; sc.render.use_crop_to_border = True
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; bg = wd.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.97, 0.98, 1.0, 1); bg.inputs['Strength'].default_value = 0.975
sun = bpy.data.lights.new('S', 'SUN'); sun.color = (1.0, 0.93, 0.75); el = math.radians(58); sun.energy = 0.075 * math.pi / math.sin(el); sun.angle = math.radians(14)
so = bpy.data.objects.new('S', sun); bpy.context.collection.objects.link(so); az = math.radians(28); so.rotation_euler = (-Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))).to_track_quat('-Z', 'Y').to_euler()
cd = bpy.data.cameras.new('C'); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36; cd.lens = cam['f'] / 640 * 36; cd.clip_start = 1; cd.clip_end = 5000
co = bpy.data.objects.new('C', cd); bpy.context.collection.objects.link(co); sc.camera = co
th = math.radians(P['pitch_deg']); yw = math.radians(P['yaw_deg']); rl = math.radians(P['roll_deg']); c_, s_ = math.cos(th), math.sin(th)
R0 = Matrix(((1, 0, 0), (0, -s_, -c_), (0, c_, -s_))); Rz = Matrix(((math.cos(yw), math.sin(yw), 0), (-math.sin(yw), math.cos(yw), 0), (0, 0, 1))); Rr = Matrix(((math.cos(rl), -math.sin(rl), 0), (math.sin(rl), math.cos(rl), 0), (0, 0, 1)))
m = (Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ (Rr @ R0 @ Rz)).transposed().to_4x4(); m.translation = Vector(P['C']) * U; co.matrix_world = m
bpy.context.view_layer.update()
def ray(px, py, z):
    mm = co.matrix_world; f = cam['f']; d = (mm.to_3x3() @ Vector(((px - 320) / f, -(py - 180) / f, -1))).normalized(); o = mm.translation; return o + d * ((z - o.z) / d.z)
G = ray(320, 180, 0.0)            # the ground point under the screen centre: every cell is rendered here
from bpy_extras.object_utils import world_to_camera_view as w2c
def to_px(p): v = w2c(sc, co, Vector(p)); return v.x * WIDTH, (1 - v.y) * HEIGHT
ax, ay = to_px(G); x0 = round(ax - CELL / 2); y0 = round(ay - CELL * 0.72)
sc.render.border_min_x = x0 / WIDTH; sc.render.border_max_x = (x0 + CELL) / WIDTH; sc.render.border_max_y = 1 - y0 / HEIGHT; sc.render.border_min_y = 1 - (y0 + CELL) / HEIGHT
meta = dict(cell=CELL, n_yaw=N_YAW, tilts=TILTS, anchor=[ax - x0, ay - y0], chars={})
for name in CHARS:
    for o in list(bpy.data.objects):
        if o.type in ('MESH', 'CURVE', 'EMPTY'): bpy.data.objects.remove(o, do_unlink=True)
    blend, obj = FILES[name]
    with bpy.data.libraries.load(os.path.join(LIC, name, blend), link=False) as (s1, d1): d1.objects = [obj]
    mesh = d1.objects[0]; bpy.context.collection.objects.link(mesh)
    root = bpy.data.objects.new('ROOT', None); bpy.context.collection.objects.link(root); spin = bpy.data.objects.new('SPIN', None); bpy.context.collection.objects.link(spin); spin.parent = root; mesh.parent = spin
    bpy.context.view_layer.update(); mesh.location.z -= min((mesh.matrix_world @ Vector(c)).z for c in mesh.bound_box)
    for mt in mesh.data.materials:
        if not (mt and mt.node_tree): continue
        nt = mt.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Specular IOR Level'].default_value = 0.0; bs.inputs['Roughness'].default_value = 1.0
        lk = next((l for l in nt.links if l.to_socket == bs.inputs['Base Color']), None)
        if lk is None: continue
        if name == 'bread':
            sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(lk.from_socket, sep.inputs['Color']); mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.09; mr.inputs['From Max'].default_value = 0.16; mr.clamp = True
            nt.links.new(sep.outputs['Blue'], mr.inputs['Value']); gm = nt.nodes.new('ShaderNodeMix'); gm.data_type = 'RGBA'; nt.links.new(mr.outputs['Result'], gm.inputs['Factor'])
            gm.inputs['A'].default_value = (*[v ** 2.2 for v in (0.86, 1.07, 1.29)], 1); gm.inputs['B'].default_value = (*[v ** 2.2 for v in (1.23, 1.37, 1.57)], 1)
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
            nt.links.new(lk.from_socket, mx.inputs['A']); nt.links.new(gm.outputs['Result'], mx.inputs['B']); nt.links.new(mx.outputs['Result'], bs.inputs['Base Color'])
        if name == 'icecream':
            hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.79; hs.inputs['Value'].default_value = 0.96; nt.links.new(lk.from_socket, hs.inputs['Color']); nt.links.new(hs.outputs['Color'], bs.inputs['Base Color'])
    k = CSCALE.get(name, 1.0); meta['chars'][name] = dict(scale=k)
    for tname, tdeg in TILTS.items():
        for j in range(N_YAW):
            yaw = 2 * math.pi * j / N_YAW
            root.location = (G.x, G.y, 0.0); root.rotation_euler = (math.radians(tdeg), 0, 0); root.scale = (k,) * 3; spin.rotation_euler = (0, 0, yaw)
            bpy.context.view_layer.update(); pts = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]; ctr = sum(pts, Vector()) / 8
            root.location.x += G.x - ctr.x; root.location.y += G.y - ctr.y                      # bbox centre over the anchor ground point
            sc.render.filepath = os.path.join(OUT, f'{name}_{tname}_{j:02d}.png'); bpy.ops.render.render(write_still=True)
json.dump(meta, open(os.path.join(OUT, 'cells.json'), 'w'), indent=1); print('chars baked', OUT)
