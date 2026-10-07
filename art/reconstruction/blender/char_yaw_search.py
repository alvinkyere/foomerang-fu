"""Analysis-by-synthesis for a character's 3D orientation (take B); FOO_CHAR = bread | teal | watermelon | coffee.
(Generalised from the Bread solver.)  blender -b --python bread_yaw_search.py -- <outdir> [first last step]
For every frame: the licensed Bread (same materials/gains/scale/tilt as the reconstruction) is placed on the camera ray of its tracked point
through the frozen per-frame camera, spun about its tilted body axis through N_YAW headings, and rendered (transparent, cropped to a 48 px
window around the track). Scoring and the temporal solve happen in analysis/solve_bread_yaw.py."""
import bpy, json, math, os, sys
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis'); LIC = os.path.join(HERE, '..', 'licensed')
args = sys.argv[sys.argv.index('--') + 1:]; OUT = args[0]; os.makedirs(OUT, exist_ok=True)
cam = json.load(open(os.path.join(AN, 'camera_takeB.json'))); poses = {p['frame']: p for p in cam['poses']}; CHAR = os.environ.get('FOO_CHAR', 'bread'); TRACK = {'icecream': 'teal'}.get(CHAR, CHAR); TRK = json.load(open(os.path.join(AN, 'tracks_takeB.json')))[TRACK]
F = sorted(int(k) for k in TRK); a0, a1, st = (int(args[1]), int(args[2]), int(args[3])) if len(args) > 3 else (F[0], F[-1], 1)
N_YAW = int(os.environ.get('FOO_NYAW', '24')); TILT = math.radians(float(os.environ.get('FOO_BTILT', '-36'))); SCALE = float(os.environ.get('FOO_BSCALE', {'bread': '1.25', 'teal': '0.57', 'icecream': '1.1', 'watermelon': '1.14', 'coffee': '1.0'}[CHAR])); U = 100.0; WIN = 24
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8; sc.cycles.use_denoising = False; sc.render.film_transparent = True
sc.render.resolution_x = 640; sc.render.resolution_y = 360; sc.render.use_border = True; sc.render.use_crop_to_border = True
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; bg = wd.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.97, 0.98, 1.0, 1); bg.inputs['Strength'].default_value = 0.975
sun = bpy.data.lights.new('S', 'SUN'); sun.color = (1.0, 0.93, 0.75); el = math.radians(58); sun.energy = 0.075 * math.pi / math.sin(el); sun.angle = math.radians(14)
so = bpy.data.objects.new('S', sun); bpy.context.collection.objects.link(so); az = math.radians(28); so.rotation_euler = (-Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))).to_track_quat('-Z', 'Y').to_euler()
root = bpy.data.objects.new('ROOT', None); bpy.context.collection.objects.link(root); spin = bpy.data.objects.new('SPIN', None); bpy.context.collection.objects.link(spin); spin.parent = root
def flat_mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (*[(c / 255) ** 2.2 for c in rgb], 1)
    bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Specular IOR Level'].default_value = 0.0; return m
def desaturate(m, sat):
    """Measured reference colour is less saturated than the pack texture: Hue/Saturation on the base colour (icecream: sat 0.6)."""
    nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); lk = next((l for l in nt.links if l.to_socket == bs.inputs['Base Color']), None)
    if lk is None: return
    hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sat; hs.inputs['Value'].default_value = 0.96; nt.links.new(lk.from_socket, hs.inputs['Color']); nt.links.new(hs.outputs['Color'], bs.inputs['Base Color'])
if CHAR == 'teal':
    sys.path.insert(0, HERE); import teal_model
    PARTS = teal_model.build(spin, flat_mat); mesh = PARTS[0]
