"""The plaza's plants as the reference video draws them (2026-10-21, from the high-quality cut, foomerang-fu physics hq.mp4).

Run on the shipped plaza (it edits plaza.glb in place; names, materials and everything else are kept):
  Blender -b --python plants.py -- apps/console/public/maps/market_plaza/plaza.glb [out.glb]

The hex plants (TREE_25 … TREE_28): a honeycomb of thin orange plates, each at its own height. In the video (2:38.5, the
camera at its closest) the plates overlap: no gaps, no dark grooves between them; each glows softly lighter at its middle
(#f9a96e there, #eb925e at its rim, #f79762 overall); and thin stems hang from the plates' rims nearly to the ground, tapering
to a blunt point (≈ 0.1 units wide at the top), about one per plate, two along the front. All four are orange (ours had the north-east
one yellow).
"""
import bpy, bmesh, sys, math, random
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC = args[0]
OUT = args[1] if len(args) > 1 else SRC
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
rng = random.Random(25)


def srgb(h):
    """'#rrggbb' -> linear RGBA (glTF base colours are linear)."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def material(name, hex_, image=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(hex_)
    bsdf.inputs['Roughness'].default_value = 0.85
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


# the plate's glow: a radial gradient from its light middle to its darker rim (the texture carries the colour: glTF then
# writes the base colour as white)
LIGHT, RIM = (0xf9, 0xa9, 0x6e), (0xeb, 0x92, 0x5e)
N = 64
img = bpy.data.images.new('hex_glow', N, N)
img.colorspace_settings.name = 'sRGB'
px = []
for j in range(N):
    for i in range(N):
        r = min(1.0, math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2)
        t = max(0.0, min(1.0, (r - 0.1) / 0.9)); t = t * t * (3 - 2 * t)
        px += [(LIGHT[k] + (RIM[k] - LIGHT[k]) * t) / 255 for k in range(3)] + [1.0]   # (a byte image holds sRGB as is)
img.pixels = px
img.pack()
img.file_format = 'PNG'
plate_mat = material('hex_plate', '#%02x%02x%02x' % LIGHT, img)
stem_mat = material('hex_stem', '#f59761')

for root in [o for o in bpy.data.objects if o.name.startswith('TREE_2') and o.name.endswith('_tree')]:
    hexes = [c for c in root.children if '_hex' in c.name]
    for leg in [c for c in root.children if '_leg' in c.name]:
        bpy.data.objects.remove(leg, do_unlink=True)
    stems = []
    centres = []
    for h in hexes:
        me = h.data
        mw = h.matrix_world
        vs = [mw @ v.co for v in me.vertices]
        c = sum(vs, Vector()) / len(vs)
        centres.append((h, c, vs))
    ys = [c.y for _, c, _ in centres]   # Blender Y: north; the video's front (south) edge shows its stems
    y_front = min(ys)
    for h, c, vs in centres:
        me = h.data
        # overlap: each plate 8% wider about its own middle, as thin as it was
        for v in me.vertices:
            w = h.matrix_world @ v.co
            w.x = c.x + (w.x - c.x) * 1.08
            w.y = c.y + (w.y - c.y) * 1.08
            v.co = h.matrix_world.inverted() @ w
        # planar UVs: the glow's middle at the plate's middle (its sides take the rim)
        r = max((Vector((v.x, v.y)) - Vector((c.x, c.y))).length for v in vs) * 1.08
        if not me.uv_layers:
            me.uv_layers.new(name='UVMap')
        uv = me.uv_layers.active.data
        for poly in me.polygons:
            for li in poly.loop_indices:
                w = h.matrix_world @ me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (0.5 + (w.x - c.x) / (2 * r), 0.5 + (w.y - c.y) / (2 * r))
        me.materials.clear()
        me.materials.append(plate_mat)
        # only its top: the thin sides took the toon shade and drew a dark groove round every plate (the video's have none)
        bm = bmesh.new(); bm.from_mesh(me)
        up = (h.matrix_world.to_3x3().inverted().transposed() @ Vector((0, 0, 1))).normalized()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.normalized().dot(up) < 0.9], context='FACES')
        bm.to_mesh(me); bm.free()
        # stems: one under each plate, two along the front; tapering to a point just above the ground
        bottom = min(v.z for v in vs)
        n = 2 if c.y - y_front < 1.0 else 1
        for _ in range(n):
            # from its south rim (the side the camera sees), as the video's hang below the canopy's front
            a = math.radians(-90 + rng.uniform(-55, 55)); d = rng.uniform(0.55, 0.8) * r
            x, y = c.x + d * math.cos(a), c.y + d * math.sin(a)
            length = bottom - rng.uniform(0.02, 0.12)
            top = rng.uniform(0.045, 0.06)
            bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=top * 0.35, radius2=top, depth=length,
                                            location=(x, y, bottom - length / 2))
            s = bpy.context.active_object
            s.name = f'{root.name}_stem{len(stems)}'
            s.data.materials.append(stem_mat)
            s.parent = root
            s.matrix_parent_inverse = root.matrix_world.inverted()
            stems.append(s)
    print(root.name, len(hexes), 'plates,', len(stems), 'stems')


# The round trees. The video's (2:05, 2:38.5): one big cluster of soft round puffs in a narrow range of yellow (#dca752 …
# #eaca66), the puffs lit towards the sun lighter; a thick purple trunk (#786a93, lit #937a9e) leaning a little east; fallen
# leaves round it. Its canopy is nearly flat-shaded: our toon light would darken the shaded puffs far more than the video's,
# so the puffs are unlit, in three tones by how they face the sun. The same tree in red (#e84c44 … #ee624f) stands round the
# plaza beyond the border, where the video shows them (their places measured in the registered HQ footage: the yellow one
# past the north-east stall and its twin in the north-west, a red one behind it, red ones east and south whose canopies the
# video shows at its edges and whose shadows lie across the east grass), and a purple stump past the west fence.
SUN = Vector((1.0, -0.25, 1.1)).normalized()      # towards the sun (Blender axes: east, north, up): the game's sun


def unlit(name, hex_):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = srgb(hex_)
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


PALETTES = {'yellow': [unlit(f'canopy_yellow_{k}', h) for k, h in (('dark', '#dca752'), ('mid', '#e2b761'), ('light', '#eaca66'))],
            'red': [unlit(f'canopy_red_{k}', h) for k, h in (('dark', '#e84c44'), ('mid', '#ec584a'), ('light', '#ee624f'))]}
trunk_mat = material('trunk_purple', '#937a9e')
leaves = sorted([o for o in bpy.data.objects if o.name.startswith('TREE29_leaf')], key=lambda o: o.name)
trunk29 = bpy.data.objects['TREE29_trunk']
centre = sum((o.matrix_world.translation for o in leaves), Vector()) / len(leaves)
base29 = Vector((trunk29.matrix_world.translation.x, trunk29.matrix_world.translation.y, 0.0))
canopy_bottom = min((o.matrix_world @ Vector(c)).z for o in leaves for c in o.bound_box)


def tone(offset):
    """Dark only on the far side from the sun, light on the half facing it (the video's tree is mostly light)."""
    d = offset.normalized().dot(SUN)
    return 0 if d < -0.5 else (2 if d > 0.0 else 1)


for o in leaves:   # each puff its own tone: the material on the object, so copies share the mesh
    o.data.materials.clear()
    o.data.materials.append(PALETTES['yellow'][1])
    o.material_slots[0].link = 'OBJECT'
    o.material_slots[0].material = PALETTES['yellow'][tone(o.matrix_world.translation - centre)]
trunk29.data.materials.clear()
trunk29.data.materials.append(trunk_mat)

# (name, trunk base X, Y in Blender plan units, palette, canopy scale across, canopy scale up, canopy bottom height, lean east deg)
OUTSIDE = [
    ('NE', 35.1, 87.1, 'yellow', 0.95, 2.0, 6.3, 12),
    ('NW', -35.7, 91.0, 'yellow', 0.95, 2.0, 6.3, 12),
    ('N', 37.0, 101.0, 'red', 1.2, 1.4, 5.0, 8),
    # a wood to the east: the video's shade lies unbroken over all the grass east of the fences (its west edge ≈ X 37), lobed
    ('E1', 46.0, 67.0, 'red', 1.3, 1.3, 3.2, 6),
    ('E2', 43.0, 47.0, 'red', 1.4, 1.4, 4.5, 6),
    ('E3', 49.5, 79.0, 'red', 1.3, 1.3, 3.5, 6),
    ('E4', 48.5, 58.0, 'red', 1.4, 1.3, 4.0, 6),
    ('E5', 49.0, 73.0, 'red', 1.4, 1.3, 4.5, 6),
    ('E6', 50.5, 86.0, 'red', 1.3, 1.3, 4.0, 6),
    ('E7', 46.5, 40.0, 'red', 1.4, 1.3, 4.0, 6),
    ('E8', 52.0, 52.0, 'red', 1.5, 1.4, 5.0, 6),
    ('E9', 53.0, 66.0, 'red', 1.5, 1.4, 5.0, 6),
    ('E10', 52.5, 80.0, 'red', 1.5, 1.4, 5.0, 6),
    ('NE2', 48.0, 99.0, 'red', 1.3, 1.4, 5.0, 6),
    ('NE3', 53.0, 92.0, 'red', 1.4, 1.4, 5.0, 6),
    ('S1', -26.5, 35.7, 'red', 1.5, 1.4, 4.0, 6),
    ('S2', 22.5, 35.5, 'red', 1.2, 1.3, 4.0, 6),
    ('S3', 31.0, 35.5, 'red', 1.2, 1.3, 4.0, 6),
]
parts = []   # every outside tree's puffs and trunk, for their shadows on the floor (outskirts.py)
# (named WOOD_, not TREE_: nobody walks behind them, so they need not fade, and they merge with the rest when drawn)
for name, X, Y, pal, sxy, sz, bottom, lean in OUTSIDE:
    root = bpy.data.objects.new(f'WOOD_{name}', None)
    bpy.context.scene.collection.objects.link(root)
    tilt = math.radians(lean)
    top = Vector((X + math.sin(tilt) * bottom, Y, bottom))   # where the trunk meets the canopy
    tr = trunk29.copy(); tr.data = trunk29.data
    bpy.context.scene.collection.objects.link(tr)
    tr.name = f'WOOD_{name}_trunk'
    tr.parent = root
    length = bottom + 0.6
    tr.matrix_world = (Matrix.Translation((X + math.sin(tilt) * length / 2, Y, length / 2 * math.cos(tilt)))
                       @ Matrix.Rotation(tilt, 4, 'Y')
                       @ Matrix.Diagonal((1.25, 1.25, length / 4.0, 1.0)))
    parts.append({'kind': 'trunk', 'from': [X, Y, 0.0], 'to': [top.x, top.y, top.z], 'r': 0.45})
    for o in leaves:
        c = o.copy(); c.data = o.data
        bpy.context.scene.collection.objects.link(c)
        c.name = f'WOOD_{name}_{o.name[7:]}'
        c.parent = root
        off = o.matrix_world.translation - Vector((centre.x, centre.y, canopy_bottom))
        p = top + Vector((off.x * sxy, off.y * sxy, off.z * sz))
        c.matrix_world = Matrix.Translation(p) @ Matrix.Diagonal((sxy, sxy, sz, 1.0)) @ o.matrix_world.to_3x3().to_4x4()
        c.material_slots[0].link = 'OBJECT'
        c.material_slots[0].material = PALETTES[pal][tone(Vector((off.x, off.y, off.z)))]
        radius = max(o.dimensions) / 2
        parts.append({'kind': 'puff', 'at': [p.x, p.y, p.z], 'r': [radius * sxy, radius * sz]})
# each outside tree's puffs as one mesh per tone (69 separate puffs a tree made the plaza slow to load and to batch)
for name, *_ in OUTSIDE:
    root = bpy.data.objects[f'WOOD_{name}']
    for mat in {c.material_slots[0].material for c in root.children if c.material_slots}:
        group = [c for c in root.children if c.type == 'MESH' and c.material_slots and c.material_slots[0].material == mat
                 and not c.name.endswith('_trunk')]
        if len(group) < 2:
            continue
        for c in group:
            c.data = c.data.copy()           # its own mesh, so joining leaves the round tree's puffs as they are
            c.data.materials.clear(); c.data.materials.append(mat)
            c.material_slots[0].link = 'DATA'
        bpy.ops.object.select_all(action='DESELECT')
        for c in group:
            c.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        group[0].name = f'WOOD_{name}_{mat.name}'
        dec = group[0].modifiers.new('fewer', 'DECIMATE'); dec.ratio = 0.25   # out there, unlit and seen from afar: a lighter mesh draws nearly the same
# the stump past the west fence (the video, 2:05: a short purple trunk, cut)
st = trunk29.copy(); st.data = trunk29.data
bpy.context.scene.collection.objects.link(st)
st.name = 'WOOD_stump'
st.matrix_world = Matrix.Translation((-38.05, 76.2, 0.55)) @ Matrix.Rotation(math.radians(-8), 4, 'Y') @ Matrix.Diagonal((1.5, 1.5, 1.1 / 4.0, 1.0))
parts.append({'kind': 'trunk', 'from': [-38.05, 76.2, 0.0], 'to': [-38.2, 76.2, 1.1], 'r': 0.5})
# The north building, above environ2's frame (we had only guessed it: two beige blocks). The video (2:38.5, HQ) shows two
# shopfronts on the terrace: purple brick (#9a7fad, lighter courses) from a dark pilaster to beside the doors, white wall either
# side, up to 8.0 units;
# above that the roof's coral band (#fc825b) to the top, a dark eave behind it. Flat as the video shows them (unlit).
def image(name, w, h, paint):
    im = bpy.data.images.new(name, w, h)
    px = [0.0] * (w * h * 4)
    for j in range(h):
        for i in range(w):
            r, g, b = paint(i / w, j / h)
            k = 4 * (j * w + i)
            px[k:k + 4] = [r / 255, g / 255, b / 255, 1.0]
    im.pixels = px
    im.pack()
    return im


def unlit_image(name, im):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = im
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(tex.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


Z0, ZB, Z1 = 3.7, 8.0, 9.72          # terrace top, where the roof band starts, the blocks' top
def facade(u, v):
    z = Z0 + v * (Z1 - Z0)
    if z >= ZB:
        return (0xc9, 0x6a, 0x50) if z < ZB + 0.08 else (0xfc, 0x82, 0x5b)
    if u < 0.2 or u > 0.9:
        return (0xf4, 0xef, 0xe0)                                    # white wall: outer end, and beside the doors
    if u < 0.245:
        return (0x4b, 0x3b, 0x3c)                                    # the pilaster
    course = (z - Z0) / 0.55
    x = u * 10.3 / 1.1 + (0.5 if int(course) % 2 else 0.0)
    if course % 1 < 0.1 or x % 1 < 0.05:
        return (0xae, 0x95, 0xc2)                                    # mortar: the lighter lines
    return (0x9a, 0x7f, 0xad)


front = unlit_image('facade_brick', image('facade_brick', 512, 256, facade))
roof = unlit('roof_coral', '#fc825b')
eave = unlit('roof_eave', '#8a6448')
for name, outer in (('ARCH_building_west', 'min'), ('ARCH_building_east', 'max')):
    o = bpy.data.objects[name]
    me = o.data
    ws = [o.matrix_world @ v.co for v in me.vertices]
    xs = [w.x for w in ws]
    x_out, x_in = (min(xs), max(xs)) if outer == 'min' else (max(xs), min(xs))
    me.materials.append(front); me.materials.append(roof)
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    nm = o.matrix_world.to_3x3().inverted().transposed()
    for poly in me.polygons:
        n = (nm @ poly.normal).normalized()
        if n.y < -0.9:
            poly.material_index = len(me.materials) - 2
        elif n.z > 0.9:
            poly.material_index = len(me.materials) - 1
        for li in poly.loop_indices:
            w = o.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((w.x - x_out) / (x_in - x_out), (w.z - Z0) / (Z1 - Z0))
    y_front = min(w.y for w in ws)
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x_out + x_in) / 2, y_front + 0.9, Z1 + 0.04))
    e = bpy.context.active_object; e.name = name.replace('building', 'eave')
    e.scale = (abs(x_in - x_out), 0.6, 0.08)
    e.data.materials.append(eave)

