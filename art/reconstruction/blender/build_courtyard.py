"""Courtyard (take B, f264-f372) reconstruction scene.  blender -b --python build_courtyard.py -- <outdir> <frame> [<frame> ...]
All numbers come from analysis/: camera_takeB.json (solved per-frame pose, fixed lens), layout_takeB.json (measured plan layout).
World: X right, Y away from the viewer, Z up. 1 plan unit (reference camera height) = 100 Blender units (BU)."""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix
from mathutils.geometry import tessellate_polygon
HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis')
args = sys.argv[sys.argv.index('--') + 1:]; OUT = args[0]; FRAMES = [int(a) for a in args[1:]]
os.makedirs(OUT, exist_ok=True)
U = 100.0                                   # BU per plan unit
TAKE = os.environ.get('FOO_TAKE', 'B')
cam = json.load(open(os.path.join(AN, f'camera_take{TAKE}.json'))); lay = json.load(open(os.path.join(AN, 'layout_merged.json')))
poses = {p['frame']: p for p in cam['poses']}
srgb = lambda c: [((x / 255) ** 2.2) for x in c]       # sRGB 0-255 -> linear (display gamma approximation; refined by calibration)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('FOO_SAMPLES', '48')); sc.cycles.use_denoising = True
sc.render.resolution_x = 640; sc.render.resolution_y = 360; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.render.image_settings.file_format = 'PNG'
sc.render.fps = 30

# ---------- materials ----------
def mat(name, color, rough=0.9, emission=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    lin = srgb(color); b.inputs['Base Color'].default_value = (*lin, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Specular IOR Level'].default_value = 0.1
    return m
lay['palette']['stone_light'] = [150, 138, 158]; lay['palette']['stone_dark'] = [124, 114, 146]
lay['palette']['sand'] = [231, 194, 116]      # measured on flat sand patches in both takes (the k-means 'sand' cluster over-estimated it)
MAT = {k: mat(k, v) for k, v in lay['palette'].items()}

# ---------- ground vector layers ----------
def add_polys(name, polys, material, z):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); outers = [p for p in polys if not p['hole']]; holes = [p for p in polys if p['hole']]
    for o in outers:
        # holes belonging to this outer polygon: those whose first point lies inside it
        pts = [Vector((x * U, y * U, 0)) for x, y in o['pts']]
        if len(pts) < 3: continue
        inner = []
        for h in holes:
            hx, hy = h['pts'][0]
            if mathutils_point_in_poly((hx * U, hy * U), [(p.x, p.y) for p in pts]): inner.append([Vector((x * U, y * U, 0)) for x, y in h['pts']])
        for tri in tessellate_polygon([pts] + inner):
            allv = pts + [v for h in inner for v in h]
            try: bm.faces.new([bm.verts.new(allv[i]) for i in tri])
            except ValueError: pass
    bm.normal_update()
    for f_ in bm.faces:
        if f_.normal.z < 0: f_.normal_flip()
    bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); ob.location.z = z; me.materials.append(material); return ob
def mathutils_point_in_poly(p, poly):
    x, y = p; inside = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1: inside = not inside
    return inside
bpy.ops.mesh.primitive_plane_add(size=1); base = bpy.context.active_object; base.name = 'GROUND_SAND'; base.scale = (400, 400, 1); base.location = (0.3 * U, 0.7 * U, -0.02); base.data.materials.append(MAT['sand'])
add_polys('GROUND_PAVEMENT', lay['classes']['pavement'], MAT['pavement'], 0.0)
add_polys('GROUND_PATHEDGE', lay['classes']['path_edge'], MAT['path_edge'], 0.01)

CAMC = [sum(p['C'][i] for p in cam['poses']) / len(cam['poses']) for i in range(3)]; CAM_AVG = Vector((CAMC[0] * U, CAMC[1] * U, CAMC[2] * U))
def footprint(blob_xy, h):
    """A raised object's blob in the rectified plan is where the camera ray through it meets the ground: recover the true XY below it."""
    k = 1.0 - h / CAM_AVG.z; return Vector((CAM_AVG.x + (blob_xy[0] - CAM_AVG.x) * k, CAM_AVG.y + (blob_xy[1] - CAM_AVG.y) * k, 0))
