"""The cross pond in 3D, object by object (2026-10-28): foomerang-fu physics hq.mp4 4:27, seen through the game's camera.

  Blender -b --python art/bridge_islands/blender/build.py -- <out_dir> [render]

Every thing in the frame is its own model:
  banks       the two grass slabs (ground.json), the top painted with grass.png (ground.py: the HQ's lime, pale edge stripe and
              shadow green), a lavender stone lip round the top edge, the sides running down into the water
  stones      the ring's slabs, each a separate block with its seam (stones.json), and the boulders, each a chamfered prism of
              its own height: pale top, darker sides
  raft        five planks (a centre square and an arm each side) with dark grooves between, our wood texture (wood.py), a dark
              red-brown edge, pegs along it; four crates (the gong islands' model), the whole turning as RAFT
  pond        lily pads with their flowers, small pads, leafy tufts at the walls' feet, bamboo
  water       one sheet named FOUNTAIN_water: the game draws the plaza fountain's water on it (waterShader.ts)
The game lights the lit parts softly (the map's `look`) and the flat ones show their colours as they are (glTF unlit + COLOR_0).
Exports pond.glb; with `render`, also the reference view (render.png).
"""
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER = args[0], 'render' in args[1:]
J = lambda p: json.load(open(os.path.join(ROOT, p)))
L, S, G, P = J('art/bridge_islands/layout.json'), J('art/bridge_islands/stones.json'), J('art/bridge_islands/ground.json'), {}
GRASS_BOX = J('art/bridge_islands/blender/grass.json')
CAM = J('art/sky_islands/camera.json')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sys.path.insert(0, os.path.join(ROOT, 'art/bridge_islands'))
import colour as HQ                                                # (the HQ's colours as the video looks in a browser: colour.py)
sys.path.insert(0, os.path.join(ROOT, 'art/sky_islands/blender'))
import objects as obj_models                                       # the gong islands' crate and bamboo, as they are
PAL = dict(J('art/sky_islands/objects.json')['palettes'])
PAL['hexplant'] = ['#92d9ad', '#83cea5', '#70c19c']
PAL['pot'] = ['#c69580', '#a87766', '#7d5646']      # (the HQ's urns here are lighter terracotta: #b78b76 measured)      # (the HQ's plates here are bluer than the gong islands': their median measured, 1:12)
rng = random.Random(11)

WATER_Z, DEPTH = L['water_z'], 2.4      # (layout.py: the water's height, which edges.py's water lines were unprojected at)
STONE_BOTTOM = WATER_Z - DEPTH


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def lit(name, hex_colour=None, image=None):
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


