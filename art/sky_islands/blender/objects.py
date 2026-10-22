"""The sky islands' objects (2026-10-22): built from objects.json (art/sky_islands/objects.py measures them), flat-shaded as
the HQ video draws them: each surface takes the light, mid or dark tone of its palette by how it faces the light (from the
upper left, as the video's shadows fall to the lower right). Imported by build.py.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

SUN = Vector((-0.5, 0.45, 1.0)).normalized()
rng = random.Random(9)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def paint(bm, pal, cut=(0.45, -0.1), flat=None):
    """Toon tones by facing: light / mid / dark (`flat`: one tone for all)."""
    layer = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')
    bm.normal_update()
    for f in bm.faces:
        d = f.normal.dot(SUN)
        c = lin(flat) if flat else lin(pal[0] if d > cut[0] else pal[1] if d > cut[1] else pal[2])
        for loop in f.loops:
            loop[layer] = c


def emit(name, bm, mat, parent):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat); o.parent = parent
    return o


def lathe(bm, profile, segments=20, at=Vector()):
    """A solid of revolution about z: profile [(radius, z)] bottom to top."""
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new(at + Vector((r * math.cos(2 * math.pi * k / segments),
                                                  r * math.sin(2 * math.pi * k / segments), z))) for k in range(segments)])
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return rings


def cylinder(bm, p0, p1, r0, r1=None, segments=10):
    r1 = r0 if r1 is None else r1
    axis = (p1 - p0)
    q = axis.to_track_quat('Z', 'Y').to_matrix()
    ring = lambda c, r: [bm.verts.new(c + q @ Vector((r * math.cos(2 * math.pi * k / segments),
                                                      r * math.sin(2 * math.pi * k / segments), 0))) for k in range(segments)]
    a, b = ring(p0, r0), ring(p1, r1)
    for k in range(segments):
        bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.faces.new(list(reversed(a))); bm.faces.new(b)


def sphere(bm, c, r, sz=1.0, segments=12, rings=8, cut=None):
    """A sphere (scaled `sz` in z); `cut`: keep only above that fraction of its height (-1 … 1)."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=r)
    vs = res['verts']
    for v in vs:
        v.co.z *= sz
    if cut is not None:
        for v in vs:
            v.co.z = max(v.co.z, cut * r * sz)
    bmesh.ops.translate(bm, verts=vs, vec=c)


def box(bm, c, size, angle=0.0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=res['verts'])
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(angle, 3, 'Z'), verts=res['verts'])
    bmesh.ops.translate(bm, verts=res['verts'], vec=c)


def gong(o, P, mat, root):
    w, h = o['width'], o['height']
    at = Vector((o['x'], o['y'], 0))
    bm = bmesh.new()
    for s in (-1, 1):                                           # two posts, a beam with round ends
        cylinder(bm, at + Vector((s * w * 0.4, 0, 0)), at + Vector((s * w * 0.4, 0, h - 0.4)), 0.34)
    cylinder(bm, at + Vector((-w * 0.5, 0, h - 0.5)), at + Vector((w * 0.5, 0, h - 0.5)), 0.5, segments=14)
    for s in (-1, 1):
        sphere(bm, at + Vector((s * w * 0.5, 0, h - 0.5)), 0.62)
    paint(bm, P['gong_frame'])
    emit('GONG_frame', bm, mat, root)
    bm = bmesh.new()                                            # the bell: a beehive of stacked rings, its mouth dark
    c = at + Vector((0, 0.05, h - 2.6))
    profile = [(0.0, 0.0), (1.15, 0.05), (1.3, 0.35), (1.18, 0.55), (1.22, 0.75), (1.05, 1.0), (1.08, 1.2), (0.82, 1.45),
               (0.84, 1.6), (0.45, 1.85), (0.0, 1.95)]
    lathe(bm, profile, 24, c)
    paint(bm, P['gong_bell'], cut=(0.8, -0.3))
    emit('GONG_bell', bm, mat, root)
    bm = bmesh.new()
    for s in (-1, 1):                                           # its cords
        cylinder(bm, at + Vector((s * 0.55, 0.05, h - 0.8)), c + Vector((s * 0.45, 0, 1.75)), 0.05, segments=5)
    paint(bm, None, flat='#8a6a3a')
    emit('GONG_cords', bm, mat, root)
    bm = bmesh.new()
    sphere(bm, c + Vector((0, -1.18, 0.35)), 0.2, sz=0.6)        # the dark hole on its front
    paint(bm, None, flat='#3b3220')
    emit('GONG_mouth', bm, mat, root)