# ---------- parameters (fitted against the reference by analysis-by-synthesis; defaults are first measurements) ----------
P = dict(fountain=dict(ring_in=7.8, ring_out=9.2, ring_h=1.3, water_h=1.0, statue_r=4.0, statue_h=1.0, halo_r=10.0),
         pavilion=dict(roof_h=6.0, roof_w=8.2, roof_t=0.6, post_h=6.0, post_r=0.45, counter_h=2.4, finial_r=0.55),
         tree=dict(canopy_h=9.0, canopy_scale=1.0, trunk_r=0.6),
         light=dict(sun_energy=2.2, ambient=0.55, sun_elev_deg=48.0, sun_az_deg=-35.0, sun_angle_deg=8.0))
if os.path.exists(os.path.join(OUT, 'params.json')): 
    for k, v in json.load(open(os.path.join(OUT, 'params.json'))).items(): P[k].update(v)
def cyl(name, r, h, loc, material, verts=64, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc); o = bpy.context.active_object; o.name = name; o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def box(name, size, loc, material, rot_z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object; o.name = name; o.scale = size; o.rotation_euler.z = rot_z; o.data.materials.append(material); return o
for k, c in (('post_dark', (72, 56, 78)), ('counter_pink', (205, 92, 122)), ('carpet', (190, 90, 88)), ('trunk', (120, 84, 64)), ('finial', (190, 160, 110)), ('halo_sand', (245, 224, 140))): MAT[k] = mat(k, c)

# ---------- fountain: statue / water / stone ring / sand halo (radial profile measured in plan view) ----------
fo = lay['objects']['fountain']; fx, fy = [c * U for c in fo['centre']]; F = P['fountain']
cyl('FOUNTAIN_HALO', F['halo_r'], 0.05, (fx, fy, 0.03), MAT['halo_sand'])
ring = cyl('FOUNTAIN_RING', F['ring_out'], F['ring_h'], (fx, fy, F['ring_h'] / 2), MAT['stone_light'])
hole = cyl('_HOLE', F['ring_in'], F['ring_h'] * 3, (fx, fy, F['ring_h'] / 2), MAT['stone_light'])
bm_ = ring.modifiers.new('bool', 'BOOLEAN'); bm_.operation = 'DIFFERENCE'; bm_.object = hole; bm_.solver = 'EXACT'
bpy.context.view_layer.objects.active = ring; bpy.ops.object.modifier_apply(modifier='bool'); bpy.data.objects.remove(hole, do_unlink=True)
cyl('FOUNTAIN_WATER', F['ring_in'], 0.05, (fx, fy, F['water_h']), MAT['water'])
cyl('FOUNTAIN_STATUE', F['statue_r'], F['statue_h'], (fx, fy, F['water_h'] + F['statue_h'] / 2), MAT['stone_dark'])

# ---------- market-stall pavilions facing the fountain ----------
PV = P['pavilion']
for k, p in enumerate(lay['objects']['pavilions'][:4]):
    fp = footprint([c * U for c in p['centre']], PV['roof_h']); cx_, cy_ = fp.x, fp.y
    ang = math.atan2(fy - cy_, fx - cx_)               # the stall's front faces the fountain
    rz = round(ang / (math.pi / 4)) * (math.pi / 4)    # snapped to the plaza's 45-degree grid
    front = Vector((math.cos(rz), math.sin(rz), 0)); side = Vector((-front.y, front.x, 0)); w = PV['roof_w']
    o = Vector((cx_, cy_, 0)) - Vector((0, 0.0, 0))     # footprint centre (plan displacement from roof height removed by the fit)
    box(f'PAV{k}_ROOF', (w, w, PV['roof_t']), (o.x, o.y, PV['roof_h']), MAT['roof_red'], rz)
    for sx in (-1, 1):
        for sf in (-1, 1):
            pp = o + side * sx * w * 0.44 + front * sf * w * 0.44
            cyl(f'PAV{k}_POST', PV['post_r'], PV['post_h'], (pp.x, pp.y, PV['post_h'] / 2), MAT['post_dark'], 12)
            cyl(f'PAV{k}_FINIAL', PV['finial_r'], PV['finial_r'] * 1.4, (pp.x, pp.y, PV['roof_h'] + PV['roof_t'] / 2 + 0.3), MAT['finial'], 12)
    box(f'PAV{k}_COUNTER', (w * 0.82, w * 0.62, PV['counter_h']), (o.x - front.x * w * 0.12, o.y - front.y * w * 0.12, PV['counter_h'] / 2), MAT['counter_pink'], rz)
    c2 = o + front * (w * 0.5 + w * 0.12); box(f'PAV{k}_CARPET', (w * 0.3, w * 0.62, 0.08), (c2.x, c2.y, 0.06), MAT['carpet'], rz)

# ---------- trees: orange canopy (hex-leaf cluster) on a trunk ----------
TR = P['tree']
TREES_KEEP = {0: None, 1: None, 2: dict(centre=[0.33, 0.51], area_px=2000), 3: None}
for k, t in enumerate(lay['objects']['trees']):
    if k not in TREES_KEEP: continue
    if TREES_KEEP[k]: t = dict(t, **TREES_KEEP[k])
    fp = footprint([c * U for c in t['centre']], TR['canopy_h']); cx_, cy_ = fp.x, fp.y; r = math.sqrt(t['area_px'] / math.pi) / 500.0 * U * TR['canopy_scale']
    cyl(f'TREE{k}_TRUNK', TR['trunk_r'], TR['canopy_h'], (cx_, cy_, TR['canopy_h'] / 2), MAT['trunk'], 12)
    cn = cyl(f'TREE{k}_CANOPY', r * 0.55, 1.6, (cx_, cy_, TR['canopy_h'] + 0.8), MAT['tree_orange'], 6, smooth=False)
    for j in range(6):
        a_ = j * math.pi / 3 + 0.3; cyl(f'TREE{k}_LEAF{j}', r * 0.42, 1.4, (cx_ + math.cos(a_) * r * 0.62, cy_ + math.sin(a_) * r * 0.62, TR['canopy_h'] + 0.6 + 0.15 * (j % 2)), MAT['tree_orange'], 6, smooth=False)

# ---------- lighting (calibrated later against the measured palette) ----------
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (1, 1, 1, 1); bg.inputs['Strength'].default_value = P['light']['ambient']
sun = bpy.data.lights.new('SUN', 'SUN'); sun.energy = P['light']['sun_energy']; sun.angle = math.radians(P['light']['sun_angle_deg']); so = bpy.data.objects.new('SUN', sun); bpy.context.collection.objects.link(so)
el = math.radians(P['light']['sun_elev_deg']); az = math.radians(P['light']['sun_az_deg']); so.rotation_euler = Vector((math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), -math.sin(el))).to_track_quat('-Z', 'Y').to_euler()

