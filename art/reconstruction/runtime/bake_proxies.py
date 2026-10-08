"""Bake a map's runtime layers from its PROXY KIT (maps/proxies/<map>.json, analysis/proxies.py) through the map's game camera.
 * ground: a plane carrying the map's ground texture (analysis/ground_texture.py: z = 0 median of the shot, inferred cells filled).
 * every primitive: textured by PROJECTING the reference frame in which it sits most centrally (UV Project from that frame's solved
   camera), so its faces show exactly what the footage shows. Unlit (emission), Standard view transform: the light and shadow are
   the footage's own.
   FOO_RANK=k projects each primitive's k-th best frame instead (0 = best); combine_passes.py takes the per-pixel median of
   several ranks, so a mover that crosses a primitive in one frame drops out. Faces outside the chosen frame take the primitive's
   "fallback" colour ("fallback_top" for upward faces) (INFERRED: the footage never showed them). Primitives with "texture": "ground" (flat decks) use the ground
   texture (a median over the whole shot) instead of a single frame.
blender -b --python bake_proxies.py -- <map> <frames_dir> <ground_tex.png> <outdir>
Outputs: ground.png (everything), occ_<group>.png (each non-ground group alone, RGBA), layers.json (depth key = canvas y of the
group's front (south) edge centre)."""
import bpy, json, math, os, sys
from mathutils import Matrix, Vector
args = sys.argv[sys.argv.index('--') + 1:]; MAP, FD, GT, OUT = args[0], os.path.abspath(args[1]), os.path.abspath(args[2]), os.path.abspath(args[3])
os.makedirs(OUT, exist_ok=True); HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis'); sys.path.insert(0, AN)
import proxies
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); cc = cfg['camera']; W, H = cc['canvas']; U = 100.0
kit = proxies.load(os.path.join(HERE, '..', 'maps', 'proxies', f'{MAP}.json'))
shot = json.load(open(os.path.join(AN, f"camera_{kit['camera']}.json"))); SHOT_F = shot['f']; POSES = {p['frame']: p for p in shot['poses']}
gmeta = json.load(open(GT.replace('.png', '.json'))); GX0, GX1, GY0, GY1 = gmeta['box']
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
def camera(name, f640, pose):
    cd = bpy.data.cameras.new(name); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36; cd.lens = f640 / 640 * 36; cd.clip_start = 0.5; cd.clip_end = 5000
    co = bpy.data.objects.new(name, cd); bpy.context.collection.objects.link(co)
    th, yw, rl = (math.radians(pose[k]) for k in ('pitch_deg', 'yaw_deg', 'roll_deg')); c_, s_ = math.cos(th), math.sin(th)
    R0 = Matrix(((1, 0, 0), (0, -s_, -c_), (0, c_, -s_))); Rz = Matrix(((math.cos(yw), math.sin(yw), 0), (-math.sin(yw), math.cos(yw), 0), (0, 0, 1)))
    Rr = Matrix(((math.cos(rl), -math.sin(rl), 0), (math.sin(rl), math.cos(rl), 0), (0, 0, 1)))
    m = (Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ (Rr @ R0 @ Rz)).transposed().to_4x4(); m.translation = Vector(pose['C']) * U; co.matrix_world = m
    return co
game = camera('GAME', cc['f'], cc['pose']); sc.camera = game
RANK = int(os.environ.get('FOO_RANK', '0'))
def srgb(c): return tuple(((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)
def emission_material(name, image, uv=None, fallback=None, fallback_top=None):
    mat = bpy.data.materials.new(name); mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear(); L = nt.links.new
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(image, check_existing=True); tx.extension = 'EXTEND'; tx.interpolation = 'Linear'
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial'); col = tx.outputs['Color']
    if uv:
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = uv; L(uvn.outputs['UV'], tx.inputs['Vector'])
        if fallback is not None:          # outside the projected frame -> the fallback colour
            sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(uvn.outputs['UV'], sep.inputs[0]); inside = None
            for comp in ('X', 'Y'):
                for op, thr in (('GREATER_THAN', 0.002), ('LESS_THAN', 0.998)):
                    m = nt.nodes.new('ShaderNodeMath'); m.operation = op; L(sep.outputs[comp], m.inputs[0]); m.inputs[1].default_value = thr
                    if inside is None: inside = m
                    else: mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L(inside.outputs[0], mm.inputs[0]); L(m.outputs[0], mm.inputs[1]); inside = mm
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; L(inside.outputs[0], mix.inputs['Factor'])
            if fallback_top is not None:          # top faces (normal up) take the top colour, sides the side colour
                geo = nt.nodes.new('ShaderNodeNewGeometry'); nz = nt.nodes.new('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], nz.inputs[0])
                up = nt.nodes.new('ShaderNodeMath'); up.operation = 'GREATER_THAN'; L(nz.outputs['Z'], up.inputs[0]); up.inputs[1].default_value = 0.5
                fb = nt.nodes.new('ShaderNodeMix'); fb.data_type = 'RGBA'; L(up.outputs[0], fb.inputs['Factor'])
                fb.inputs['A'].default_value = srgb(fallback); fb.inputs['B'].default_value = srgb(fallback_top); L(fb.outputs['Result'], mix.inputs['A'])
            else: mix.inputs['A'].default_value = srgb(fallback)
            L(tx.outputs['Color'], mix.inputs['B']); col = mix.outputs['Result']
    L(col, em.inputs['Color']); L(em.outputs['Emission'], out.inputs['Surface']); return mat
# ground plane over the texture box
gm = bpy.data.meshes.new('ground'); gm.from_pydata([(GX0 * U, GY0 * U, 0), (GX1 * U, GY0 * U, 0), (GX1 * U, GY1 * U, 0), (GX0 * U, GY1 * U, 0)], [], [(0, 1, 2, 3)])
uvl = gm.uv_layers.new(name='UV'); [setattr(uvl.data[i], 'uv', uv) for i, uv in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)])]
ground = bpy.data.objects.new('ground', gm); bpy.context.collection.objects.link(ground); gm.materials.append(emission_material('ground', GT, 'UV'))
# projector cameras: per primitive, the shot frame where its centre is nearest the image centre and its whole mesh is in view
def shot_px(pose, p):
    th = math.radians(pose['pitch_deg']); s_, c_ = math.sin(th), math.cos(th); d = [p[i] - pose['C'][i] for i in range(3)]
    x, y, z = d[0], -s_ * d[1] - c_ * d[2], c_ * d[1] - s_ * d[2]; return SHOT_F * x / z + 320, SHOT_F * y / z + 180
