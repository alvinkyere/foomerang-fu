"""The sky islands in 3D (2026-10-22): islands, cliffs, stone blocks and bridges from layout.json, seen through the game's camera.

  Blender -b --python art/sky_islands/blender/build.py -- <out_dir> [render]

Everything is flat-coloured and unlit, as the HQ video shows it (art/sky_islands/README.md): the island tops grass
(#def7ac) with a soft lavender lip; the cliffs lavender, fading into the mist (#e5f3de) as they go down (over ~6 units);
the stone blocks the same with lighter tops (#afbce6) and rounded edges; the bridges purple-brown wood (#936f90). The
colours fade by vertex colour (glTF COLOR_0 on unlit materials), so the game draws them exactly. Exports sky.glb; with
`render`, also renders the reference view (9:04.0: the plaza rig at 0.9326x) for comparing with the video.
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

GRASS, LIP, CLIFF, BLOCK_TOP, BLOCK_SIDE, MIST, WOOD, WOOD_DARK, ROPE = (
    '#def7ac', '#c9cdeb', '#a9b0d8', '#afbce6', '#97a1c8', '#e5f3de', '#936f90', '#6f526e', '#c9b38a')
DEPTH = 30.0          # how far the islands and blocks run down into the mist
FADE = 6.0            # over how much of it they fade into the mist


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
# the island tops: our flat-coloured grass (tops.py), over the plan's extent
PLAN = CAM['plan']
TOPS_RES = 20
GRASS_MAT = bpy.data.materials.new('sky_grass'); GRASS_MAT.use_nodes = True
_nt = GRASS_MAT.node_tree
for _n in list(_nt.nodes):
    if _n.type != 'OUTPUT_MATERIAL': _nt.nodes.remove(_n)
_tex = _nt.nodes.new('ShaderNodeTexImage')
_tex.image = bpy.data.images.load(os.path.join(ROOT, 'art/sky_islands/blender/tops.png')); _tex.image.pack()
_bg = _nt.nodes.new('ShaderNodeBackground')
_nt.links.new(_tex.outputs['Color'], _bg.inputs['Color'])
_nt.links.new(_bg.outputs[0], next(n for n in _nt.nodes if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])


def mix(a, b, t):
    return [x + (y - x) * t for x, y in zip(lin(a), lin(b))]


# the cliffs below an edge, as the video's (a column under the centre island's south edge, 9:04.0, ~16 px a unit): lavender
# under the lip, darkening grey-blue ~3 units down, then lightening into the mist (depth below the top, units -> colour)
CLIFF_STOPS = [(0.0, '#b4bce0'), (0.6, '#aab5d3'), (3.1, '#93a5b7'), (6.25, '#a8b9bc'), (9.4, '#c8d9c9'), (14.0, MIST)]


def cliff_colour(d):
    for (d0, c0), (d1, c1) in zip(CLIFF_STOPS, CLIFF_STOPS[1:]):
        if d <= d1:
            return mix(c0, c1, max(0.0, (d - d0) / (d1 - d0)))
    return lin(MIST)


def colour_by_height(bm, top_hex, side_hex, top_z):
    """Tops their colour; the rounded lip between; sides down the cliff's colours into the mist."""
    layer = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')   # linear, as glTF's COLOR_0
    for f in bm.faces:
        nz = abs(f.normal.z)
        for loop in f.loops:
            z = loop.vert.co.z
            if nz > 0.95 and z >= top_z - 0.05:
                c = lin(top_hex)
            elif z >= top_z - 0.4 and nz > 0.3:
                c = mix(top_hex, LIP, 0.6)                    # the lip: the grass turning down
            else:
                c = cliff_colour(top_z - z)
            loop[layer] = c


def prism(name, outline, top_z, top_hex, side_hex, bevel):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, top_z)) for x, y in outline]
    face = bm.faces.new(vs)
    face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)   # (the original stays: the top)
    down = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=down, vec=(0, 0, -(top_z + DEPTH)))
    bm.normal_update()
    # round the top edges (the islands' soft lip, the blocks' rounded edges)
    top_edges = [e for e in bm.edges if all(abs(v.co.z - top_z) < 1e-4 for v in e.verts) and len(e.link_faces) == 2
                 and any(f.normal.z > 0.7 for f in e.link_faces)]
    bmesh.ops.bevel(bm, geom=top_edges, offset=bevel, segments=4, profile=0.5, affect='EDGES')
    # and the vertical corners
    corners = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1.0]
    bmesh.ops.bevel(bm, geom=corners, offset=bevel * 1.5, segments=4, profile=0.5, affect='EDGES')
    for d, _ in CLIFF_STOPS[1:]:                      # rings at the colour stops down the cliff
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, top_z - d), plane_no=(0, 0, 1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # outward everywhere (the cap up)
    bm.normal_update()
    colour_by_height(bm, top_hex, side_hex, top_z)
    grass = top_hex == GRASS
    if grass:                                          # the caps take the grass texture, mapped by where they lie
        uvl = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            on_top = abs(f.normal.z) > 0.95 and all(v.co.z >= top_z - 0.05 for v in f.verts)
            f.material_index = 1 if on_top else 0
            for loop in f.loops:
                x, y = loop.vert.co.x, loop.vert.co.y
                loop[uvl].uv = ((x - PLAN['x0']) / (PLAN['x1'] - PLAN['x0']), (y - PLAN['y0']) / (PLAN['y1'] - PLAN['y0']))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(MAT)
    if grass: me.materials.append(GRASS_MAT)
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


for key, outline in L['islands'].items():
    prism(f'ISLAND_{key}', outline, 0.0, GRASS, CLIFF, 0.35)
for i, b in enumerate(L['blocks']):
    prism(f'BLOCK_{i:02d}', b['top'], b['height'], BLOCK_TOP, BLOCK_SIDE, 0.3)


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
    else: getattr(obj_models, kind)(o, PAL, MAT, props, i)

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