# the roof band runs on over the doors, unbroken, as the video's does
bw, be = bpy.data.objects['ARCH_building_west'], bpy.data.objects['ARCH_building_east']
gx0 = max((bw.matrix_world @ v.co).x for v in bw.data.vertices)
gx1 = min((be.matrix_world @ v.co).x for v in be.data.vertices)
gy = min((bw.matrix_world @ v.co).y for v in bw.data.vertices)
bpy.ops.mesh.primitive_cube_add(size=1, location=((gx0 + gx1) / 2, gy + 4.0, (8.25 + Z1) / 2))
band = bpy.context.active_object; band.name = 'ARCH_roof_middle'
band.scale = (gx1 - gx0, 8.0, Z1 - 8.25)
band.data.materials.append(roof)

# the doors between them: white double doors with panel insets (ours were a beige block)
def doors(u, v):
    if abs(u - 0.5) < 0.012 or any(abs(u - c) < 0.33 / 2 and abs(abs(u - c) - 0.11) < 0.012 and 0.15 < v < 0.85 for c in (0.27, 0.73)) \
            or any(abs(v - t) < 0.01 and (0.16 < u < 0.38 or 0.62 < u < 0.84) for t in (0.15, 0.85)):
        return (0xd8, 0xd2, 0xc4)
    return (0xf6, 0xf3, 0xe8)


