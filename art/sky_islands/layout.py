"""The sky islands' layout in plan units (Blender X east, Y north; the island tops are the ground, z 0) (2026-10-22).

Measured from the HQ round through the plaza's camera rig (calibrate.py):
  * the islands' outlines: their grass seen from above (output/plan.png), gridded square to each island's own axis and
    cleaned by hand where a tree, a pot or a stone block hides the edge (an edge then runs straight on);
  * the tilted top-right island: its three visible edges fitted to the grass boundary (-62, 31 and -60 degrees);
  * the bridges: their wood (#936f90) seen from above; the log bridge turned -17.5 degrees;
  * the stone blocks: their light tops (#afbce6) segmented in the opening frame (9:04.0) and cast back into the plan at their
    height. The block on the centre island's north-east corner shows 40 px of front face above the grass in that frame:
    2.5 units, a character's height; the others start at that height and are corrected by comparing renders with the video.
Writes layout.json.

  python art/sky_islands/layout.py       (from the repository root)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
Z = CAM['referenceZoom']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


def unproject(pts, z):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    H = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)


def line(angle_deg, through):
    a = math.radians(angle_deg)
    return np.array(through, float), np.array([math.cos(a), math.sin(a)])


def meet(l1, l2):
    (p, d), (q, e) = l1, l2
    t = np.linalg.solve(np.array([d, -e]).T, q - p)[0]
    return p + t * d


# the tilted island: its edges as fitted; its north corner where its north-east edge reaches the grass's top (y 103.3)
# (its south-west and south-east edges 0.2 units in from the first fit: 2026-10-25, checked along their length against
# reference.png's grass)
SW, SE, NE = line(-61.96, (23.837, 85.924)), line(30.94, (32.227, 83.822)), line(-60.37, (31.55, 94.96))
s, e = meet(SW, SE), meet(SE, NE)
n = meet(NE, (np.array([0.0, 103.3]), np.array([1.0, 0.0])))
NW = (n, SE[1])
w = meet(SW, NW)
tilted = [list(map(float, np.round(p, 2))) for p in (w, n, e, s)]

# each straight side checked against reference.png's grass (2026-10-25: sampled along the side, the grass's end found across it
# at the ground, the median taken; moved where it was off by 0.3 units or more with a tight spread)
ISLANDS = {
    # the long one round the top-left: its west end, the arm south, the bar east, the lobe at its east end
    'north': [(-29.3, 100.5), (-17.0, 100.5), (-17.0, 98.0), (13.0, 98.0), (13.0, 91.2), (18.5, 91.2), (18.5, 88.4),
              (13.15, 88.4), (13.15, 91.0), (-18.35, 91.0), (-18.35, 74.3), (-24.2, 74.3), (-24.2, 88.6), (-29.3, 88.6)],
    'northeast': tilted,
    # where the north bar's east end meets the tilted island, behind the blocks (the opening frame: the grass runs on)
    'northeast_join': [(12.5, 90.5), (21.0, 90.5), (18.6, 97.8), (12.5, 97.8)],
    'centre': [(-9.8, 66.9), (10.1, 66.9), (10.1, 82.8), (-9.8, 82.8)],
    'east': [(18.75, 61.4), (25.25, 61.4), (25.25, 73.6), (18.75, 73.6)],
    # (its east side: reference.png's grass edge x 799-805, y 955-1045, cast back at the ground; the south bridge's landing
    # stands out past it over the gap)
    'southwest': [(-24.3, 52.1), (-5.3, 52.1), (-5.3, 58.25), (-18.3, 58.25), (-18.3, 64.1), (-24.3, 64.1)],
    'south': [(2.75, 51.6), (20.4, 51.6), (20.4, 58.8), (2.75, 58.8)],
}
BRIDGES = {
    # planks laid across the way, two ropes along it; their ends just over the islands' edges
    'north': dict(kind='planks', corners=[(-2.75, 82.5), (3.05, 82.5), (3.05, 91.3), (-2.75, 91.3)], along=90.0),
    # (its south end at its stone landing, which carries on to the southwest island: reference.png, the planks stop where
    # the landing's top begins)
    'south': dict(kind='planks', corners=[(-8.5, 60.1), (-2.8, 60.1), (-2.8, 67.2), (-8.5, 67.2)], along=90.0),
    # logs side by side, each lying across the way (from the centre island east to the east island)
    'east': dict(kind='logs', corners=[(10.0, 71.15), (19.6, 68.54), (21.7, 73.74), (12.1, 76.75)], along=-17.5),
}

# the stone blocks: their tops in the opening frame, back into the plan at their height
H0 = 2.5
f = cv2.imread('art/sky_islands/output/reference.png')
hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
h, sat, val = (hsv[..., i].astype(int) for i in range(3))
top = ((h >= 110) & (h <= 135) & (sat > 25) & (val > 215)).astype(np.uint8)
top[0:400, 0:240] = 0                                                   # the names
top = cv2.morphologyEx(top, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
nlab, lab, st, _ = cv2.connectedComponentsWithStats(top)
blocks = []
for i in range(1, nlab):
    if st[i, 4] < 900: continue
    cs, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    quad = cv2.approxPolyDP(c, 6, True)[:, 0, :]
    plan = unproject(quad, H0)
    blocks.append(dict(top=[list(map(float, np.round(p, 2))) for p in plan], height=H0,
                       image=[int(st[i, 0]), int(st[i, 1]), int(st[i, 2]), int(st[i, 3])], quad=quad.tolist()))
# beyond the opening frame's top (seen as the camera moves north, output/plan.png): the tall block at the north-west corner
# that carries the blue spiral tile, and the great block behind the north bar's east end that carries the gold one
# (the first and the third set back north 2.6 and 4.1 units, 2026-10-25: their tiles stand on the grass in front of them,
# objects.py, and reference.png shows grass up to each tile, no block face)
for top, hgt in (([(-31.0, 99.1), (-26.5, 99.1), (-26.5, 106.1), (-31.0, 106.1)], 4.0),
                 ([(8.0, 98.5), (19.0, 98.5), (19.0, 107.0), (8.0, 107.0)], 6.5),
                 ([(19.5, 98.6), (24.0, 98.6), (24.0, 103.6), (19.5, 103.6)], 4.0)):
    blocks.append(dict(top=top, height=hgt, image=None))
# the bodies of rock the islands are built as: islands that overlap are one body (one top, one rim round the outside: two
# coplanar tops would flicker, and each would draw its rim across the other's grass). Outlined at 1/50 unit, every corner
# rounded in the plan itself (owner, 2026-10-25: "the corners are always a little rounded, never ever sharp"): the outline
# simplified to straight sides, then every corner, inner or outer, given a true arc
K = 50
x0 = min(x for o in ISLANDS.values() for x, _ in o) - 4; y0 = min(y for o in ISLANDS.values() for _, y in o) - 4
x1 = max(x for o in ISLANDS.values() for x, _ in o) + 4; y1 = max(y for o in ISLANDS.values() for _, y in o) + 4
disk = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(round(r * K)) + 1,) * 2)


def fillet(poly, r, step=math.radians(10)):
    """A polygon's corners rounded with true arcs of radius r (each clamped to what its two edges allow), points every 10
    degrees: straight sides stay straight, so a face along one is flat (no shading stripes)."""
    P = [np.array(p, float) for p in poly]
    n = len(P)
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n)) / 2
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        u, v = (a - b) / np.linalg.norm(a - b), (c - b) / np.linalg.norm(c - b)
        ang = math.acos(max(-1.0, min(1.0, float(np.dot(u, v)))))
        if ang > math.radians(175) or ang < 1e-3: out.append(b); continue
        t = r / math.tan(ang / 2)                                  # how far along each edge the arc starts
        t = min(t, 0.45 * np.linalg.norm(a - b), 0.45 * np.linalg.norm(c - b))
        rr = t * math.tan(ang / 2)
        p0, p1 = b + u * t, b + v * t
        bis = (u + v) / np.linalg.norm(u + v)
        centre = b + bis * (rr / math.sin(ang / 2))
        a0 = math.atan2(*(p0 - centre)[::-1]); a1 = math.atan2(*(p1 - centre)[::-1])
        d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        k = max(1, int(abs(d) / step))
        out += [centre + rr * np.array([math.cos(a0 + d * j / k), math.sin(a0 + d * j / k)]) for j in range(k + 1)]
    return [[round(float(x), 3), round(float(y), 3)] for x, y in out]


def rounded(m, grow, r):
    """Outlines (plan units) of mask `m` grown by `grow` units: simplified to straight sides (to 0.06 units), every corner then
    rounded to radius `r` with a true arc."""
    if grow > 0: m = cv2.dilate(m, disk(grow))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        q = cv2.approxPolyDP(c, 0.06 * K, True)[:, 0, :]
        poly = [(float(px) / K + x0, float(py) / K + y0) for px, py in q]
        out.append(fillet(poly, r) if r > 0 else [[round(x, 3), round(y, 3)] for x, y in poly])
    return out


mask = np.zeros((int((y1 - y0) * K), int((x1 - x0) * K)), np.uint8)
for o in ISLANDS.values():
    cv2.fillPoly(mask, [np.int32([[(x - x0) * K, (y - y0) * K] for x, y in o])], 1)
# the grass is the islands as measured, its corners rounded (reference.png: ~0.9 units); the rock round it runs a lip of
# RIM further out (the HQ: ~0.3 units of lavender outside the grass, all round): the grass always within the rock
RIM, CORNER = 0.3, 0.9
grass = rounded(mask, 0.0, CORNER)
bodies = rounded(mask, RIM, CORNER + RIM)
# the blocks the bridges rest on (the opening frame: the planks and logs run onto them; built flush with the bridges as
# their landings), and the one in the seam where the north bar's lobe meets the tilted island; all walked over, not walls
# (block 6 too, 2026-10-25: the stone the log bridge's west end rests on, east of the centre island's grass, x 1238-1302,
# y 451-603 in reference.png: lit lavender stone, not grass, the logs starting past it)
PIERS = {'bridges': [15, 6], 'seam': [1]}
# not blocks at all (2026-10-25: every block's top and footprint cast back over reference.png): 3, 5 and 10 are the lit
# lavender lips and faces of the north bar, the tilted island and the east island; 6 and 7, the "landings" at the log
# bridge's ends, are the centre and east islands' own rims where the logs meet them. Kept in the list (their numbers name
# the others) but dropped from the model and the rules
NOT_BLOCKS = {3: 'the north bar\'s lip', 5: 'the tilted island\'s face', 10: 'the east island\'s lip',
              7: 'the east island\'s rim under the logs'}
for i, why in NOT_BLOCKS.items(): blocks[i]['not_a_block'] = why
# the landings are level with the grass, not 2.5 units up (2026-10-23: ff physics hq 2.mp4 7:28-7:36, the log bridge meets the
# centre island at the grass, no tall block; players stand where the south bridge lands, 7:54 and 8:22): their tops cast
# back into the plan at the ground's height, which puts each between its bridge's end and the island it leads to
# (block 15, the south bridge's: its top stands ~0.4 units over the southwest island's grass, reference.png: the top's near
# edge at y 895, the grass from y 900; on the gap's side its face runs down into the mist)
LANDING_H = 0.4
# its top seen in the opening frame, measured by hand (the segmentation took in the island's lip beside it): x 640-875, from
# the bridge's end (y 858) to its near edge (y 895)
blocks[15]['quad'] = [[645, 858], [870, 858], [876, 895], [640, 895]]
for i in PIERS['bridges']:
    blocks[i]['top'] = [list(map(float, np.round(p, 2))) for p in unproject(blocks[i]['quad'], LANDING_H)]
    blocks[i]['height'] = LANDING_H
# the stones standing on the grass, each its own height: its front face's length down to the grass in reference.png (a unit
# of height shows ~16 px there): 1 37 px, 2 52, 4 34, 11 35. Each top is cast back again at its own height
HEIGHTS = {1: 2.3, 2: 3.2, 4: 2.1, 11: 2.2}
for i, h in HEIGHTS.items():
    blocks[i]['top'] = [list(map(float, np.round(p, 2))) for p in unproject(blocks[i]['quad'], h)]
    blocks[i]['height'] = h
for b in blocks: b.pop('quad', None)
# a stone block: its flat light top is what was measured; the block runs a round of BLOCK_ROUND further out (the HQ's blocks:
# a soft round on every edge), its corners rounded too
# boxes, not pills (reference.png, block 13 close: square faces, edges and corners rounded about a third of a unit)
BLOCK_ROUND, BLOCK_CORNER = 0.35, 0.35
for b in blocks:
    m = np.zeros_like(mask)
    cv2.fillPoly(m, [np.int32([[(x - x0) * K, (y - y0) * K] for x, y in b['top']])], 1)
    (_, _), (bw, bh), _ = cv2.minAreaRect(np.float32(b['top']))
    out = rounded(m, BLOCK_ROUND, min(BLOCK_CORNER + BLOCK_ROUND, 0.3 * (min(bw, bh) + 2 * BLOCK_ROUND)))
    if not out: print('lost block', b['top'], bw, bh, int(m.sum()))
    b['outline'] = out[0] if out else b['top']
    b['over_grass'] = round(float((m & mask).sum() / m.sum()), 2)
# which blocks are stones standing on the grass (a short front face down to it, nothing under them) and which are pillars
# running down into the mist, as reference.png shows each (how much of a block lies over grass does not tell them apart:
# block 2, on the ground, 0.57; blocks 8, 13 and 16, pillars, 0.51-0.55)
ON_GROUND = {0, 1, 2, 4, 11, 20}
for i, b in enumerate(blocks): b['on_ground'] = i in ON_GROUND
# rock standing under the islands' tops, as the HQ shows it (reference.png 9:04.0; ff physics hq 2.mp4 7:26-8:32 closer): a
# column of the HQ's darker stone (#828dc3 on its face toward the viewer) under the tilted island's south corner, its face
# at the corner, 160 px wide on screen (x 1580-1741), its top just under the rim, running down into the mist
# the tilted island is a slab (SLAB_T thick) on rock set back from its south-west edge by RECESS (the HQ2 close views: that
# side overhangs; its north-west side runs on into the north bar): what is cut from under it
SLAB_T, RECESS = 1.6, 1.0
def offset_edges(quad, amounts):
    """The quad with each edge (i -> i+1) moved outward by amounts[i] (negative: inward)."""
    P = [np.array(p, float) for p in quad]
    c = sum(P) / 4
    lines = []
    for i in range(4):
        a, b = P[i], P[(i + 1) % 4]
        d = (b - a) / np.linalg.norm(b - a); n = np.array([d[1], -d[0]])
        if np.dot(n, (a + b) / 2 - c) < 0: n = -n
        lines.append((a + n * amounts[i], d))
    out = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        t = np.linalg.solve(np.array([d1, -d2]).T, p2 - p1)
        out.append([round(float(v), 3) for v in p1 + d1 * t[0]])
    return out
# its edges in order: north-west (to the north bar), north-east, south-east, south-west
# (only its south-west side is cut back: under its south-east side the rock runs on flush, reference.png x 1740-1860, and
# its dark column stands at the south corner between them)
UNDERCUT = dict(cut=offset_edges(tilted, [-0.3, 3.0, -0.5, 3.0]), keep=offset_edges(tilted, [-0.3, -RECESS, 0.0, -RECESS]),
                top=-SLAB_T)
UNDERCUT['cut'][0] = [round(tilted[0][0] + 0.25, 3), round(tilted[0][1] - 0.15, 3)]   # (not under the north bar's end)
COLUMNS = [dict(name='tilted_south', outline=[(24.4, 80.0), (29.6, 80.0), (29.6, 84.0), (24.4, 84.0)], top=-0.5,
                colour='#96a2e0'),
           # a buttress under the north bar's south face, west of its lobe (what was taken for block 3): its top a lighter band
           # at y 225-238 in reference.png, x 1125-1300, cast back at 1.5 units below the grass
           dict(name='north_buttress', outline=[(6.5, 89.1), (12.6, 89.1), (12.6, 91.6), (6.5, 91.6)], top=-1.5,
                colour='#acb6e2'),
           # a shelf under the centre island's south face east of the south bridge: its lit top the lighter band 62 px under
           # the lip (reference.png x 890-1110, y 784-808; cast back at 5 units down it lies 0.3-1.3 units in front of the face)
           dict(name='centre_shelf', outline=[(-2.6, 65.3), (5.5, 65.3), (5.5, 67.5), (-2.6, 67.5)], top=-5.0,
                colour='#bac6e6')]
json.dump(dict(islands=ISLANDS, bridges=BRIDGES, blocks=blocks, grass=grass, bodies=bodies, columns=COLUMNS, undercut=UNDERCUT,
               piers=PIERS['bridges'] + PIERS['seam'],
               landings=PIERS['bridges']), open('art/sky_islands/layout.json', 'w'), indent=1)
print(len(bodies), 'bodies of rock:', [len(b) for b in bodies])
print(len(ISLANDS), 'islands,', len(BRIDGES), 'bridges,', len(blocks), 'blocks; tilted island', tilted)
