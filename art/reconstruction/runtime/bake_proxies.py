"""Bake a map's runtime layers from its PROXY KIT (maps/proxies/<map>.json, analysis/proxies.py) through the map's game camera.
 * ground: a plane carrying the map's ground texture (analysis/ground_texture.py: z = 0 median of the shot, inferred cells filled).
 * every primitive: textured by PROJECTING the reference frame in which it sits most centrally (UV Project from that frame's solved
   camera), so its faces show exactly what the footage shows. Unlit (emission), Standard view transform: the light and shadow are
   the footage's own.
   FOO_RANK=k projects each primitive's k-th best frame instead (0 = best); combine_passes.py takes the per-pixel median of
   several ranks, so a mover that crosses a primitive in one frame drops out. Faces outside the chosen frame take the primitive's
   "fallback" colour ("fallback_top" for upward faces) (INFERRED: the footage never showed them). Primitives with "texture": "ground" (flat decks) use the ground
   texture (a median over the whole shot) instead of a single frame.
   "key": [r, g, b] (+ "key_tolerance") makes a primitive transparent where its projected texture matches that colour (the floor
   around a prop whose proxy is a little larger than the prop: no halo). "borrow": [dx, dy] (plan units) textures a primitive the
   footage never showed with the observed stretch that far away along the same structure (INFERRED, repeating real texture).
   "exclude_frames": [first, last] keeps frames where a mover covers the primitive out of its projections.
   The game camera may have an off-centre principal point ("principal" in the map config, canvas px): a lens shift. The canvas must
   keep the footage's 16:9: Blender's UV Project takes a camera projector's aspect from the scene's render size.
blender -b --python bake_proxies.py -- <map> <frames_dir> <ground_tex.png> <outdir>
Outputs: ground.png (everything), occ_<group>.png (each non-ground group alone, RGBA), layers.json (depth key = canvas y of the
group's front (south) edge centre)."""
import bpy, json, math, os, sys
from mathutils import Matrix, Vector
args = sys.argv[sys.argv.index('--') + 1:]; MAP, FD, GT, OUT = args[0], os.path.abspath(args[1]), os.path.abspath(args[2]), os.path.abspath(args[3])
os.makedirs(OUT, exist_ok=True); HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis'); sys.path.insert(0, AN)
import proxies
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); cc = cfg['camera']; W, H = cc['canvas']; assert abs(W / H - 16 / 9) < 1e-3, 'projected textures need a 16:9 canvas (UV Project uses the render aspect)'; U = 100.0
kit = proxies.load(os.path.join(HERE, '..', 'maps', 'proxies', f'{MAP}.json'))
shot = json.load(open(os.path.join(AN, f"camera_{kit['camera']}.json"))); SHOT_F = shot['f']; POSES = {p['frame']: p for p in shot['poses']}
gmeta = json.load(open(GT.replace('.png', '.json'))); GX0, GX1, GY0, GY1 = gmeta['box']
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
def camera(name, f640, pose, principal=None, size=(640, 360)):
    cd = bpy.data.cameras.new(name)
    if principal is not None:          # off-centre principal point -> lens shift (fractions of the larger image side)
        cd.shift_x = (size[0] / 2 - principal[0]) / max(size); cd.shift_y = (principal[1] - size[1] / 2) / max(size)
    cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36; cd.lens = f640 / 640 * 36; cd.clip_start = 0.5; cd.clip_end = 5000
    co = bpy.data.objects.new(name, cd); bpy.context.collection.objects.link(co)
    th, yw, rl = (math.radians(pose[k]) for k in ('pitch_deg', 'yaw_deg', 'roll_deg')); c_, s_ = math.cos(th), math.sin(th)
    R0 = Matrix(((1, 0, 0), (0, -s_, -c_), (0, c_, -s_))); Rz = Matrix(((math.cos(yw), math.sin(yw), 0), (-math.sin(yw), math.cos(yw), 0), (0, 0, 1)))
    Rr = Matrix(((math.cos(rl), -math.sin(rl), 0), (math.sin(rl), math.cos(rl), 0), (0, 0, 1)))
    m = (Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ (Rr @ R0 @ Rz)).transposed().to_4x4(); m.translation = Vector(pose['C']) * U; co.matrix_world = m
    return co