d = bpy.data.objects['ARCH_doors']
dm = d.data
dws = [d.matrix_world @ v.co for v in dm.vertices]
dx0, dx1 = min(w.x for w in dws), max(w.x for w in dws)
dz0, dz1 = min(w.z for w in dws), max(w.z for w in dws)
if not dm.uv_layers:
    dm.uv_layers.new(name='UVMap')
duv = dm.uv_layers.active.data
for poly in dm.polygons:
    for li in poly.loop_indices:
        w = d.matrix_world @ dm.vertices[dm.loops[li].vertex_index].co
        duv[li].uv = ((w.x - dx0) / (dx1 - dx0), (w.z - dz0) / (dz1 - dz0))
dm.materials.clear(); dm.materials.append(unlit_image('doors_white', image('doors_white', 128, 160, doors)))

# The banner poles: the video's stop just above a crossbar at 7.36 units (ours ran on to 14), a crossbar 3.4 units long to the
# west, and the white banner (#f4f1ea, the game's "<" and ruled lines) hangs from it down to 3.35, tied to the pole.
def banner(u, v):
    x, y = u - 0.5, v - 0.55
    if abs(abs(y) * 0.9 - (x + 0.12)) < 0.045 and -0.14 < x < 0.12 and abs(y) < 0.2:
        return (0x8a, 0x83, 0x86)                                    # the "<"
    if any(abs(v - t) < 0.012 for t in (0.25, 0.3, 0.82, 0.87)) and 0.2 < u < 0.8:
        return (0xc4, 0xc0, 0xbc)                                    # ruled lines
    return (0xf4, 0xf1, 0xea)