# ---------- the fitted camera ----------
cd = bpy.data.cameras.new('CAM'); cd.type = 'PERSP'; cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36.0; cd.lens = cam['f'] / 640.0 * 36.0; cd.clip_start = 1; cd.clip_end = 5000
co = bpy.data.objects.new('CAM', cd); bpy.context.collection.objects.link(co); sc.camera = co
def set_cam(frame):
    p = poses[frame]; th = math.radians(p['pitch_deg']); yaw = math.radians(p['yaw_deg']); roll = math.radians(p['roll_deg'])
    c, s = math.cos(th), math.sin(th); R0 = Matrix(((1, 0, 0), (0, -s, -c), (0, c, -s)))
    Rz = Matrix(((math.cos(yaw), math.sin(yaw), 0), (-math.sin(yaw), math.cos(yaw), 0), (0, 0, 1))); Rr = Matrix(((math.cos(roll), -math.sin(roll), 0), (math.sin(roll), math.cos(roll), 0), (0, 0, 1)))
    R = Rr @ R0 @ Rz                                   # world -> camera (x right, y down, z forward)
    Rbl = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ R   # -> Blender camera axes (x right, y up, -z forward)
    m = Rbl.transposed().to_4x4(); m.translation = Vector(p['C']) * U; co.matrix_world = m

