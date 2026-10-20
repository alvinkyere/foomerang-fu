"""The faces the pack does not have (owner, 2026-10-20: the character-select animations exactly as game-setting.mp4): a BLINK and
the HAPPY face of the ready cheer, made for every character as flat stickers in its own face's plane, like the pack's eyes.

Seen in the video (zoomed resting and cheering frames of Banana, Watermelon, Donut, Coffee):
 * blink: both eyes shut to a short black dash, ~the eye's width, for 2-3 frames;
 * happy: both eyes become thick black arcs bowed upwards (smiling eyes), ~the eye's width; the mouth an open black smile, flat
   on top and round below, with a red tongue in its lower part (Coffee keeps a row of white teeth along the top).
The pack's own face (eyes, their white highlights, the mouth) is separated from the body into FACE['normal']; the two new faces
are built beside it. Rig.pose moves all three with the body; one is shown at a time."""
import bmesh, bpy, math
import numpy as np
from mathutils import Vector, Matrix

BLACK = (14, 14, 14)
TONGUE = (231, 53, 52)
WHITE = (250, 250, 250)


def _lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _flat(name, rgb):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True
        bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bs.inputs['Base Color'].default_value = (*[_lin(v) for v in rgb], 1.0)
        bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Specular IOR Level'].default_value = 0.0
    return m


def _islands(mesh):
    """Each connected part of `mesh`: its vertex indices, world points, and mean texture colour (0-255)."""
    mw = mesh.matrix_world
    mat = mesh.data.materials[0]
    tex = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'diffuse' in n.image.name.lower()), None) \
        or next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    W, H = tex.size; px = np.array(tex.pixels[:]).reshape(H, W, 4)
    bm = bmesh.new(); bm.from_mesh(mesh.data); uv = bm.loops.layers.uv.active; bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen: continue
        stack, faces = [f], []; seen.add(f.index)
        while stack:
            x = stack.pop(); faces.append(x)
            for e in x.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        verts = sorted({v.index for g in faces for v in g.verts})
        pts = np.array([tuple(mw @ bm.verts[i].co) for i in verts])
        cols = [px[min(H - 1, int((l[uv].uv[1] % 1) * H)), min(W - 1, int((l[uv].uv[0] % 1) * W)), :3] for g in faces for l in g.loops] if uv else [[0.5] * 3]
        out.append(dict(verts=verts, pts=pts, c=pts.mean(0), span=np.ptp(pts, 0), col=np.mean(cols, 0) * 255, n=len(verts)))
    bm.free()
    return out


def _plane(pts):
    """Centre and orthonormal axes (right, up, normal towards the camera at -Y) of a flat point set."""
    c = pts.mean(0); w, v = np.linalg.eigh(np.cov((pts - c).T)); n = v[:, 0]
    if n[1] > 0: n = -n
    up = np.array([0, 0, 1.0]) - n * n[2]; up /= np.linalg.norm(up); right = np.cross(up, n)
    if right[0] < 0: right = -right
    return c, right, up, n


def find_face(mesh):
    """The pack's face parts: the two eyes (dark discs, a mirrored pair), their white highlights, and the mouth parts."""
    parts = _islands(mesh)
    lum = lambda p: p['col'].mean()
    height = np.ptp(np.concatenate([p['pts'] for p in parts])[:, 2])
    dark = [p for p in parts if lum(p) < 70 and p['n'] < 2000 and min(p['span']) < 0.08 * height]   # Avocado's eyes bulge a little
    best = None
    for a in dark:
        for b in dark:
            if a is b or a['c'][0] >= 0 or b['c'][0] <= 0: continue
            if abs(a['c'][2] - b['c'][2]) > 0.05 * height or abs(a['c'][0] + b['c'][0]) > 0.1 * height: continue
            size = min(max(a['span']), max(b['span']))
            if best is None or size > best[0]: best = (size, a, b)
    _, eL, eR = best
    eye_r = (max(eL['span'][0], eL['span'][2]) + max(eR['span'][0], eR['span'][2])) / 4
    highlights = [p for p in parts if lum(p) > 200 and p['n'] < 200
                  and min(np.linalg.norm(p['c'] - e['c']) for e in (eL, eR)) < 1.2 * eye_r]
    sep = eR['c'][0] - eL['c'][0]; ez = (eL['c'][2] + eR['c'][2]) / 2; front = min(eL['c'][1], eR['c'][1])
    mouth = [p for p in parts if p is not eL and p is not eR and p not in highlights and p['n'] < 2000
             and abs(p['c'][0]) < 0.42 * sep and ez - 2.4 * eye_r < p['c'][2] < ez - 0.25 * eye_r
             and p['c'][1] < front + 0.15 * height and max(p['span']) < 0.9 * sep]
    return dict(eyes=(eL, eR), eye_r=eye_r, highlights=highlights, mouth=mouth)


