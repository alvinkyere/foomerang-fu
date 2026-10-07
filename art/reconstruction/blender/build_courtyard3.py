"""Courtyard reconstruction, PASS 3 (materials/light/characters/VFX fidelity; camera, registration, trajectories frozen).
PASS 2 header follows.   blender -b --python build_courtyard2.py -- <outdir> <frame> [<frame> ...]   (env FOO_TAKE=A|B, FOO_SAMPLES)
Camera and ground registration are FROZEN from pass 1 (analysis/camera_take{A,B}.json). Everything else is rebuilt from measurements:
 stalls / fountain+shell / hex-tiled trees / props from the rectified plans (analysis/props_takeA.json, trees.json, layout_merged.json),
 lighting from measured lit/shadow patch ratios, characters from the licensed meshes (rigged non-destructively with empties),
 teal creature + boomerang reconstructed from the footage, VFX from frame-by-frame analysis (analysis/vfx_*.json).
World: X right, Y away from the viewer, Z up; 1 plan unit (reference camera height) = 100 BU."""
import bpy, bmesh, json, math, os, sys, random
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon
HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis'); LIC = os.path.join(HERE, '..', 'licensed')
args = sys.argv[sys.argv.index('--') + 1:]; OUT = args[0]; FRAMES = [int(a) for a in args[1:]]; os.makedirs(OUT, exist_ok=True)
TAKE = os.environ.get('FOO_TAKE', 'B'); U = 100.0
J = lambda n: json.load(open(os.path.join(AN, n)))
cam = J(f'camera_take{TAKE}.json'); lay = J('layout_merged.json'); props = J('props_takeA.json'); trees = J('trees.json'); ANN = J(f'annotations_take{TAKE}.json'); TRK = J(f'tracks_take{TAKE}.json'); BIAS = J(f'track_bias_take{TAKE}.json') if os.path.exists(os.path.join(AN, f'track_bias_take{TAKE}.json')) else {}; FYAW = J('facing_yaw.json')[TAKE]
VFX = J('vfx.json') if os.path.exists(os.path.join(AN, 'vfx.json')) else {}
BW = J('burst_world.json')
poses = {p['frame']: p for p in cam['poses']}
P = dict(light=dict(el=58.0, az=28.0, sun_frac=(1.0, 0.93, 0.75), amb_frac=(0.97, 0.98, 1.0), sun_angle=14.0, k=1.0, sun_gain=0.075, amb_gain=0.975))
if os.path.exists(os.path.join(OUT, 'params.json')):
    for k, v in json.load(open(os.path.join(OUT, 'params.json'))).items(): P.setdefault(k, {}).update(v)
srgb = lambda c: [(x / 255) ** 2.2 for x in c]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('FOO_SAMPLES', '48')); sc.cycles.use_denoising = True
sc.render.resolution_x = 640; sc.render.resolution_y = 360; sc.render.resolution_percentage = 100; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'; sc.render.fps = 30; sc.cycles.max_bounces = 4

