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
    c = P.mean(0); r = math.sqrt(2 * area / (3 * math.sqrt(3)))
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


ground = lambda pts: r1(plan(pts))
# Props read off the HQ frame (foomerang-fu physics hq.mp4 1:15.5) by eye, in pixels of the 1920x1080 reference
TREES = [  # foot, lumps (x, y, rx, ry), colour
    dict(foot=(570, 340), colour='#e9795a', lumps=[(545, 190, 62, 50), (575, 285, 55, 45)]),
    dict(foot=(440, 540), colour='#e8b050', lumps=[(470, 405, 62, 52), (400, 440, 60, 50), (430, 500, 48, 40)]),
    dict(foot=(1215, 610), colour='#e8b050', lumps=[(1215, 520, 58, 46), (1185, 560, 55, 40), (1245, 590, 46, 40)]),
    dict(foot=(1750, 480), colour='#e9795a', lumps=[(1810, 210, 62, 50), (1760, 290, 56, 46), (1855, 300, 50, 45), (1850, 405, 62, 50), (1775, 375, 46, 40)]),
]
tree_out = []
for t in TREES:
    height = 3.4
    lumps = []
    for x, y, rx, ry in t['lumps']:
        z = float(np.clip(2.0 + 3.0 * (t['foot'][1] - y) / 260.0, 2.0, 5.2))
        spot, ppu = unproject(x, y, z)
        lumps.append(dict(at=spot, r=round(rx / ppu, 2), ry=round(ry / ppu, 2), z=round(z, 2)))
    tf = json.load(open('art/bridge_islands/treefit.json')).get(str(len(tree_out)), dict(dx=0.0, dy=0.0, s=1.0)) if os.path.exists('art/bridge_islands/treefit.json') else dict(dx=0.0, dy=0.0, s=1.0)
    mx = float(np.mean([l['at'][0] for l in lumps])); my = float(np.mean([l['at'][1] for l in lumps]))
    for l in lumps:
        l['at'] = [round(mx + tf['s'] * (l['at'][0] - mx) + tf['dx'], 2), round(my + tf['s'] * (l['at'][1] - my) + tf['dy'], 2)]
        l['r'] = round(l['r'] * tf['s'], 2); l['ry'] = round(l['ry'] * tf['s'], 2)
    tree_out.append(dict(foot=unproject(*t['foot'], 0.0)[0], height=height, colour=t['colour'], top=unproject(t['foot'][0], t['foot'][1] - 90, height)[0], lumps=lumps))
BUSHES = [(860, 205, 78), (775, 865, 72), (1345, 420, 68)]
POTS = [(1060, 190), (1085, 180), (1130, 288), (1165, 402), (1135, 782), (1105, 800), (545, 345), (1150, 600), (890, 180)]
CRATES = [(1130, 605), (1175, 635)]
BAMBOO = [(1400, 330), (1395, 270), (1360, 560), (1372, 595), (1420, 615), (365, 500), (860, 120)]
PADS = [(125, 790, 45), (290, 915, 72), (1565, 825, 52), (1690, 900, 66), (1520, 960, 62), (380, 1065, 55)]
LANTERNS = [(1025, 60), (1495, 410)]
LEVERS = [((560, 572), (547, 580)), ((1075, 375), (1063, 380)), ((835, 825), (825, 822))]
GATE = dict(left=(1223, 233), right=(1300, 290), gong=(1260, 230))
at = lambda pts, z=0.0: [unproject(x, y, z)[0] for x, y in pts]
out = dict(zoom=Z, banks=[r1(b) for b in banks], bridge=r1(bridge_poly), trees=tree_out,
           bushes=[dict(at=unproject(x, y, 0.0)[0], r=round(r / unproject(x, y, 0.0)[1], 2)) for x, y, r in BUSHES],
           pots=at(POTS), crates=at(CRATES), bamboo=at(BAMBOO), pads=[dict(at=unproject(x, y, 0.0)[0], r=round(r / unproject(x, y, 0.0)[1], 2)) for x, y, r in PADS],
           lanterns=at(LANTERNS), levers=[dict(housing=unproject(a[0], a[1], 0.3)[0], knob=unproject(b[0], b[1], 0.3)[0], z=0.3) for a, b in LEVERS],
           gate=dict(left=unproject(*GATE['left'], 0.0)[0], right=unproject(*GATE['right'], 0.0)[0], gong=unproject(*GATE['gong'], 0.0)[0]),
           petals=[], tufts=[])
json.dump(out, open('art/bridge_islands/layout.json', 'w'))
allp = np.concatenate(banks)
print('banks', [len(b) for b in banks], 'bridge', len(bridge_poly), 'bounds', allp.min(0).round(1), allp.max(0).round(1))