cloth = unlit_image('banner_cloth', image('banner_cloth', 128, 192, banner))
for side in ('BANNER_02_banner_l', 'BANNER_03_banner_r'):
    pole, rag = bpy.data.objects[side + '_pole'], bpy.data.objects[side + '_cloth']
    px, py = pole.matrix_world.translation.x, pole.matrix_world.translation.y
    for v in pole.data.vertices:
        w = pole.matrix_world @ v.co
        w.z = w.z * 8.22 / 14.0
        v.co = pole.matrix_world.inverted() @ w
    bpy.ops.mesh.primitive_cube_add(size=1, location=(px - 1.6, py, 7.36))
    bar = bpy.context.active_object; bar.name = side + '_crossbar'
    bar.scale = (3.4, 0.14, 0.14)
    bar.data.materials.append(pole.data.materials[0])
    ws = [rag.matrix_world @ v.co for v in rag.data.vertices]
    z_lo, z_hi = min(w.z for w in ws), max(w.z for w in ws)
    x_lo, x_hi = min(w.x for w in ws), max(w.x for w in ws)
    me = rag.data
    for v in me.vertices:
        w = rag.matrix_world @ v.co
        w.z = 3.35 + (w.z - z_lo) / (z_hi - z_lo) * (7.2 - 3.35)
        v.co = rag.matrix_world.inverted() @ w
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            w = rag.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((w.x - x_lo) / (x_hi - x_lo), (w.z - 3.35) / (7.2 - 3.35))
    me.materials.clear(); me.materials.append(cloth)