# ---------------------------------------------------------------- materials (painted look: low-frequency colour drift + fine grain)
def mat(name, rgb, rough=0.92, drift=0.05, grain=0.03, emit=0.0, emit_rgb=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Specular IOR Level'].default_value = 0.05
    base = (*srgb(rgb), 1); b.inputs['Base Color'].default_value = base
    if drift or grain:
        tc = nt.nodes.new('ShaderNodeTexCoord'); n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.35; n1.inputs['Detail'].default_value = 4
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 5.0; n2.inputs['Detail'].default_value = 2
        nt.links.new(tc.outputs['Object'] if False else tc.outputs['Generated'], n1.inputs['Vector']); nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
        rgbmix = nt.nodes.new('ShaderNodeMix'); rgbmix.data_type = 'RGBA'; rgbmix.blend_type = 'MULTIPLY'
        # factor 1 (always applied); B = 1 - drift*(n1-0.5) - grain*(n2-0.5) as a grey multiplier
        mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'MULTIPLY_ADD'; mth.inputs[1].default_value = -2 * drift; mth.inputs[2].default_value = 1.0 + drift
        nt.links.new(n1.outputs['Fac'], mth.inputs[0])
        mth2 = nt.nodes.new('ShaderNodeMath'); mth2.operation = 'MULTIPLY_ADD'; mth2.inputs[1].default_value = -2 * grain; mth2.inputs[2].default_value = grain
        nt.links.new(n2.outputs['Fac'], mth2.inputs[0])
        add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'; nt.links.new(mth.outputs[0], add.inputs[0]); nt.links.new(mth2.outputs[0], add.inputs[1])
        rgbmix.inputs['Factor'].default_value = 1.0; rgbmix.inputs['A'].default_value = base; nt.links.new(add.outputs[0], rgbmix.inputs['B'])
        nt.links.new(rgbmix.outputs['Result'], b.inputs['Base Color'])
    if emit: b.inputs['Emission Color'].default_value = (*srgb(emit_rgb or rgb), 1); b.inputs['Emission Strength'].default_value = emit
    return m
lay['palette']['stone_light'] = [150, 138, 158]; lay['palette']['stone_dark'] = [124, 114, 146]; lay['palette']['sand'] = [231, 194, 116]
MAT = {k: mat(k, v) for k, v in lay['palette'].items()}
for k, v, kw in (('post', (88, 40, 58), {}), ('counter', (160, 66, 112), {}), ('counter_lip', (240, 196, 200), {}), ('carpet', (202, 116, 106), {}), ('carpet_fringe', (232, 190, 170), {}), ('roof_top', (217, 100, 83), dict(drift=0.07)),
                 ('roof_stripe', (232, 140, 118), {}), ('roof_side', (176, 70, 62), {}), ('finial', (196, 186, 166), {}), ('trunk', (112, 92, 150), {}), ('crate', (143, 102, 113), {}), ('pot', (167, 118, 89), {}),
                 ('pot_dark', (96, 66, 60), {}), ('fence', (126, 108, 176), {}), ('pole', (85, 79, 61), {}), ('flag', (205, 72, 84), {}), ('water', (118, 196, 228), dict(rough=0.4, emit=0.18, emit_rgb=(105, 190, 225))),
                 ('water_edge', (160, 220, 240), dict(emit=0.05, emit_rgb=(160, 220, 240))), ('shell', (124, 112, 146), {}), ('shell_rib', (164, 148, 180), {}), ('ring_top', (160, 145, 168), {}), ('ring_side', (122, 108, 140), {}),
                 ('leaf', (243, 151, 93), dict(drift=0.09)), ('leaf_gold', (232, 196, 108), dict(drift=0.06)), ('stair', (250, 244, 205), {}), ('stair_line', (214, 120, 110), {})):
    MAT[k] = mat(k, v, **kw)

TEXDIR = os.path.join(AN, 'textures')
def tex_mat(name, png, gain=1.0, rough=0.95, side_rgb=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b_ = nt.nodes['Principled BSDF']; b_.inputs['Roughness'].default_value = rough; b_.inputs['Specular IOR Level'].default_value = 0.04
    g = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(g.outputs['Position'], sep.inputs['Vector'])
    u = nt.nodes.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = 1 / 240.0; u.inputs[2].default_value = 1 / 2.4; nt.links.new(sep.outputs['X'], u.inputs[0])
    v = nt.nodes.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = 1 / 240.0; v.inputs[2].default_value = 0.4 / 2.4; nt.links.new(sep.outputs['Y'], v.inputs[0])
    comb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(u.outputs[0], comb.inputs['X']); nt.links.new(v.outputs[0], comb.inputs['Y'])
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(os.path.join(TEXDIR, png)); tx.image.colorspace_settings.name = 'sRGB'; tx.interpolation = 'Linear'; tx.extension = 'EXTEND'
    nt.links.new(comb.outputs[0], tx.inputs['Vector'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0; mx.inputs['B'].default_value = (gain, gain, gain, 1)
    nt.links.new(tx.outputs['Color'], mx.inputs['A']); nt.links.new(mx.outputs['Result'], b_.inputs['Base Color']); return m
def top_tex(o, tmat):
    """Second material slot = captured texture on the up-facing faces only."""
    o.data.materials.append(tmat); idx = len(o.data.materials) - 1
    for p in o.data.polygons:
        if p.normal.z > 0.85: p.material_index = idx
    return o
# ---------------------------------------------------------------- primitives
def finish(o, material, smooth=True, bevel=0.0):
    o.data.materials.append(material)
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    if bevel:
        bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 3; bv.limit_method = 'ANGLE'
    return o
def cyl(name, r, h, loc, material, verts=48, smooth=True, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot); o = bpy.context.active_object; o.name = name; return finish(o, material, smooth)
def box(name, size, loc, material, rz=0.0, bevel=0.0, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object; o.name = name; o.scale = size; o.rotation_euler.z = rz; bpy.ops.object.transform_apply(scale=True); return finish(o, material, smooth, bevel)
def sphere(name, r, loc, material, scale=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc); o = bpy.context.active_object; o.name = name; o.scale = scale; return finish(o, material, True)

CAMC = [sum(p['C'][i] for p in cam['poses']) / len(cam['poses']) for i in range(3)]; CAM_AVG = Vector((CAMC[0] * U, CAMC[1] * U, CAMC[2] * U))
def footprint(xy, h):
    """Rectified-plan blob of a raised thing -> its true ground position (ray correction)."""
    k = 1.0 - h / CAM_AVG.z; return Vector((CAM_AVG.x + (xy[0] - CAM_AVG.x) * k, CAM_AVG.y + (xy[1] - CAM_AVG.y) * k, 0))

# ---------------------------------------------------------------- ground
def inside(p, poly):
    x, y = p; r = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: r = not r
    return r
def add_polys(name, polys, material, z):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); holes = [p for p in polys if p['hole']]
    for o in [p for p in polys if not p['hole']]:
        pts = [Vector((x * U, y * U, 0)) for x, y in o['pts']]
        if len(pts) < 3: continue
        inner = [[Vector((x * U, y * U, 0)) for x, y in h['pts']] for h in holes if inside((h['pts'][0][0] * U, h['pts'][0][1] * U), [(p.x, p.y) for p in pts])]
        allv = pts + [v for h in inner for v in h]
        for tri in tessellate_polygon([pts] + inner):
            try: bm.faces.new([bm.verts.new(allv[i]) for i in tri])
            except ValueError: pass
    bm.normal_update()
    for f_ in bm.faces:
        if f_.normal.z < 0: f_.normal_flip()
    bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob.location.z = z; me.materials.append(material); return ob
bpy.ops.mesh.primitive_plane_add(size=1); base = bpy.context.active_object; base.name = 'GROUND_SAND'; base.scale = (400, 400, 1); base.location = (30, 70, -0.02); base.data.materials.append(tex_mat('tex_ground', 'ground_albedo.png'))     # one plane: the capture itself under lit ground, class fill under shadows/props
# (the wide 'path_edge' bands of pass 2 are gone: the thin pavement-edge stripes live in the captured pavement texture)

# ---------------------------------------------------------------- fountain: stone ring + water + scallop-shell statue
fo = lay['objects']['fountain']; fx, fy = [c * U for c in fo['centre']]
ring = cyl('FOUNTAIN_RING', 9.2, 1.15, (fx, fy, 0.575), MAT['ring_side'], 96); hole = cyl('_HOLE', 8.3, 4, (fx, fy, 0.575), MAT['ring_side'], 96)
bm_ = ring.modifiers.new('b', 'BOOLEAN'); bm_.operation = 'DIFFERENCE'; bm_.object = hole; bm_.solver = 'EXACT'; bpy.context.view_layer.objects.active = ring; bpy.ops.object.modifier_apply(modifier='b'); bpy.data.objects.remove(hole, do_unlink=True)
ring.data.materials.append(tex_mat('tex_ring', 'plane_ring.png'))
for p in ring.data.polygons: p.material_index = 1 if p.normal.z > 0.9 else 0
w_ = cyl('FOUNTAIN_WATER', 8.4, 0.05, (fx, fy, 0.95), MAT['water'], 96); top_tex(w_, tex_mat('tex_water', 'plane_ring.png'))
te = bpy.data.objects.new('_t', None)
sh_ = sphere('SHELL_DOME', 4.7, (fx, fy, 0.95), MAT['shell'], (1.0, 0.93, 0.25)); top_tex(sh_, tex_mat('tex_shell', 'plane_shell.png'))
sphere('SHELL_LOBE_L', 1.5, (fx - 4.7, fy - 0.4, 0.95), MAT['shell'], (1, 0.8, 0.25)); sphere('SHELL_LOBE_R', 1.5, (fx + 4.7, fy - 0.4, 0.95), MAT['shell'], (1, 0.8, 0.25))

# ---------------------------------------------------------------- market stalls (measured footprints; front faces the fountain)
ST = dict(long=8.2, deep=4.9, roof_h=5.75, roof_t=0.5, post_r=0.5, counter_h=3.5, over=0.9)
def stall(k, xy, rz):
    fr = Vector((math.cos(rz), math.sin(rz), 0)); sd = Vector((-fr.y, fr.x, 0)); o = Vector((xy[0], xy[1], 0)); L, D = ST['long'], ST['deep']
    top = ST['roof_h']
    r_ = box(f'S{k}_ROOF', (D + 2 * ST['over'], L + 2 * ST['over'], ST['roof_t']), (o.x, o.y, top), MAT['roof_top'], rz, bevel=0.0); top_tex(r_, ROOF_TEX)
    box(f'S{k}_ROOF_UNDER', (D + 1.9, L + 1.9, 0.12), (o.x, o.y, top - ST['roof_t'] / 2 - 0.02), MAT['roof_side'], rz)
    for a in (-1, 1):
        for b in (-1, 1):
            pp = o + sd * a * (L / 2 - 0.5) + fr * b * (D / 2 - 0.5)
            cyl(f'S{k}_POST', ST['post_r'], top - 0.4, (pp.x, pp.y, (top - 0.4) / 2), MAT['post'], 12)
            q = o + sd * a * (L / 2 + ST['over'] - 0.3) + fr * b * (D / 2 + ST['over'] - 0.3); sphere(f'S{k}_FINIAL', 0.34, (q.x, q.y, top + ST['roof_t'] / 2 + 0.15), MAT['finial'], seg=12); cyl(f'S{k}_FBASE', 0.30, 0.25, (q.x, q.y, top + ST['roof_t'] / 2 + 0.1), MAT['post'], 10)
    c0 = o - fr * 0.9; box(f'S{k}_COUNTER', (D - 2.4, L - 1.6, ST['counter_h']), (c0.x, c0.y, ST['counter_h'] / 2), MAT['counter'], rz, bevel=0.1)
    box(f'S{k}_COUNTER_LIP', (D - 2.1, L - 1.3, 0.28), (c0.x, c0.y, ST['counter_h'] + 0.1), MAT['counter_lip'], rz)
    v0 = o + fr * (D / 2 - 0.25); box(f'S{k}_VALANCE', (0.35, L - 0.9, 1.5), (v0.x, v0.y, top - 0.25 - 0.75), MAT['counter'], rz)
    c2 = o + fr * (D / 2 + 1.5); box(f'S{k}_CARPET', (2.5, L * 0.72, 0.1), (c2.x, c2.y, 0.07), MAT['carpet'], rz)
    for s_ in (-0.5, 0.5): q = c2 + sd * s_ * L * 0.72; box(f'S{k}_FRINGE', (2.6, 0.2, 0.11), (q.x, q.y, 0.075), MAT['carpet_fringe'], rz)
ROOF_TEX = tex_mat('tex_roof', 'plane_roof.png')
SIX = lay['objects']['pavilions']
for k, p in enumerate(SIX[:4]):
    fp = footprint([c * U for c in p['centre']], ST['roof_h'] + ST['roof_t'] / 2); ang = math.atan2(fy - fp.y, fx - fp.x); rz = round(ang / (math.pi / 4)) * (math.pi / 4)
    stall(k, (fp.x, fp.y), rz)
# the left axis stall also carries a white rod along its fountain-side edge
# ---------------------------------------------------------------- trees: hex-tiled canopies on purple trunks, with drips
CAN_H = 9.0
def canopy_mesh(name, outline, h, thick, material, tmat):
    pts = [Vector((x * U, y * U, 0)) for x, y in outline]
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for tri in tessellate_polygon([pts]):
        try: bm.faces.new([bm.verts.new(pts[i]) for i in tri])
        except ValueError: pass
    bm.normal_update()
    for f_ in bm.faces:
        if f_.normal.z < 0: f_.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces)); [setattr(v, 'co', v.co + Vector((0, 0, thick))) for v in r['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob.location.z = h; me.materials.append(material); top_tex(ob, tmat); return ob
BUSH_TEX = tex_mat('tex_bush', 'plane_bush.png')
for k, t in enumerate(trees):
    if math.dist(t['centre'], props['yellow_tree']['canopy']) < 0.03: continue
    if math.dist(t['centre'], (-0.4652, 0.3825)) < 0.05 or math.dist(t['centre'], (0.2613, 0.367)) < 0.05: continue
    canopy_mesh(f'BUSH{k}', t['outline'], 0.0, 1.0, MAT['leaf'], BUSH_TEX)
gt = props['yellow_tree']; gp = footprint([gt['canopy'][0] * U, gt['canopy'][1] * U], CAN_H)
cyl('GOLD_CANOPY', 3.9, 1.1, (gp.x, gp.y, CAN_H + 3.0), MAT['leaf_gold'], 20, smooth=False); cyl('GOLD_CANOPY2', 2.8, 1.1, (gp.x + 3.0, gp.y - 1.6, CAN_H + 3.2), MAT['leaf_gold'], 14, smooth=False)
tp = footprint([gt['trunk'][0] * U, gt['trunk'][1] * U], 0); cyl('GOLD_TRUNK', 0.7, CAN_H + 3.5, (tp.x, tp.y, (CAN_H + 3.5) / 2), MAT['trunk'], 10)
# ---------------------------------------------------------------- props
for k, (x, y) in enumerate(props['fence']):
    fx_, fy_ = x * U, y * U; cyl(f'FENCE{k}_BAR', 0.45, 5.6, (fx_, fy_, 1.6), MAT['fence'], 16, rot=(math.pi / 2, 0, 0)); sphere(f'FENCE{k}_CAPA', 0.62, (fx_, fy_ + 2.8, 1.4), MAT['fence'], seg=14); sphere(f'FENCE{k}_CAPB', 0.62, (fx_, fy_ - 2.8, 1.4), MAT['fence'], seg=14)
for k, (x, y) in enumerate(props['crates']): box(f'CRATE{k}', (3.6, 3.6, 3.6), (x * U, y * U, 1.8), MAT['crate'], rz=0.4 + k, bevel=0.35, smooth=False)
for k, (x, y) in enumerate(props['pots']):
    sphere(f'POT{k}', 1.45, (x * U, y * U, 1.45), MAT['pot'], (1, 1, 1.05)); cyl(f'POT{k}_RIM', 0.9, 0.3, (x * U, y * U, 2.7), MAT['pot_dark'], 16)
sg = props['stairs']; sx_, sy_ = sg['centre'][0] * U, sg['centre'][1] * U
for i in range(4): box(f'STAIR{i}', (sg['size'][0] * U, 2.2, 0.35), (sx_, sy_ + 4 - i * 2.4, 0.2 + 0.25 * (3 - i)), MAT['stair'])
pl_, pr_ = [Vector((x * U, y * U, 0)) for x, y in props['bunting']]
for p_ in (pl_, pr_): cyl('BUNTING_POLE', 0.55, 13.0, (p_.x, p_.y, 6.5), MAT['pole'], 12)
for i in range(1, 13):
    u = i / 13; x = pl_.x + (pr_.x - pl_.x) * u; y = pl_.y + (pr_.y - pl_.y) * u; z = 11.6 - 1.4 * 4 * u * (1 - u)
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.85, radius2=0.0, depth=1.5, location=(x, y, z - 0.75), rotation=(math.pi, 0, 0)); fl = bpy.context.active_object; fl.name = 'FLAG'; finish(fl, MAT['flag'], False)

dash_m = mat('dash', (150, 118, 84), drift=0.0, grain=0.0)
for i in range(16):
    y0 = 38.0 + i * 4.3; box(f'DASH{i}', (0.5, 2.4, 0.06), (40.0, y0, 0.05), dash_m)
# ---------------------------------------------------------------- lighting (measured: lit/shadow patch ratios -> sun/ambient fractions; shadows fall left/down)
L_ = P['light']; el = math.radians(L_['el']); az = math.radians(L_['az'])
wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; bg = wd.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*L_['amb_frac'], 1); bg.inputs['Strength'].default_value = L_['k'] * L_['amb_gain']
sun = bpy.data.lights.new('SUN', 'SUN'); sun.color = L_['sun_frac']; sun.energy = L_['k'] * L_['sun_gain'] * math.pi / math.sin(el); sun.angle = math.radians(L_['sun_angle'])
so = bpy.data.objects.new('SUN', sun); bpy.context.collection.objects.link(so)
to_sun = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))   # toward the sun: +X (right) and +Y (away): shadows fall left and toward the viewer (measured)
so.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- camera (frozen)
cd = bpy.data.cameras.new('CAM'); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0; cd.lens = cam['f'] / 640.0 * 36.0; cd.clip_start = 1; cd.clip_end = 5000
co = bpy.data.objects.new('CAM', cd); bpy.context.collection.objects.link(co); sc.camera = co
def set_cam(frame):
    p = poses[frame]; th = math.radians(p['pitch_deg']); yaw = math.radians(p['yaw_deg']); roll = math.radians(p['roll_deg'])
    c, s = math.cos(th), math.sin(th); R0 = Matrix(((1, 0, 0), (0, -s, -c), (0, c, -s)))
    Rz = Matrix(((math.cos(yaw), math.sin(yaw), 0), (-math.sin(yaw), math.cos(yaw), 0), (0, 0, 1))); Rr = Matrix(((math.cos(roll), -math.sin(roll), 0), (math.sin(roll), math.cos(roll), 0), (0, 0, 1)))
    R = Rr @ R0 @ Rz; Rbl = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ R; m = Rbl.transposed().to_4x4(); m.translation = Vector(p['C']) * U; co.matrix_world = m