# =====================================================================================================================
# Sequence: licensed characters (as supplied), placeholders for what the archive does not contain, burst VFX
# =====================================================================================================================
import random
ANN = json.load(open(os.path.join(AN, f'annotations_take{TAKE}.json')))
LIC = os.path.join(HERE, '..', 'licensed')
def ray_to_plane(frame, px, py, z):
    """World point where the camera ray through image pixel (px, py) of `frame` meets the horizontal plane Z = z (BU)."""
    set_cam(frame); bpy.context.view_layer.update(); m = co.matrix_world; f = cam['f']
    d = (m.to_3x3() @ Vector(((px - 320.0) / f, -(py - 180.0) / f, -1.0))).normalized(); o = m.translation
    t = (z - o.z) / d.z; return o + d * t
def interp(track, frame, key=lambda v: v):
    ks = sorted(int(k) for k in track)
    if frame <= ks[0]: return track[str(ks[0])]
    if frame >= ks[-1]: return track[str(ks[-1])]
    for a, b in zip(ks, ks[1:]):
        if a <= frame <= b:
            u = (frame - a) / (b - a); u = u * u * (3 - 2 * u); pa, pb = track[str(a)], track[str(b)]; return [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u]
def load_char(name, blend):
    with bpy.data.libraries.load(os.path.join(LIC, name, blend), link=False) as (src, dst): dst.objects = [name]
    o = dst.objects[0]; bpy.context.collection.objects.link(o)
    root = bpy.data.objects.new(name.upper() + '_ROOT', None); bpy.context.collection.objects.link(root); o.parent = root
    bpy.context.view_layer.update(); zs = [(o.matrix_world @ Vector(c)).z for c in o.bound_box]; o.location.z -= min(zs)   # stand on the ground
    for m in o.data.materials:
        if m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED': n.inputs['Specular IOR Level'].default_value = 0.2
    return root
# ---------- static props (positions: pixels of frame 264 unprojected onto the ground) ----------
def ground_at(px, py, z=0.0): return ray_to_plane(264 if TAKE == 'B' else 201, px, py, z)
if True:
    pm = mat('pole_dark', (66, 52, 56)); flag_m = mat('bunting_red', (205, 72, 84)); box_m = mat('crate_purple', (108, 88, 132)); pot_m = mat('pot_brown', (150, 98, 70))
    refframe = 264 if TAKE == 'B' else 201
    # bunting poles: in take B frame 264 at pixels (188,338) and (342,338); in take A frame 201 at (237,330)/(385,330) scaled by the camera difference (use the world positions found for B)
    if TAKE == 'B': pl_, pr_ = ray_to_plane(264, 188, 338, 0.0), ray_to_plane(264, 342, 338, 0.0)
    else: pl_, pr_ = ray_to_plane(201, 237, 332, 0.0), ray_to_plane(201, 385, 332, 0.0)
    for p_ in (pl_, pr_): cyl('BUNTING_POLE', 0.9, 13.0, (p_.x, p_.y, 6.5), pm, 12)
    top = 11.6
    for i in range(1, 13):
        u = i / 13; x = pl_.x + (pr_.x - pl_.x) * u; y = pl_.y + (pr_.y - pl_.y) * u; z = top - 1.4 * 4 * u * (1 - u)
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.85, radius2=0.0, depth=1.5, location=(x, y, z - 0.75), rotation=(math.pi, 0, 0)); fl = bpy.context.active_object; fl.name = 'BUNTING_FLAG'; fl.data.materials.append(flag_m)
    # props at the lower-left (purple crates, brown pots)
    for (px_, py_, sz_, rot_) in ((35, 285, 3.6, 0.3), (67, 268, 3.3, 0.7)):
        g_ = ray_to_plane(264 if TAKE == 'B' else 201, px_, py_, 0.0) if TAKE == 'B' else ray_to_plane(201, px_ + 55, py_ + 10, 0.0); box('CRATE', (sz_, sz_, sz_), (g_.x, g_.y, sz_ / 2), box_m, rot_)
    for (px_, py_) in ((15, 302), (38, 308)):
        g_ = ray_to_plane(264 if TAKE == 'B' else 201, px_, py_, 0.0) if TAKE == 'B' else ray_to_plane(201, px_ + 55, py_ + 10, 0.0); cyl('POT', 1.5, 2.4, (g_.x, g_.y, 1.2), pot_m, 16)
