"""The cross pond in 3D, object by object (2026-10-28): foomerang-fu physics hq.mp4 4:27, seen through the game's camera.

  Blender -b --python art/lily_island/blender/build.py -- <out_dir> [render]

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
L, S, G, P = J('art/lily_island/layout.json'), J('art/lily_island/stones.json'), J('art/lily_island/ground.json'), {}
GRASS_BOX = J('art/lily_island/blender/grass.json')
CAM = J('art/sky_islands/camera.json')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sys.path.insert(0, os.path.join(ROOT, 'art/lily_island'))
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
GRASS = lit('pond_grass', image=image('art/lily_island/blender/grass.png'))      # (a flat pale-lime swatch: the island's rim colour)
SLAB_TOP, SLAB_SIDE = lit('pond_slab_top', HQ.lit('#818cc1', 0.98)), lit('pond_slab_side', HQ.lit('#566aa6', 0.875))      # (the island's slabs: in the HQ they are darker than its boulders)
# per block, as the HQ frame shows it (its trees and slabs throw shadows on the stones: the NW slab and the W boulder lie in them), in
# the order of stones.json: (top, side)
BLOCK_COLOURS = [('#9fbff0', '#6f8fd8'), ('#7aa6e8', '#4f78c8'), ('#818cc1', '#5162a2'), ('#a6baef', '#5e78b9'), ('#7d96e0', '#5a74c4'),
                 ('#707fb4', '#5a69a0'), ('#a5b3ea', '#7388cf'), ('#a3b4ea', '#6a7cb5')]
BLOCK_TAPER = {3: 1.0, 4: 1.0}      # (the E cube and its low rock have straight sides; the other rocks are broader at the foot)
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
for k, poly in enumerate(G['polygons']):
    body(f'BANK_{k}', poly, 0.0, GRASS, LIP_SIDE, top_r=0.3, bottom=WATER_Z - DEPTH)


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
RIM_GRASS = lit('island_rim', HQ.lit('#e4f6a2', 0.98))
SHADE_GRASS = lit('island_shade', HQ.lit('#cae996', 0.98))
PALE_GRASS = lit('island_pale', HQ.lit('#e4f6a2', 0.98))
LIME_GRASS = lit('island_lime', HQ.lit('#ddf293', 0.98))
# the kerb: the lavender stone wall that runs round the island (the HQ's, ~1 unit thick, its top rounded), a run of straight pieces laid
# along the outline, each drawn in half a unit
KERB_TOP, KERB_SIDE = lit('island_kerb_top', HQ.lit('#8095dc', 0.98)), lit('island_kerb_side', HQ.lit('#6378c2', 0.875))
KERB_H, KERB_W = 0.8, 0.5
def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


UNDER_STONES = [[tuple(p) for p in offset_poly([tuple(q) for q in blk['top']], 0.4)] for blk in S]      # (the kerb runs under a stone, never over it)
for k, poly in enumerate(G['polygons']):
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1.0 if area > 0 else -1.0                                   # (counter-clockwise: the inside is to the left)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        length = math.hypot(x1 - x0, y1 - y0)
        if length < 0.6: continue
        if any(inside(((x0 + x1) / 2, (y0 + y1) / 2), u) or inside((x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.25), u) or inside((x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.75), u) for u in UNDER_STONES): continue
        ux, uy = (x1 - x0) / length, (y1 - y0) / length
        nx, ny = -uy * sgn, ux * sgn                                  # inward
        mx, my = (x0 + x1) / 2 + nx * KERB_W * 0.5, (y0 + y1) / 2 + ny * KERB_W * 0.5
        body(f'KERB_{k}_{i}', rounded_rect(mx, my, length + KERB_W, KERB_W, math.degrees(math.atan2(uy, ux)), 0.15), KERB_H, KERB_TOP, KERB_SIDE,
             top_r=0.22, bottom=WATER_Z - DEPTH, soft=True, top_seg=3)
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
        # the HQ's slabs are fat rounded barrels with chamfered corners, not boxes: the traced outline, grown a little, its corners rounded
        pts = offset_poly([tuple(p) for p in b['clean']], GROW_SLAB)
        body(f'STONE_{k}_0', pts, H + rng.uniform(-0.03, 0.03), BLOCK_MATERIALS[k][0], BLOCK_MATERIALS[k][1], top_r=ROLL, corner_r=CORNER_BOULDER,
             bottom=STONE_BOTTOM, soft=True, top_seg=SEGS, taper=BLOCK_TAPER.get(k, 0.93))
    else:
        pts = offset_poly([tuple(p) for p in b['clean']], GROW)                       # (the hull in a few straight sides, grown a little)
        body(f'BOULDER_{k}', pts, H, BLOCK_MATERIALS[k][0], BLOCK_MATERIALS[k][1], top_r=ROLL, corner_r=CORNER_BOULDER, bottom=STONE_BOTTOM, soft=True, top_seg=SEGS, taper=BLOCK_TAPER.get(k, 0.88))

# ---------------------------------------------------------------------------------------------------------------- island life
PAD, PAD_RIM, PAD_DARK, FLOWER, FLOWER_HEART = '#76b668', '#8cc47c', '#5b9a55', '#fbe3e3', '#f2b4c0'
for k, (x, y) in enumerate(L['pads']):
    r = (2.5 if k == 2 else 1.9) * 0.8; z = WATER_Z + 0.06       # (the HQ's pads are large; the big one at the west edge of the frame is half again as wide)
    notch = math.radians(62); a0 = rng.uniform(0, 2 * math.pi)
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
    if k in (1, 3):                                                # (two of them carry a flower: pale petals round a pink heart)
        star = [(x + math.cos(i * math.pi / 8) * r * (0.5 if i % 2 == 0 else 0.26), y + math.sin(i * math.pi / 8) * r * (0.5 if i % 2 == 0 else 0.26)) for i in range(16)]
        parts.append((star, FLOWER, 0.03))
        parts.append(([(x + math.cos(a) * r * 0.14, y + math.sin(a) * r * 0.14) for a in [i * math.pi / 4 for i in range(8)]], FLOWER_HEART, 0.04))
    flat(f'PAD_{k}', parts, z=z)
for k, (x, y) in enumerate(L['crates']):
    obj_models.crate({'x': x, 'y': y, 'width': 1.43}, PAL, FLAT, None, k)
for k, (x, y) in enumerate(L['bamboo']):
    obj_models.bamboo({'x': x, 'y': y, 'width': 0.42, 'height': rng.uniform(4.4, 6.4)}, PAL, FLAT, None, 100 + k)


def blob(name, c, radii, hex_, hex_low, sub=4, bumps=0.08):
    """A soft lump (an ico-sphere stretched, its edge wavy like the HQ's leaf masses): lighter on top, darker underneath."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    phase = [rng.uniform(0, 6.28) for _ in range(3)]
    for v in bm.verts:
        n = v.co.copy()
        ang = math.atan2(n.y, n.x)
        wave = 1 + bumps * (math.sin(13 * ang + phase[0]) * 0.6 + math.sin(21 * ang + phase[1]) * 0.4)   # (a scalloped rim)
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
            k = 0.85 * max(0.0, 1 - d) ** 1.3 + 0.22 * ring + (0.0 if up > 0.4 else 0.5)    # (darker towards the heart and underneath)
            col_ = hi.lerp(lo, max(0.0, min(1.0, k)))
            loop[col] = (col_.x, col_.y, col_.z, 1.0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


def trunk(name, foot, top, height, r0, r1):
    """A slim leaning trunk, white birch with dark patches: a tapered tube from the foot (on the ground) to the top (`height` up)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    rings, seg = 9, 8
    a = Vector((foot[0], foot[1], 0.0)); b = Vector((top[0], top[1], height))
    axis = (b - a).normalized(); side = axis.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0)); up = axis.cross(side).normalized()
    grid = []
    for i in range(rings):
        t = i / (rings - 1); centre = a + (b - a) * t; r = r0 + (r1 - r0) * t
        grid.append([bm.verts.new(centre + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(rings - 1):
        dark = (i % 3 == 1)
        for k in range(seg):
            f = bm.faces.new([grid[i][k], grid[i][(k + 1) % seg], grid[i + 1][(k + 1) % seg], grid[i + 1][k]])
            patch = (dark and k % 4 != 1) or (k == 2 and i % 3 == 0)      # (wide dark bands round the trunk, with pale gaps and the odd dot)
            for loop in f.loops: loop[col] = lin(HQ.flat('#586398' if patch else '#c9cdea'))
            f.smooth = False
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(FLAT)
    return o


# the two orange trees (layout.py: read off the HQ frame at 10:37): a leaning birch, then its lumps of canopy, each a flat wavy disc
# standing the height of the trunk (their half widths and heights are the pixels the HQ shows, over the pixels a plan unit is there)
TREE, TREE_LOW = '#e5714f', '#b94d33'
for k, t in enumerate(L['trees']):
    trunk(f'TRUNK_{k}', t['foot'], t['top'], t['height'], 0.85, 0.7)
    for j, lump in enumerate(t['lumps']):
        r = lump['r']
        cx, cy, cz, ry = lump['at'][0], lump['at'][1], lump['z'], lump.get('ry', r)
        blob(f'TREE_{k}_{j}', (cx, cy, cz), (r * 0.95, ry * 0.95, r * 0.8), TREE, TREE_LOW)
        for m in range(9):                              # (the HQ's canopy is a cauliflower of puffs: small domes round and over the big one)
            a = 2 * math.pi * m / 9 + rng.uniform(-0.2, 0.2); d = rng.uniform(0.55, 0.78)
            pr = rng.uniform(0.3, 0.42)
            blob(f'TREE_{k}_{j}_p{m}', (cx + math.cos(a) * r * d, cy + math.sin(a) * ry * d, cz + rng.uniform(-0.1, 0.25) * r),
                 (r * pr, ry * pr, r * pr * 0.9), TREE, TREE_LOW, sub=3, bumps=0.05)
# the fallen leaves: small red ovals on the grass by the trees' feet
for k, (x, y) in enumerate(L['petals']):
    a0 = rng.uniform(0, math.pi); w, h = rng.uniform(0.16, 0.26), rng.uniform(0.09, 0.14)
    pts = [(x + math.cos(i * math.pi / 5) * w * math.cos(a0) - math.sin(i * math.pi / 5) * h * math.sin(a0),
            y + math.cos(i * math.pi / 5) * w * math.sin(a0) + math.sin(i * math.pi / 5) * h * math.cos(a0)) for i in range(10)]
    flat(f'PETAL_{k}', [(pts, '#d95a38', 0)], z=0.06)

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
    # the stones alone, white on black, through the HQ camera: measured against the HQ's rock mask (art/lily_island/compare.py)
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
