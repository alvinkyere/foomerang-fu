"""The lily island (2026-10-30): foomerang-fu physics hq.mp4 10:37 (output/reference.png, 637.0 s: local only, not committed), measured
through the plaza's camera rig (art/sky_islands/camera.json) at this view's zoom (scale.json): a lime island of grass with a lavender lip,
set 45 degrees in the plan, stone slabs and boulders on and about it, two orange trees, bamboo, four crates, lily pads on the water.
Colour masks of reference.png, outlines unprojected onto the ground (z 0) in plan units; writes layout.json. The props' places are
read off the frame (pixel centres below) and unprojected the same way.

  python art/bridge_islands/layout.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, os
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/bridge_islands/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
H = cv2.findHomography(np.float32([ref(X, Y) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)
r1 = lambda a: [[round(float(x), 2), round(float(y), 2)] for x, y in a]

f = cv2.imread('art/bridge_islands/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
hud = np.arange(1920)[None, :] > 215
grass = hud & (((h[..., 0] > 25) & (h[..., 0] < 55) & (h[..., 1] > 50) & (h[..., 2] > 190)) | ((h[..., 0] >= 55) & (h[..., 0] <= 95) & (h[..., 1] > 30) & (h[..., 1] < 95) & (h[..., 2] >= 228)))
rock = hud & (h[..., 0] >= 104) & (h[..., 0] <= 125) & (h[..., 1] >= 55) & (h[..., 2] >= 140)
bridge = hud & (h[..., 0] >= 135) & (h[..., 0] <= 168) & (h[..., 1] >= 28) & (h[..., 1] <= 90) & (h[..., 2] >= 120) & (h[..., 2] <= 205)
k = lambda n: np.ones((n, n), np.uint8)
clean = lambda m, n=7: cv2.morphologyEx(cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k(n)), cv2.MORPH_OPEN, k(n))
glow = hud & (h[..., 0] >= 55) & (h[..., 0] <= 100) & (h[..., 1] > 25) & (h[..., 2] >= 170)
land = clean(grass, 11) > 0
land = land | ((clean(rock | glow, 5) > 0) & (cv2.dilate(land.astype(np.uint8), k(27)) > 0))
bridge_m = clean(bridge, 9) > 0
land = clean(land, 21) > 0
land = cv2.morphologyEx(land.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
cs, _ = cv2.findContours(land.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
KERB_Z = 0.3
_Hk = cv2.findHomography(np.float32([ref(X, Y, KERB_Z) for X, Y in g]), np.float32(g))[0]
plan_k = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), _Hk).reshape(-1, 2)
banks = [plan_k(cv2.approxPolyDP(c, 3.0, True).reshape(-1, 2)) for c in cs if cv2.contourArea(c) > 2500]
# the small islets are regular platforms in the HQ (a hexagon of grass with a wall round it): each traced blob becomes a regular hexagon of the same area, at its centroid
def _hex(poly):
    P = np.array(poly); n = len(P)
    area = abs(sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))) / 2
    c = P.mean(0); r = 1.2 * math.sqrt(2 * area / (3 * math.sqrt(3)))
    return np.array([[c[0] + r * math.cos(math.pi / 6 + i * math.pi / 3), c[1] + r * math.sin(math.pi / 6 + i * math.pi / 3)] for i in range(6)])
def rectify(P, eps=1.2, tiny=2.2):
    """The HQ's island is built of right angles in the plan (45 degrees in the picture): a traced outline is straightened to that. Find
    the way its edges run, turn it square, replace each run of edges by one straight edge at its mean place, drop the wobbles
    shorter than `tiny`, put the corners where neighbouring edges meet, and turn it back."""
    d = np.diff(np.vstack([P, P[:1]]), axis=0)
    ang = np.arctan2(d[:, 1], d[:, 0]); w = np.hypot(d[:, 0], d[:, 1])
    th = np.angle(np.sum(w * np.exp(4j * ang))) / 4                     # (the grid's turn, from the edges' own directions)
    c, s = np.cos(-th), np.sin(-th); Rm = np.array([[c, -s], [s, c]])
    Q = P @ Rm.T
    Q = cv2.approxPolyDP(np.float32(Q).reshape(-1, 1, 2), eps, True).reshape(-1, 2)
    n = len(Q)
    edges = []                                                          # [orientation 'h'|'v', coordinate, length]
    for i in range(n):
        a, b = Q[i], Q[(i + 1) % n]
        horiz = abs(b[0] - a[0]) >= abs(b[1] - a[1])
        edges.append([horiz, (a[1] + b[1]) / 2 if horiz else (a[0] + b[0]) / 2, float(np.hypot(*(b - a)))])
    changed = True
    while changed and len(edges) > 4:
        changed = False
        for i in range(len(edges)):
            j = (i + 1) % len(edges)
            if edges[i][0] == edges[j][0]:                              # two runs the same way: one edge
                L = edges[i][2] + edges[j][2]
                edges[i] = [edges[i][0], (edges[i][1] * edges[i][2] + edges[j][1] * edges[j][2]) / L, L]
                del edges[j]; changed = True; break
            if edges[i][2] < tiny:                                      # a wobble: its neighbours meet over it
                k = (i - 1) % len(edges)
                if edges[k][0] == edges[j][0]:
                    L = edges[k][2] + edges[j][2]
                    edges[k] = [edges[k][0], (edges[k][1] * edges[k][2] + edges[j][1] * edges[j][2]) / L, L]
                    for idx in sorted({i, j}, reverse=True): del edges[idx]
                    changed = True; break
    out = []
    for i in range(len(edges)):
        a, b = edges[i - 1], edges[i]                                   # the corner between edge i-1 and edge i
        out.append((b[1], a[1]) if b[0] is False or not b[0] else (a[1], b[1]))
    pts = []
    for i in range(len(edges)):
        a, b = edges[i - 1], edges[i]
        pts.append([a[1], b[1]] if a[0] is False or not a[0] else [b[1], a[1]])
    pts = np.array(pts)                                                 # (x of the vertical edge, y of the horizontal one)
    return pts @ Rm                                                     # (back from the square frame)


banks = [_hex(b) if cv2.contourArea(np.float32(b)) < 120 else rectify(b, eps=1.5, tiny=2.6) for b in banks]
def _rect(b):
    P = np.float32(b); (cx, cy), (w, h), a = cv2.minAreaRect(P)
    if cv2.contourArea(P) / max(w * h, 1e-6) < 0.9 or w * h < 120: return b
    return cv2.boxPoints(((cx, cy), (w, h), a))
banks = [_rect(b) for b in banks]
# islets put where the HQ shows them (their traced blob's hexagon moved to the HQ's centre in the frame and scaled): the pots' islet, south
_ISLET_FIX = [((1150, 830), (1123, 838), 0.88)]      # (the islet's kerb, thick on its camera-facing sides, carries it ~17 px right and 10 down of its own centre)
for _was, _now, _sc in _ISLET_FIX:
    _w = plan_k([_was])[0]; _n = plan([_now])[0]      # (the traced blobs are in plan_k's plane; the islet's grass is at the ground's)
    for _i, _b in enumerate(banks):
        _c = np.mean(np.array(_b, float), 0)
        if len(_b) == 6 and np.linalg.norm(_c - _w) < 4.0: banks[_i] = (np.array(_b, float) - _c) * _sc + _n
# the east islet (islet_e.py: a tall round rock, fitted): the red tree stands on its top; the hex islet traced there is its grass, not an island
ISLET_E = json.load(open('art/bridge_islands/islet_e.json'))
ISLET_NW = json.load(open('art/bridge_islands/islet_nw.json'))      # (the red tree's islet, north-west: a raised hexagonal platform; its bank stays walkable)
banks = [b for b in banks if np.linalg.norm(np.mean(np.array(b, float), 0) - np.array(ISLET_E['centre'])) > ISLET_E['radius'] + 3.0]
# the east island, as its corners stand in the frame (a big plain island with its south-west side along the bridge): five corners, unprojected where the kerb is
EAST_PX = [(640, 205), (1125, 20), (1585, 330), (1592, 585), (1350, 792)]
SW_PX = [(255, 612), (495, 452), (1020, 905), (885, 1080)]      # the south-west island's four corners in the frame (kerb's outer edge)
_sw = plan_k(np.float32(SW_PX))
_east = plan_k(np.float32(EAST_PX))
_k = max(range(len(banks)), key=lambda i: cv2.contourArea(np.float32(banks[i])))
banks[_k] = _east
EAST_INDEX = _k
_k2 = [i for i in range(len(banks)) if len(banks[i]) == 4 and cv2.contourArea(np.float32(banks[i])) > 120]
if _k2: banks[_k2[0]] = _sw
SW_INDEX = _k2[0] if _k2 else -1
# the bridge's own outline (its bricks), for the walkable ground and its model
bcs, _ = cv2.findContours(bridge_m.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
bridge_poly = plan(cv2.approxPolyDP(max(bcs, key=cv2.contourArea), 6.0, True).reshape(-1, 2)) if bcs else []


def homography_at(z):
    g2 = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    return cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g2]), np.float32(g2))[0]


def unproject(px, py, z):
    Hz = homography_at(z)
    a = cv2.perspectiveTransform(np.float32([[[px, py]]]), Hz)[0, 0]
    b = cv2.perspectiveTransform(np.float32([[[px + 10, py]]]), Hz)[0, 0]
    return [round(float(a[0]), 2), round(float(a[1]), 2)], 10 / float(np.hypot(*(b - a)))


BRIDGE_PX = [(650, 539), (825, 402), (1056, 587), (880, 739)]      # the deck's corners in the frame: the NW wall along A-B, the SE wall along C-D, open ends B-C and D-A
bridge_poly = np.array([unproject(x, y, 0.12)[0] for x, y in BRIDGE_PX])
# the south-west island measured side by side (edges.py): its grass outline (the top, at the grass's height) and its water line (the flank's foot,
# at the water's height): the island is the grass, the flank slopes from it down to that line
WATER_Z = -0.7
_EDGES = json.load(open('art/bridge_islands/edges.json'))
def fillet(P, r, seg=7):
    """A polygon with each corner replaced by a circular arc of radius r tangent to its two sides (seg + 1 points a corner)."""
    P = np.array(P, float); n = len(P); out = []
    for i in range(n):
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % n]
        a, b = (p0 - p1) / np.linalg.norm(p0 - p1), (p2 - p1) / np.linalg.norm(p2 - p1)
        half = math.acos(float(np.clip(a @ b, -1, 1))) / 2
        d = min(r / math.tan(half), np.linalg.norm(p0 - p1) * 0.45, np.linalg.norm(p2 - p1) * 0.45); rr = d * math.tan(half)
        t0, t1 = p1 + a * d, p1 + b * d; c = p1 + (a + b) / np.linalg.norm(a + b) * (rr / math.sin(half))
        a0, a1 = math.atan2(*(t0 - c)[::-1]), math.atan2(*(t1 - c)[::-1]); da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        out += [c + rr * np.array([math.cos(a0 + da * j / seg), math.sin(a0 + da * j / seg)]) for j in range(seg + 1)]
    return np.array(out)


ISLAND_R = 1.3          # (the HQ's islands: their grass corners rounded ~1.3 units; the water line's by as much more as the flank is wide)
measured = []
for _name, _idx in (('sw', SW_INDEX), ('east', EAST_INDEX)):
    if _idx < 0 or _name not in _EDGES: continue
    _g = np.array([unproject(x, y, 0.0)[0] for x, y in _EDGES[_name]['grass']]); _wl = np.array([unproject(x, y, WATER_Z)[0] for x, y in _EDGES[_name]['water']])
    _fw = float(np.mean(np.linalg.norm(_wl - _g, axis=1)))
    banks[_idx] = fillet(_g, ISLAND_R)
    measured.append(dict(name=_name, index=_idx, water=r1(fillet(_wl, ISLAND_R + _fw))))
ground = lambda pts: r1(plan(pts))
# Props read off the HQ frame (foomerang-fu physics hq.mp4 1:15.5) by eye, in pixels of the 1920x1080 reference
TREES = [  # foot, lumps (x, y, rx, ry: fit_lumps.py, ellipses fitted to the HQ's canopy), colour
    dict(foot=(570, 330), base='islet_nw', colour='#d87b6a', lumps=[(514, 185, 32, 41), (566, 188, 39, 34), (533, 278, 31, 24), (592, 281, 30, 35)]),
    dict(foot=(440, 535), colour='#d3b66d', lumps=[(458, 378, 30, 28), (490, 407, 28, 26), (400, 432, 34, 22), (484, 446, 20, 25), (431, 489, 21, 31), (410, 495, 26, 30)]),
    dict(foot=(1215, 610), colour='#d3b66d', lumps=[(1242, 500, 31, 30), (1217, 503, 25, 30), (1170, 546, 33, 31), (1245, 576, 33, 25), (1214, 586, 25, 29)]),
    dict(foot=(1795, 335), top=(1835, 210), base='islet_e', colour='#d87b6a', lumps=[(1810, 189, 51, 46), (1786, 193, 37, 39), (1883, 271, 39, 49), (1761, 297, 37, 42), (1839, 349, 41, 39), (1795, 370, 29, 51), (1852, 418, 38, 47), (1879, 435, 64, 51)]),
]
tree_out = []
for t in TREES:
    height = 3.4
    base = {'islet_e': ISLET_E['height'], 'islet_nw': ISLET_NW['height']}.get(t.get('base'), 0.0)
    lumps = []
    for x, y, rx, ry in t['lumps']:
        z = base + float(np.clip(2.0 + 3.0 * (t['foot'][1] - y) / 260.0, 2.0, 5.2))
        spot, ppu = unproject(x, y, z)
        lumps.append(dict(at=spot, r=round(rx / ppu, 2), ry=round(ry / ppu, 2), z=round(z, 2)))
    tf = json.load(open('art/bridge_islands/treefit.json')).get(str(len(tree_out)), dict(dx=0.0, dy=0.0, s=1.0)) if os.path.exists('art/bridge_islands/treefit.json') else dict(dx=0.0, dy=0.0, s=1.0)
    mx = float(np.mean([l['at'][0] for l in lumps])); my = float(np.mean([l['at'][1] for l in lumps]))
    for l in lumps:
        l['at'] = [round(mx + tf['s'] * (l['at'][0] - mx) + tf['dx'], 2), round(my + tf['s'] * (l['at'][1] - my) + tf['dy'], 2)]
        l['r'] = round(l['r'] * tf['s'], 2); l['ry'] = round(l['ry'] * tf['s'], 2)
    tree_out.append(dict(foot=unproject(*t['foot'], base)[0], base=base, height=height, colour=t['colour'], top=unproject(*(t.get('top') or (t['foot'][0], t['foot'][1] - 90)), base + height)[0], lumps=lumps))
_PS = json.load(open('art/bridge_islands/props.json')) if os.path.exists('art/bridge_islands/props.json') else {}
_mv = lambda name, xy: (xy[0] + _PS.get(name, [0, 0])[0], xy[1] + _PS.get(name, [0, 0])[1])
BUSHES = [(*_mv('bush0', (860, 240)), 80), (*_mv('bush1', (770, 879)), 80), (*_mv('bush2', (1356, 470)), 76)]      # (centroids and sizes matched to the HQ's)
# pots: (x, y) of the foot in the frame, width, height, the height it stands at (the one on the round boulder stands on its top)
POTS = [(1062, 215, 1.5, 1.8, 0.0), (1092, 200, 1.3, 1.6, 0.0), (1127, 296, 1.2, 1.3, 2.8), (1218, 415, 1.1, 1.2, 0.0), (1148, 822, 1.35, 1.75, 0.0),
        (1075, 812, 1.2, 1.25, 0.0), (1150, 600, 0.8, 0.9, 0.0), (890, 180, 0.8, 0.9, 0.0)]
CRATES = [_mv('crate0', (1130, 605)), _mv('crate0', (1175, 635))]
BAMBOO = [(1400, 355), (1222, 215), (1268, 200), (1360, 560), (1372, 595), (1420, 615), (365, 500)]
PADS = [(*_mv('pad0', (125, 790)), 45), (*_mv('pad1', (290, 915)), 72), (*_mv('pad2', (1565, 825)), 52), (*_mv('pad3', (1690, 900)), 66), (*_mv('pad4', (1520, 960)), 62), (*_mv('pad5', (380, 1065)), 55)]
LANTERNS = [_mv('lantern0', (1025, 60)), _mv('lantern1', (1495, 410))]
LEVERS = [((569, 568), (538, 585)), ((1075, 375), (1063, 380)), ((839, 814), (816, 831))]
GATE = dict(left=(1223, 233), right=(1300, 290), gong=(1260, 230))
at = lambda pts, z=0.0: [unproject(x, y, z)[0] for x, y in pts]
# the lily pads (fit_pads.py: each pad's ellipse, notch and flower measured on the HQ frame), lying on the water: unprojected at the water's height;
# a screen direction turns into the plan's by undoing the view's squash (y up in the plan, the frame's y down, sin(pitch) ~0.83 vertically)
_PADS = json.load(open('art/bridge_islands/pads.json'))
def _pad(p):
    spot, ppu = unproject(p['c'][0], p['c'][1], WATER_Z)
    na = None if p['notch'] is None else round(math.degrees(math.atan2(-math.sin(math.radians(p['notch'])) / 0.83, math.cos(math.radians(p['notch'])))), 1)
    return dict(at=spot, r=round(p['axes'][0] / ppu, 2), notch=na, flower=p['flower'])
pads_out = [_pad(p) for p in _PADS['pads']]
small_out = [dict(at=unproject(x_, y_, WATER_Z)[0], r=round(r_ / unproject(x_, y_, WATER_Z)[1], 2)) for x_, y_, r_ in _PADS['small']]
# the cube standing in the water by the wall's end (the HQ: its top a diamond, corners (1600, 73) (1642, 112) (1597, 140) (1558, 103); its left side
# 70 px tall down to the water): each corner unprojected at the top's height, the water's plus 4.3
CUBE_TOP = WATER_Z + 4.3
# the two raised grass-topped blocks at the wall's end (the HQ: grass corners read off the frame): the lower platform's grass front edge ~60 px over the
# water (z = water + 3.7), the upper one standing on it, its side 35 px (2.1 units) above the platform
raised = [dict(grass=r1([unproject(x, y, WATER_Z + 3.7)[0] for x, y in [(1495, 340), (1630, 325), (1635, 410), (1525, 415)]]), z=WATER_Z + 3.7),
          dict(grass=r1([unproject(x, y, WATER_Z + 5.8)[0] for x, y in [(1495, 245), (1575, 250), (1565, 305), (1490, 300)]]), z=WATER_Z + 5.8)]
# the bunting (the HQ: two strings of red pennants, read off the frame where the string runs just above the pennants' tops): each end unprojected at
# the height it hangs at (the north string from the long wall's end over the north lantern, 4.5 up; the east one from the raised block to the tree)
bunting = [dict(a=unproject(905, 12, 4.5)[0] + [4.5], b=unproject(1125, 26, 4.5)[0] + [4.5]),
           dict(a=unproject(1560, 296, 5.0)[0] + [5.0], b=unproject(1745, 322, 5.0)[0] + [5.0])]
cubes = [dict(top=r1([unproject(x, y, CUBE_TOP)[0] for x, y in [(1600, 73), (1642, 112), (1597, 140), (1558, 103)]]), z=CUBE_TOP)]
# the blocks standing on the east island (their top faces read off the frame, their heights from the front faces' pixels over 16 px a unit): the small
# cube by the urns, the round boulder the pot and the lever stand on, the block before the hex bush
for _px, _z in (([(1020, 135), (1075, 125), (1090, 160), (1035, 175)], 1.9),
                ([(1090, 295), (1120, 283), (1165, 285), (1185, 305), (1182, 335), (1150, 348), (1105, 346), (1083, 325)], 2.8),
                ([(1305, 330), (1345, 322), (1370, 340), (1360, 365), (1315, 368)], 2.0),
                # the gong's stepped stone base, two slabs
                ([(1203, 262), (1258, 250), (1292, 280), (1235, 296)], 0.5), ([(1218, 240), (1262, 232), (1280, 258), (1235, 268)], 1.0),
                # the tall block in the water south of the east island (its front face 57 px down to the water)
                ([(1245, 782), (1292, 808), (1265, 838), (1222, 812)], WATER_Z + 3.5)):
    cubes.append(dict(top=r1([unproject(x, y, _z)[0] for x, y in _px]), z=_z))
out = dict(zoom=Z, water_z=WATER_Z, measured=measured, islet_e=ISLET_E, islet_nw=ISLET_NW, bunting=bunting, cubes=cubes, raised=raised, banks=[r1(b) for b in banks], bridge=r1(bridge_poly), trees=tree_out,
           bushes=[dict(at=unproject(x, y, 0.0)[0], r=round(r / unproject(x, y, 0.0)[1], 2)) for x, y, r in BUSHES],
           pots=[dict(at=unproject(x, y, z)[0], w=w, h=hh, z=z) for x, y, w, hh, z in POTS], crates=at(CRATES), bamboo=at(BAMBOO), pads=pads_out, small_pads=small_out,
           lanterns=at(LANTERNS), levers=[dict(housing=unproject(a[0], a[1], 0.3)[0], knob=unproject(b[0], b[1], 0.3)[0], z=0.3) for a, b in LEVERS],
           gate=dict(left=unproject(*GATE['left'], 0.0)[0], right=unproject(*GATE['right'], 0.0)[0], gong=unproject(*GATE['gong'], 0.0)[0]),
           petals=[[*unproject(float(x), float(y), 0.0)[0], '#e6a93a'] for x, y in [(455, 525), (470, 540), (428, 548), (498, 515), (405, 520), (490, 545), (445, 560), (515, 535), (418, 538), (478, 505), (460, 500)]], tufts=[])
json.dump(out, open('art/bridge_islands/layout.json', 'w'))
allp = np.concatenate(banks)
print('banks', [len(b) for b in banks], 'bridge', len(bridge_poly), 'bounds', allp.min(0).round(1), allp.max(0).round(1))