SCALE = cc.get('scale', W / 640)          # canvas px per footage px (3: the video's 640 x 360 at x3)
if os.environ.get('FOO_DEBUG_FRAME'):          # diagnostic: render through a shot frame's own camera (must reproduce that frame)
    W, H = (int(v) for v in os.environ.get('FOO_DEBUG_RES', '1920x1080').split('x')); sc.render.resolution_x = W; sc.render.resolution_y = H
    game = camera('GAME', SHOT_F, POSES[int(os.environ['FOO_DEBUG_FRAME'])]); sc.camera = game
else: game = camera('GAME', cc['f'] * SCALE * 640 / W, cc['pose'], cc.get('principal'), (W, H)); sc.camera = game
RANK = int(os.environ.get('FOO_RANK', '0'))
def srgb(c): return tuple(((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)
def emission_material(name, image, uv=None, fallback=None, fallback_top=None, key=None, key_tol=0.12):
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
            # fallback faces read as solids: shaded by facing (up full, sides darker, the east side darkest: the footage's sun is west)
            g2 = nt.nodes.new('ShaderNodeNewGeometry'); n2 = nt.nodes.new('ShaderNodeSeparateXYZ'); L(g2.outputs['Normal'], n2.inputs[0])
            shade = nt.nodes.new('ShaderNodeMath'); shade.operation = 'MULTIPLY_ADD'; L(n2.outputs['Z'], shade.inputs[0]); shade.inputs[1].default_value = 0.25; shade.inputs[2].default_value = 0.75
            east = nt.nodes.new('ShaderNodeMath'); east.operation = 'MULTIPLY_ADD'; L(n2.outputs['X'], east.inputs[0]); east.inputs[1].default_value = -0.12; L(shade.outputs[0], east.inputs[2])
            shaded = nt.nodes.new('ShaderNodeMix'); shaded.data_type = 'RGBA'; shaded.blend_type = 'MULTIPLY'; shaded.inputs['Factor'].default_value = 1.0
            L(east.outputs[0], shaded.inputs['B']); L(shaded.outputs['Result'], mix.inputs['A'])
            if fallback_top is not None:          # top faces (normal up) take the top colour, sides the side colour
                geo = nt.nodes.new('ShaderNodeNewGeometry'); nz = nt.nodes.new('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], nz.inputs[0])
                up = nt.nodes.new('ShaderNodeMath'); up.operation = 'GREATER_THAN'; L(nz.outputs['Z'], up.inputs[0]); up.inputs[1].default_value = 0.5
                fb = nt.nodes.new('ShaderNodeMix'); fb.data_type = 'RGBA'; L(up.outputs[0], fb.inputs['Factor'])
                fb.inputs['A'].default_value = srgb(fallback); fb.inputs['B'].default_value = srgb(fallback_top); L(fb.outputs['Result'], shaded.inputs['A'])
            else: shaded.inputs['A'].default_value = srgb(fallback)
            L(tx.outputs['Color'], mix.inputs['B']); col = mix.outputs['Result']
    L(col, em.inputs['Color'])
    if key is not None:          # transparent where the texture matches the key colour (the floor around a prop)
        d = nt.nodes.new('ShaderNodeVectorMath'); d.operation = 'DISTANCE'; L(col, d.inputs[0]); d.inputs[1].default_value = srgb(key)[:3]
        m = nt.nodes.new('ShaderNodeMath'); m.operation = 'LESS_THAN'; L(d.outputs['Value'], m.inputs[0]); m.inputs[1].default_value = key_tol
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        L(m.outputs[0], mx.inputs['Fac']); L(em.outputs['Emission'], mx.inputs[1]); L(tr.outputs['BSDF'], mx.inputs[2]); L(mx.outputs['Shader'], out.inputs['Surface'])
    else: L(em.outputs['Emission'], out.inputs['Surface'])
    return mat
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
    lo, hi = prim.get('exclude_frames', (0, -1))          # frames where a mover covers it (measured; see the kit's note)
    cand = [f for f in POSES if not lo <= f <= hi]
    ranked = sorted(cand, key=score); top = -score(ranked[0])[0]
    seeing = [f for f in ranked if -score(f)[0] >= top - 0.05]          # only frames that see it about as fully as the best one
    if 'borrow' in prim:          # project the frame that best sees the stretch `borrow` away, moved onto this primitive
        bx, by = prim['borrow']; Vb = [(x + bx, y + by, z) for x, y, z in V]
        def score(f, V=Vb):
            pts = [shot_px(POSES[f], v) for v in V]; return (-round(sum(-2 <= u <= 642 and -2 <= v <= 362 for u, v in pts) / len(pts), 1),)
        ranked = sorted(cand, key=score); top = -score(ranked[0])[0]; seeing = [f for f in ranked if -score(f)[0] >= top - 0.05]
    best = seeing[min(RANK * 7, len(seeing) - 1)] if len(seeing) > RANK * 7 else seeing[(RANK * 3) % len(seeing)]          # ranks apart: movers move
    pkey = (best, tuple(prim.get('borrow', (0, 0))))
    if pkey not in projectors:
        pose = dict(POSES[best]); bx, by = prim.get('borrow', (0, 0)); pose['C'] = [pose['C'][0] - bx, pose['C'][1] - by, pose['C'][2]]
        projectors[pkey] = camera(f'SHOT{best}_{bx}_{by}', SHOT_F, pose)
    me = bpy.data.meshes.new(prim['name']); me.from_pydata([(x * U, y * U, z * U) for x, y, z in V], [], [tuple(f) for f in F]); uvl_ = me.uv_layers.new(name='UV')
    ob = bpy.data.objects.new(prim['name'], me); bpy.context.collection.objects.link(ob)
    if prim.get('texture') == 'ground':          # planar UVs into the ground texture box
        for poly in me.polygons:
            for li in poly.loop_indices:
                x, y, _ = me.vertices[me.loops[li].vertex_index].co; uvl_.data[li].uv = ((x / U - GX0) / (GX1 - GX0), (y / U - GY0) / (GY1 - GY0))
        me.materials.append(emission_material(f'm_{prim["name"]}', GT, 'UV'))
    else:
        mod = ob.modifiers.new('proj', 'UV_PROJECT'); mod.uv_layer = 'UV'; mod.projector_count = 1; mod.projectors[0].object = projectors[pkey]
        mod.aspect_x = 640 / 360; mod.aspect_y = 1.0
        me.materials.append(emission_material(f'm_{prim["name"]}', os.path.join(FD, f'f{best:04d}.png'), 'UV', prim.get('fallback'), prim.get('fallback_top'), prim.get('key'), prim.get('key_tolerance', 0.12)))
    groups.setdefault(prim['group'], []).append((ob, prim)); print(prim['name'], '<- frame', best, flush=True)
bpy.context.view_layer.update()
print('CAMERA', sc.camera.name, 'lens', round(sc.camera.data.lens, 2), 'at', tuple(round(v, 1) for v in sc.camera.matrix_world.translation), 'res', sc.render.resolution_x, sc.render.resolution_y, flush=True)
from bpy_extras.object_utils import world_to_camera_view as w2c
def canvas_y(x, y): v = w2c(sc, game, Vector((x * U, y * U, 0.0))); return (1 - v.y) * H
def render(path): sc.render.filepath = path; bpy.ops.render.render(write_still=True)
sc.render.film_transparent = False; render(os.path.join(OUT, 'ground.png'))
if os.environ.get('FOO_GROUND_ONLY') == '1': sys.exit(0)
sc.render.film_transparent = True; ground.visible_camera = False; layers = {}
for g, members in groups.items():
    if g == 'ground': continue
    for g2, m2 in groups.items():
        for ob, _ in m2: ob.visible_camera = (g2 == g)
    render(os.path.join(OUT, f'occ_{g}.png'))
    pts = [pt for _, prim in members for poly in proxies.footprint(prim) for pt in poly]; ymin = min(p[1] for p in pts)
    xs = [p[0] for p in pts]; front = ((min(xs) + max(xs)) / 2, ymin); layers[g] = dict(depth_y=canvas_y(*front), footprint=list(front))
json.dump(layers, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1); print('baked', MAP, len(layers), 'layers ->', OUT)
