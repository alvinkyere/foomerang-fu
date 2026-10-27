"""The cross pond in 3D (2026-10-27): the banks, the stone wall, the water and the turning raft from layout.json.

  Blender -b --python art/pond_cross/blender/build.py -- <out_dir> [render]

Lit like the gong islands (the game's soft light): the grass banks with a lavender lip, running down into the pond; the
stone wall's blocks rounded lavender; the water one flat sheet named FOUNTAIN_water (the game draws the plaza fountain's
water on it: waterShader.ts, its field water.png from package.py); the raft (RAFT: planks and its four crates) built about
its own centre, so the game turns it by the round's clock. Exports pond.glb; with `render`, also the reference view.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER = args[0], 'render' in args[1:]
L = json.load(open(os.path.join(ROOT, 'art/pond_cross/layout.json')))
CAM = json.load(open(os.path.join(ROOT, 'art/sky_islands/camera.json')))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sys.path.insert(0, os.path.join(ROOT, 'art/sky_islands/blender'))
import objects as obj_models                                       # the gong islands' crate, as it is
PAL = json.load(open(os.path.join(ROOT, 'art/sky_islands/objects.json')))['palettes']

WATER_Z, BANK_DEPTH = -0.6, 3.0


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def lit(name, hex_colour):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 1.0; bsdf.inputs['Base Color'].default_value = lin(hex_colour)
    return m


def unlit(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(attr.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


# reference.png's colours: the grass #d8f78b, the lavender lit (#9da7e1), the wall's faces darker, the raft's wood #b39d7b
GRASS, ROCK, WALL, WOOD = lit('pond_grass', '#d8f78b'), lit('pond_rock', '#9da7e1'), lit('pond_wall', '#8f9ad8'), lit('pond_wood', '#b39d7b')
SEAM = lit('pond_seam', '#8a7356')
FLAT = unlit('pond_flat')


def body(name, outline, top_z, top_mat, side_mat, top_r, bottom):
    """An outline extruded down to `bottom`, its top edge rounded; the flat top one material, the rest the other."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, top_z)) for x, y in outline])
    face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)
    bmesh.ops.translate(bm, verts=[g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, bottom - top_z))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    top_edges = [e for e in bm.edges if all(abs(v.co.z - top_z) < 1e-4 for v in e.verts) and len(e.link_faces) == 2
                 and any(f.normal.z > 0.7 for f in e.link_faces) and any(abs(f.normal.z) < 0.3 for f in e.link_faces)]
    bmesh.ops.bevel(bm, geom=top_edges, offset=top_r, segments=4, profile=0.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    for f in bm.faces:
        f.material_index = 1 if f.normal.z > 0.995 and all(v.co.z >= top_z - 1e-3 for v in f.verts) else 0
        f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    me.materials.append(side_mat); me.materials.append(top_mat)
    return o


# the banks: grass inside a lavender lip, down into the water
for k, b in enumerate(L['banks']): body(f'BANK_{k}', b, 0.0, GRASS, ROCK, 0.35, WATER_Z - BANK_DEPTH)
# the stone wall and the boulders: lavender, standing over the grass
for k, w in enumerate(L['walls']): body(f'WALL_{k}', w, 1.4, ROCK, WALL, 0.5, WATER_Z - BANK_DEPTH)

# the water: one square sheet over the whole pond (its field, water.png, is baked over this square: package.py)
x0, y0 = min(p[0] for b in L['banks'] for p in b), min(p[1] for b in L['banks'] for p in b)
x1, y1 = max(p[0] for b in L['banks'] for p in b), max(p[1] for b in L['banks'] for p in b)
cx, cy, half = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2 + 40
me = bpy.data.meshes.new('FOUNTAIN_water')
me.from_pydata([(cx - half, cy - half, WATER_Z), (cx + half, cy - half, WATER_Z), (cx + half, cy + half, WATER_Z),
                (cx - half, cy + half, WATER_Z)], [], [(0, 1, 2, 3)])
water = bpy.data.objects.new('FOUNTAIN_water', me); sc.collection.objects.link(water)
me.materials.append(lit('pond_water', '#74a2b2'))

# the raft: built round its own origin (the game turns RAFT about its local up), placed at its centre at the measured angle
R_ = L['raft']; arm, wid = R_['arm'], R_['width']
raft = bpy.data.objects.new('RAFT', None); sc.collection.objects.link(raft)
raft.location = (R_['centre'][0], R_['centre'][1], 0.0)
DECK = 0.0
for k, (sx, sy) in enumerate(((arm, wid), (wid, arm))):
    o = body(f'RAFT_deck_{k}', [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)], DECK, WOOD, SEAM,
             0.12, WATER_Z - 0.3)
    o.parent = raft
# its planks' seams: thin dark lines across each arm
bm = bmesh.new()
for k in range(-7, 8):
    for (u0, v0, u1, v1) in (((k * arm / 16) - 0.03, -wid / 2, (k * arm / 16) + 0.03, wid / 2),
                             (-wid / 2, (k * arm / 16) - 0.03, wid / 2, (k * arm / 16) + 0.03)):
        if abs(k * arm / 16) < wid / 2 + 0.1: continue
        vs = [bm.verts.new((u, v, DECK + 0.01)) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
        bm.faces.new(vs)
me = bpy.data.meshes.new('RAFT_seams'); bm.to_mesh(me); bm.free()
o = bpy.data.objects.new('RAFT_seams', me); sc.collection.objects.link(o); me.materials.append(SEAM); o.parent = raft
for k, (u, v) in enumerate(R_['crates']):
    obj_models.crate({'x': u, 'y': v, 'width': 1.43}, PAL, FLAT, raft, k)
for c in raft.children:
    if c.name.startswith('CRATE_'): c.name = 'RAFT_' + c.name
raft.rotation_euler = (0, 0, math.radians(R_['degrees']))

# the camera: the plaza's rig, at the reference view's zoom
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * L['zoom'] / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = lin('#74a2b2')
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(30), 0, math.radians(20))
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False); so.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'pond.glb'), export_format='GLB', use_selection=True,
                          export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
print('pond built:', len(L['banks']), 'banks,', len(L['walls']), 'walls,', len(R_['crates']), 'crates')