def unlit(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(attr.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


def paint_flat(o, top_hex, side_hex, mid_hex=None):
    """Makes a built body unlit, in the colours the HQ shows (its top, its sides; a rolled edge between in `mid_hex`): as the island flanks are drawn."""
    me = o.data; bm = bmesh.new(); bm.from_mesh(me); col = bm.loops.layers.float_color.new('Col')
    T, S_ = lin(HQ.flat(top_hex)), lin(HQ.flat(side_hex)); M = lin(HQ.flat(mid_hex)) if mid_hex else None
    for f in bm.faces:
        f.normal_update(); nz = f.normal.z
        c = T if nz > 0.8 else (M if (M is not None and nz > 0.3) else S_)
        for lp in f.loops: lp[col] = c
        f.material_index = 0
    bm.to_mesh(me); bm.free(); me.materials.clear(); me.materials.append(FLAT)
    return o


def image(path):
    img = bpy.data.images.load(os.path.join(ROOT, path)); img.pack(); return img


# the HQ's colours (4:27, medians of each class). The game's soft light lands a top at about its base colour and a front face
# at ~92% of it, so the lavender sides are set a little brighter than they should appear (#7683be).
GRASS = lit('pond_grass', image=image('art/bridge_islands/blender/grass.png'))      # (a flat pale-lime swatch: the island's rim colour)
SLAB_TOP, SLAB_SIDE = lit('pond_slab_top', HQ.lit('#818cc1', 0.98)), lit('pond_slab_side', HQ.lit('#566aa6', 0.875))      # (the island's slabs: in the HQ they are darker than its boulders)
# per block, as the HQ frame shows it (its trees and slabs throw shadows on the stones: the NW slab and the W boulder lie in them), in
# the order of stones.json: (top, side)
BLOCK_COLOURS = [('#9fbff0', '#6f8fd8'), ('#7aa6e8', '#4f78c8'), ('#818cc1', '#5162a2'), ('#a6baef', '#5e78b9'), ('#82a1e2', '#617cb9'),
                 ('#a4b3ea', '#6a79ab'), ('#a5b3ea', '#7388cf'), ('#a3b4ea', '#6a7cb5')]
BRICK_WALLS = {3}      # (stones.json indices of the bridge's two walls: sorted by y, 3 = the NW wall, 6 = the SE one)
CUBE_LIKE = {0, 1, 2, 4, 5, 7, 8, 9, 10, 12, 13, 14}
BLOCK_TAPER = {}      # (the E cube and its low rock have straight sides; the other rocks are broader at the foot)
BLOCK_COLOURS = [('#97a6e0', '#6a79ab')] * 24      # (every block alike for now: tops #a5b3ea, sides #6a79ab as the HQ's stones measure)
BLOCK_MATERIALS = [(lit(f'island_top_{i}', HQ.lit(t, 0.98)), lit(f'island_side_{i}', HQ.lit(sd, 0.875))) for i, (t, sd) in enumerate(BLOCK_COLOURS)]
STONE_TOP, STONE_SIDE = lit('pond_stone_top', HQ.lit('#a6b4e9', 0.98)), lit('pond_stone_side', HQ.lit('#909edf', 0.875))
LIP_SIDE = lit('pond_lip', HQ.lit('#909edf', 0.875))
WATER = lit('pond_water', HQ.flat('#74a2b2'))
FLAT = unlit('pond_flat')


def tops_uv(x, y):
    return ((x - GRASS_BOX['x0']) / (GRASS_BOX['x1'] - GRASS_BOX['x0']), (y - GRASS_BOX['y0']) / (GRASS_BOX['y1'] - GRASS_BOX['y0']))


def chaikin(poly, n=2):
    """Corner-cutting: each pass replaces every corner by two points on its sides; a few passes turn a polygon into a soft curve."""
    for _ in range(n):
        out = []
        for i in range(len(poly)):
            (px, py), (qx, qy) = poly[i], poly[(i + 1) % len(poly)]
            out += [(0.75 * px + 0.25 * qx, 0.75 * py + 0.25 * qy), (0.25 * px + 0.75 * qx, 0.25 * py + 0.75 * qy)]
        poly = out
    return poly


def offset_poly(poly, d):
    """A polygon moved out by `d` along its corners' bisectors (a convex-ish outline: a stone's)."""
    n = len(poly); area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0
    out = []
    for i in range(n):
        (x0, y0), (x1, y1), (x2, y2) = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (x1 - x0, y1 - y0); e2 = (x2 - x1, y2 - y1)
        n1 = (e1[1], -e1[0]); n2 = (e2[1], -e2[0])
        l1 = math.hypot(*n1) or 1; l2 = math.hypot(*n2) or 1
        bx, by = n1[0] / l1 + n2[0] / l2, n1[1] / l1 + n2[1] / l2
        bl = math.hypot(bx, by) or 1
        out.append((x1 + sgn * bx / bl * d, y1 + sgn * by / bl * d))
    return out


def rounded_rect(cx, cy, length, width, angle_deg, r, seg=6):
    """A rectangle with its corners rounded by `r` (its ends soft, like the HQ's slabs), turned by `angle_deg`."""
    r = min(r, width / 2 - 0.01, length / 2 - 0.01); a = math.radians(angle_deg); ux, uy = math.cos(a), math.sin(a)
    pts = []
    for (sx, sy, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx, ccy = sx * (length / 2 - r), sy * (width / 2 - r)
        for k in range(seg + 1):
            t = math.radians(a0 + 90 * k / seg); pts.append((ccx + math.cos(t) * r, ccy + math.sin(t) * r))
    return [(cx + u * ux - v * uy, cy + u * uy + v * ux) for u, v in pts]


def body(name, outline, top_z, top_mat, side_mat, top_r=0.0, corner_r=0.0, bottom=STONE_BOTTOM, uv=None, parent=None, soft=False, top_seg=3, front_mat=None, taper=1.0):
    """An outline extruded down to `bottom`: its vertical corners rounded by `corner_r`, its top edge by `top_r`; the flat top
    one material, the rest the other. Smooth across the rounds, sharp where faces meet squarely."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, top_z)) for x, y in outline])
    face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)
    bmesh.ops.translate(bm, verts=[g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, bottom - top_z))
    if taper != 1.0:
        # the HQ's rocks are broader at the foot than at the top: the top ring drawn in about its middle, the sides leaning
        tops = [v for v in bm.verts if abs(v.co.z - top_z) < 1e-6]
        cx = sum(v.co.x for v in tops) / len(tops); cy = sum(v.co.y for v in tops) / len(tops)
        for v in tops: v.co.x, v.co.y = cx + taper * (v.co.x - cx), cy + taper * (v.co.y - cy)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    if corner_r > 0:
        corners = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.05]
        bmesh.ops.bevel(bm, geom=corners, offset=corner_r, segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    if top_r > 0:
        top_edges = [e for e in bm.edges if all(abs(v.co.z - top_z) < 1e-4 for v in e.verts) and len(e.link_faces) == 2
                     and any(f.normal.z > 0.7 for f in e.link_faces) and any(abs(f.normal.z) < 0.3 for f in e.link_faces)]
        bmesh.ops.bevel(bm, geom=top_edges, offset=top_r, segments=top_seg, profile=0.5, affect='EDGES', clamp_overlap=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        f.material_index = 1 if f.normal.z > 0.995 and all(v.co.z >= top_z - 1e-3 for v in f.verts) else (2 if front_mat is not None and f.normal.y < -0.7 and abs(f.normal.z) < 0.3 else 0)
        f.smooth = True
        for loop in f.loops:
            loop[uvl].uv = (uv or tops_uv)(loop.vert.co.x, loop.vert.co.y)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    me.materials.append(side_mat); me.materials.append(top_mat)
    if front_mat is not None: me.materials.append(front_mat)
    if not soft:                                       # (a soft stone has no creases at all: its rounds carry the light)
        angles = {}
        for poly in me.polygons:
            for k in poly.edge_keys: angles.setdefault(k, []).append(poly.normal.copy())
        keyed = {tuple(sorted(e.vertices)): e for e in me.edges}
        for k, ns in angles.items():
            if len(ns) == 2 and ns[0].angle(ns[1]) > math.radians(40): keyed[tuple(sorted(k))].use_edge_sharp = True
    if parent is not None: o.parent = parent
    return o


def flat(name, parts, parent=None, z=0.0):
    """Flat-coloured pieces: parts = [(polygon, hex colour, height offset)]: each a fan, unlit, shown as its colour."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for poly, hx, dz in parts:
        vs = [bm.verts.new((x, y, z + dz)) for x, y in poly]
        try: face = bm.faces.new(vs)
        except ValueError: continue
        face.normal_update()
        if face.normal.z < 0: face.normal_flip()
        for loop in face.loops: loop[col] = lin(HQ.flat(hx))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    if parent is not None: o.parent = parent
    return o


# ---------------------------------------------------------------------------------------------------------------- banks
def _soft_rect(poly):
    """A four-cornered outline (the south-west island: the HQ's is a plain rectangle with generously rounded corners) as a rounded rectangle."""
    if len(poly) != 4: return [tuple(q) for q in poly]
    P = [tuple(q) for q in poly]
    cx = sum(q[0] for q in P) / 4; cy = sum(q[1] for q in P) / 4
    e0 = (P[1][0] - P[0][0], P[1][1] - P[0][1]); e1 = (P[2][0] - P[1][0], P[2][1] - P[1][1])
    l0, l1 = math.hypot(*e0), math.hypot(*e1)
    if max(l0, l1) < 12: return P                                  # (a small islet stays as drawn: hexagons are 6-cornered, so only rectangles get here)
    a = math.degrees(math.atan2(e0[1], e0[0])) if l0 >= l1 else math.degrees(math.atan2(e1[1], e1[0]))
    return rounded_rect(cx, cy, max(l0, l1), min(l0, l1), a, 1.9, seg=8)
def fillet(P, r, seg=7):
    """A polygon with each corner replaced by a circular arc of radius r tangent to its two sides."""
    P = [tuple(q) for q in P]; n = len(P); out = []
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n)); sg = 1 if area > 0 else -1
    for i in range(n):
        p0, p1, p2 = Vector((*P[i - 1], 0)), Vector((*P[i], 0)), Vector((*P[(i + 1) % n], 0))
        a, b = (p0 - p1).normalized(), (p2 - p1).normalized()
        half = math.acos(max(-1.0, min(1.0, a.dot(b)))) / 2
        d = min(r / math.tan(half), (p0 - p1).length * 0.45, (p2 - p1).length * 0.45); rr = d * math.tan(half)
        t0, t1 = p1 + a * d, p1 + b * d
        c = p1 + (a + b).normalized() * (rr / math.sin(half))
        a0, a1 = math.atan2(t0.y - c.y, t0.x - c.x), math.atan2(t1.y - c.y, t1.x - c.x)
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        out += [(c.x + rr * math.cos(a0 + da * j / seg), c.y + rr * math.sin(a0 + da * j / seg)) for j in range(seg + 1)]
    return out


MEASURED = {m['index']: m['water'] for m in L.get('measured', [])}      # (layout.py: the islands edges.py measured side by side, with their water lines)
SWI = -99
SW_R = 1.3          # (the HQ's south-west island: its corners rounded about 1.3 units on the grass, the water line's by as much more as the flank is wide)
RENDER_OUTLINES = [[tuple(q) for q in poly] if k in MEASURED else _soft_rect(poly) for k, poly in enumerate(L['banks'])]      # (the south-west island comes rounded from layout.py)      # (layout.py's straightened outline: the traced ground.json one is jagged)
for k, poly in enumerate(RENDER_OUTLINES):
    if k not in MEASURED: poly = chaikin(poly, 1 if len(poly) <= 6 else 2)      # (the HQ's island has soft rounded corners)
    body(f'BANK_{k}', poly, 0.0, GRASS, LIP_SIDE, top_r=0.0 if k in MEASURED else 0.3, bottom=WATER_Z - DEPTH)


def lit_flat(name, polys, material, z):
    """Drawn shapes lying on the grass (the HQ's shadow green, its pale patches): flat lit meshes, crisp at any zoom."""
    bm = bmesh.new()
    for poly in polys:
        try: face = bm.faces.new([bm.verts.new((x, y, z)) for x, y in poly])
        except ValueError: continue
        face.normal_update()
        if face.normal.z < 0: face.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(material)
    return o


# the pale stripe along the island's edge is the whole bank; the lime sits on it, the outline pulled in half a unit
RIM_GRASS = lit('island_rim', HQ.lit('#e9f69d', 0.98))
SHADE_GRASS = lit('island_shade', HQ.lit('#cfe991', 0.98))
PALE_GRASS = lit('island_pale', HQ.lit('#e9f69d', 0.98))
LIME_GRASS = lit('island_lime', HQ.lit('#dcf296', 0.98))
# the kerb: the lavender stone wall that runs round the island (the HQ's, ~1 unit thick, its top rounded), a run of straight pieces laid
# along the outline, each drawn in half a unit
KERB_TOP, KERB_SIDE = lit('island_kerb_top', HQ.lit('#a5b3eb', 0.98)), lit('island_kerb_side', HQ.lit('#7e8fd4', 0.875))
KERB_H, KERB_W = 0.6, 1.0
def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


def cross_sign(e1, e2, sgn):
    return (e1[0] * e2[1] - e1[1] * e2[0]) * sgn


def kerb_ring(name, poly, top_mat, side_mat):
    """One continuous kerb round the island (the HQ's is a single soft slab, not pieces): the outline is the wall's outer foot; the wall comes
    in by a width that is thick where its outer face looks at the camera and thin on the back edges; the profile rounds from the foot up
    over a soft shoulder to the flat top and down into the grass. Corners are mitred, the shading smooth round them."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0
    inward, widths, hts = [], [], []
    for i in range(n):
        (x0, y0), (x1, y1), (x2, y2) = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (x1 - x0, y1 - y0); e2 = (x2 - x1, y2 - y1)
        l1 = math.hypot(*e1) or 1; l2 = math.hypot(*e2) or 1
        n1 = (-e1[1] / l1 * sgn, e1[0] / l1 * sgn); n2 = (-e2[1] / l2 * sgn, e2[0] / l2 * sgn)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]; bl = math.hypot(bx, by) or 1; bx, by = bx / bl, by / bl
        cosh = bx * n1[0] + by * n1[1]
        miter = min(1.0 / max(0.45, cosh), 1.15)
        if cross_sign(e1, e2, sgn) < 0: miter = min(miter, 1.0)      # (a reflex corner: the inner edge would fold over: keep it plain)
        f = (1.0 + (n1[1] + n2[1]) / 2.0) / 2.0                      # (1: the outer face looks at the camera)
        kw, kh = 0.1 + 1.2 * f * f, 0.03 + 0.09 * f      # (the lavender is the island's own flank, flush with the grass and sloping down to the water: the grass is the top of the rock, not a layer on it)      # (the back edges have next to no wall: the HQ's island is not encased all round)
        inward.append((bx * miter, by * miter)); widths.append(kw); hts.append(kh)
    # profile: (fraction of the width inward, height as a fraction of kh), outer foot to the grass; z is relative to the grass (0)
    prof = [(0.0, None), (0.0, 0.3), (0.1, 0.6), (0.3, 0.9), (0.7, 1.0), (0.9, 0.9), (1.0, 0.55)]
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    rows = []
    for fr, hz in prof:
        row = []
        for i in range(n):
            x, y = poly[i]; dx, dy = inward[i]
            z = (WATER_Z - DEPTH) if hz is None else hts[i] * hz
            row.append(bm.verts.new((x + dx * widths[i] * fr, y + dy * widths[i] * fr, z)))
        rows.append(row)
    for r in range(len(prof) - 1):
        top = prof[r + 1][1] is not None and prof[r][1] is not None and prof[r][1] >= 0.8 and prof[r + 1][1] >= 0.0 and r >= 2
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new([rows[r][i], rows[r][j], rows[r + 1][j], rows[r + 1][i]])
            f.smooth = True; f.material_index = 1 if r >= 2 else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sum(f.normal.z for f in bm.faces if f.material_index == 1) < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    me.materials.append(side_mat); me.materials.append(top_mat)
    return o


def corner_blocks(poly):
    """The HQ's front corners carry a rounded block standing out of the wall (a corner post): at every convex corner whose two edges face the camera."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0
    for i in range(n):
        (x0, y0), (x1, y1), (x2, y2) = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (x1 - x0, y1 - y0); e2 = (x2 - x1, y2 - y1)
        if min(math.hypot(*e1), math.hypot(*e2)) < 4.5: continue          # (a corner between two real walls, not a wobble)
        if cross_sign(e1, e2, sgn) <= 0: continue                            # (convex only)
        l1 = math.hypot(*e1); l2 = math.hypot(*e2)
        n1 = (-e1[1] / l1 * sgn, e1[0] / l1 * sgn); n2 = (-e2[1] / l2 * sgn, e2[0] / l2 * sgn)
        if min(n1[1], n2[1]) < 0.35: continue                                # (both outer faces look towards the camera)
        bx, by = n1[0] + n2[0], n1[1] + n2[1]; bl = math.hypot(bx, by) or 1; bx, by = bx / bl, by / bl
        ang = math.degrees(math.atan2(by, bx)) + 45.0
        body(f'CORNER_{i}', rounded_rect(x1 + bx * 0.9, y1 + by * 0.9, 3.6, 3.6, ang, 1.2), 0.7, KERB_TOP, KERB_SIDE, top_r=0.3, bottom=WATER_Z - DEPTH, soft=True, top_seg=3)


def flank(name, inner, z_in, outer, z_out, rows):
    """The island's side as the HQ shows it: a band from the grass outline (z_in) down to the water line (z_out), drawn unlit in the colours the HQ
    shows across it (rows: fraction of the way out, colour; read off the frame by probes across the south-west and south-east sides)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col'); n = len(inner)
    ring = [[bm.verts.new((inner[i][0] + (outer[i][0] - inner[i][0]) * fr, inner[i][1] + (outer[i][1] - inner[i][1]) * fr, z_in + (z_out - z_in) * fr)) for i in range(n)] for fr, _ in rows]
    for r in range(len(rows) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new([ring[r][i], ring[r][j], ring[r + 1][j], ring[r + 1][i]])
            for lp in f.loops: lp[col] = lin(HQ.flat(rows[r if lp.vert in (ring[r][i], ring[r][j]) else r + 1][1]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


EAST_K = next((m['index'] for m in L.get('measured', []) if m.get('name') == 'east'), -1)
for _k_, _water in MEASURED.items():
    _in = RENDER_OUTLINES[_k_]
    _out = [tuple(q) for q in _water]
    if len(_out) == len(_in):
        # (edges.py's probes, from the grass's edge out: a pale blend, the lavender lit then darker down the side, the darkest at the foot)
        rows_ = ([(0.0, '#a9c1cd'), (0.12, '#99abd9'), (0.25, '#8699d1'), (0.4, '#8197cd'), (0.55, '#7c98c8'), (0.7, '#749ac1'), (0.85, '#709bc0'), (1.0, '#6d9abf')]
                 if _k_ == EAST_K else      # (the east island's south-east side: darker sooner)
                 [(0.0, '#b2ccc6'), (0.12, '#a7b8dc'), (0.3, '#a3b1ea'), (0.48, '#8c9ad5'), (0.64, '#8797cf'), (0.8, '#7c96c6'), (1.0, '#7399c0')])
        flank(f'FLANK_{_k_}', _in, 0.0, _out, WATER_Z + 0.01, rows_)
        # the thin pale foam line where the side meets the water, then the darker water hugging it (the HQ: #a8daf5 ~4 px, then #689dba)
        _cx = sum(q[0] for q in _out) / len(_out); _cy = sum(q[1] for q in _out) / len(_out)
        _grow = lambda P, d: [(x + (x - _cx) / math.hypot(x - _cx, y - _cy) * d, y + (y - _cy) / math.hypot(x - _cx, y - _cy) * d) for x, y in P]
        # (the HQ: the water hugging the flank is darker than the open water, ~15 px, then eases into it; the south-west island also shows a thin
        # pale foam line at its foot, the east island none)
        _o2 = _out
        # (no continuous foam line: the HQ's is only a short stretch, which the water's own ribbons give)
        flank(f'DARK_{_k_}', _o2, WATER_Z + 0.011, _grow(_o2, 0.7), WATER_Z + 0.011, [(0.0, '#6c9abe'), (0.6, '#719fbd'), (1.0, '#77a4bd')])
for k, poly in enumerate(RENDER_OUTLINES):
    if k in MEASURED: continue
    corner_blocks(poly)
    kerb_ring(f'KERB_{k}', chaikin(poly, 1 if len(poly) <= 6 else 2), KERB_TOP, KERB_SIDE)
lit_flat('LIME', G.get('lime', []), LIME_GRASS, 0.012)      # (ground.py: the ground less its pale edge stripe)
lit_flat('SHADE', G.get('shade', []), SHADE_GRASS, 0.02)
lit_flat('PALE', G.get('pale', []), PALE_GRASS, 0.024)


def tuft(name, x, y, rot):
    """A few short strokes of darker green (the HQ's '///' marks in the grass): three thin leaning blades."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for i in range(3):
        bx = x + (i - 1) * 0.34 * math.cos(rot); by = y + (i - 1) * 0.34 * math.sin(rot)
        lean = Vector((math.cos(rot + 1.57) * 0.1, math.sin(rot + 1.57) * 0.1, 0))
        w = Vector((math.cos(rot), math.sin(rot), 0)) * 0.05
        tip = Vector((bx, by, 0.34 - 0.06 * abs(i - 1))) + lean
        f = bm.faces.new([bm.verts.new(Vector((bx, by, 0.02)) - w), bm.verts.new(Vector((bx, by, 0.02)) + w), bm.verts.new(tip)])
        for loop in f.loops: loop[col] = lin(HQ.flat('#9cc874'))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


for k, (x, y) in enumerate(L['tufts']):
    tuft(f'TUFT_{k}', x, y, rng.uniform(-0.5, 0.5))

# ---------------------------------------------------------------------------------------------------------------- levers
# the lever set into the side of the NE and SW slabs (the HQ): a rounded tan housing, a short pink stem, a cyan ball for a knob
for k, lv in enumerate(L['levers']):
    hx, hy = lv['housing']; kx, ky = lv['knob']; z = lv['z']
    ang = math.atan2(ky - hy, kx - hx); ln = math.hypot(kx - hx, ky - hy)
    body(f'LEVER_{k}_housing', rounded_rect(hx, hy, 1.2, 0.8, math.degrees(ang), 0.3), z + 0.85, lit(f'lever_h{k}', HQ.lit('#f0dfa8', 0.98)), lit(f'lever_hs{k}', HQ.lit('#d8c48a', 0.875)),
         top_r=0.12, bottom=z - 0.3, soft=True, top_seg=3)
    body(f'LEVER_{k}_stem', rounded_rect((hx + kx) / 2, (hy + ky) / 2, ln, 0.2, math.degrees(ang), 0.1), z + 0.75, lit(f'lever_s{k}', HQ.lit('#e9b8c4', 0.98)), lit(f'lever_ss{k}', HQ.lit('#c898a6', 0.875)),
         top_r=0.06, bottom=z + 0.45, soft=True, top_seg=2)
    knob = bpy.ops.mesh.primitive_uv_sphere_add(radius=0.34, location=(kx, ky, z + 0.62), segments=24, ring_count=12)
    ko = bpy.context.active_object; ko.name = f'LEVER_{k}_knob'
    ko.data.materials.append(lit(f'lever_k{k}', HQ.lit('#5fd6f6', 0.98))); bpy.ops.object.shade_smooth()
# ---------------------------------------------------------------------------------------------------------------- stones
# The HQ's stones are soft: slabs with rounded ends and a rolled top edge, boulders with organic outlines, light running smoothly
# over every round, no creases. Each footprint is the HQ's flat top grown by GROW (the roll takes it back), its sides rounded by
# CORNER, its top edge rolled by ROLL over SEGS steps.
SEAM = 0.1
GROW_SLAB = float(os.environ.get('POND_GROW_SLAB', 0.22))     # (the margin of a wall slab and of a boulder are fitted apart)
# (the HQ's facets are straight with small rounded corners and a narrow soft edge: not pillows)
GROW, CORNER_SLAB, CORNER_BOULDER, ROLL, SEGS = float(os.environ.get('POND_GROW', 0.35)), float(os.environ.get('POND_CORNER_SLAB', 0.35)), float(os.environ.get('POND_CORNER', 0.4)), float(os.environ.get('POND_ROLL', 0.22)), 4
SW_SKIP = {8, 10, 12, 13, 6, 11}          # (stones.json blocks the south-west section draws from sw_blocks.json instead: measured, one by one)
SWB = J('art/bridge_islands/sw_blocks.json')
for k, b in enumerate(S):
    if k in SW_SKIP or k in (0, 2, 3, 5, 7, 9, 14): continue      # (9: the SE wall's run onto the east island, built with the wall)          # (3: the north-east wall, measured by ne_wall.py; 7: the east islet, islet_e.py: both below)
    H = b['height']
    if k in BRICK_WALLS:
        # the bridge's walls: a row of fat rounded bricks laid end to end along the rect's long axis, a hair apart, heights uneven, the end brick a taller cap
        pts_ = [tuple(q) for q in b['top']]
        cx_ = sum(q[0] for q in pts_) / len(pts_); cy_ = sum(q[1] for q in pts_) / len(pts_)
        sxx = sum((q[0] - cx_) ** 2 for q in pts_); syy = sum((q[1] - cy_) ** 2 for q in pts_); sxy = sum((q[0] - cx_) * (q[1] - cy_) for q in pts_)
        a_ = 0.5 * math.atan2(2 * sxy, sxx - syy)                          # (the polygon's long axis, in the plan)
        ux_, uy_ = math.cos(a_), math.sin(a_)
        ts_ = [(q[0] - cx_) * ux_ + (q[1] - cy_) * uy_ for q in pts_]
        t0_, t1_ = min(ts_), max(ts_); rw_ = t1_ - t0_
        n_ = max(2, round(rw_ / (6.0 if k == 3 else 4.6))); piece_ = rw_ / n_
        for j_ in range(n_):
            mid_ = t0_ + (j_ + 0.5) * piece_
            cap_ = (j_ == n_ - 1)
            body(f'STONE_{k}_{j_}', rounded_rect(cx_ + mid_ * ux_, cy_ + mid_ * uy_, piece_ - 0.15 + (0.8 if cap_ else 0), (4.2 if k == 3 else 2.3) + (0.8 if cap_ else 0), math.degrees(a_), 0.55),
                 H + (0.6 if cap_ else 0) + rng.uniform(-0.15, 0.15), BLOCK_MATERIALS[k][0], BLOCK_MATERIALS[k][1], top_r=0.3, corner_r=0.5, bottom=STONE_BOTTOM, soft=True, top_seg=3)
    elif b['kind'] == 'slab':
        # the HQ's slabs are fat rounded barrels with chamfered corners, not boxes: the traced outline, grown a little, its corners rounded
        pts = offset_poly([tuple(p) for p in b['clean']], GROW_SLAB)
        body(f'SLIDER_0' if k == 2 else f'STONE_{k}_0', pts, H + rng.uniform(-0.03, 0.03), BLOCK_MATERIALS[k][0], BLOCK_MATERIALS[k][1], top_r=ROLL, corner_r=CORNER_BOULDER,
             bottom=STONE_BOTTOM, soft=True, top_seg=SEGS, taper=BLOCK_TAPER.get(k, 0.93))
    else:
        if k in CUBE_LIKE:
            # the HQ's boulders are soft cubes: the footprint's own rectangle with generous rounded corners, not a many-sided hull
            cx_, cy_, rw_, rh_, ang_ = b['rect']
            pts = rounded_rect(cx_, cy_, rw_ * 0.5 + 2 * GROW, rh_ * 0.5 + 2 * GROW, -ang_, 0.9)      # (the hand outlines took in each block's side as well as its top: ~0.68 of them is the top)
        else:
            pts = offset_poly([tuple(p) for p in b['clean']], GROW)                       # (the hull in a few straight sides, grown a little)
        body(f'BOULDER_{k}', pts, H, BLOCK_MATERIALS[k][0], BLOCK_MATERIALS[k][1], top_r=ROLL, corner_r=CORNER_BOULDER, bottom=STONE_BOTTOM, soft=True, top_seg=SEGS, taper=BLOCK_TAPER.get(k, 0.88))

# the long wall along the east island's north-east side (ne_wall.py: its top face from the HQ, its height from the front face): one soft slab
NEW = J('art/bridge_islands/ne_wall.json')
_q = NEW['footprint']; _cx = sum(q[0] for q in _q) / 4; _cy = sum(q[1] for q in _q) / 4
_e1 = (_q[1][0] - _q[0][0], _q[1][1] - _q[0][1]); _e2 = (_q[2][0] - _q[1][0], _q[2][1] - _q[1][1])
_L, _W = math.hypot(*_e1), math.hypot(*_e2); _ang = math.degrees(math.atan2(_e1[1], _e1[0]))
if _W > _L: _L, _W, _ang = _W, _L, math.degrees(math.atan2(_e2[1], _e2[0]))
paint_flat(body('NE_WALL', rounded_rect(_cx, _cy, _L, _W, _ang, 0.8), NEW['height'], lit('ne_top', HQ.lit('#a7b5ea', 0.98)), lit('ne_side', HQ.lit('#7e8bc2', 0.875)),
     top_r=0.35, corner_r=0.8, bottom=STONE_BOTTOM, soft=True, top_seg=3), '#a7b5ea', '#7e8bc2', '#94a2dc')      # (unlit: the HQ's top and front colours)

# the cube in the water by the wall's end (layout.py `cubes`: its top's corners from the HQ): a soft box down into the water, unlit in the HQ's colours
for k, cu in enumerate(L.get('cubes', [])):
    paint_flat(body(f'CUBE_{k}', [tuple(q) for q in cu['top']], cu['z'], FLAT, FLAT, top_r=0.2, corner_r=0.25, bottom=STONE_BOTTOM,
                    soft=True, top_seg=2), *(('#a6c4ea', '#7198bb', '#8cafd3') if k == 0 else ('#a7b5ea', cu.get('side', '#7e8bc2'), '#94a2dc')))      # (the water cube: the HQ's colours there less the beams' light, which the overlay adds back; the rest lavender)
# the raised grass-topped blocks at the wall's end (layout.py `raised`): a lavender block with a rim round its grass, unlit in the HQ's colours
for k, rb in enumerate(L.get('raised', [])):
    g_ = [tuple(q) for q in rb['grass']]
    paint_flat(body(f'RAISED_{k}', offset_poly(g_, 0.35), rb['z'], FLAT, FLAT, top_r=0.2, corner_r=0.4, bottom=STONE_BOTTOM, soft=True, top_seg=2), '#a7b5ea', '#7e8bc2', '#94a2dc')
    flat(f'RAISED_{k}_grass', [(chaikin(g_, 2), '#c4eb9c', 0)], z=rb['z'] + 0.02)
# the east islet (islet_e.py: fitted to the HQ's silhouette): a tall round rock, an octagon with soft corners, grass on its top, its red tree up there
IE = L['islet_e']
_oct = [(IE['centre'][0] + IE['radius'] * math.cos(math.pi / 8 + i * math.pi / 4), IE['centre'][1] + IE['radius'] * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]
body('ISLET_E', offset_poly(_oct, 0.0), IE['height'], lit('ie_top', HQ.lit('#a7b5ea', 0.98)), lit('ie_side', HQ.lit('#7e8bc2', 0.875)), top_r=0.3, corner_r=0.45,
     bottom=STONE_BOTTOM, soft=True, top_seg=3)
# (the HQ: its grass a smaller patch towards the back left, the rest of the top lavender rim)
# (the HQ: frame x 1714-1813, y 331-420, mostly under the canopy; its median #b9daa2, darker than the islands' rim green)
_cap = [(IE['centre'][0] + (x - IE['centre'][0]) * 0.55 - 1.1, IE['centre'][1] + (y - IE['centre'][1]) * 0.5 + 1.2) for x, y in _oct]
flat('ISLET_E_grass', [(chaikin(_cap, 2), '#b9daa2', 0)], z=IE['height'] + 0.02)

# the bunting (layout.py: its strings' ends from the HQ): a thin dark string, red pennants every 1.25 units hanging 0.95, unlit, two-sided
def _flat3d(name, tris):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for pts, hx in tris:
        for order in (pts, pts[::-1]):
            f = bm.faces.new([bm.verts.new(p) for p in order])
            for loop in f.loops: loop[col] = lin(HQ.flat(hx))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
_tris = []
for st in L.get('bunting', []):
    a, b = Vector(st['a']), Vector(st['b']); d = b - a; ln = d.length; d.normalize()
    up = Vector((0, 0, 0.05))
    _tris.append(([a - up, a + up, b + up], '#4a3550')); _tris.append(([a - up, b + up, b - up], '#4a3550'))
    t = 0.5
    while t < ln - 0.2:
        p = a + d * t
        _tris.append(([p - d * 0.38, p + d * 0.38, p + Vector((0, 0, -0.95))], '#d87b69'))
        t += 1.25
_flat3d('BUNTING', _tris)

# leafy ferns (layout.py `ferns`): pointed leaves fanning out from the middle and arching down, two greens, unlit as the HQ's flat leaves
_tris = []
for k, fe in enumerate(L.get('ferns', [])):
    cx, cy = fe['at']; r = fe['r']; z = fe['z']; a0 = rng.uniform(0, 6.28)
    for j in range(9):
        a = a0 + j * 2 * math.pi / 9 + rng.uniform(-0.2, 0.2); ln = r * rng.uniform(0.8, 1.1)
        d = Vector((math.cos(a), math.sin(a), 0)); n = Vector((-d.y, d.x, 0))
        base = Vector((cx, cy, z + 0.5)); mid = base + d * ln * 0.5 + Vector((0, 0, 0.35)); tip = base + d * ln + Vector((0, 0, -0.35))
        col = '#78b88c' if j % 2 else '#66a67c'      # (the HQ's fern greens, #7ab98f median)
        _tris.append(([base - n * 0.12, mid - n * ln * 0.24, mid + n * ln * 0.24], col)); _tris.append(([mid - n * ln * 0.24, tip, mid + n * ln * 0.24], col))
_flat3d('FERNS', _tris)

# the east islet's foam: the HQ draws a thick pale crescent round its foot on the camera's side (1:12, ~0.9 units out, ~0.5 wide)
_ie = L['islet_e']; _ring = []
for i in range(25):
    a = math.radians(190 + i * 160 / 24)
    _ring.append(a)
_in_ = [(_ie['centre'][0] + math.cos(a) * (_ie['radius'] + 0.55), _ie['centre'][1] + math.sin(a) * (_ie['radius'] + 0.55)) for a in _ring]
_ou_ = [(_ie['centre'][0] + math.cos(a) * (_ie['radius'] + 0.55 + 0.55 * math.sin((a - math.radians(190)) / math.radians(160) * math.pi)), _ie['centre'][1] + math.sin(a) * (_ie['radius'] + 0.55 + 0.55 * math.sin((a - math.radians(190)) / math.radians(160) * math.pi))) for a in _ring]
flat('ISLET_E_foam', [([_in_[i], _in_[i + 1], _ou_[i + 1], _ou_[i]], '#b4e2f2', 0) for i in range(len(_ring) - 1)], z=WATER_Z + 0.03)

# the north-west islet (islet_e.py nw: fitted): a raised hexagonal platform, thick lavender walls, its grass on top, the red tree standing there
INW = L['islet_nw']
_hx = [(INW['centre'][0] + INW['radius'] * math.cos(math.pi / 6 + i * math.pi / 3), INW['centre'][1] + INW['radius'] * math.sin(math.pi / 6 + i * math.pi / 3)) for i in range(6)]
paint_flat(body('ISLET_NW', _hx, INW['height'], FLAT, FLAT, top_r=0.25, corner_r=0.5, bottom=STONE_BOTTOM, soft=True, top_seg=2), '#a7b5ea', '#7e8bc2', '#94a2dc')
flat('ISLET_NW_grass', [(chaikin([(INW['centre'][0] + (x - INW['centre'][0]) * 0.78, INW['centre'][1] + (y - INW['centre'][1]) * 0.78) for x, y in _hx], 2), '#c4ea9c', 0)], z=INW['height'] + 0.02)

# ---------------------------------------------------------------------------------------------------------------- the south-west section's blocks
# (measured by sw_blocks.py: top face and side of each, from the HQ frame): soft cushions, a pale top rolled over into darker sides; the west one is a stack of two
SW_TOP, SW_SIDE = lit('sw_top', HQ.lit('#a9b5ec', 0.98)), lit('sw_side', HQ.lit('#8290cc', 0.875))      # (sides: the HQ blocks' shaded median)
IVY = '#6fae82'


def grow(poly, c, k):
    return [(c[0] + k * (x - c[0]), c[1] + k * (y - c[1])) for x, y in poly]


def ivy(name, cx, cy, z, r, n=7, seed=0):
    """A ragged patch of dark green ivy lying over a block's edge: a few overlapping jagged leaves."""
    rr = random.Random(seed); parts = []
    for i in range(n):
        a = rr.uniform(0, 2 * math.pi); d = rr.uniform(0, r * 0.7); px, py = cx + math.cos(a) * d, cy + math.sin(a) * d
        pts = []
        for j in range(10):
            t = j * 2 * math.pi / 10; rad = r * rr.uniform(0.3, 0.45) * (1.0 if j % 2 == 0 else 0.8)
            pts.append((px + math.cos(t) * rad, py + math.sin(t) * rad))
        parts.append((pts, IVY if i % 3 else '#5f9e75', 0.0))
    flat(name, parts, z=z)


for n, blk in SWB.items():
    top = [tuple(p) for p in blk['top']]; foot = [tuple(p) for p in blk['foot']]
    c = (sum(p[0] for p in top) / len(top), sum(p[1] for p in top) / len(top))
    cf = (sum(p[0] for p in foot) / len(foot), sum(p[1] for p in foot) / len(foot))
    H = blk['height'] * 1.4
    if n == 'w':
        body('SW_w_low', grow(top, c, 1.3), H * 0.36, SW_TOP, SW_SIDE, top_r=0.35, corner_r=0.7, bottom=STONE_BOTTOM, soft=True, top_seg=3)
        body('SW_w_up', grow(top, c, 1.25), H, SW_TOP, SW_SIDE, top_r=0.45, corner_r=0.9, bottom=H * 0.3, soft=True, top_seg=3)
        ivy('SW_w_ivy', c[0] - 1.2, c[1] - 0.6, H + 0.05, 0.8, n=3, seed=1)
    else:
        body(f'SW_{n}', grow(top, c, 1.75 if n != 's' else 1.9), H, SW_TOP, SW_SIDE, top_r=0.45, corner_r=0.8, bottom=STONE_BOTTOM, soft=True, top_seg=3)
        if n != 's': ivy(f'SW_{n}_ivy', c[0] - 0.2, c[1] + 0.9, H + 0.05, 1.3, n=7, seed=hash(n) % 97)

# ---------------------------------------------------------------------------------------------------------------- island life
PAD, PAD_RIM, PAD_DARK, FLOWER, FLOWER_HEART = '#79af77', '#86bd86', '#5f9a64', '#fbe8ec', '#f4c4d0'      # (the HQ pads' median, its lighter rim)
for k, pad in enumerate(L['pads']):
    x, y = pad['at']
    r = pad['r']; z = WATER_Z + 0.06       # (fit_pads.py: the HQ's pads, their radii, notches and flowers measured)
    notch = math.radians(40); a0 = (math.radians(pad['notch']) if pad.get('notch') is not None else rng.uniform(0, 2 * math.pi))      # (the gap is centred on a0)
    steps = 28
    rim = [(x + math.cos(a0 + notch / 2 + t * (2 * math.pi - notch) / steps) * r, y + math.sin(a0 + notch / 2 + t * (2 * math.pi - notch) / steps) * r) for t in range(steps + 1)]
    inner = [(x + (px - x) * 0.92, y + (py - y) * 0.92) for px, py in rim]
    parts = []
    for i in range(steps):                                          # (a lighter ring round the edge, the body a shade darker)
        parts.append(([(x, y), rim[i], rim[i + 1]], PAD_RIM, 0))
        parts.append(([(x, y), inner[i], inner[i + 1]], PAD, 0.005))
    for j in range(6):                                             # (short dark dashes: the HQ's veins)
        a = a0 + notch / 2 + (j + 0.5) * (2 * math.pi - notch) / 6
        c0, c1 = 0.4 * r, 0.58 * r
        d = Vector((math.cos(a), math.sin(a), 0)); n = Vector((-d.y, d.x, 0)) * 0.09
        p0, p1 = Vector((x, y, 0)) + d * c0, Vector((x, y, 0)) + d * c1
        parts.append(([(p0.x - n.x, p0.y - n.y), (p0.x + n.x, p0.y + n.y), (p1.x + n.x, p1.y + n.y), (p1.x - n.x, p1.y - n.y)], PAD_DARK, 0.01))
    if pad.get('flower', k in (1, 3)):                              # (a flower: pale petals round a pink heart)
        star = [(x + math.cos(i * math.pi / 8) * r * (0.5 if i % 2 == 0 else 0.26), y + math.sin(i * math.pi / 8) * r * (0.5 if i % 2 == 0 else 0.26)) for i in range(16)]
        parts.append((star, FLOWER, 0.03))
        parts.append(([(x + math.cos(a) * r * 0.14, y + math.sin(a) * r * 0.14) for a in [i * math.pi / 4 for i in range(8)]], FLOWER_HEART, 0.04))
    flat(f'PAD_{k}', parts, z=z)
# the potted bamboo's grey pot (the HQ: by the gate, a squat grey-green pot)
if L['bamboo']:
    _bx, _by = L['bamboo'][0]
    paint_flat(body('BAMBOO_POT', [(_bx + math.cos(i * math.pi / 8) * 0.75, _by + math.sin(i * math.pi / 8) * 0.75) for i in range(16)], 0.9, FLAT, FLAT, top_r=0.1, bottom=0,
                    soft=True, top_seg=1, taper=0.8), '#6f7f7c', '#8a9a96', '#7d8c89')
for k, sp in enumerate(L.get('small_pads', [])):                   # (the small round pads)
    x, y = sp['at']; r = sp['r']
    flat(f'SPAD_{k}', [([(x + math.cos(i * math.pi / 10) * r, y + math.sin(i * math.pi / 10) * r) for i in range(20)], PAD, 0)], z=WATER_Z + 0.05)
for k, (x, y) in enumerate(L['crates']):
    obj_models.crate({'x': x, 'y': y, 'width': 1.43}, PAL, FLAT, None, k)
for k, (x, y) in enumerate(L['bamboo']):
    # (the HQ's bamboo by the gate and the potted one by the wall are thick, ~20 px: 1.1 units; the rest thinner)
    obj_models.bamboo({'x': x, 'y': y, 'width': 1.1 if k in (1, 2) else 0.7, 'height': rng.uniform(4.4, 6.4)}, PAL, FLAT, None, 100 + k)


def blob(name, c, radii, hex_, hex_low, sub=5, bumps=0.17):
    """A soft lump (an ico-sphere stretched, its edge wavy like the HQ's leaf masses): lighter on top, darker underneath."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    phase = [rng.uniform(0, 6.28) for _ in range(3)]
    for v in bm.verts:
        n = v.co.copy()
        ang = math.atan2(n.y, n.x)
        wave = 1 + bumps * (math.sin(17 * ang + phase[0]) * 0.5 + math.sin(29 * ang + phase[1]) * 0.35 + math.sin(41 * ang + phase[2]) * 0.3) * (0.4 + 0.6 * max(0.0, 1 - abs(n.z)))      # (a feathery rim, strongest round the equator)   # (a scalloped rim)
        v.co = Vector((c[0] + n.x * radii[0] * wave, c[1] + n.y * radii[1] * wave, c[2] + n.z * radii[2]))
    # the HQ's canopies are mottled soft discs: a darker heart (rings), a lighter rim, softly blended (colour per vertex, no facets)
    hi, lo = Vector(lin(HQ.flat(hex_))[:3]), Vector(lin(HQ.flat(hex_low))[:3])
    ph = rng.uniform(0, 6.28)
    for f in bm.faces:
        f.smooth = True
        for loop in f.loops:
            v = loop.vert.co
            d = math.hypot(v.x - c[0], v.y - c[1]) / max(radii[0], 1e-6)
            ring = 0.5 + 0.5 * math.sin(d * 9.0 + ph)                      # (soft rings from the middle)
            up = max(0.0, min(1.0, (v.z - (c[2] - radii[2])) / (2 * radii[2])))
            mott = 0.14 * math.sin(7.3 * v.x + 3 * v.y + ph) * math.sin(6.1 * v.y - 2 * v.x + ph * 1.7)      # (soft mottling)
            south = max(0.0, -(v.y - c[1]) / max(radii[1], 1e-6))
            k = 0.7 * (1 - up) + 0.35 * south - 0.15 + 0.5 * mott    # (the HQ's lumps: light over their tops, darkening down their camera-facing undersides)
            col_ = hi.lerp(lo, max(0.0, min(1.0, k)))
            loop[col] = (col_.x, col_.y, col_.z, 1.0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


def trunk(name, foot, top, height, r0, r1, bend=0.0, base=0.0):
    """A slim leaning trunk, white birch with dark patches: a tapered tube from the foot (on the ground) to the top (`height` up)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    rings, seg = 15, 10
    a = Vector((foot[0], foot[1], base)); b = Vector((top[0], top[1], base + height))
    axis = (b - a).normalized(); side = axis.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0)); up = axis.cross(side).normalized()
    grid = []; blot = {}
    for i in range(rings):
        t = i / (rings - 1); centre = a + (b - a) * t + side * (bend * math.sin(math.pi * t) * (1 if t < 0.5 else 1)); r = r0 + (r1 - r0) * t
        grid.append([bm.verts.new(centre + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(rings - 1):
        dark = (i % 3 == 1)
        for k in range(seg):
            f = bm.faces.new([grid[i][k], grid[i][(k + 1) % seg], grid[i + 1][(k + 1) % seg], grid[i + 1][k]])
            patch = blot[(i // 2, k // 3)] if (i // 2, k // 3) in blot else blot.setdefault((i // 2, k // 3), rng.random() < (0.55 if i > rings * 0.4 else 0.06))      # (pale lavender bark, dark navy blotches gathered near the top where the canopy starts, as the HQ's)
            for loop in f.loops: loop[col] = lin(HQ.flat('#4f5a93' if patch else '#c4c9e9'))
            f.smooth = False
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


# the two orange trees (layout.py: read off the HQ frame at 10:37): a leaning birch, then its lumps of canopy, each a flat wavy disc
# standing the height of the trunk (their half widths and heights are the pixels the HQ shows, over the pixels a plan unit is there)
for k, t in enumerate(L['trees']):
    TREE = t['colour']; TREE_LOW = '#' + ''.join('%02x' % int(int(t['colour'][i:i + 2], 16) * 0.86) for i in (1, 3, 5))
    # (the HQ's trunk runs up between the canopy's tiers to its highest lump: seen in the gaps, pale bark with navy patches up there)
    _hi = max(t['lumps'], key=lambda l: l['z'])
    trunk(f'TRUNK_{k}', t['foot'], _hi['at'], _hi['z'] - t.get('base', 0.0) - 0.4, 0.7, 0.5, bend=0.5 if k == 0 else -0.4, base=t.get('base', 0.0))
    for j, lump in enumerate(t['lumps']):
        r = lump['r'] * 1.12
        cx, cy, cz, ry = lump['at'][0], lump['at'][1], lump['z'], lump.get('ry', lump['r']) * 1.12
        blob(f'TREE_{k}_{j}', (cx, cy, cz), (r * 0.78, ry * 0.78, r * 0.7), TREE, TREE_LOW)
        for m in range(9):                              # (the HQ's canopy is a cauliflower of puffs: domes round and over a smaller heart, crevices between)
            a = 2 * math.pi * m / 9 + rng.uniform(-0.25, 0.25); d = rng.uniform(0.5, 0.72)
            pr = rng.uniform(0.38, 0.5)
            blob(f'TREE_{k}_{j}_p{m}', (cx + math.cos(a) * r * d, cy + math.sin(a) * ry * d, cz + rng.uniform(-0.1, 0.25) * r),
                 (r * pr, ry * pr, r * pr * 0.9), TREE, TREE_LOW, sub=3, bumps=0.05)
# cast shadows of the canopies (the HQ bakes them as dark flat shapes): each lump's footprint shifted along the light (east 0.10, north 0.44 per
# unit of height, the game's sun), dark green on the grass and dark teal on the water
SHADOW_GRASS, SHADOW_WATER = '#9fcf8c', '#5b8a9f'
for k, t in enumerate(L['trees']):
    for j, lump in enumerate(t['lumps']):
        zc = lump['z']; cx, cy = lump['at'][0] + 0.10 * zc, lump['at'][1] + 0.44 * zc
        r, ry = lump['r'] * 1.05, lump.get('ry', lump['r']) * 1.05
        pts = [(cx + math.cos(i * math.pi / 12) * r, cy + math.sin(i * math.pi / 12) * ry) for i in range(24)]
        on_land = any(inside((cx, cy), [tuple(q) for q in poly]) for poly in G['polygons'])
        if on_land: flat(f'SHADOW_{k}_{j}', [(pts, SHADOW_GRASS, 0)], z=0.03)      # (the HQ's water shows none under its trees)
# the fallen leaves: small red ovals on the grass by the trees' feet
for k, (x, y, *_pc) in enumerate(L['petals']):
    a0 = rng.uniform(0, math.pi); w, h = rng.uniform(0.22, 0.34), rng.uniform(0.12, 0.19)      # (the HQ's leaves are plump ovals, ~14 x 8 px)
    pts = [(x + math.cos(i * math.pi / 5) * w * math.cos(a0) - math.sin(i * math.pi / 5) * h * math.sin(a0),
            y + math.cos(i * math.pi / 5) * w * math.sin(a0) + math.sin(i * math.pi / 5) * h * math.cos(a0)) for i in range(10)]
    flat(f'PETAL_{k}', [(pts, (_pc[0] if _pc else '#d95a38'), 0)], z=0.06)

# short isolated horizontal white ripple dashes in the open water (the HQ's, away from the island), screen-horizontal = plan x
_rp = random.Random(23)
_land_wide = [[tuple(q) for q in offset_poly([tuple(r) for r in poly], 4.0)] for poly in G['polygons']]
_stone_wide = [[tuple(q) for q in offset_poly([tuple(r) for r in blk['top']], 3.0)] for blk in S]
_xs = [p[0] for g_ in G['polygons'] for p in g_]; _ys = [p[1] for g_ in G['polygons'] for p in g_]
_n = 0
for _try in range(600):
    if _n >= 16: break
    rx = _rp.uniform(min(_xs) - 14, max(_xs) + 14); ry = _rp.uniform(min(_ys) - 12, max(_ys) + 12)
    if any(inside((rx, ry), w_) for w_ in _land_wide + _stone_wide): continue
    ln = _rp.uniform(1.0, 2.2)
    flat(f'RIPPLE_{_n}', [([(rx - ln / 2, ry - 0.05), (rx + ln / 2, ry - 0.05), (rx + ln / 2 + 0.08, ry), (rx + ln / 2, ry + 0.05), (rx - ln / 2, ry + 0.05), (rx - ln / 2 - 0.08, ry)], '#d9f0f8', 0)], z=WATER_Z + 0.08)
    _n += 1
# ---------------------------------------------------------------------------------------------------------------- the bridge, bushes, pots, gate, lanterns
# the bridge: a purple-brown brick deck between the islands (the HQ, 1:15), planks laid across it, a hair above the grass
BRIDGE_TOP, BRIDGE_SIDE = lit('bridge_top', HQ.lit('#a2819e', 0.98)), lit('bridge_side', HQ.lit('#7b6190', 0.875))
if L['bridge']:
    body('BRIDGE', [tuple(p) for p in L['bridge']], 0.12, BRIDGE_TOP, BRIDGE_SIDE, top_r=0.1, bottom=WATER_Z - 0.5, soft=True, top_seg=2)
    bp = [tuple(p) for p in L['bridge']]
    # the deck's own axes: u along the walls (A-B: the HQ's courses of bricks run that way, their joints the pale streaks), v across, B-C
    A_, B_, C_, D_ = bp
    ux_, uy_ = B_[0] - A_[0], B_[1] - A_[1]; ln_ = math.hypot(ux_, uy_); ux_, uy_ = ux_ / ln_, uy_ / ln_
    vx_, vy_ = -uy_, ux_
    cxb = sum(p[0] for p in bp) / 4; cyb = sum(p[1] for p in bp) / 4
    us = [(p[0] - cxb) * ux_ + (p[1] - cyb) * uy_ for p in bp]; vs = [(p[0] - cxb) * vx_ + (p[1] - cyb) * vy_ for p in bp]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    to_xy = lambda u, v: (cxb + u * ux_ + v * vx_, cyb + u * uy_ + v * vy_)
    seams = []
    # the HQ's deck (1:12, close up): overlapping scalloped shingles in rows along the walls, each lighter over its body with a darker
    # shadowed front edge (the edge towards the camera), the rows overlapping; on some rows a pale scalloped line along the front edges.
    # Its tones span only ~16 levels (5th-95th percentile #9c7d9a .. #ab8ba0): measured
    course, brick = 1.05, 1.5
    front = -1.0 if vy_ < 0 else 1.0                   # (the HQ's shingles bulge AWAY from the camera, up the frame: +v when it points north)
    rr_ = random.Random(5)
    n_courses = int((v1 - v0) / course) + 1
    order = range(n_courses - 1, -1, -1) if front > 0 else range(n_courses)      # (each row is drawn over the one its scallops bulge into)
    for depth, i in enumerate(order):
        vb, vf = v0 + i * course, v0 + (i + 1) * course          # (the row's band; its front edge at vf if front > 0, else at vb)
        if front < 0: vb, vf = vf, vb
        off = 0.0 if i % 2 else brick / 2
        u = u0 - off
        pale_row = rr_.random() < 0.3
        while u < u1:
            ua, ub = max(u + 0.03, u0), min(u + brick - 0.03, u1)
            if ub - ua > 0.25:
                um = (ua + ub) / 2; hw = (ub - ua) / 2
                # the tile: its back edge straight, its front a shallow arc bulging 0.3 past the row's front
                arc = [(um + hw * math.cos(t), vf + front * 0.3 * math.sin(t)) for t in [math.pi * k / 8 for k in range(9)]][::-1]
                body_ = [(ua, vb), (ub, vb)] + [(x, y) for x, y in arc[::-1]] if False else [(ua, vb), (ub, vb), (ub, vf)] + arc[1:-1] + [(ua, vf)]
                col = ['#a6859f', '#a4839e', '#a887a1'][rr_.randrange(3)]
                dz = 0.004 * depth
                seams.append(([to_xy(x, y) for x, y in body_], col, dz))
                # its front shadow: a band along the arc, 0.22 deep, darker
                inner = [(um + (x - um) * 0.97, y - front * 0.09) for x, y in arc]
                band = [to_xy(x, y) for x, y in arc] + [to_xy(x, y) for x, y in inner[::-1]]
                seams.append((band, '#9a7b98', dz + 0.0015))
                if pale_row:
                    edge = [to_xy(x, y) for x, y in arc] + [to_xy(um + (x - um) * 0.97, y - front * 0.06) for x, y in arc[::-1]]
                    seams.append((edge, '#b496a6', dz + 0.003))
            u += brick
    flat('BRIDGE_seams', [([(x, y) for x, y in poly], col, dz) for poly, col, dz in seams], z=0.135)
WALL_TOP, WALL_SIDE = lit('wall_top', HQ.lit('#828fc3', 0.98)), lit('wall_side', HQ.lit('#5f6ca3', 0.875))      # (the HQ walls' bright and dark medians, measured)
# the bridge's two walls: chains of fat rounded bricks along the deck's long sides (A-B and C-D), a taller cap block at the far end of each
bq = [tuple(p) for p in L['bridge']]
if len(bq) == 4:
    A, B_, C_, D_ = bq
    for tag, p0, p1, outward in (('NW', A, B_, (-1, 1)), ('SE', D_, C_, (1, -1))):
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; ln0 = math.hypot(dx, dy); ux, uy = dx / ln0, dy / ln0
        # (how far each wall runs past the deck's corners, and how wide it is, measured: the NW wall runs on onto the east island, ~3.7 units past B)
        e0, e1, wid, off = (0.9, 4.6, 1.8, 0.8) if tag == 'NW' else (0.9, 4.2, 1.3, 0.5)      # (the SE wall too runs on onto the east island, behind the crates: to (1180, 500))
        p0 = (p0[0] - ux * e0, p0[1] - uy * e0); p1 = (p1[0] + ux * e1, p1[1] + uy * e1); ln = ln0 + e0 + e1
        nx, ny = -uy, ux
        # which side is outward: away from the deck's centre
        cxd = sum(q[0] for q in bq) / 4; cyd = sum(q[1] for q in bq) / 4
        if (((p0[0] + p1[0]) / 2 - cxd) * nx + ((p0[1] + p1[1]) / 2 - cyd) * ny) < 0: nx, ny = -nx, -ny
        n_w = max(3, round(ln / 3.3)); piece = ln / n_w      # (the HQ's: ~5 blocks a wall)
        # (the pieces along the deck ride their wall's slider, the glTF node SLIDER_<k> the renderer moves by the rules' progress; the run on
        # onto the east island stays: layout.py `bridge_walls`)
        _slider = bpy.data.objects.new('SLIDER_%d' % (0 if tag == 'NW' else 1), None); sc.collection.objects.link(_slider)
        _slides_to = ln0 + e0 + 0.9
        for j in range(n_w):
            mid = (j + 0.5) * piece
            cap = (j == n_w - 1) if tag == 'NW' else (j == 0)
            cxw, cyw = p0[0] + ux * mid + nx * off, p0[1] + uy * mid + ny * off
            # (the HQ's blocks stand ~1.1 high with bevelled tops; the cap at the island end a taller near-cube)
            body(f'BWALL_{tag}_{j}', rounded_rect(cxw, cyw, piece - 0.08 - (0.3 if cap else 0), wid + (0.35 if cap else 0), math.degrees(math.atan2(uy, ux)), 0.45),
                 1.1 + (0.45 if cap else 0) + rng.uniform(-0.06, 0.06), WALL_TOP, WALL_SIDE, top_r=0.28, corner_r=0.45, bottom=STONE_BOTTOM, soft=True, top_seg=3,
                 parent=_slider)      # (the whole wall slides, its run onto the east island too: the HQ leaves nothing behind, 1:19)
# hex bushes, pots and the gong gate: the gong islands' own models (art/sky_islands/blender/objects.py), as they are
for k, bu in enumerate(L['bushes']):
    obj_models.hexplant({'x': bu['at'][0], 'y': bu['at'][1], 'width': bu['r'] * 1.6}, PAL, FLAT, None, k)
for k, po in enumerate(L['pots']):
    _before = set(bpy.data.objects.keys())
    obj_models.pot({'x': po['at'][0], 'y': po['at'][1], 'width': po['w'], 'height': po['h']}, PAL, FLAT, None, k)
    for n_ in set(bpy.data.objects.keys()) - _before: bpy.data.objects[n_].location.z += po['z']
# stone lanterns: a small pale-lavender post with a cap
for k, (x, y) in enumerate(L['lanterns']):
    # (the HQ's lanterns are grey-green stone, stacked: a base, a post, a lit box, a roof)
    # (the HQ's, 1:12: ~2 units across, ~4 tall, turned 45 degrees: a base block, a lit box with dark windows, a stepped roof)
    for j_, (w_, z0, z1) in enumerate(((1.5, 0.0, 0.9), (1.2, 0.9, 1.1), (1.8, 1.1, 2.2), (2.1, 2.2, 2.55), (1.5, 2.55, 2.9), (0.9, 2.9, 3.25), (0.45, 3.25, 3.6))):
        paint_flat(body(f'LANTERN_{k}_{j_}', rounded_rect(x, y, w_ * 0.55, w_ * 0.55, 45, 0.12), z1, FLAT, FLAT, top_r=0.08, bottom=z0, soft=True, top_seg=1), '#adc3b9', '#8aa69d', '#9bb5ab')
    for sx in (-1, 1):                                              # (its windows: dark slots on the two camera-facing faces)
        a_ = math.radians(45 + (90 if sx > 0 else 0) - 90); nx_, ny_ = math.cos(a_ - math.pi / 2) * sx, math.sin(a_ - math.pi / 2)
        cxw, cyw = x + 0.51 * (-0.707 if sx < 0 else 0.707), y - 0.51 * 0.707
        tx, ty = (0.707, -0.707) if sx < 0 else (0.707, 0.707)
        quad = [(cxw - tx * 0.2, cyw - ty * 0.2, 1.35), (cxw + tx * 0.2, cyw + ty * 0.2, 1.35), (cxw + tx * 0.2, cyw + ty * 0.2, 1.95), (cxw - tx * 0.2, cyw - ty * 0.2, 1.95)]
        _flat3d(f'LANTERN_{k}_win{sx}', [([Vector(q) for q in quad[:3]], '#4f6266'), ([Vector(q) for q in (quad[0], quad[2], quad[3])], '#4f6266')])
# the gong gate: the gong islands' model, turned to the gate's own way (its posts stand along the plan diagonal in the HQ frame here)
gl, gr = L['gate']['left'], L['gate']['right']
gate_root = bpy.data.objects.new('GATE', None); sc.collection.objects.link(gate_root)
gate_root.location = ((gl[0] + gr[0]) / 2, (gl[1] + gr[1]) / 2, 0.0)
gate_root.rotation_euler = (0, 0, math.atan2(gr[1] - gl[1], gr[0] - gl[0]))
obj_models.gong({'x': 0.0, 'y': 0.0, 'width': math.hypot(gr[0] - gl[0], gr[1] - gl[1]) / 0.8, 'height': 4.9}, PAL, FLAT, gate_root)

# ---------------------------------------------------------------------------------------------------------------- water
xs = [p[0] for g in G['polygons'] for p in g]; ys = [p[1] for g in G['polygons'] for p in g]
cx, cy, half = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 30      # (package.py's field covers the same square)
me = bpy.data.meshes.new('FOUNTAIN_water')
me.from_pydata([(cx - half, cy - half, WATER_Z), (cx + half, cy - half, WATER_Z), (cx + half, cy + half, WATER_Z), (cx - half, cy + half, WATER_Z)], [], [(0, 1, 2, 3)])
water = bpy.data.objects.new('FOUNTAIN_water', me); sc.collection.objects.link(water); me.materials.append(WATER)

# ---------------------------------------------------------------------------------------------------------------- camera, light, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * L['zoom'] / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = lin(HQ.flat('#74a2b2'))
# the game's light, so the preview renders like the game (render/three/softLook.ts, the map's `look`): an ambient of 0.52 and a sun of
# 0.4812 toward [-0.0949, 0.9111, 0.4012] (x east, y up, z south). In Blender (x east, y north, z up) a sun's rays travel along its -Z;
# the tilt (24.4 degrees) and the turn (-13.3) below send them along (0.095, 0.401, -0.911), the way the game's light falls. A sun of
# strength S lights a diffuse surface to albedo * S * cos / pi, so S = 0.4812 * pi; the world's uniform 0.52 lights it to albedo * 0.52.
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 0.4812 * math.pi; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(24.4), 0, math.radians(-13.3))
bgn = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND'); bgn.inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)   # (the water's colour behind: the sheet covers it)
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False); so.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'island.glb'), export_format='GLB', use_selection=True,
                          export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
MASK_OF = ('STONE_', 'BOULDER_')   # (which things the mask shows)
if 'mask' in args[1:]:
    # the stones alone, white on black, through the HQ camera: measured against the HQ's rock mask (art/bridge_islands/compare.py)
    emit = bpy.data.materials.new('mask'); emit.use_nodes = True; nt = emit.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); bg = nt.nodes.new('ShaderNodeEmission'); bg.inputs['Color'].default_value = (1, 1, 1, 1)
    nt.links.new(bg.outputs[0], out.inputs['Surface'])
    black = bpy.data.materials.new('maskblack'); black.use_nodes = True
    for n in list(black.node_tree.nodes):
        if n.type != 'OUTPUT_MATERIAL': black.node_tree.nodes.remove(n)
    bo = next(n for n in black.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'); be = black.node_tree.nodes.new('ShaderNodeEmission'); be.inputs['Color'].default_value = (0, 0, 0, 1)
    black.node_tree.links.new(be.outputs[0], bo.inputs['Surface'])
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith(MASK_OF):
            o.data.materials.clear(); o.data.materials.append(emit)
        elif o.type == 'MESH':                              # (everything else black, not hidden: the grass and the water cover a stone's foot)
            o.data.materials.clear(); o.data.materials.append(black)
    next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0, 0, 0, 1)
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'mask.png'); bpy.ops.render.render(write_still=True)
print('polygons:', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'stones:', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(('STONE_', 'BOULDER_'))))
print('lily island built:', len(G['polygons']), 'ground,', len(S), 'stones,', len(L['crates']), 'crates,', len(L['pads']), 'pads')