def ray_to_plane(frame, px, py, z):
    set_cam(frame); bpy.context.view_layer.update(); m = co.matrix_world; f = cam['f']
    d = (m.to_3x3() @ Vector(((px - 320.0) / f, -(py - 180.0) / f, -1.0))).normalized(); o = m.translation; return o + d * ((z - o.z) / d.z)
def at(name, frame):
    """Refined per-frame image position of a tracked thing (None if not tracked at that frame)."""
    d = TRK.get(name); 
    if not d: return None
    return d.get(str(frame))
def interp(track, frame):
    ks = sorted(int(k) for k in track)
    if frame <= ks[0]: return track[str(ks[0])]
    if frame >= ks[-1]: return track[str(ks[-1])]
    for a, b in zip(ks, ks[1:]):
        if a <= frame <= b:
            u = (frame - a) / (b - a); u = u * u * (3 - 2 * u); pa, pb = track[str(a)], track[str(b)]; return [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u]

# ---------------------------------------------------------------- characters (licensed meshes unmodified; limbs added where the model has none; rig = chain of empties)
LIMB = {'bread': mat('limb_bread', (110, 80, 46)), 'coffee': mat('limb_coffee', (236, 232, 224)), 'watermelon': None}
def load_char(name, blend):
    with bpy.data.libraries.load(os.path.join(LIC, name, blend), link=False) as (src, dst): dst.objects = [name]
    o = dst.objects[0]; bpy.context.collection.objects.link(o)
    root = bpy.data.objects.new(name.upper() + '_ROOT', None); bpy.context.collection.objects.link(root)
    lean = bpy.data.objects.new(name.upper() + '_LEAN', None); bpy.context.collection.objects.link(lean); lean.parent = root
    sq = bpy.data.objects.new(name.upper() + '_SQUASH', None); bpy.context.collection.objects.link(sq); sq.parent = lean
    o.parent = sq; bpy.context.view_layer.update(); co_ = [o.matrix_world @ Vector(c) for c in o.bound_box]; zmin = min(p.z for p in co_); o.location.z -= zmin
    bpy.context.view_layer.update(); co_ = [o.matrix_world @ Vector(c) for c in o.bound_box]; W = (max(p.x for p in co_) - min(p.x for p in co_)) / 2; Hh = max(p.z for p in co_); Dy = min(p.y for p in co_)
    for m in o.data.materials:
        if m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED': n.inputs['Specular IOR Level'].default_value = 0.15
    limbs = {}
    if LIMB[name] is not None:      # the supplied Bread / Coffee have no limbs (the reference characters do): small mitten/foot ellipsoids on animated pivots
        for key, (sx, z, y, r) in dict(handL=(-1, 0.45 * Hh, 0.0, 0.34), handR=(1, 0.45 * Hh, 0.0, 0.34), footL=(-0.4, 0.12, Dy * 0.5, 0.40), footR=(0.4, 0.12, Dy * 0.5, 0.40)).items():
            pv = bpy.data.objects.new(f'{name.upper()}_{key}', None); bpy.context.collection.objects.link(pv); pv.parent = sq
            pv.location = (sx * (W * 1.0 if 'hand' in key else W), y, z); limbs[key] = pv
            bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=14, ring_count=8, location=(0, 0, -r * 0.6 if 'foot' in key else 0)); s_ = bpy.context.active_object; s_.name = pv.name + '_MESH'; s_.scale = (1, 1.15, 0.9 if 'foot' in key else 1.1); finish(s_, LIMB[name]); s_.parent = pv
    return dict(root=root, lean=lean, sq=sq, mesh=o, limbs=limbs, W=W, H=Hh)