CHARS = {'bread': load_char('bread', 'bread.blend'), 'coffee': load_char('coffee', 'Coffee.blend'), 'watermelon': load_char('watermelon', 'watermelon.blend')}
# --- NOT in the licensed archive: clearly named placeholders (rights/asset status to be confirmed) ---
tealm = mat('PLACEHOLDER_teal', (103, 202, 171)); bm_ = mat('PLACEHOLDER_boomerang', (118, 76, 48))
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.4, location=(0, 0, 1.4)); teal = bpy.context.active_object; teal.name = 'PLACEHOLDER_TEAL_CREATURE'; teal.scale = (1.0, 0.9, 1.15); teal.data.materials.append(tealm)
for p_ in teal.data.polygons: p_.use_smooth = True
def make_boomerang(name):
    cvb = bpy.data.curves.new(name, 'CURVE'); cvb.dimensions = '3D'; sp = cvb.splines.new('BEZIER'); sp.bezier_points.add(2)
    for pp, c in zip(sp.bezier_points, ((-1.5, 1.0, 0), (0, 0, 0), (-1.5, -1.0, 0))): pp.co = c; pp.handle_left_type = pp.handle_right_type = 'VECTOR'
    cvb.bevel_depth = 0.34; cvb.materials.append(bm_); o = bpy.data.objects.new('PLACEHOLDER_' + name, cvb); bpy.context.collection.objects.link(o); return o
BOOM = {'boomerang_a': make_boomerang('boomerang_a'), 'boomerang_b': make_boomerang('boomerang_b')}
# --- burst VFX (coffee splash + cup debris) ---
random.seed(7); burst_mat = mat('burst_brown', (74, 44, 30)); debris_mat = mat('burst_white', (236, 232, 224))
PART = []
for i in range(64):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=10, ring_count=6); o = bpy.context.active_object; o.name = f'BURST_P{i}'; o.data.materials.append(burst_mat); o.hide_render = True
    a_ = random.uniform(0, math.tau); sp_ = random.uniform(0.04, 0.26) * (1.5 if i % 5 == 0 else 1.0); PART.append((o, a_, sp_, random.uniform(0.15, 0.55) * (1.5 if i % 7 == 0 else 1.0), random.uniform(0.12, 0.45)))
DEB = []
for i in range(9):
    bpy.ops.mesh.primitive_cube_add(size=1); o = bpy.context.active_object; o.name = f'BURST_D{i}'; o.data.materials.append(debris_mat); o.hide_render = True
    DEB.append((o, random.uniform(0, math.tau), random.uniform(0.2, 0.6), random.uniform(0.3, 0.8)))
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=0.1); splat = bpy.context.active_object; splat.name = 'BURST_SPLAT'; splat.data.materials.append(burst_mat); splat.hide_render = True
ring_mat = bpy.data.materials.new('spawn_ring'); ring_mat.use_nodes = True; rb = ring_mat.node_tree.nodes['Principled BSDF']; rb.inputs['Base Color'].default_value = (1, 1, 1, 1); rb.inputs['Emission Color'].default_value = (1.0, 0.93, 0.62, 1); rb.inputs['Emission Strength'].default_value = 2.2
RINGS = {}
for n_ in ANN.get('spawn_rings', {}):
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.07, major_segments=40, minor_segments=8); r_ = bpy.context.active_object; r_.name = f'SPAWN_RING_{n_}'; r_.data.materials.append(ring_mat); r_.hide_render = True; r_.scale = (1, 1, 0.3); RINGS[n_] = r_
BURST_T0 = 331
prev = {}
def set_hidden(root, flag):
    root.hide_render = flag
    for c in root.children_recursive: c.hide_render = flag
