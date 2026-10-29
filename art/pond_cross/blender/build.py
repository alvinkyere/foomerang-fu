"""The cross pond in 3D, object by object (2026-10-28): foomerang-fu physics hq.mp4 4:27, seen through the game's camera.

  Blender -b --python art/pond_cross/blender/build.py -- <out_dir> [render]

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
L, S, G, P = J('art/pond_cross/layout.json'), J('art/pond_cross/stones.json'), J('art/pond_cross/ground.json'), J('art/pond_cross/props.json')
GRASS_BOX = J('art/pond_cross/blender/grass.json')
CAM = J('art/sky_islands/camera.json')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sys.path.insert(0, os.path.join(ROOT, 'art/pond_cross'))
import colour as HQ                                                # (the HQ's colours as the video looks in a browser: colour.py)
sys.path.insert(0, os.path.join(ROOT, 'art/sky_islands/blender'))
import objects as obj_models                                       # the gong islands' crate and bamboo, as they are
PAL = J('art/sky_islands/objects.json')['palettes']
rng = random.Random(11)

WATER_Z, DEPTH = -0.6, 2.4
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


def image(path):
    img = bpy.data.images.load(os.path.join(ROOT, path)); img.pack(); return img


# the HQ's colours (4:27, medians of each class). The game's soft light lands a top at about its base colour and a front face
# at ~92% of it, so the lavender sides are set a little brighter than they should appear (#7683be).
GRASS = lit('pond_grass', image=image('art/pond_cross/blender/grass.png'))
STONE_TOP, STONE_SIDE = lit('pond_stone_top', HQ.lit('#a1abe6', 0.98)), lit('pond_stone_side', HQ.lit('#8795d7', 0.875))
LIP_SIDE = lit('pond_lip', HQ.lit('#8795d7', 0.875))
WOOD = lit('pond_wood', image=image('art/pond_cross/blender/wood.png'))
GROOVE, EDGE, EDGE_FRONT = lit('pond_groove', HQ.lit('#8c6e56', 0.98)), lit('pond_edge', HQ.lit('#9c7e7b', 0.81)), lit('pond_edge_front', HQ.lit('#c8a993', 0.90))      # (the HQ's side: lit 0.71 toward the camera it is pink-tan #b49884, lit 0.52 on an east face mauve #7e6664: one colour, the game's light does the rest)
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


def body(name, outline, top_z, top_mat, side_mat, top_r=0.0, corner_r=0.0, bottom=STONE_BOTTOM, uv=None, parent=None, soft=False, top_seg=3, front_mat=None):
    """An outline extruded down to `bottom`: its vertical corners rounded by `corner_r`, its top edge by `top_r`; the flat top
    one material, the rest the other. Smooth across the rounds, sharp where faces meet squarely."""
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, top_z)) for x, y in outline])
    face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face], use_keep_orig=True)
    bmesh.ops.translate(bm, verts=[g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, bottom - top_z))
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
for k, poly in enumerate(G['polygons']):
    body(f'BANK_{k}', poly, 0.0, GRASS, LIP_SIDE, top_r=0.3, bottom=WATER_Z - DEPTH)

# ---------------------------------------------------------------------------------------------------------------- stones
# The HQ's stones are soft: slabs with rounded ends and a rolled top edge, boulders with organic outlines, light running smoothly
# over every round, no creases. Each footprint is the HQ's flat top grown by GROW (the roll takes it back), its sides rounded by
# CORNER, its top edge rolled by ROLL over SEGS steps.
SEAM = 0.1
GROW_SLAB = float(os.environ.get('POND_GROW_SLAB', 0.22))     # (the margin of a wall slab and of a boulder are fitted apart)
# (the HQ's facets are straight with small rounded corners and a narrow soft edge: not pillows)
GROW, CORNER_SLAB, CORNER_BOULDER, ROLL, SEGS = float(os.environ.get('POND_GROW', 0.35)), float(os.environ.get('POND_CORNER_SLAB', 0.35)), float(os.environ.get('POND_CORNER', 0.4)), float(os.environ.get('POND_ROLL', 0.22)), 4
for k, b in enumerate(S):
    H = b['height']
    if b['kind'] == 'slab':
        cx, cy, rw, rh, ang = b['rect']
        ang = -ang    # (OpenCV's angle is for y down, the plan's y is north: the turn is mirrored)
        # (stones.py already separates the blocks along their visible seams: a run is one block; only one over 12 is cut in two)
        n = max(1, math.ceil(rw / 12.0)); piece = rw / n
        a = math.radians(ang); ux, uy = math.cos(a), math.sin(a)
        for j in range(n):
            mid = -rw / 2 + (j + 0.5) * piece
            outline = rounded_rect(cx + mid * ux, cy + mid * uy, piece + 2 * GROW_SLAB - (SEAM if n > 1 else 0), rh + 2 * GROW_SLAB, ang, CORNER_SLAB)
            body(f'STONE_{k}_{j}', outline, H + rng.uniform(-0.03, 0.03), STONE_TOP, STONE_SIDE, top_r=ROLL, bottom=STONE_BOTTOM, soft=True, top_seg=SEGS)
    else:
        pts = offset_poly([tuple(p) for p in b['clean']], GROW)                       # (the hull in a few straight sides, grown a little)
        body(f'BOULDER_{k}', pts, H, STONE_TOP, STONE_SIDE, top_r=ROLL, corner_r=CORNER_BOULDER, bottom=STONE_BOTTOM, soft=True, top_seg=SEGS)

# ---------------------------------------------------------------------------------------------------------------- raft
R_ = J('art/pond_cross/raft.json'); arm, wid = R_['arm'], R_['width']        # (ground.py: the raft trimmed to its pond)
raft = bpy.data.objects.new('RAFT', None); sc.collection.objects.link(raft)
raft.location = (R_['centre'][0], R_['centre'][1], 0.0)
DECK, GAP, THICK = float(R_.get('deck', 0.18)), 0.2, 0.9        # (fit_raft.py: the HQ's deck stands 0.8 above the ground)
reach = (arm - wid) / 2                                            # an arm plank's length, past the centre square
planks = [(-wid / 2, wid / 2, -wid / 2, wid / 2)]                  # (u0, u1, v0, v1): the centre square
planks += [(wid / 2 + GAP / 2, wid / 2 + reach, -wid / 2, wid / 2), (-wid / 2 - reach, -wid / 2 - GAP / 2, -wid / 2, wid / 2),
           (-wid / 2, wid / 2, wid / 2 + GAP / 2, wid / 2 + reach), (-wid / 2, wid / 2, -wid / 2 - reach, -wid / 2 - GAP / 2)]
local_uv = lambda x, y: ((x + 20) / 8.0, (y + 20) / 8.0)
for k, (u0, u1, v0, v1) in enumerate(planks):
    if k == 0: u0, u1, v0, v1 = u0 + GAP / 2, u1 - GAP / 2, v0 + GAP / 2, v1 - GAP / 2
    body(f'RAFT_plank_{k}', [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], DECK, WOOD, EDGE, top_r=0.07, bottom=DECK - THICK, uv=local_uv, parent=raft, front_mat=EDGE_FRONT)
# the grooves between the planks: a dark slab under the whole cross, a hair below the deck, which the gaps show
for (u0, u1, v0, v1) in ((-arm / 2, arm / 2, -wid / 2, wid / 2), (-wid / 2, wid / 2, -arm / 2, arm / 2)):
    ins = 0.08                                       # (inset: the planks' own sides, not this slab's, are the raft's edge)
    body(f'RAFT_base_{int(u1)}', [(u0 + ins, v0 + ins), (u1 - ins, v0 + ins), (u1 - ins, v1 - ins), (u0 + ins, v1 - ins)], DECK - 0.08, GROOVE, GROOVE, bottom=DECK - THICK + 0.05, uv=local_uv, parent=raft)
# the HQ's edge (4:27, the raft's edge enlarged): a thin dark rim round the deck's outer edge; under it the side, with a row of dark
# rounded ovals along it (the shadowed gaps between the ends of the logs beneath); and no pegs on the deck. A crate's soft shadow lies
# on the deck beside it.
RIM, OVAL, SHADOW = '#8f7162', '#5b4f66', '#a68c6b'
rim, ovals = [], []
def oval(cx, cy, cz, along, w, h, outward):
    """A flat ellipse on a plank's side face, lying along the edge (`along`: a unit vector), `outward` the face's normal."""
    pts = [(cx + along[0] * math.cos(t) * w / 2 + outward[0] * 0.015, cy + along[1] * math.cos(t) * w / 2 + outward[1] * 0.015, cz + math.sin(t) * h / 2) for t in [i * math.pi / 8 for i in range(16)]]
    return pts
oval_tris = []
for (u0, u1, v0, v1) in planks[1:]:
    along_u = (u1 - u0) > (v1 - v0)
    sides = ((v0, -1), (v1, 1)) if along_u else ((u0, -1), (u1, 1))
    length = (u1 - u0) if along_u else (v1 - v0)
    n = max(2, int(length // 1.3))
    for edge_at, sign in sides:
        # the rim: a thin strip along the deck's outer edge
        if along_u: rim.append(([(u0, edge_at - sign * 0.14), (u1, edge_at - sign * 0.14), (u1, edge_at), (u0, edge_at)], RIM, 0))
        else: rim.append(([(edge_at - sign * 0.14, v0), (edge_at, v0), (edge_at, v1), (edge_at - sign * 0.14, v1)], RIM, 0))
    # the end of an arm (its outer end) has its rim too
    end = (u1, 1, True) if u0 > 0 else (u0, -1, True) if u1 < 0 else (v1, 1, False) if v0 > 0 else (v0, -1, False)
    # the ovals run along the end face: dark rounded gaps between the ends of the logs, every ~1.3 units
    span = (v1 - v0) if end[2] else (u1 - u0)
    for j in range(max(2, int(span // 1.3))):
        t = (j + 0.5) / max(2, int(span // 1.3))
        if end[2]: p = (end[0], v0 + (v1 - v0) * t, DECK - 0.5); al = (0, 1, 0); out = (end[1], 0, 0)
        else: p = (u0 + (u1 - u0) * t, end[0], DECK - 0.5); al = (1, 0, 0); out = (0, end[1], 0)
        pts = oval(p[0], p[1], p[2], al, 0.72, 0.36, out)
        c0 = Vector((p[0] + out[0] * 0.015, p[1] + out[1] * 0.015, p[2]))
        for i in range(16): oval_tris.append(([c0, Vector(pts[i]), Vector(pts[(i + 1) % 16])], OVAL))
    if end[2]: rim.append(([(end[0] - end[1] * 0.14, v0), (end[0], v0), (end[0], v1), (end[0] - end[1] * 0.14, v1)], RIM, 0))
    else: rim.append(([(u0, end[0] - end[1] * 0.14), (u1, end[0] - end[1] * 0.14), (u1, end[0]), (u0, end[0])], RIM, 0))
flat('RAFT_rim', rim, parent=raft, z=DECK + 0.006)
if oval_tris:
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for pts, hx in oval_tris:
        for order in (pts, pts[::-1]):
            f = bm.faces.new([bm.verts.new(p) for p in order])
            for loop in f.loops: loop[col] = lin(HQ.flat(hx))
    me = bpy.data.meshes.new('RAFT_ovals'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('RAFT_ovals', me); sc.collection.objects.link(o); me.materials.append(FLAT); o.parent = raft
shadows = [([(u - 0.95 + dx, v - 0.62 + dy) for dx, dy in ((0, 0), (1.9, 0), (1.9, 1.5), (0, 1.5))], SHADOW, 0) for u, v in R_['crates']]
flat('RAFT_shadows', shadows, parent=raft, z=DECK + 0.004)
for k, (u, v) in enumerate(R_['crates']):
    obj_models.crate({'x': u, 'y': v, 'width': 1.43}, PAL, FLAT, raft, k)
    # (the crate stands on the deck: its builder puts it on z = 0)
for c in list(raft.children):
    if c.name.startswith('CRATE_'):
        c.name = 'RAFT_' + c.name; c.location.z += DECK
raft.rotation_euler = (0, 0, math.radians(R_['degrees']))

# ---------------------------------------------------------------------------------------------------------------- pond life
PAD, PAD_DARK, FLOWER, FLOWER_HEART = '#62ad5e', '#4f9a52', '#f6dbda', '#e8a9b5'
for k, p in enumerate(P['pads']):
    x, y = p['at']; r = p['r'] * 0.8; z = WATER_Z + 0.06
    notch = math.radians(38); a0 = rng.uniform(0, 2 * math.pi)
    disc = [(x, y)] + [(x + math.cos(a0 + notch / 2 + t * (2 * math.pi - notch) / 24) * r, y + math.sin(a0 + notch / 2 + t * (2 * math.pi - notch) / 24) * r) for t in range(25)]
    parts = []
    for i in range(1, 25):
        parts.append(([disc[0], disc[i], disc[i + 1] if i < 24 else disc[24]], PAD, 0))
    for j in range(7):                                             # the veins
        a = a0 + notch / 2 + (j + 0.5) * (2 * math.pi - notch) / 7
        parts.append(([(x, y), (x + math.cos(a - 0.07) * r * 0.78, y + math.sin(a - 0.07) * r * 0.78), (x + math.cos(a + 0.07) * r * 0.78, y + math.sin(a + 0.07) * r * 0.78)], PAD_DARK, 0.01))
    star = [(x + math.cos(i * math.pi / 8) * r * (0.42 if i % 2 == 0 else 0.2), y + math.sin(i * math.pi / 8) * r * (0.42 if i % 2 == 0 else 0.2)) for i in range(16)]
    parts.append((star, FLOWER, 0.03))
    parts.append(([(x + math.cos(a) * r * 0.1, y + math.sin(a) * r * 0.1) for a in [i * math.pi / 4 for i in range(8)]], FLOWER_HEART, 0.04))
    flat(f'PAD_{k}', parts, z=z)
for k, d in enumerate(P['dots']):
    x, y = d['at']; r = max(0.25, min(d['r'], 0.6))
    flat(f'DOT_{k}', [([(x + math.cos(a) * r, y + math.sin(a) * r) for a in [i * math.pi / 6 for i in range(12)]], '#7fba7d', 0)], z=WATER_Z + 0.05)
# leafy tufts: a jagged low clump of dark green leaves
for k, t in enumerate(P['tufts']):
    x, y = t['at']; r = max(0.5, min(t['r'], 1.1))
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for j in range(9):
        a = rng.uniform(0, 2 * math.pi); d = rng.uniform(0, r * 0.7); h = rng.uniform(0.5, 1.1) * r
        base = Vector((x + math.cos(a) * d, y + math.sin(a) * d, 0.0))
        tip = base + Vector((math.cos(a) * r * 0.35, math.sin(a) * r * 0.35, h))
        side = Vector((-math.sin(a), math.cos(a), 0)) * r * 0.3
        f = bm.faces.new([bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(tip)])
        for loop in f.loops: loop[col] = lin(HQ.flat('#4f9a5f' if j % 2 else '#5aa862'))
    me = bpy.data.meshes.new(f'TUFT_{k}'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f'TUFT_{k}', me); sc.collection.objects.link(o); me.materials.append(FLAT)
for k, b in enumerate(P['bamboo']):
    obj_models.bamboo({'x': b['at'][0], 'y': b['at'][1], 'width': 0.42, 'height': rng.uniform(2.6, 4.2)}, PAL, FLAT, None, 100 + k)

# ---------------------------------------------------------------------------------------------------------------- bunting
# two strings rising from the north wall's gap (props.py), a red pennant hanging from each ~1.2 units: flat colours, both sides
def flat3d(name, tris):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for pts, hx in tris:
        for order in (pts, pts[::-1]):
            f = bm.faces.new([bm.verts.new(p) for p in order])
            for loop in f.loops: loop[col] = lin(HQ.flat(hx))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o
tris = []
for st in P['strings']:
    a, b = Vector(st['a']), Vector(st['b']); d = (b - a); length = d.length; d.normalize()
    side = Vector((-d.y, d.x, 0)); side.normalize(); side *= 0.04
    tris.append(([a - side, a + side, b + side], '#5b3c50')); tris.append(([a - side, b + side, b - side], '#5b3c50'))
    t = 0.7
    while t < length - 0.3:
        p = a + d * t
        tris.append(([p - d * 0.4, p + d * 0.4, p + Vector((0, 0, -1.25))], '#e73e1e'))
        t += 1.2
flat3d('BUNTING', tris)

# ---------------------------------------------------------------------------------------------------------------- water
xs = [p[0] for g in G['polygons'] for p in g]; ys = [p[1] for g in G['polygons'] for p in g]
cx, cy, half = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 12      # (package.py's field covers the same square)
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
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'pond.glb'), export_format='GLB', use_selection=True,
                          export_cameras=False, export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
MASK_OF = ('RAFT_plank_',) if os.environ.get('POND_MASK') == 'raft' else ('STONE_', 'BOULDER_')   # (which things the mask shows)
if 'mask' in args[1:]:
    # the stones alone, white on black, through the HQ camera: measured against the HQ's rock mask (art/pond_cross/compare.py)
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
print('pond built:', len(G['polygons']), 'banks,', len(S), 'stones,', len(planks), 'planks,', len(R_['crates']), 'crates,', len(P['pads']), 'pads')