CH = {'bread': load_char('bread', 'bread.blend'), 'coffee': load_char('coffee', 'Coffee.blend'), 'watermelon': load_char('watermelon', 'watermelon.blend')}

def set_hidden(c, flag):
    for o in (c['root'], c['lean'], c['sq'], c['mesh']): o.hide_render = flag
    for ch in c['mesh'].children_recursive: ch.hide_render = flag
    for pv in c['limbs'].values():
        pv.hide_render = flag
        for ch in pv.children: ch.hide_render = flag
LEAN_BACK = float(os.environ.get('FOO_LEAN', '-0.75'))      # the reference characters are tilted back so the face points up toward the camera
CHAR_SCALE = {'bread': 0.76, 'coffee': 1.0, 'watermelon': 1.14, 'teal': 0.64}      # linear, from silhouette-area ratios measured against the reference (median over six frames)
def facing(name, f):
    if TAKE != 'B' or name not in FYAW: return 0.0
    d = FYAW[name]; ks = sorted(int(k) for k in d); vals = [d[str(k)] for k in ks]
    if f <= ks[0]: return vals[0]
    i = min(range(len(ks)), key=lambda j: abs(ks[j] - f)); return float(vals[i])        # the characters spin fast: no heavy smoothing here
heading = {}
def drop_z(frame, px, py, xL, yL):
    """Height at which the camera ray through (px, py) passes closest to the vertical line over the landing point (xL, yL)."""
    set_cam(frame); bpy.context.view_layer.update(); m = co.matrix_world; f = cam['f']; d = (m.to_3x3() @ Vector(((px - 320.0) / f, -(py - 180.0) / f, -1.0))).normalized(); o = m.translation
    dx, dy = d.x, d.y; den = dx * dx + dy * dy
    t = ((xL - o.x) * dx + (yL - o.y) * dy) / den if den > 1e-9 else 0.0; return max(0.0, o.z + d.z * t)
