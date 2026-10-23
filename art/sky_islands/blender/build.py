"""The sky islands in 3D (2026-10-22): islands, cliffs, stone blocks and bridges from layout.json, seen through the game's camera.

  Blender -b --python art/sky_islands/blender/build.py -- <out_dir> [render]

The ground is lit 3D, as the HQ video shows it (art/sky_islands/README.md, slice 6): each island a body of rock with rounded
corners, running down into the mist, its top our grass (grass.py) rounding over its edge; the stone blocks rock, rounded on
every edge. The game lights them softly and fades them into the mist (#e5f3de) by height (the manifest's `look`). The
bridges (purple-brown wood, #936f90) and the objects are still flat and unlit (glTF KHR_materials_unlit + COLOR_0). Exports
sky.glb; with `render`, also renders the reference view (9:04.0: the plaza rig at 0.9326x).
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
RENDER = 'render' in args[1:]
L = json.load(open(os.path.join(ROOT, 'art/sky_islands/layout.json')))
CAM = json.load(open(os.path.join(ROOT, 'art/sky_islands/camera.json')))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

MIST, WOOD, WOOD_DARK, ROPE = (
    '#e5f3de', '#936f90', '#6f526e', '#c9b38a')
DEPTH = 30.0          # how far the islands and blocks run down into the mist


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def unlit(name):
    """A flat material showing its vertex colours as they are (glTF: KHR_materials_unlit + COLOR_0)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(attr.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


MAT = unlit('sky_flat')
def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(lin(a), lin(b))]