def maple(o, P, mat, root, k):
    """A red maple as the video's: a slate trunk leaning up into branches, each ending in a flat umbrella cap of leaves
    with a scalloped hanging fringe, the caps in tiers from about half its height to its top."""
    w, h, z0 = o['width'], o['height'], o['z']
    base = Vector((o['x'], o['y'], z0))
    lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.1, 0.1), 0)) * w
    # caps in tiers up the trunk, alternating sides (the video's: four or five, a third of the tree's width each)
    tiers = [0.42, 0.56, 0.7, 0.84, 1.0]
    caps = []
    for j, t in enumerate(tiers):
        side = -1 if j % 2 == 0 else 1
        caps.append((lean * t + Vector((side * w * rng.uniform(0.18, 0.3), rng.uniform(-0.12, 0.12) * w, 0)), t))
    caps[-1] = (lean, 1.0)
    bm = bmesh.new()
    cylinder(bm, base, base + lean + Vector((0, 0, h * 0.95)), 0.36, 0.2, 8)
    tips = []
    for off, t in caps:
        tip = base + off + Vector((0, 0, h * t - w * 0.1))
        cylinder(bm, base + lean * t + Vector((0, 0, h * t * 0.8)), tip, 0.18, 0.1, 6); tips.append(tip)
    paint(bm, P['trunk'])
    emit(f'MAPLE_{k}_trunk', bm, mat, root)
    bm = bmesh.new()
    for j, tip in enumerate(tips):
        r = w * rng.uniform(0.2, 0.25)
        res = bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=8, radius=r)
        teeth = {}
        for v in res['verts']:
            v.co.z = max(v.co.z * 0.32, -0.05 * r)               # a flat umbrella
            if v.co.z <= -0.05 * r + 1e-4:                       # its ragged fringe of leaves hanging down
                a = round(math.atan2(v.co.y, v.co.x), 4)
                teeth.setdefault(a, rng.uniform(0.25, 0.6))
                v.co.z -= r * teeth[a]
                v.co.x *= 1.05; v.co.y *= 1.05
            v.co += tip + Vector((0, 0, 0.05))
    paint(bm, P['maple'], cut=(0.6, 0.05))
    emit(f'MAPLE_{k}_canopy', bm, mat, root)
    if z0 == 0:                                                # leaves fallen round its foot
        bm = bmesh.new()
        for _ in range(10):
            a = rng.uniform(0, 2 * math.pi); d = rng.uniform(0.4, w * 0.4)
            sphere(bm, base + Vector((math.cos(a) * d, math.sin(a) * d - 0.4, 0.02)), 0.15, sz=0.15, segments=8, rings=4)
        paint(bm, None, flat=P['maple'][2])
        emit(f'MAPLE_{k}_leaves', bm, mat, root)


def hexplant(o, P, mat, root, k):
    w = o['width']
    hp = 0.6 * w                                               # its stems as long as the cluster is wide, nearly
    at = Vector((o['x'], o['y'], 0))
    R = w / 8.5                                                # a plate's radius (the close-up: ~5 plates across)
    bm = bmesh.new(); stems = bmesh.new(); dots = bmesh.new()
    plates = []
    for q in range(-5, 6):
        for r in range(-5, 6):
            x = R * math.sqrt(3) * (q + r / 2); y = R * 1.5 * r
            if x * x + y * y <= (w / 2 - R * 0.3) ** 2:
                plates.append((x, y))
    for i, (x, y) in enumerate(plates):
        z = hp + rng.uniform(-0.12, 0.12)
        c = at + Vector((x, y, z))
        ring = [bm.verts.new(c + Vector((R * 0.97 * math.cos(math.pi / 6 + j * math.pi / 3),
                                         R * 0.97 * math.sin(math.pi / 6 + j * math.pi / 3), 0))) for j in range(6)]
        mid = bm.verts.new(c + Vector((0, 0, 0.02)))
        for j in range(6):
            bm.faces.new((mid, ring[j], ring[(j + 1) % 6]))
        if i % 2 == 0 or y < -w * 0.2:
            cylinder(stems, c + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), -0.05)),
                     at + Vector((x * 1.05, y * 1.05, 0.0)), 0.05, 0.04, 5)
        if rng.random() < 0.35:
            sphere(dots, c + Vector((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 0.05)), 0.08, sz=0.5, segments=6, rings=3)
    # plates: light at their middles, their mid tone at the rim
    layer = bm.loops.layers.float_color.new('Col')
    for f in bm.faces:
        for loop in f.loops:
            centre = loop.vert.co.z > max(v.co.z for v in f.verts) - 1e-4 and len(loop.vert.link_faces) == 6
            loop[layer] = lin(P['hexplant'][0] if centre else P['hexplant'][1])
    emit(f'HEXPLANT_{k}_plates', bm, mat, root)
    paint(stems, None, flat=P['hexplant'][2]); emit(f'HEXPLANT_{k}_stems', stems, mat, root)
    paint(dots, None, flat='#f4d98c'); emit(f'HEXPLANT_{k}_dots', dots, mat, root)