LANDING = {}
def centre_of(name, f):
    p = at(name, f)
    if p is None: return None
    return p
def recentre(mesh, root, w_unused, f, px, py, parts=None):
    """Put the model's bounding-box CENTRE (after tilt/scale/spin) on the camera ray of the tracked point: the track is the mask centroid, not a ground point."""
    bpy.context.view_layer.update(); objs = parts or [mesh]; pts = []
    for o in objs: pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    ctr = sum(pts, Vector()) / len(pts); tgt = ray_to_plane(f, px, py, ctr.z)
    root.location.x += tgt.x - ctr.x; root.location.y += tgt.y - ctr.y
def place_char(name, f):
    c = CH[name]; p = centre_of(name, f); dead = (TAKE == 'B' and name == 'coffee' and f >= VFX.get('coffee_death_frame', 328))
    if p is None or dead: set_hidden(c, True); return
    px, py = p; F0 = min(poses); w = ray_to_plane(f, px, py, 1.4); lift = 0.0
    di = VFX.get('drop_in', {}).get(name)
    if di and TAKE == 'A' and di['first'] <= f < di['land']:
        if name not in LANDING:
            pl = at(name, di['land']); LANDING[name] = ray_to_plane(di['land'], pl[0], pl[1], 1.4)
        L = LANDING[name]; lift = drop_z(f, px, py, L.x, L.y); w = Vector((L.x, L.y, 1.4))
    q = at(name, max(F0, f - 3)) or p; wp = ray_to_plane(max(F0, f - 3), q[0], q[1], 1.4); d = Vector((w.x - wp.x, w.y - wp.y)); sp = d.length / 3.0
    if d.length > 0.3: heading[name] = math.atan2(d.x, -d.y)
    moving = min(1.0, sp / 0.5); ph = f * 0.62
    c['root'].location = (w.x, w.y, max(0.0, lift - 1.4) + 0.45 * abs(math.sin(ph)) * moving); c['root'].rotation_euler = (0, 0, facing(name, f)); c['root'].scale = (CHAR_SCALE[name],) * 3
    c['lean'].rotation_euler = (LEAN_BACK + 0.12 * moving, 0.07 * math.sin(ph) * moving, 0)
    land_sq = 0.0
    if di and TAKE == 'A': land_sq = max(0.0, 1.0 - abs(f - di['land']) / 3.0) if f >= di['land'] - 1 else 0.0
    sqz = 1 - 0.07 * moving * (1 - abs(math.sin(ph))) - 0.18 * land_sq; c['sq'].scale = (1 + 0.04 * moving + 0.12 * land_sq, 1 + 0.02 * moving + 0.12 * land_sq, sqz)
    sw = math.sin(ph) * moving
    for k, pv in c['limbs'].items():
        s_ = 1 if k.endswith('L') else -1
        if k.startswith('foot'): pv.rotation_euler = (0.9 * sw * s_, 0, 0); pv.location.z = 0.12 + 0.25 * max(0.0, sw * s_)
        else: pv.rotation_euler = (-0.8 * sw * s_, 0, 0.35 * moving * s_)
    set_hidden(c, False); bx_, by_ = BIAS.get(name, (0, 0)); recentre(c['mesh'], c['root'], w, f, px + bx_, py + by_)