def place_frame(f):
    for name, root in CHARS.items():
        ks_ = sorted(int(k) for k in ANN[name])
        if (TAKE == 'B' and name == 'coffee' and f > 331) or f < ks_[0] or f > ks_[-1]: set_hidden(root, True); continue
        if True:
            px, py = interp(ANN[name], f); w = ray_to_plane(f, px, py, 1.4); root.location = (w.x, w.y, 0.0)
            F0_ = min(poses); fp_ = max(F0_, f - 3); pw = interp(ANN[name], fp_); wp = ray_to_plane(fp_, pw[0], pw[1], 1.4); d = Vector((w.x - wp.x, w.y - wp.y))
            if d.length > 0.35: prev[name] = math.atan2(d.x, -d.y)
            root.rotation_euler = (0, 0, prev.get(name, 0.0)); set_hidden(root, False)
            root.location.z = 0.35 * abs(math.sin(f * 0.55)) if d.length > 0.35 else 0.0
    kt = sorted(int(k) for k in ANN['teal']); teal.hide_render = f < kt[0] or f > kt[-1]
    if not teal.hide_render: px, py = interp(ANN['teal'], f); w = ray_to_plane(f, px, py, 1.6); teal.location = (w.x, w.y, 0.0)
    for name, o in BOOM.items():
        if name not in ANN: o.hide_render = True; continue
        tr = ANN[name]; ks = sorted(int(k) for k in tr)
        if f < ks[0] or f > ks[-1]: o.hide_render = True; continue
        px, py = interp(tr, f); w = ray_to_plane(f, px, py, 2.0); o.location = (w.x, w.y, 0); o.rotation_euler = (0, 0, f * 0.9); o.hide_render = False
    # burst
    if 'burst' not in ANN: age = -1; bw = Vector((0, 0, 0))
    else: bx, by = interp(ANN['burst'], max(336, f)); bw = ray_to_plane(f, bx, by, 0.5); age = f - BURST_T0
    for o, a_, sp_, sz, up in PART:
        if age < 0: o.hide_render = True; continue
        t = age; o.location = (bw.x + math.cos(a_) * sp_ * min(t, 14) * 1.0, bw.y + math.sin(a_) * sp_ * min(t, 14) * 1.0, max(0.2, 1.0 + up * t * 0.5 - 0.06 * t * t)); o.scale = (sz,) * 3; o.hide_render = False
    for o, a_, sp_, up in DEB:
        if age < 0: o.hide_render = True; continue
        t = age; o.location = (bw.x + math.cos(a_) * sp_ * min(t, 12), bw.y + math.sin(a_) * sp_ * min(t, 12), max(0.3, 0.8 + up * t * 0.4 - 0.05 * t * t)); o.scale = (0.7, 0.5, 0.25); o.rotation_euler = (t * 0.3, t * 0.2, a_); o.hide_render = False
    for n_, r_ in RINGS.items():
        a0, a1 = ANN['spawn_rings'][n_]; vis = a0 <= f <= a1 and (n_ + '') in ANN
        r_.hide_render = not vis
        if vis:
            u = (f - a0) / (a1 - a0); tr_ = ANN[n_]; px, py = interp(tr_, max(f, min(int(k) for k in tr_))); w = ray_to_plane(f, px, py, 0.1); r_.location = (w.x, w.y, 0.12); sz = 3.2 * (1.0 - 0.35 * u); r_.scale = (sz, sz, 0.3)
    splat.hide_render = age < 0; splat.location = (bw.x, bw.y, 0.08); r_ = min(1.0, max(0.0, age / 22.0)) * 1.7; splat.scale = (max(r_, 0.01), max(r_, 0.01), 1)
for f in FRAMES:
    set_cam(f); place_frame(f); set_cam(f); sc.render.filepath = os.path.join(OUT, f'f{f:04d}.png'); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'courtyard_take{TAKE}.blend'))