def lit(name, hex_colour=None, image=None):
    """A lit material (glTF: a plain base colour or texture): the game shades it (the map's soft look) and mists it by height."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 1.0
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image; tex.extension = 'REPEAT'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = lin(hex_colour)
    return m


# our grass (grass.py: a tile of TILE plan units), and the rock: the HQ's lit block top (#a7b3e0, 9:41.6), which the game's
# soft light shows as it is on a top; sides a little darker, the far sides darker still, and everything below fades to mist
GRASS_TILE = 16.0
_grass_img = bpy.data.images.load(os.path.join(ROOT, 'art/sky_islands/blender/grass.png')); _grass_img.pack()
GRASS_LIT = lit('sky_grass', image=_grass_img)
ROCK = lit('sky_rock', '#a9b5e1')
RIM_R, CORNER_R = 0.45, 0.7      # the round of an island's top edge and of its corners, units (the HQ close-ups)


def body(name, outline, top_z, top_mat, top_r, corner_r):
    """An island (or a stone block): its outline extruded down into the mist, its corners and its top edge rounded, its top
    (and the round of its edge) one material, its sides rock. Smooth-shaded across the rounds, sharp elsewhere."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, top_z)) for x, y in outline]
    face = bm.faces.new(vs)
    face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)   # (the original stays: the top)
    down = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=down, vec=(0, 0, -(top_z + DEPTH)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # (the extrusion leaves the cap facing down)
    bm.normal_update()
    corners = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1.0]
    bmesh.ops.bevel(bm, geom=corners, offset=corner_r, segments=6, profile=0.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    top_edges = [e for e in bm.edges if all(abs(v.co.z - top_z) < 1e-4 for v in e.verts) and len(e.link_faces) == 2
                 and any(f.normal.z > 0.7 for f in e.link_faces) and any(abs(f.normal.z) < 0.3 for f in e.link_faces)]
    bmesh.ops.bevel(bm, geom=top_edges, offset=top_r, segments=5, profile=0.5, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # outward everywhere (the cap up)
    bm.normal_update()
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        # the top's material on its flat only: its rounded edge is the rock's, a lavender rim round the grass (the HQ, 9:04.0:
        # ~half a unit of light lavender between the grass and the drop, all round)
        on_top = f.normal.z > 0.995 and all(v.co.z >= top_z - 1e-3 for v in f.verts)
        f.material_index = 1 if on_top else 0
        f.smooth = True
        for loop in f.loops:
            x, y = loop.vert.co.x, loop.vert.co.y
            loop[uvl].uv = (x / GRASS_TILE, y / GRASS_TILE)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    me.materials.append(ROCK); me.materials.append(top_mat)
    # sharp where faces meet at more than 40 degrees (a flat side against a flat top); the rounds stay smooth
    for e in me.edges: e.use_edge_sharp = False
    me.update()
    angles = {}
    for poly in me.polygons:
        for k in poly.edge_keys: angles.setdefault(k, []).append(poly.normal.copy())
    keyed = {tuple(sorted(e.vertices)): e for e in me.edges}
    for k, ns in angles.items():
        if len(ns) == 2 and ns[0].angle(ns[1]) > math.radians(40): keyed[tuple(sorted(k))].use_edge_sharp = True
    return o


def box(name, centre, size, angle, colour, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(angle, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    layer = bm.loops.layers.float_color.new('Col')
    for f in bm.faces:
        shade = 1.0 if f.normal.z > 0.5 else 0.82
        for loop in f.loops: loop[layer] = [c * shade for c in lin(colour)[:3]] + [1.0]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(MAT)
    if parent is not None: o.parent = parent
    return o


# the islands as bodies of rock (layout.py: overlapping islands are one body)
for k, outline in enumerate(L['bodies']):
    body(f'ISLAND_{k}', outline, 0.0, GRASS_LIT, RIM_R, CORNER_R)
for i, b in enumerate(L['blocks']):
    # the stone blocks: rock all over, rounded more (the HQ: a big soft round on every edge)
    body(f'BLOCK_{i:02d}', b['top'], b['height'], ROCK, 0.5, 0.6)


def bridge(key, B):
    c = [Vector((x, y, 0)) for x, y in B['corners']]
    origin = sum(c, Vector()) / 4
    along = math.radians(B['along'])
    u = Vector((math.cos(along), math.sin(along), 0))          # the way across
    v = Vector((-u.y, u.x, 0))                                 # across the way
    length = max((p - origin).dot(u) for p in c) - min((p - origin).dot(u) for p in c)
    width = max((p - origin).dot(v) for p in c) - min((p - origin).dot(v) for p in c)
    root = bpy.data.objects.new(f'BRIDGE_{key}', None); sc.collection.objects.link(root)
    if B['kind'] == 'planks':
        n = max(1, round(length / 0.62))
        for k in range(n):
            t = -length / 2 + (k + 0.5) * length / n
            box(f'BRIDGE_{key}_plank{k}', origin + u * t + Vector((0, 0, -0.08)), (length / n - 0.08, width, 0.16),
                along, WOOD if k % 2 == 0 else '#8a6888', root)
        for side in (-0.28, 0.28):
            box(f'BRIDGE_{key}_rope{side:+.2f}', origin + v * (side * width) + Vector((0, 0, 0.02)),
                (length, 0.07, 0.06), along, ROPE, root)
    else:
        n = max(1, round(length / 0.85))
        for k in range(n):
            t = -length / 2 + (k + 0.5) * length / n
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=length / n / 2 * 0.95, depth=width,
                                                location=origin + u * t + Vector((0, 0, -0.1)))
            log = bpy.context.active_object; log.name = f'BRIDGE_{key}_log{k}'
            log.rotation_euler = (math.pi / 2, 0, along)
            me = log.data
            layer = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
            for poly in me.polygons:
                shade = 0.75 if abs(poly.normal.z) < 0.3 and False else 1.0
                for li in poly.loop_indices: layer.data[li].color = [x * shade for x in lin(WOOD)[:3]] + [1.0]
            me.materials.append(MAT); log.parent = root
        for side in (-0.3, 0.3):
            box(f'BRIDGE_{key}_rope{side:+.2f}', origin + v * (side * width) + Vector((0, 0, 0.32)),
                (length, 0.07, 0.06), along, ROPE, root)


for key, B in L['bridges'].items():
    bridge(key, B)

# the objects (objects.py measures them; blender/objects.py builds them)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import objects as obj_models
OBJ = json.load(open(os.path.join(ROOT, 'art/sky_islands/objects.json')))
PAL = OBJ['palettes']
props = bpy.data.objects.new('PROPS', None); sc.collection.objects.link(props)
tile_images = {k: obj_models.tile_image(k, PAL[k]) for k in ('tile_blue', 'tile_gold')}
for i, o in enumerate(OBJ['objects']):
    kind = o['kind']
    if kind == 'gong': obj_models.gong(o, PAL, MAT, props)
    elif kind.startswith('tile'): obj_models.tile(o, PAL[kind], MAT, props, i, tile_images[kind])
    # pots and crates break: the game finds each at the model's top level by its arena id (POT_<i>, CRATE_<i>)
    else: getattr(obj_models, kind)(o, PAL, MAT, None if kind in ('pot', 'crate') else props, i)

# the camera: the plaza's rig, at the reference view's zoom
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co)
sc.camera = co
cx, cy, cz = (v * 100 for v in CAM['centre'])
co.location = (cx, cy, cz)
co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36
cam.lens = CAM['focalPx'] * CAM['referenceZoom'] / 1920 * 36
cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('mist'); sc.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs['Color'].default_value = lin(MIST)
sc.view_settings.view_transform = 'Standard'

os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'sky.glb'), export_format='GLB', use_selection=True,
                          export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png')
    bpy.ops.render.render(write_still=True)
print('sky islands built:', len(L['islands']), 'islands,', len(L['blocks']), 'blocks,', len(L['bridges']), 'bridges')
