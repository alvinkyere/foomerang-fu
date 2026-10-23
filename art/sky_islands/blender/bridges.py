"""The gong islands' bridges in 3D (2026-10-23), built by build.py. Lit (the game's soft light shades them).

As the HQ videos show them (foomerang-fu physics hq.mp4 9:41.6, 9:15.5):
  planks   rows across the way, each of two planks of different lengths (staggered like bricks), thick, their edges rounded,
           purple-brown (#906d90); their cut ends tan along both sides; two twisted rope pairs lie along the way on top
  logs     hollow logs side by side, each lying across the way, a ring at its middle, its ends tan rings round a dark hollow
           (#675776); two twisted ropes bind them along the way
And the owner's barriers (2026-10-23: "3D with actual barriers"): wooden posts at each long side, a sagging rope rail between
them, one at the top and one half-way down (the rules' fences: a body cannot cross a rail, a boomerang flies over).
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

WOOD, WOOD_SEAM, TAN, HOLLOW, ROPE, POST = '#906d90', '#5f465f', '#c0a184', '#675776', '#b8987c', '#6f526e'
DECK = 0.1                 # the deck's top, units above the grass (it rests on the islands' rims and the stone landings)
POST_H = 1.05              # a post's height above the deck
RAIL_H = 0.85              # the rail's height at a post
SAG = 0.14                 # how far the rail sags between posts


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


_mats = {}


def mat(hex_colour):
    if hex_colour not in _mats:
        m = bpy.data.materials.new(f'bridge_{hex_colour[1:]}'); m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = lin(hex_colour)
        bsdf.inputs['Roughness'].default_value = 1.0
        _mats[hex_colour] = m
    return _mats[hex_colour]


def frame(B):
    c = [Vector((x, y, 0)) for x, y in B['corners']]
    origin = sum(c, Vector()) / 4
    a = math.radians(B['along'])
    u = Vector((math.cos(a), math.sin(a), 0)); v = Vector((-u.y, u.x, 0))
    length = max((p - origin).dot(u) for p in c) - min((p - origin).dot(u) for p in c)
    width = max((p - origin).dot(v) for p in c) - min((p - origin).dot(v) for p in c)
    return origin, a, u, v, length, width


GROUND = []          # (build sets it) the island bodies and the stone landings: where a drawn deck stops


def inside(p, poly):
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > p.y) != (by > p.y) and p.x < (bx - ax) * (p.y - ay) / (by - ay) + ax: hit = not hit
    return hit


def deck(B):
    """The bridge as drawn: its rules extent (which runs onto the islands, so a player steps on and off it) cut back at each
    end to just past the lavender lip of the ground it reaches (reference.png: the planks stop at the lip)."""
    origin, a, u, v, length, width = frame(B)
    ends = []
    for sign in (-1, 1):
        end = length / 2
        t = 0.0
        while t < length / 2:
            if any(inside(origin + u * (sign * t), g) for g in GROUND):
                end = min(length / 2, t + 0.12)
                break
            t += 0.03
        ends.append(sign * end)
    centre = origin + u * ((ends[0] + ends[1]) / 2)
    return centre, a, u, v, ends[1] - ends[0], width


def link(name, bm, materials, parent):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    for m in materials: me.materials.append(m)
    o.parent = parent
    return o


def plank(name, centre, size, angle, round_, parent, tan_ends=()):
    """A rounded wooden box; `tan_ends`: which of its ends (-1, +1 along its second axis) show tan cut grain."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=round_, segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
    for f in bm.faces:
        c = f.calc_center_median()
        # its cut end, and the round onto its top there (seen from above, a tan edge along the bridge's side)
        f.material_index = 1 if any(s * f.normal.y > 0.25 and s * c.y > size[1] / 2 - round_ * 1.5 for s in tan_ends) else 0
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(angle, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    return link(name, bm, [mat(WOOD), mat(TAN)], parent)


def tube(name, points, radius, colour, parent, sides=6):
    """A rope (or any thin round thing) along `points`."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points): p.co = (q.x, q.y, q.z, 1)
    cu.bevel_depth = radius; cu.bevel_resolution = max(1, sides // 4); cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    for other in bpy.context.selected_objects: other.select_set(False)
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    o.data.materials.append(mat(colour))
    for p in o.data.polygons: p.use_smooth = True
    o.parent = parent
    return o


def twisted(name, start, end, up, across, z_of, parent, strands=2, twist=1.6, spread=0.06, radius=0.04):
    """A twisted rope pair from `start` to `end`: its strands wind round each other (one turn every `twist` units)."""
    n = max(8, int((end - start).length / 0.12))
    for s in range(strands):
        pts = []
        for i in range(n + 1):
            t = i / n
            p = start.lerp(end, t)
            phase = (end - start).length * t / twist * 2 * math.pi + s * math.pi
            pts.append(p + across * (math.cos(phase) * spread) + up * (z_of(t) + math.sin(phase) * spread * 0.6))
        tube(f'{name}_s{s}', pts, radius, ROPE, parent)


def barriers(key, origin, a, u, v, length, width, parent):
    """Posts at both long sides, a sagging rope rail between them."""
    up = Vector((0, 0, 1))
    n = max(1, round(length / 4.5))                         # spans between posts
    for side in (-1, 1):
        edge = origin + v * side * (width / 2 - 0.12)
        posts = [edge + u * (-length / 2 + 0.35 + k * (length - 0.7) / n) for k in range(n + 1)]
        for k, p in enumerate(posts):
            bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.17, depth=POST_H + 0.6,
                                                location=p + up * (DECK + (POST_H - 0.6) / 2))
            o = bpy.context.active_object; o.name = f'BRIDGE_{key}_post{side:+d}{k}'
            o.data.materials.append(mat(POST)); o.parent = parent
            for poly in o.data.polygons: poly.use_smooth = abs(poly.normal.z) < 0.5
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.19,
                                                 location=p + up * (DECK + POST_H))
            cap = bpy.context.active_object; cap.name = f'BRIDGE_{key}_cap{side:+d}{k}'
            cap.scale.z = 0.6; cap.data.materials.append(mat(TAN)); cap.parent = parent
            for poly in cap.data.polygons: poly.use_smooth = True
        for k in range(n):
            for h, name in ((RAIL_H, 'rail'), (RAIL_H * 0.5, 'low')):     # a rope at the top, one half-way down
                twisted(f'BRIDGE_{key}_{name}{side:+d}{k}', posts[k], posts[k + 1], up, v,
                        lambda t, h=h: DECK + h - SAG * 4 * t * (1 - t), parent, spread=0.04, radius=0.045)


def planks_bridge(key, B, rng):
    origin, a, u, v, length, width = deck(B)
    root = bpy.data.objects.new(f'BRIDGE_{key}', None); bpy.context.scene.collection.objects.link(root)
    rows = max(1, round(length / 0.9)); pitch = length / rows
    for k in range(rows):
        t = -length / 2 + (k + 0.5) * pitch
        split = rng.uniform(0.3, 0.7)                        # where this row's two planks meet (staggered like bricks)
        lift = rng.uniform(-0.03, 0.03)
        for j, (v0, v1) in enumerate(((-0.5, split - 0.5), (split - 0.5, 0.5))):
            w0, w1 = v0 * width + (0.03 if j else 0), v1 * width - (0 if j else 0.03)
            # the outer ends uneven, a little past the deck's side (the HQ: a ragged tan edge along each side)
            if j == 0: w0 -= rng.uniform(0.0, 0.14)
            else: w1 += rng.uniform(0.0, 0.14)
            centre = origin + u * t + v * ((w0 + w1) / 2) + Vector((0, 0, DECK - 0.15 + lift))
            # the plank's long axis runs across the way: size (along the way, across, thick); its outer end shows tan
            plank(f'BRIDGE_{key}_plank{k}_{j}', centre, (pitch - 0.07, w1 - w0, 0.3), a, 0.13, root,
                  tan_ends=(-1,) if j == 0 else (1,))
    # under the planks, dark boards the length of the bridge: the gaps between planks show wood, not the mist below
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(length - 0.1, width - 0.2, 0.08), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z'), verts=bm.verts)
    bmesh.ops.translate(bm, vec=origin + Vector((0, 0, DECK - 0.27)), verts=bm.verts)
    link(f'BRIDGE_{key}_boards', bm, [mat(WOOD_SEAM)], root)
    up = Vector((0, 0, 1))
    for side in (-0.28, 0.28):
        start = origin + u * (-length / 2 + 0.1) + v * (side * width)
        end = origin + u * (length / 2 - 0.1) + v * (side * width)
        twisted(f'BRIDGE_{key}_rope{side:+.2f}', start, end, up, v, lambda t: DECK + 0.04, root)
    barriers(key, origin, a, u, v, length, width, root)


def logs_bridge(key, B, rng):
    origin, a, u, v, length, width = deck(B)
    root = bpy.data.objects.new(f'BRIDGE_{key}', None); bpy.context.scene.collection.objects.link(root)
    n = max(1, round(length / 1.4)); pitch = length / n
    r = pitch / 2 * 0.96
    zc = DECK + 0.12 - r                                   # the logs' tops a little above the deck line
    for k in range(n):
        t = -length / 2 + (k + 0.5) * pitch
        centre = origin + u * t + Vector((0, 0, zc))
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=r, radius2=r, depth=width - 0.1)
        # the hollow ends: each cap inset to a tan ring round a dark hollow, pushed a little in
        caps = [f for f in bm.faces if abs(f.normal.z) > 0.9]
        for f in caps:
            res = bmesh.ops.inset_individual(bm, faces=[f], thickness=r * 0.28, depth=-0.06)
            f.material_index = 2
            for g in res['faces']: g.material_index = 1
        # the ring at its middle
        mid = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0),
                                     plane_no=(0, 0, 1))
        ring = [g for g in mid['geom_cut'] if isinstance(g, bmesh.types.BMVert)]
        for vert in ring:
            vert.co.x *= 1.06; vert.co.y *= 1.06
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=bm.verts)   # axis -> y
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z'), verts=bm.verts)             # y -> across
        bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
        link(f'BRIDGE_{key}_log{k}', bm, [mat(WOOD), mat(TAN), mat(HOLLOW)], root)
    up = Vector((0, 0, 1))
    for side in (-0.3, 0.3):
        start = origin + u * (-length / 2) + v * (side * width)
        end = origin + u * (length / 2) + v * (side * width)
        # over each log's top and down a little between them
        twisted(f'BRIDGE_{key}_rope{side:+.2f}', start, end, up, v,
                lambda t: zc + r * (0.86 + 0.14 * abs(math.cos(t * n * math.pi))) + 0.03, root)
    barriers(key, origin, a, u, v, length, width, root)


def build(bridges, ground):
    GROUND[:] = [[tuple(p) for p in g] for g in ground]
    rng = random.Random(23)
    for key, B in bridges.items():
        (planks_bridge if B['kind'] == 'planks' else logs_bridge)(key, B, rng)
