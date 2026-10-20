"""Stub hands for the pack characters that have none (owner, 2026-10-19): Bread, Coffee, Icecream and Carrot get the same hands
as Avocado, Bacon, Banana, Donut, Milk and Watermelon. Used by bake_chars.py and bake_portraits.py right after a model is loaded.

Measured on the six pack characters that have them (licensed/*.blend):
 * shape: the pack's own hand, a rounded cube (98 vertices); copied here from Milk's right hand, so it is the identical shape;
 * size: 0.30-0.50 model units as drawn (each model times its CSCALE), median 0.40; every new hand is 0.40 as drawn;
 * place: on each side, its centre on the body's outline at about a fifth of the body's height (0.15-0.29 measured), a little
   in front of the body's middle;
 * colour: as game-setting.mp4 shows them (owner, 2026-10-20: the video's colours everywhere): its character-select circles show
   these four WITH hands, Bread dark brown, Coffee light grey, Icecream teal, Carrot rust (median of each hand on a resting frame).
   HAND holds that colour; the flat material is set RENDER_GAIN darker, since this light draws a flat colour ~1.2x brighter.
The hands are a second material on the same mesh (a flat colour, no texture), so they turn, tilt and shade with the body."""
import bmesh, bpy, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HAND_SIZE = 0.40                   # as drawn (model units x CSCALE)
HEIGHT = 0.20                      # hand centre, as a fraction of the body's height above its bottom
FORWARD = 0.25                     # hand centre, as a fraction of the body's half-depth in front of its middle
EMBED = 0.25                       # how much of a hand's width sinks into the body (Milk's hands just touch it; Bacon's are half in)
# the hand colour as rendered (sRGB), as the video shows it
HAND = {'bread': (123, 106, 70), 'coffee': (185, 185, 167), 'icecream': (84, 192, 184), 'carrot': (196, 106, 71)}
RENDER_GAIN = 1.2
NEEDS_HANDS = tuple(HAND)

_shape = None


def _hand_shape(lic):
    """Milk's right hand (the pack's rounded cube): vertices centred and scaled to a 1-unit cube, and its faces."""
    global _shape
    if _shape is not None:
        return _shape
    with bpy.data.libraries.load(os.path.join(lic, 'milk', 'milk.blend'), link=False) as (src, dst):
        dst.objects = ['milk']
    milk = dst.objects[0]; me = milk.data
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    start = min(bm.verts, key=lambda v: (v.co - Vector((1.012, -0.157, -1.201))).length)
    seen, stack = {start.index}, [start]
    while stack:
        v = stack.pop()
        for e in v.link_edges:
            w = e.other_vert(v)
            if w.index not in seen:
                seen.add(w.index); stack.append(w)
    verts = [bm.verts[i].co.copy() for i in sorted(seen)]
    lo = Vector([min(p[i] for p in verts) for i in range(3)]); hi = Vector([max(p[i] for p in verts) for i in range(3)])
    ctr, size = (lo + hi) / 2, max(hi - lo)
    order = {i: k for k, i in enumerate(sorted(seen))}
    faces = [[order[v.index] for v in f.verts] for f in bm.faces if all(v.index in seen for v in f.verts)]
    bm.free(); bpy.data.objects.remove(milk); bpy.data.meshes.remove(me)
    assert len(verts) == 98, f'expected the pack hand (98 vertices), got {len(verts)}'
    _shape = ([(p - ctr) / size for p in verts], faces)
    return _shape


def _srgb_to_linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hand_colour(name):
    """The hand's material colour (linear RGB): its rendered target, RENDER_GAIN darker."""
    return tuple(_srgb_to_linear(c) / RENDER_GAIN for c in HAND[name])


def add_hands(mesh, name, lic, draw_scale=1.0):
    """Adds two stub hands to `mesh` (a pack model just linked into the scene, standing as loaded: up +Z, facing -Y in the world).
    `draw_scale` is the model's CSCALE, so the hands come out HAND_SIZE as drawn. No-op for characters that already have hands."""
    if name not in NEEDS_HANDS:
        return
    verts, faces = _hand_shape(lic)
    bpy.context.view_layer.update()
    to_world = mesh.matrix_world.copy(); to_local = to_world.inverted()
    # the body: the largest connected part (the face and other decals are separate thin parts in front of it)
    bm = bmesh.new(); bm.from_mesh(mesh.data); bm.transform(to_world); bm.faces.ensure_lookup_table()
    seen, parts = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        group, stack = [], [f]; seen.add(f.index)
        while stack:
            g = stack.pop(); group.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        parts.append(group)
    body = max(parts, key=lambda g: sum(f.calc_area() for f in g))
    pts = [v.co.copy() for f in body for v in f.verts]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    tree = BVHTree.FromPolygons([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in body])
    bm.free()
    size = HAND_SIZE / draw_scale
    z = lo.z + HEIGHT * (hi.z - lo.z)
    y = (lo.y + hi.y) / 2 - FORWARD * (hi.y - lo.y) / 2          # in front: the pack faces -Y
    cx = (lo.x + hi.x) / 2
    mat = bpy.data.materials.new(f'hands_{name}'); mat.use_nodes = True
    bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*hand_colour(name), 1.0)
    bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Specular IOR Level'].default_value = 0.0
    mesh.data.materials.append(mat); slot = len(mesh.data.materials) - 1
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    for side in (1, -1):
        # the body's outline on this side at the hand's height: cast in from outside
        start = Vector((cx + side * (hi.x - lo.x), y, z))
        hit = tree.ray_cast(start, Vector((-side, 0, 0)))[0]
        edge = hit.x if hit is not None else (hi.x if side > 0 else lo.x)
        centre = Vector((edge + side * size * (0.5 - EMBED), y, z))
        new = [bm.verts.new(to_local @ (centre + p * size)) for p in verts]
        for f in faces:
            face = bm.faces.new([new[i] for i in f]); face.material_index = slot; face.smooth = True
    bm.normal_update(); bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