# the fence the video shows south-east, beyond environ2's frame: the south-west one mirrored across the plaza (collision.py
# makes it a wall, as the others)
west = [o for o in bpy.data.objects if o.name.startswith('FENCE_30_')]
east = [o for o in bpy.data.objects if o.name.startswith('FENCE_32_')]
axis = (sum(o.matrix_world.translation.x for o in west) / len(west) + sum(o.matrix_world.translation.x for o in east) / len(east)) / 2
for o in [o for o in bpy.data.objects if o.name.startswith('FENCE_31_fence_sw')]:
    c = o.copy(); c.data = o.data
    bpy.context.scene.collection.objects.link(c)
    c.name = o.name.replace('FENCE_31_fence_sw', 'FENCE_33_fence_se')
    c.parent = None
    c.matrix_world = Matrix.Translation((2 * axis, 0, 0)) @ Matrix.Scale(-1, 4, (1, 0, 0)) @ o.matrix_world
import json as _json, os as _os
open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'plants_outside.json'), 'w').write(_json.dumps(
    {'sun': list(SUN), 'parts': parts, 'leaves_at': [[X, Y] for n, X, Y, pal, *_ in OUTSIDE if pal == 'yellow']}))
print('outside trees:', len(OUTSIDE), '+ stump;', len(parts), 'parts')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_cameras=True, export_lights=False, export_apply=True,
                          export_yup=True)
print('plants: exported', OUT)