def _sticker(name, shapes, plane, lift, surface):
    """A mesh from 2D polygons [(points[(x, y)], material)] drawn in `plane` (centre, right, up, normal) and laid onto the body:
    each polygon is cut into small triangles in 2D, then every point is moved along the face's normal onto `surface` (a BVH of
    the body) and `lift` in front of it, so the sticker hugs a rounded face (Avocado's pit, Donut, Carrot, Coffee's mug) as the
    pack's own do."""
    c, right, up, n = plane
    nv = Vector(n)
    me = bpy.data.meshes.new(name); bm = bmesh.new(); mats = []
    for pts2, mat in shapes:
        if mat.name not in [m.name for m in mats]: mats.append(mat)
        sub = bmesh.new()
        vs = [sub.verts.new((x, y, 0.0)) for x, y in _dense(pts2)]
        sub.faces.new(vs)
        bmesh.ops.triangulate(sub, faces=sub.faces[:])
        size = max(max(p[0] for p in pts2) - min(p[0] for p in pts2), max(p[1] for p in pts2) - min(p[1] for p in pts2))
        for _ in range(3):         # small triangles: edges longer than ~a twelfth of the shape are halved
            long = [e for e in sub.edges if e.calc_length() > size / 12]
            if not long: break
            bmesh.ops.subdivide_edges(sub, edges=long, cuts=1, use_grid_fill=False)
            bmesh.ops.triangulate(sub, faces=sub.faces[:])
        mi = [m.name for m in mats].index(mat.name); vmap = {}
        for v in sub.verts:
            p = Vector(c + right * v.co.x + up * v.co.y)
            hit = surface.ray_cast(p + nv * 5.0, -nv)[0]
            vmap[v.index] = bm.verts.new((hit if hit is not None else p) + nv * lift)
        sub.verts.index_update()
        for f in sub.faces:
            nf = bm.faces.new([vmap[v.index] for v in f.verts]); nf.material_index = mi
        sub.free()
    bm.normal_update(); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob


def _dense(pts2, step=None):
    """The outline with extra points along long edges, so a sticker laid on a rounded face bends with it."""
    out = []
    L = max(math.dist(pts2[i], pts2[(i + 1) % len(pts2)]) for i in range(len(pts2)))
    step = step or L / 3 if L > 0 else 1
    for i, a in enumerate(pts2):
        b = pts2[(i + 1) % len(pts2)]; k = max(1, int(math.dist(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k) for t in range(k)]
    return out


def _arc(r, w, a0, a1, n=24):
    """A thick arc (stroke width w) of radius r from angle a0 to a1, with round ends, as one polygon."""
    outer = [(math.cos(a) * (r + w / 2), math.sin(a) * (r + w / 2)) for a in np.linspace(a0, a1, n)]
    inner = [(math.cos(a) * (r - w / 2), math.sin(a) * (r - w / 2)) for a in np.linspace(a1, a0, n)]
    cap = lambda a, s: [(math.cos(a) * r + math.cos(t) * w / 2, math.sin(a) * r + math.sin(t) * w / 2) for t in np.linspace(a + s * 0, a + s * math.pi, 8)[1:-1]]
    return outer + cap(a1, 1) + inner + cap(a0, -1)


def _bar(cx, cy, w, h, n=8):
    """A bar with round ends (a stadium), centred at (cx, cy)."""
    r = h / 2; pts = []
    for t in np.linspace(-math.pi / 2, math.pi / 2, n): pts.append((cx + w / 2 - r + math.cos(t) * r, cy + math.sin(t) * r))
    for t in np.linspace(math.pi / 2, 3 * math.pi / 2, n): pts.append((cx - w / 2 + r + math.cos(t) * r, cy + math.sin(t) * r))
    return pts


def _smile(cx, cy, w, h, n=24):
    """The open smile: flat on top, round below (a half ellipse hanging from its top edge at cy)."""
    return [(cx + math.cos(t) * w / 2, cy - math.sin(t) * h) for t in np.linspace(0, math.pi, n)]


def _separate(mesh, idx, name):
    """Moves the vertices `idx` of `mesh` into their own object (Blender's separate: textures and UVs kept)."""
    me = mesh.data
    for f in me.polygons: f.select = False
    for e in me.edges: e.select = False
    for v in me.vertices: v.select = v.index in idx
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='VERT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    ob = next(o for o in bpy.data.objects if o not in before); ob.name = name
    return ob


def build_faces(mesh, name):
    """Takes the pack's face out of `mesh` and makes the new ones. Returns the face objects by part, and which are shown for each
    expression: FACES[expression] = names of the objects shown ('normal', 'blink', 'happy')."""
    face = find_face(mesh)
    eL, eR = face['eyes']; r = face['eye_r']
    plane = _plane(np.concatenate([eL['pts'], eR['pts']]))
    c, right, up, n = plane
    to2 = lambda p: (float(np.dot(p - c, right)), float(np.dot(p - c, up)))
    from mathutils.bvhtree import BVHTree
    mw = mesh.matrix_world
    face_idx = set(i for p in (eL, eR, *face['highlights'], *face['mouth']) for i in p['verts'])
    # nor on the stub hands and feet (98 vertices; Avocado's 218): an eye near the body's edge must not land on a hand
    face_idx |= set(i for p in _islands(mesh) if p['n'] in (98, 218) for i in p['verts'])
    me = mesh.data
    surface = BVHTree.FromPolygons([mw @ v.co for v in me.vertices],
                                   [list(p.vertices) for p in me.polygons if not (set(p.vertices) & face_idx)])
    black, tongue, white = _flat('face_black', BLACK), _flat('face_tongue', TONGUE), _flat('face_white', WHITE)
    eyes2 = [to2(e['c']) for e in (eL, eR)]
    sep = eyes2[1][0] - eyes2[0][0]
    lift = 0.01 * sep                                    # in front of the body, as the pack's stickers are
    objs = {}
    # blink: a dash across each eye, a little below its middle
    objs['blink_eyes'] = _sticker(f'{name}_blink_eyes', [(_bar(x, y - 0.1 * r, 1.8 * r, 0.34 * r), black) for x, y in eyes2], plane, lift, surface)
    # happy eyes: arcs bowed upwards over each eye's middle
    arcs = [([(x + px, y - 0.15 * r + py) for px, py in _arc(0.72 * r, 0.36 * r, math.radians(15), math.radians(165))], black) for x, y in eyes2]
    # the open smile: as wide as the pack's mouth (within 0.38-0.62 of the eye spacing), its top where the pack's mouth begins
    if face['mouth']:
        m2 = np.array([to2(p) for p in np.concatenate([m['pts'] for m in face['mouth']])])
        mx, mtop, mw = float((m2[:, 0].min() + m2[:, 0].max()) / 2), float(m2[:, 1].max()), float(np.ptp(m2[:, 0]))
    else:
        mx, mtop, mw = (eyes2[0][0] + eyes2[1][0]) / 2, eyes2[0][1] - 0.9 * r, 0.5 * sep
    w = float(np.clip(mw * 1.05, 0.38 * sep, 0.62 * sep)); h = 0.62 * w
    top = min(mtop, (eyes2[0][1] + eyes2[1][1]) / 2 - 0.75 * r)
    objs['happy'] = _sticker(f'{name}_happy', arcs + [(_smile(mx, top, w, h), black)], plane, lift, surface)
    detail = [(_smile(mx, top - 0.52 * h, 0.56 * w, 0.42 * h), tongue)]
    if name == 'coffee':
        detail.append((_bar(mx, top - 0.13 * h, 0.82 * w, 0.2 * h), white))
    objs['happy_detail'] = _sticker(f'{name}_happy_detail', detail, plane, 2 * lift, surface)
    # the pack's own eyes (with their highlights) and mouth, out of the body so each can be hidden
    objs['eyes'] = _separate(mesh, set(i for p in (eL, eR, *face['highlights']) for i in p['verts']), f'{name}_eyes')
    if face['mouth']:
        mouth_pts = np.concatenate([m['pts'] for m in face['mouth']])
        # vertex indices changed after the first separate: find the mouth again by position
        left = _islands(mesh)
        idx = set(i for p in left for i in p['verts'] if any(np.allclose(p['c'], m['c'], atol=1e-4) for m in face['mouth']))
        objs['mouth'] = _separate(mesh, idx, f'{name}_mouth') if idx else None
    shows = {'normal': ['eyes', 'mouth'], 'blink': ['blink_eyes', 'mouth'], 'happy': ['happy', 'happy_detail']}
    return {k: v for k, v in objs.items() if v is not None}, shows
