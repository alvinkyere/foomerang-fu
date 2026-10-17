"""environ2's fountain (a citrus-juicer fountain) as our own model, every dimension measured from environ2 through its solved
camera (fountain_meas.json: plan units; see the environ2 README). Builds the model, renders it through the camera, exports FBX.
Blender -b --python fountain.py -- <out_dir> [materials.json]"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
os.makedirs(OUT, exist_ok=True)
M = json.load(open(os.path.join(stage.HERE, 'fountain_meas.json')))
B = stage.BU
CX, CY = M['cx'] * B, M['cy'] * B
R0, R1, H, RI, HW = M['R0'] * B, M['R1'] * B, M['h'] * B, M['Ri'] * B, M['hw'] * B
RD, HD, HC = M['rd'] * B, M['hd'] * B, M['hc'] * B
# colours (linear albedo), fitted against environ2 by fit_colours (start: the image's sRGB, linearised)
DEFAULT = {'rim_top': (0.80, 0.70, 0.72), 'rim_side': (0.36, 0.32, 0.45), 'water': (0.20, 0.62, 0.74),
           'dish': (0.48, 0.38, 0.47), 'cone': (0.52, 0.42, 0.52), 'bowl': (0.25, 0.20, 0.30), 'dish_side': (0.28, 0.24, 0.34), 'ground': (0.93, 0.89, 0.62)}
COL = dict(DEFAULT, **(json.load(open(ARGS[1])) if len(ARGS) > 1 else {}))
json.dump(COL, open(os.path.join(OUT, 'albedo_used.json'), 'w'))

sc, cam = stage.setup(engine='CYCLES')
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.render.film_transparent = False


def mat(name, rgb, rough=0.8, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = (*rgb, 1)
        p.inputs['Emission Strength'].default_value = emit
    return m


def ring_solid(name, r_out_bot, r_out_top, r_in, z0, z1, segs=96, outline=lambda a: 1.0):
    """A thick ring: outer wall (slightly tapered), flat top, inner wall; outline(a) scales the outer radius at angle a."""
    bm = bmesh.new()
    rings = []
    for k, (r, z) in enumerate(((r_out_bot, z0), (r_out_top, z1), (r_in, z1), (r_in, z0))):
        rings.append([bm.verts.new((CX + r * (outline(2 * math.pi * i / segs) if k < 2 else 1) * math.cos(2 * math.pi * i / segs),
                                    CY + r * (outline(2 * math.pi * i / segs) if k < 2 else 1) * math.sin(2 * math.pi * i / segs), z))
                      for i in range(segs)])
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    return o


def assign(o, *mats, top_index=None):
    for m in mats:
        o.data.materials.append(m)
    return o


m_top, m_side = mat('rim_top', COL['rim_top']), mat('rim_side', COL['rim_side'])
m_water, m_dish, m_cone = mat('water', COL['water'], 0.15), mat('dish', COL['dish']), mat('cone', COL['cone'])
m_bowl = mat('bowl', COL['bowl'])
m_dish_side = mat('dish_side', COL['dish_side'])
m_ground = mat('ground', COL['ground'], 0.95)

# ground (only to receive the fountain's shadow and contact light; the plaza's ground is its own model later)
bpy.ops.mesh.primitive_plane_add(size=4000, location=(CX, CY + 600, 0))
assign(bpy.context.object, m_ground)

# rim: outer wall + top (rim_top on the faces facing up, rim_side on the walls)
rim = ring_solid('FOUNTAIN_rim', R0, R1, RI, 0.0, H)
assign(rim, m_side, m_top)
for f in rim.data.polygons:
    f.material_index = 1 if f.normal.z > 0.5 else 0
bev = rim.modifiers.new('bevel', 'BEVEL')
bev.width, bev.segments, bev.limit_method = 0.12, 3, 'ANGLE'
for f in rim.data.polygons:
    f.use_smooth = False
# the drain slot at the front of the rim (image x 649..654, y 513..530)
fa = stage.ray_to_z(651.5, 530, 0)
bpy.ops.mesh.primitive_cube_add(location=(fa.x, fa.y - 0.02, H / 2 + 0.02))
slot = bpy.context.object
slot.name = 'FOUNTAIN_slot'
slot.scale = (0.22, 0.05, H / 2 + 0.02)
assign(slot, mat('slot', COL.get('slot', (0.10, 0.09, 0.14))))
# basin floor and water surface
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=RI + 0.01, depth=0.2, location=(CX, CY, 0.1))
assign(bpy.context.object, m_side)
bpy.ops.mesh.primitive_circle_add(vertices=96, radius=1.0, fill_type='NGON', location=(CX, CY, HW))
water = bpy.context.object
water.name = 'FOUNTAIN_water'
assign(water, m_water)
nt = m_water.node_tree
p_ = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tc, mp, gr, ramp = nt.nodes.new('ShaderNodeTexCoord'), nt.nodes.new('ShaderNodeMapping'), nt.nodes.new('ShaderNodeTexGradient'), \
    nt.nodes.new('ShaderNodeValToRGB')
gr.gradient_type = 'SPHERICAL'
mp.inputs['Location'].default_value = (0.45, -0.55, 0)                  # the gradient's centre is at -location: back-left of the basin
mp.inputs['Scale'].default_value = (1.1, 1.1, 1)
nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
nt.links.new(gr.outputs['Fac'], ramp.inputs['Fac'])
base = COL['water']
ramp.color_ramp.elements[0].color = (*base, 1)
ramp.color_ramp.elements[1].color = tuple(min(1.0, c * float(os.environ.get('FOO_WATER_GLOW', '1.45'))) for c in base) + (1,)
ramp.color_ramp.elements[1].position = 0.55
nt.links.new(ramp.outputs['Color'], p_.inputs['Base Color'])
water.scale = (RI + 0.01, RI + 0.01, 1)       # the mesh is a unit disc, so the mapping above is in basin radii

# the juicer dish: a thin-lipped round dish standing in the water; its outline runs out into a pointed spout (west, tip at image
# (584, 412)) and it carries a tab handle (east, image x 703..716, y 400..433)
tip = stage.ray_to_z(584, 412, HD)
SPOUT = (math.hypot(tip.x - CX, tip.y - CY) / RD) - 1       # how far the spout's tip reaches past the rim, as a fraction of RD
def dish_outline(a):
    d = abs((a - math.pi + math.pi) % (2 * math.pi) - math.pi)   # angle from due west
    wobble = 0.012 * math.sin(5 * a + 0.7) + 0.008 * math.sin(9 * a + 2.1)     # hand-sculpted, not turned
    return 1 + wobble + SPOUT * max(0.0, 1 - d / 0.55) ** 2.2
LIP = 0.55                                       # the dish's wide flat lip (0.32 measured worse)
dish = ring_solid('FOUNTAIN_dish', RD, RD * 0.99, RD - LIP, HW - 0.3, HD, segs=256, outline=dish_outline)
assign(dish, m_dish_side, m_dish)
for f in dish.data.polygons:
    f.use_smooth = False
    f.material_index = 1 if f.normal.z > 0.5 else 0
a, b = stage.ray_to_z(700, 401, HD - 0.2), stage.ray_to_z(715, 432, HD - 0.2)
bpy.ops.mesh.primitive_cube_add(location=((a.x + b.x) / 2, (a.y + b.y) / 2, (HD - 0.12 + HW - 0.3) / 2))
tab = bpy.context.object
tab.name = 'FOUNTAIN_tab'
tab.scale = (abs(b.x - a.x) / 2, abs(b.y - a.y) / 2, (HD - 0.2 - HW + 0.3) / 2)
tb = tab.modifiers.new('bevel', 'BEVEL')
tb.width, tb.segments = 0.3, 4
assign(tab, m_dish)

# the reamer: a dark sunken bowl rising to a low cone, and 18 separate rounded ribs radiating from the tip down to the lip
floor = HD - 0.75
rc = RD - LIP
SEG, RAD = 128, 16
bm = bmesh.new()
grid = []
for k in range(RAD + 1):
    t = k / RAD
    row = []
    for i in range(SEG):
        a = 2 * math.pi * i / SEG
        row.append(bm.verts.new((CX + rc * t * math.cos(a), CY + rc * t * math.sin(a),
                                 floor + (HC - 0.12 - floor) * (1 - t) ** 1.25 - 0.08)))
    grid.append(row)
for k in range(RAD):
    for i in range(SEG):
        j = (i + 1) % SEG
        bm.faces.new((grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]))
me = bpy.data.meshes.new('bowl')
bm.to_mesh(me)
bm.free()
bowl = bpy.data.objects.new('FOUNTAIN_bowl', me)
sc.collection.objects.link(bowl)
assign(bowl, m_bowl)
for f in bowl.data.polygons:
    f.use_smooth = True
RIBS = 14
apex = Vector((CX, CY, HC))
for r in range(RIBS):
    a = 2 * math.pi * (r + 0.5) / RIBS
    end_ = Vector((CX + (rc - 0.05) * math.cos(a), CY + (rc - 0.05) * math.sin(a), HD - 0.25))
    mid = apex.lerp(end_, 0.5)
    mid.z += 0.04                                  # ribs lie on the cone, barely convex
    curve = bpy.data.curves.new(f'rib{r}', 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(2)
    for bp, p, rad in zip(sp.bezier_points, (apex, mid, end_), (0.15, 0.8, 1.0)):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = rad
    curve.bevel_depth = 0.16
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    o = bpy.data.objects.new(f'FOUNTAIN_rib{r}', curve)
    sc.collection.objects.link(o)
    o.data.materials.append(m_cone)

# light: warm sun from the east and a little behind (environ2's shadows fall west and toward the viewer), sky fill
sun = bpy.data.lights.new('SUN', 'SUN')
sun.energy = float(os.environ.get('FOO_SUN', '3.2'))
sun.color = (1.0, 0.95, 0.85)
sun.angle = math.radians(8)
so = bpy.data.objects.new('SUN', sun)
sc.collection.objects.link(so)
so.rotation_euler = Vector((-1.0, 0.25, -float(os.environ.get('FOO_SUN_DOWN', '1.1')))).to_track_quat('-Z', 'Y').to_euler()
wd = bpy.data.worlds.new('W')
wd.use_nodes = True
bg = wd.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.75, 0.80, 0.90, 1)
bg.inputs['Strength'].default_value = float(os.environ.get('FOO_SKY', '0.9'))
sc.world = wd

# render the fountain's region (border) and the whole frame's id masks for the comparison
x0, y0, x1, y1 = 520, 300, 790, 545
sc.render.use_border, sc.render.use_crop_to_border = True, False
sc.render.border_min_x, sc.render.border_max_x = x0 / stage.W, x1 / stage.W
sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / stage.H, 1 - y0 / stage.H
sc.render.filepath = os.path.join(OUT, 'fountain_render.png')
bpy.ops.render.render(write_still=True)

# part masks for the comparison: every part flat in its own colour (Workbench), the ground black
PARTS = {'rim_top': (1, 0, 0), 'rim_side': (0, 1, 0), 'water': (0, 0, 1), 'dish': (1, 1, 0), 'cone': (1, 0, 1), 'bowl': (0, 1, 1),
         'dish_side': (1, 1, 1), 'ground': (0, 0, 0)}
saved = {}
for m in bpy.data.materials:
    if m.name in PARTS:
        saved[m.name] = tuple(m.diffuse_color)
        m.diffuse_color = (*PARTS[m.name], 1)
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_shadows = False
sc.display_settings.display_device = 'sRGB'
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = os.path.join(OUT, 'fountain_ids.png')
bpy.ops.render.render(write_still=True)

# FBX of the model only (no ground, no light, no camera)
bpy.ops.object.select_all(action='DESELECT')
for o in sc.objects:
    if o.name.startswith('FOUNTAIN') or o.type == 'MESH' and o.data.materials and o.data.materials[0].name in ('rim_side', 'dish') \
            and o.name not in ('Plane',):
        o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'fountain.blend'))
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'fountain.fbx'), use_selection=True, apply_unit_scale=True)
print('fountain built: rim R0 %.2f h %.2f, dish %.2f, cone %.2f BU' % (R0, H, RD, HC))