else:
    blend, obj = {'bread': ('bread.blend', 'bread'), 'watermelon': ('watermelon.blend', 'watermelon'), 'coffee': ('Coffee.blend', 'coffee'), 'icecream': ('icecream.blend', 'Icecream')}[CHAR]
    with bpy.data.libraries.load(os.path.join(LIC, CHAR, blend), link=False) as (s_, d_): d_.objects = [obj]
    mesh = d_.objects[0]; bpy.context.collection.objects.link(mesh); mesh.parent = spin; PARTS = [mesh]
    bpy.context.view_layer.update(); zs = [(mesh.matrix_world @ Vector(c)).z for c in mesh.bound_box]; mesh.location.z -= min(zs)
    for m in mesh.data.materials:
        nt = m.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Specular IOR Level'].default_value = 0.0; bs.inputs['Roughness'].default_value = 1.0
        if CHAR == 'icecream': desaturate(m, float(os.environ.get('FOO_SAT', '0.79')))
        if CHAR != 'bread': continue
        lk = next(l for l in nt.links if l.to_socket == bs.inputs['Base Color'])
        sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(lk.from_socket, sep.inputs['Color']); mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.09; mr.inputs['From Max'].default_value = 0.16; mr.clamp = True
        nt.links.new(sep.outputs['Blue'], mr.inputs['Value']); gm = nt.nodes.new('ShaderNodeMix'); gm.data_type = 'RGBA'; nt.links.new(mr.outputs['Result'], gm.inputs['Factor'])
        gm.inputs['A'].default_value = (*[v ** 2.2 for v in (0.86, 1.07, 1.29)], 1); gm.inputs['B'].default_value = (*[v ** 2.2 for v in (1.23, 1.37, 1.57)], 1)
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
        nt.links.new(lk.from_socket, mx.inputs['A']); nt.links.new(gm.outputs['Result'], mx.inputs['B']); nt.links.new(mx.outputs['Result'], bs.inputs['Base Color'])
cd = bpy.data.cameras.new('C'); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36; cd.lens = cam['f'] / 640 * 36; cd.clip_start = 1; cd.clip_end = 5000
co = bpy.data.objects.new('C', cd); bpy.context.collection.objects.link(co); sc.camera = co
def set_cam(fr):
    p = poses[fr]; th = math.radians(p['pitch_deg']); yw = math.radians(p['yaw_deg']); rl = math.radians(p['roll_deg']); c, s = math.cos(th), math.sin(th)
    R0 = Matrix(((1, 0, 0), (0, -s, -c), (0, c, -s))); Rz = Matrix(((math.cos(yw), math.sin(yw), 0), (-math.sin(yw), math.cos(yw), 0), (0, 0, 1))); Rr = Matrix(((math.cos(rl), -math.sin(rl), 0), (math.sin(rl), math.cos(rl), 0), (0, 0, 1)))
    R = Rr @ R0 @ Rz; m = (Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ R).transposed().to_4x4(); m.translation = Vector(p['C']) * U; co.matrix_world = m
def ray(fr, px, py, z):
    bpy.context.view_layer.update(); m = co.matrix_world; f = cam['f']; d = (m.to_3x3() @ Vector(((px - 320) / f, -(py - 180) / f, -1))).normalized(); o = m.translation; return o + d * ((z - o.z) / d.z)
for fr in range(a0, a1 + 1, st):
    if str(fr) not in TRK: continue
    px, py = TRK[str(fr)]; set_cam(fr)
    sc.render.border_min_x = max(0, (px - WIN)) / 640; sc.render.border_max_x = min(640, (px + WIN)) / 640; sc.render.border_max_y = 1 - max(0, (py - WIN)) / 360; sc.render.border_min_y = 1 - min(360, (py + WIN)) / 360
    for k in range(N_YAW):
        yaw = 2 * math.pi * k / N_YAW; w = ray(fr, px, py, 1.4)
        root.location = (w.x, w.y, 0); root.rotation_euler = (TILT, 0, 0); root.scale = (SCALE,) * 3; spin.rotation_euler = (0, 0, yaw)
        bpy.context.view_layer.update(); pts = [o.matrix_world @ Vector(c) for o in PARTS for c in o.bound_box]; ctr = sum(pts, Vector()) / len(pts); t = ray(fr, px, py, ctr.z)
        root.location.x += t.x - ctr.x; root.location.y += t.y - ctr.y
        sc.render.filepath = os.path.join(OUT, f'f{fr:04d}_y{k:02d}.png'); bpy.ops.render.render(write_still=True)
print('done')