# ---------------------------------------------------------------- motion trails (ribbons following the measured tracks): teal cyan swoosh, watermelon red streak, boomerang pale streak
def trail_mat(rgb, alpha):
    m = bpy.data.materials.new('trail'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputMaterial'); mix = nt.nodes.new('ShaderNodeMixShader'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*srgb(rgb), 1); em.inputs['Strength'].default_value = 1.0; mix.inputs['Fac'].default_value = alpha
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface']); return m
TRAIL = {'teal': (trail_mat((120, 225, 205), 0.55), 1.6, 9), 'watermelon': (trail_mat((235, 90, 80), 0.5), 1.3, 7), 'boomerang_a': (trail_mat((250, 244, 222), 0.4), 0.9, 8), 'boomerang_b': (trail_mat((250, 244, 222), 0.4), 0.9, 8)}
TRAIL_OBJ = {}
def update_trail(name, f, z):
    mat_, width, n = TRAIL[name]; ob = TRAIL_OBJ.get(name)
    if ob is None:
        me = bpy.data.meshes.new('trail_' + name); ob = bpy.data.objects.new('TRAIL_' + name, me); bpy.context.collection.objects.link(ob); me.materials.append(mat_); TRAIL_OBJ[name] = ob
    pts = []
    for k in range(n + 1):
        p = at(name, f - k)
        if p is None: break
        pts.append((ray_to_plane(f, p[0], p[1], z), k))   # the CURRENT camera, so the ribbon stays attached in the image
    me = ob.data; me.clear_geometry()
    if len(pts) < 3 or (pts[0][0] - pts[-1][0]).length < 1.5: ob.hide_render = True; return
    bm = bmesh.new(); L = []
    for i, (p, k) in enumerate(pts):
        a = pts[min(i + 1, len(pts) - 1)][0] - pts[max(i - 1, 0)][0]; nrm = Vector((-a.y, a.x, 0)); nrm = nrm.normalized() if nrm.length > 1e-6 else Vector((1, 0, 0)); wd = width * (1 - i / (n + 1))
        L.append((bm.verts.new(p + nrm * wd + Vector((0, 0, 0))), bm.verts.new(p - nrm * wd)))
    for i in range(len(L) - 1):
        try: bm.faces.new((L[i][0], L[i][1], L[i + 1][1], L[i + 1][0]))
        except ValueError: pass
    bm.to_mesh(me); bm.free(); ob.hide_render = False

# ---------------------------------------------------------------- teal creature (reconstructed from the footage: a bean/jelly body with a hood and a face; swoosh trail)
eyem = mat('teal_eye', (22, 52, 56), rough=0.4)
tr_ = bpy.data.objects.new('TEAL_ROOT', None); bpy.context.collection.objects.link(tr_); tl_ = bpy.data.objects.new('TEAL_LEAN', None); bpy.context.collection.objects.link(tl_); tl_.parent = tr_
def slab_t(name, size, loc, material, bev=0.8):
    o = box(name, size, loc, material, 0.0); bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bev; bv.segments = 5; ss = o.modifiers.new('ss', 'SUBSURF'); ss.levels = 2
    for p in o.data.polygons: p.use_smooth = True
    return o
tealm = mat('teal_body', (98, 214, 183), rough=0.8, drift=0.05); teal2 = mat('teal_dark', (62, 150, 150), rough=0.8, drift=0.03); nub = mat('teal_nub', (70, 170, 120), rough=0.8)
tb = slab_t('TEAL_BODY', (4.4, 1.8, 3.7), (0, 0, 1.85), tealm, 0.7); tb.parent = tl_
lower = slab_t('TEAL_LOWER', (4.2, 1.6, 1.3), (0, 0, 0.9), teal2, 0.5); lower.parent = tl_
EY = []
for s_ in (-1, 1): e_ = sphere('TEAL_EYE', 0.26, (s_ * 0.95, -0.95, 1.55), eyem, (1, 0.5, 1.1), 10); e_.parent = tl_; EY.append(e_)
mo = box('TEAL_MOUTH', (0.9, 0.2, 0.14), (0, -0.95, 1.1), eyem); mo.parent = tl_; EY.append(mo)
for s_ in (-1, 1): n_ = sphere('TEAL_NUB', 0.42, (s_ * 2.35, 0.0, 0.7), nub, (1, 1, 0.9), 10); n_.parent = tl_; EY.append(n_)
hood = tb; face = lower
TEAL = dict(root=tr_, lean=tl_, parts=[tb, hood, face] + EY)
def place_teal(f):
    p = at('teal', f); vis = p is not None
    for o in [TEAL['root'], TEAL['lean']] + TEAL['parts']: o.hide_render = not vis
    TRAIL_OBJ.get('teal') and setattr(TRAIL_OBJ['teal'], 'hide_render', True)
    if not vis: return
    px, py = p; F0 = min(poses); w = ray_to_plane(f, px, py, 1.6); lift = 0.0; di = VFX.get('drop_in', {}).get('teal')
    if di and TAKE == 'A' and di['first'] <= f < di['land']:
        if 'teal' not in LANDING: pl = at('teal', di['land']); LANDING['teal'] = ray_to_plane(di['land'], pl[0], pl[1], 1.6)
        L = LANDING['teal']; lift = drop_z(f, px, py, L.x, L.y); w = Vector((L.x, L.y, 1.6))
    q = at('teal', max(F0, f - 3)) or p; wp = ray_to_plane(max(F0, f - 3), q[0], q[1], 1.6); d = Vector((w.x - wp.x, w.y - wp.y)); sp = d.length / 3.0; moving = min(1.0, sp / 0.5)
    if d.length > 0.3: heading['teal'] = math.atan2(d.x, -d.y)
    TEAL['root'].location = (w.x, w.y, max(0.0, lift - 1.6) + 0.4 * abs(math.sin(f * 0.6)) * moving); TEAL['root'].rotation_euler = (0, 0, facing('teal', f)); TEAL['root'].scale = (CHAR_SCALE['teal'],) * 3; TEAL['lean'].rotation_euler = (LEAN_BACK + 0.15 * moving, 0, 0)
    tbx, tby = BIAS.get('teal', (0, 0)); recentre(None, TEAL['root'], None, f, px + tbx, py + tby, parts=[o for o in TEAL['parts'] if o.type == 'MESH'])
    if moving > 0.35: update_trail('teal', f, 1.6)

# ---------------------------------------------------------------- boomerangs (reconstructed: thick dark-brown crescent, tan underside, pale streak behind)
bmat = mat('boomerang', (92, 58, 36), rough=0.6, drift=0.03)
def make_boom(name):
    cv = bpy.data.curves.new(name, 'CURVE'); cv.dimensions = '3D'; s = cv.splines.new('BEZIER'); s.bezier_points.add(2)
    for pp, c in zip(s.bezier_points, ((-1.3, 1.5, 0), (0.6, 0, 0), (-1.3, -1.5, 0))): pp.co = c; pp.handle_left_type = pp.handle_right_type = 'AUTO'
    cv.bevel_depth = 0.55; cv.bevel_resolution = 4; cv.materials.append(bmat); o = bpy.data.objects.new('BOOM_' + name, cv); bpy.context.collection.objects.link(o); return o
BOOM = {'boomerang_a': make_boom('a'), 'boomerang_b': make_boom('b')}
def place_booms(f):
    for n, o in BOOM.items():
        p = at(n, f)
        if p is None: o.hide_render = True; TRAIL_OBJ.get(n) and setattr(TRAIL_OBJ[n], 'hide_render', True); continue
        w = ray_to_plane(f, p[0], p[1], 2.4); o.location = w; o.rotation_euler = (0.25, 0.0, f * 0.8); o.scale = (0.5, 0.5, 0.5); o.hide_render = False; update_trail(n, f, 2.4)

# ---------------------------------------------------------------- VFX
ring_core = bpy.data.materials.new('ring_core'); ring_core.use_nodes = True; nt = ring_core.node_tree; nt.nodes.clear(); o_ = nt.nodes.new('ShaderNodeOutputMaterial'); mx = nt.nodes.new('ShaderNodeMixShader'); trn = nt.nodes.new('ShaderNodeBsdfTransparent'); emi = nt.nodes.new('ShaderNodeEmission')
emi.inputs['Color'].default_value = (1.0, 0.96, 0.78, 1); emi.inputs['Strength'].default_value = 1.1; nt.links.new(trn.outputs[0], mx.inputs[1]); nt.links.new(emi.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o_.inputs['Surface']); RING_MIX = mx
RINGS = {}
for n_ in VFX.get('rings', {}):
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.032, major_segments=64, minor_segments=8); r_ = bpy.context.active_object; r_.name = f'SPAWN_RING_{n_}'; r_.scale = (1, 1, 0.3); r_.data.materials.append(ring_core)
    bpy.ops.mesh.primitive_circle_add(vertices=64, fill_type='NGON', radius=1.0); d_ = bpy.context.active_object; d_.name = f'SPAWN_GLOW_{n_}'; d_.data.materials.append(trail_mat((255, 246, 205), 0.3)); RINGS[n_] = (r_, d_)