def pot(o, P, mat, root, k):
    w, h = o['width'], o['height']
    at = Vector((o['x'], o['y'], 0))
    r = w / 2
    bm = bmesh.new()
    lathe(bm, [(r * 0.55, 0.0), (r * 0.85, h * 0.22), (r, h * 0.48), (r * 0.82, h * 0.75), (r * 0.55, h * 0.88),
               (r * 0.62, h * 0.97), (r * 0.6, h)], 18, at)
    for s in (-1, 1):                                          # its two handles
        sphere(bm, at + Vector((s * r * 0.85, 0, h * 0.78)), r * 0.22, segments=8, rings=5)
    paint(bm, P['pot'])
    emit(f'POT_{k}', bm, mat, root)
    bm = bmesh.new()
    lathe(bm, [(r * 0.5, h - 0.01), (0.0, h - 0.005)], 18, at)  # the dark mouth
    paint(bm, None, flat=P['pot'][2]); emit(f'POT_{k}_mouth', bm, mat, root)


def crate(o, P, mat, root, k):
    w = o['width']
    at = Vector((o['x'], o['y'], w / 2))
    a = rng.uniform(-0.35, 0.35)
    bm = bmesh.new(); box(bm, at, (w, w, w), a); paint(bm, P['crate']); emit(f'CRATE_{k}', bm, mat, root)
    bm = bmesh.new()                                           # its panels: each face's darker inset
    for n in (Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))):
        n = Matrix.Rotation(a, 3, 'Z') @ n
        size = (w * 0.74 if abs(n.x) < 0.9 else 0.02, w * 0.74 if abs(n.y) < 0.9 else 0.02, w * 0.74 if abs(n.z) < 0.9 else 0.02)
        box(bm, at + n * (w / 2 + 0.005), (size[0], size[1], size[2]) if abs(a) < 1e-6 else size, 0.0)
    paint(bm, P['crate'], cut=(0.6, 0.1))
    for f in bm.faces:
        for loop in f.loops:
            loop[bm.loops.layers.float_color['Col']] = [x * 0.85 for x in loop[bm.loops.layers.float_color['Col']][:3]] + [1]
    emit(f'CRATE_{k}_panels', bm, mat, root)


def aloe(o, P, mat, root, k):
    w, h = o['width'], o['height']
    at = Vector((o['x'], o['y'], 0))
    ph = h * 0.35
    bm = bmesh.new(); lathe(bm, [(w * 0.3, 0), (w * 0.38, ph * 0.8), (w * 0.4, ph)], 14, at)
    paint(bm, P['aloe_pot']); emit(f'ALOE_{k}_pot', bm, mat, root)
    bm = bmesh.new()
    for j in range(8):                                         # its leaves: long blades out and up from the pot
        a = j * 2 * math.pi / 8 + rng.uniform(-0.2, 0.2)
        tilt = rng.uniform(0.35, 0.8)
        tip = at + Vector((math.cos(a) * w * 0.55 * tilt, math.sin(a) * w * 0.55 * tilt, ph + (h - ph) * (1.1 - tilt * 0.5)))
        cylinder(bm, at + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, ph)), tip, w * 0.11, 0.0, 4)
    paint(bm, P['aloe']); emit(f'ALOE_{k}_leaves', bm, mat, root)