projectors = {}; groups = {}
for prim in kit['primitives']:
    V, F = proxies.mesh(prim); cx = sum(v[0] for v in V) / len(V); cy = sum(v[1] for v in V) / len(V); cz = sum(v[2] for v in V) / len(V)
    def score(f):
        pts = [shot_px(POSES[f], v) for v in V]
        inside = sum(-2 <= u <= 642 and -2 <= v <= 362 for u, v in pts) / len(pts); u, v = shot_px(POSES[f], (cx, cy, cz))
        return (-round(inside, 1), (u - 320) ** 2 + (v - 180) ** 2)
    ranked = sorted(POSES, key=score); top = -score(ranked[0])[0]
    seeing = [f for f in ranked if -score(f)[0] >= top - 0.05]          # only frames that see it about as fully as the best one
    best = seeing[min(RANK * 7, len(seeing) - 1)] if len(seeing) > RANK * 7 else seeing[(RANK * 3) % len(seeing)]          # ranks apart: movers move
    if best not in projectors: projectors[best] = camera(f'SHOT{best}', SHOT_F, POSES[best])
    me = bpy.data.meshes.new(prim['name']); me.from_pydata([(x * U, y * U, z * U) for x, y, z in V], [], [tuple(f) for f in F]); uvl_ = me.uv_layers.new(name='UV')
    ob = bpy.data.objects.new(prim['name'], me); bpy.context.collection.objects.link(ob)
    if prim.get('texture') == 'ground':          # planar UVs into the ground texture box
        for poly in me.polygons:
            for li in poly.loop_indices:
                x, y, _ = me.vertices[me.loops[li].vertex_index].co; uvl_.data[li].uv = ((x / U - GX0) / (GX1 - GX0), (y / U - GY0) / (GY1 - GY0))
        me.materials.append(emission_material(f'm_{prim["name"]}', GT, 'UV'))
    else:
        mod = ob.modifiers.new('proj', 'UV_PROJECT'); mod.uv_layer = 'UV'; mod.projector_count = 1; mod.projectors[0].object = projectors[best]
        mod.aspect_x = 640 / 360; mod.aspect_y = 1.0
        me.materials.append(emission_material(f'm_{prim["name"]}', os.path.join(FD, f'f{best:04d}.png'), 'UV', prim.get('fallback'), prim.get('fallback_top')))
    groups.setdefault(prim['group'], []).append((ob, prim)); print(prim['name'], '<- frame', best, flush=True)
bpy.context.view_layer.update()
from bpy_extras.object_utils import world_to_camera_view as w2c
def canvas_y(x, y): v = w2c(sc, game, Vector((x * U, y * U, 0.0))); return (1 - v.y) * H
def render(path): sc.render.filepath = path; bpy.ops.render.render(write_still=True)
sc.render.film_transparent = False; render(os.path.join(OUT, 'ground.png'))
sc.render.film_transparent = True; ground.visible_camera = False; layers = {}
for g, members in groups.items():
    if g == 'ground': continue
    for g2, m2 in groups.items():
        for ob, _ in m2: ob.visible_camera = (g2 == g)
    render(os.path.join(OUT, f'occ_{g}.png'))
    pts = [pt for _, prim in members for poly in proxies.footprint(prim) for pt in poly]; ymin = min(p[1] for p in pts)
    xs = [p[0] for p in pts]; front = ((min(xs) + max(xs)) / 2, ymin); layers[g] = dict(depth_y=canvas_y(*front), footprint=list(front))
json.dump(layers, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1); print('baked', MAP, len(layers), 'layers ->', OUT)