brown = mat('burst_brown', (66, 38, 24), drift=0.0, grain=0.0); white = mat('burst_white', (236, 232, 224), drift=0.0, grain=0.0); disc_m = mat('burst_disc', (246, 236, 176), drift=0.0, grain=0.0)
BURST_OBJ = {}
def poly_mesh(key, polys, z, material):
    ob = BURST_OBJ.get(key)
    if ob is None:
        me = bpy.data.meshes.new(key); ob = bpy.data.objects.new(key, me); bpy.context.collection.objects.link(ob); me.materials.append(material); BURST_OBJ[key] = ob
    me = ob.data; me.clear_geometry(); bm = bmesh.new()
    for poly in polys:
        if len(poly) < 3: continue
        pts = [ray_to_plane(CUR, x, y, z) for x, y in poly]; pts = [Vector((p.x, p.y, p.z)) for p in pts]
        flat = [Vector((p.x, p.y, 0)) for p in pts]
        try:
            for tri in tessellate_polygon([flat]): bm.faces.new([bm.verts.new(pts[i]) for i in tri])
        except Exception: pass
    bm.to_mesh(me); bm.free(); ob.hide_render = len(me.polygons) == 0
CUR = 0
def place_vfx(f):
    global CUR; CUR = f
    for n_, (r_, d_) in RINGS.items():
        rg = VFX['rings'][n_]; vis = TAKE == 'A' and rg['t0'] <= f <= rg['t1']; r_.hide_render = d_.hide_render = not vis
        if vis:
            u = (f - rg['t0']) / (rg['t1'] - rg['t0']); p = at(n_, min(max(f, rg['t0']), rg['t1'])) or at(n_, f); w = ray_to_plane(f, p[0], p[1] + 8, 0.1)
            rad = (rg['r0'] + (rg['r1'] - rg['r0']) * (1 - (1 - u) ** 2)) / 7.5; r_.location = d_.location = (w.x, w.y, 0.14); r_.scale = (rad, rad, 0.3); d_.scale = (rad, rad, 1)
            RING_MIX.inputs['Fac'].default_value = 0.65 * max(0.0, 1.0 - u ** 1.3)
    if TAKE == 'B':
        fr = BW['frames'].get(str(f)); Z = [0.54, 0.5, 0.26, 0.22, 0.18]
        for k in range(5):
            key = f'BURSTW{k}'; ob = BURST_OBJ.get(key)
            if ob is None:
                col = BW['colors'][k]; m_ = mat(f'burstw{k}', tuple(col), rough=1.0, drift=0.0, grain=0.0); me = bpy.data.meshes.new(key); ob = bpy.data.objects.new(key, me); bpy.context.collection.objects.link(ob); me.materials.append(m_); BURST_OBJ[key] = ob
            me = ob.data; me.clear_geometry(); polys = fr.get(str(k), []) if fr else []
            if f >= VFX['coffee_death_frame'] - 2:
                bm = bmesh.new()
                for poly in polys:
                    if len(poly) < 3: continue
                    pts = [Vector((x * U, y * U, Z[k])) for x, y in poly]; flat = [Vector((p.x, p.y, 0)) for p in pts]
                    try:
                        for tri in tessellate_polygon([flat]): bm.faces.new([bm.verts.new(pts[i]) for i in tri])
                    except Exception: pass
                bm.to_mesh(me); bm.free()
            ob.hide_render = len(me.polygons) == 0

for f in FRAMES:
    set_cam(f)
    for n in CH: place_char(n, f)
    place_teal(f); place_booms(f)
    # watermelon streak
    p = at('watermelon', f); q = at('watermelon', f - 3)
    if p and q and math.hypot(p[0] - q[0], p[1] - q[1]) > 6: update_trail('watermelon', f, 1.4)
    elif 'watermelon' in TRAIL_OBJ: TRAIL_OBJ['watermelon'].hide_render = True
    place_vfx(f); set_cam(f)
    sc.render.filepath = os.path.join(OUT, f'f{f:04d}.png'); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'courtyard2_take{TAKE}.blend'))