def bamboo(o, P, mat, root, k):
    w, h = o['width'], o['height']
    at = Vector((o['x'], o['y'], 0))
    r = w / 2
    bm = bmesh.new(); nodes = bmesh.new(); leaves = bmesh.new()
    seg = 0.95
    n = max(2, round(h / seg))
    for j in range(n):
        z0, z1 = j * h / n, (j + 1) * h / n
        cylinder(bm, at + Vector((0, 0, z0)), at + Vector((0, 0, z1 - 0.06)), r, r, 10)
        cylinder(nodes, at + Vector((0, 0, z1 - 0.08)), at + Vector((0, 0, z1 + 0.02)), r * 1.12, r * 1.12, 10)
        if j in (n // 2, n - 2):                               # a spray of leaves at two of its nodes
            for q in range(4):
                a = rng.uniform(0, 2 * math.pi)
                tip = at + Vector((math.cos(a) * 1.1, math.sin(a) * 1.1, z1 + 0.35))
                cylinder(leaves, at + Vector((0, 0, z1)), tip, 0.12, 0.0, 3)
    paint(bm, P['bamboo']); emit(f'BAMBOO_{k}', bm, mat, root)
    paint(nodes, P['bamboo'], cut=(0.9, 0.5)); emit(f'BAMBOO_{k}_nodes', nodes, mat, root)
    paint(leaves, P['bamboo'], cut=(0.3, -0.3)); emit(f'BAMBOO_{k}_leaves', leaves, mat, root)


def tuft(o, P, mat, root, k):
    w = o['width']
    at = Vector((o['x'], o['y'], 0))
    bm = bmesh.new()
    for j in range(5):                                         # five blades fanned left to right
        x = (j - 2) / 2 * w * 0.4
        tip = at + Vector((x * 1.4, rng.uniform(-0.05, 0.05), w * 0.42 * (1 - abs(j - 2) * 0.18)))
        cylinder(bm, at + Vector((x, 0, 0)), tip, 0.07, 0.0, 3)
    paint(bm, P['tuft']); emit(f'TUFT_{k}', bm, mat, root)


def tile(o, P, mat, root, k, image):
    """A spiral tile: a hexagonal plaque on a stone block's face, turned to the camera."""
    w = o['width']
    at = Vector((o['x'], o['y'] - 0.15, 2.5 / 2 + o['z']))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rot = Matrix.Rotation(math.radians(-45), 3, 'X')            # tipped back to face the camera, as the video shows it
    ring = [bm.verts.new(at + rot @ Vector((w / 2 * math.cos(math.pi / 6 + j * math.pi / 3), 0,
                                             w / 2 * math.sin(math.pi / 6 + j * math.pi / 3)))) for j in range(6)]
    mid = bm.verts.new(at)
    for j in range(6):
        f = bm.faces.new((mid, ring[(j + 1) % 6], ring[j]))
        for loop in f.loops:
            d = loop.vert.co - at
            d = rot.inverted() @ d
            loop[uvl].uv = (0.5 + d.x / w, 0.5 + d.z / w)
    me = bpy.data.meshes.new(f'TILE_{k}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(f'TILE_{k}', me); bpy.context.scene.collection.objects.link(ob); ob.parent = root
    m = bpy.data.materials.new(f'tile_{k}'); m.use_nodes = True; nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != 'OUTPUT_MATERIAL': nt.nodes.remove(nd)
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(tex.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs[0], next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
    me.materials.append(m)


def tile_image(name, P, N=128):
    """The plaque: a dark hexagonal rim, its colour inside, a spiral of its light colour (drawn, not traced)."""
    im = bpy.data.images.new(name, N, N)
    rim, face, line = [int(P[2][i:i + 2], 16) / 255 for i in (1, 3, 5)], [int(P[1][i:i + 2], 16) / 255 for i in (1, 3, 5)], \
        [int(P[0][i:i + 2], 16) / 255 for i in (1, 3, 5)]
    px = []
    for j in range(N):
        for i in range(N):
            x, y = (i + 0.5) / N * 2 - 1, (j + 0.5) / N * 2 - 1
            hexd = max(abs(y) * 2 / math.sqrt(3), abs(y) / math.sqrt(3) + abs(x)) if False else \
                max(abs(x) * 2 / math.sqrt(3), abs(x) / math.sqrt(3) + abs(y))
            r, a = math.hypot(x, y), math.atan2(y, x)
            spiral = abs(((r * 2.2 - a / math.pi) % 1.0) - 0.5) < 0.16 and r < 0.6
            c = rim if hexd > 0.78 else (line if spiral else face)
            px += c + [1.0]
    im.pixels = px; im.pack()
    return im
