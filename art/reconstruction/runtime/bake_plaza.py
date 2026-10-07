"""Bake the market_plaza RUNTIME assets from the reconstruction scene (build_courtyard8.py), seen through the frozen take-A camera
(frame 233) at the runtime resolution.  blender -b --python bake_plaza.py -- <outdir> [width]
Outputs (outdir): ground.png (every static surface, with the occluders' cast shadows), occ_<group>.png (each tall object alone, RGBA),
layers.json (group -> pixel rect + depth key = screen y of its ground footprint centre), camera.json (projection for the TS side)."""
import bpy, json, math, os, sys, runpy
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]; OUT = os.path.abspath(args[0]); WIDTH = int(args[1]) if len(args) > 1 else 1920; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); BUILDER = os.path.join(HERE, '..', 'blender', 'build_courtyard8.py')
os.environ['FOO_TAKE'] = 'A'; os.environ.setdefault('FOO_SAMPLES', '64')
sys.argv = ['blender', '--', os.path.join(OUT, '_scene')]                # no frames: build the scene only
g = runpy.run_path(BUILDER, run_name='__bake__')
sc = bpy.context.scene; set_cam = g['set_cam']; set_cam(233); co = sc.camera
SCALE = WIDTH / 640; HEIGHT = round(360 * SCALE)
sc.render.resolution_x = WIDTH; sc.render.resolution_y = HEIGHT; sc.render.image_settings.color_mode = 'RGBA'
# everything dynamic off
DYN = ('BREAD', 'COFFEE', 'WATERMELON', 'TEAL', 'BOOM', 'TRAIL', 'BURST', 'SPAWN', 'SHADOW_', 'Icecream', 'bread', 'coffee', 'watermelon')
for o in bpy.data.objects:
    if o.name.startswith(DYN) or (o.parent and o.parent.name.startswith(DYN)): o.hide_render = True
GROUPS = {}
def grp(o):
    n = o.name
    for pre in ('S0_', 'S1_', 'S2_', 'S3_', 'FAR0_', 'FAR1_'):
        if n.startswith(pre): return 'stall_' + pre.rstrip('_').lower()
    if n.startswith(('FOUNTAIN', 'SHELL', 'WATER_EDGE')): return 'fountain'
    if n.startswith('CRATE'): return 'crate_' + n[5:6]
    if n.startswith('POT'): return 'pot_' + ''.join(ch for ch in n[3:] if ch.isdigit())[:1]
    if n.startswith(('BUNTING', 'FLAG')): return 'bunting'
    if n.startswith('GOLD'): return 'golden_tree'
    if n.startswith('FENCE'): return 'fence_' + n[5:6]
    if n.startswith(('FAR_WALL', 'SIGN')): return 'far_wall'
    return None
for o in bpy.data.objects:
    if o.type in ('MESH', 'CURVE') and not o.hide_render:
        k = grp(o)
        if k: GROUPS.setdefault(k, []).append(o)
# a prop swallowed by a stall body (the rebuilt full-footprint counter) is invisible in the reconstruction: drop it
def inside_body(o):
    c = o.matrix_world.translation
    for b in bpy.data.objects:
        if b.name.endswith('_BODY') and b.name[:2] in ('S0', 'S1', 'S2', 'S3'):
            lc = b.matrix_world.inverted() @ c
            if all(abs(lc[i]) <= 0.5 * (b.dimensions[i] / max(b.scale[i], 1e-6)) for i in range(2)): return True
    return False
for k in [k for k, v in GROUPS.items() if k.startswith('pot_') and all(inside_body(o) for o in v)]:
    for o in GROUPS[k]: o.hide_render = True
    del GROUPS[k]
print('groups', {k: len(v) for k, v in GROUPS.items()})
def project(p):
    bpy.context.view_layer.update(); from bpy_extras.object_utils import world_to_camera_view as w2c
    v = w2c(sc, co, Vector(p)); return v.x * WIDTH, (1 - v.y) * HEIGHT
def render(path):
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
occ = [o for v in GROUPS.values() for o in v]
# 1) ground: EVERY static object visible (a faded or uncovered occluder must reveal the object itself, never a bare shadow)
sc.render.film_transparent = False
render(os.path.join(OUT, 'ground.png'))
if os.environ.get('FOO_GROUND_ONLY') == '1': sys.exit(0)
# 2) each occluder group alone on a transparent film (ground and other groups hidden from the camera)
sc.render.film_transparent = True
statics = [o for o in bpy.data.objects if o.type in ('MESH', 'CURVE') and not o.hide_render and o not in occ]
for o in statics: o.visible_camera = False
layers = {}
for k, objs in GROUPS.items():
    for o in occ: o.visible_camera = o in objs
    render(os.path.join(OUT, f'occ_{k}.png'))
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]; cx = sum(p.x for p in pts) / len(pts); cy = sum(p.y for p in pts) / len(pts)
    layers[k] = dict(depth_y=project((cx, cy, 0.0))[1], footprint_bu=[cx, cy])
# 3) camera for the TS projection (pinhole in plan units = BU/100, exactly the solved pose)
cam = g['cam']; p = g['poses'][233]
json.dump(dict(width=WIDTH, height=HEIGHT, f=cam['f'] * SCALE, cx=WIDTH / 2, cy=HEIGHT / 2, pose=p, bu_per_unit=0.05,
               world_to_bu='x_bu = X / 20 - 50, y_bu = 100 - Y / 20'), open(os.path.join(OUT, 'camera.json'), 'w'), indent=1)
json.dump(layers, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1)
print('baked', OUT)
