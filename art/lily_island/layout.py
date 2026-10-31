"""The lily island (2026-10-30): foomerang-fu physics hq.mp4 10:37 (output/reference.png, 637.0 s: local only, not committed), measured
through the plaza's camera rig (art/sky_islands/camera.json) at this view's zoom (scale.json): a lime island of grass with a lavender lip,
set 45 degrees in the plan, stone slabs and boulders on and about it, two orange trees, bamboo, four crates, lily pads on the water.
Colour masks of reference.png, outlines unprojected onto the ground (z 0) in plan units; writes layout.json. The props' places are
read off the frame (pixel centres below) and unprojected the same way.

  python art/lily_island/layout.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, os
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/lily_island/scale.json'))
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

f = cv2.imread('art/lily_island/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
hud = np.arange(1920)[None, :] > 215
grass = hud & (((h[..., 0] > 25) & (h[..., 0] < 55) & (h[..., 1] > 50) & (h[..., 2] > 190)) | ((h[..., 0] >= 55) & (h[..., 0] <= 95) & (h[..., 1] > 30) & (h[..., 1] < 95) & (h[..., 2] >= 228)))   # (the light shaft tints the grass cyan: paler and less saturated than the water)
rock = hud & (h[..., 0] >= 104) & (h[..., 0] <= 125) & (h[..., 1] >= 55) & (h[..., 2] >= 140)
k = lambda n: np.ones((n, n), np.uint8)
clean = lambda m, n=7: cv2.morphologyEx(cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k(n)), cv2.MORPH_OPEN, k(n))
# the island is its grass, the soft green glow at its edge and the lavender kerb that runs round it (the kerb's outer edge is the land's edge)
glow = hud & (h[..., 0] >= 55) & (h[..., 0] <= 100) & (h[..., 1] > 25) & (h[..., 2] >= 170)
land = clean(grass, 11) > 0
land = land | ((clean(rock | glow, 5) > 0) & (cv2.dilate(land.astype(np.uint8), k(27)) > 0))
land = clean(land, 21) > 0
# bamboo and the trees stand over the island's edge in the frame: their holes in the mask are closed (the legitimate bays are all wider)
land = cv2.morphologyEx(land.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (51, 51))) > 0
cs, _ = cv2.findContours(land.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
KERB_Z = 0.3      # (the outline is the kerb's: its top stands ~0.5 over the ground, its foot is on it: read half way)
_Hk = cv2.findHomography(np.float32([ref(X, Y, KERB_Z) for X, Y in g]), np.float32(g))[0]
plan_k = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), _Hk).reshape(-1, 2)
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


banks = [rectify(plan_k(cv2.approxPolyDP(c, 2.0, True).reshape(-1, 2))) for c in cs if cv2.contourArea(c) > 20000]

# props, read off the frame (pixel centres at the foot of each): [x, y] in the 1920x1080 reference
PX = dict(
    crates=[(640, 385), (668, 415), (1313, 575), (665, 898)],
    bamboo=[(762, 215), (845, 245), (880, 225), (913, 232), (1050, 752), (1102, 742), (870, 985), (925, 965)],
    pads=[(640, 258), (497, 303), (50, 700), (1617, 580), (1280, 18)],
    trees=[(375, 440), (1435, 205)],
    levers=[((620, 777), (650, 771), 0.3), ((1275, 245), (1247, 260), 0.3)],
    tufts=[(1112, 182), (602, 456), (562, 630), (832, 790), (1334, 622), (985, 842), (692, 508), (1024, 372), (1206, 330)],
)
at = lambda pts: r1(plan(pts))
def homography_at(z):
    g2 = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    return cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g2]), np.float32(g2))[0]


def unproject(px, py, z):
    """A pixel of the frame, as the plan point under it when it is `z` high; and how many pixels a plan unit is there."""
    Hz = homography_at(z)
    a = cv2.perspectiveTransform(np.float32([[[px, py]]]), Hz)[0, 0]
    b = cv2.perspectiveTransform(np.float32([[[px + 10, py]]]), Hz)[0, 0]
    return [round(float(a[0]), 2), round(float(a[1]), 2)], 10 / float(np.hypot(*(b - a)))


# The two orange trees (the HQ frame at 10:37, read off by eye): a slim leaning birch from the island's edge, and lumps of canopy
# (centre pixel, half width and half height in pixels). The trunk is `H` units tall: the pixels it climbs over the pixels a unit of
# height moves a point.
_foot = lambda px, py: unproject(px, py, 0.0)[0]
_dy = abs(ref(0, 77, 1.0)[1] - ref(0, 77, 0.0)[1])
TREE_PX = [
    dict(foot=(430, 560), top=(352, 345), lumps=[(250, 365, 80, 80), (372, 342, 48, 42), (432, 370, 62, 50), (335, 512, 85, 58)]),
    dict(foot=(1405, 268), top=(1440, 190), lumps=[(1486, 80, 56, 40), (1500, 152, 48, 46), (1366, 109, 44, 34), (1366, 211, 66, 48)]),
]
trees = []
for t in TREE_PX:
    height = 3.4      # (a bent birch about as tall as two and a half characters; its lumps sit from low to high with how high they are in the frame)
    span = max(t['foot'][1] - t['top'][1], 1)
    lumps = []
    for x, y, rx, ry in t['lumps']:
        z = float(np.clip(2.2 + 3.4 * (t['foot'][1] - y) / span, 2.2, 5.6))
        spot, ppu = unproject(x, y, z)
        lumps.append(dict(at=spot, r=round(rx / ppu, 2), ry=round(ry / ppu, 2), z=round(z, 2)))
    # the fit against the game's own view (fit_trees.py): the canopy moved and scaled as a whole
    tf = json.load(open('art/lily_island/treefit.json')).get(str(len(trees)), dict(dx=0.0, dy=0.0, s=1.0)) if os.path.exists('art/lily_island/treefit.json') else dict(dx=0.0, dy=0.0, s=1.0)
    if lumps:
        mx = float(np.mean([l['at'][0] for l in lumps])); my = float(np.mean([l['at'][1] for l in lumps]))
        for l in lumps:
            l['at'] = [round(mx + tf['s'] * (l['at'][0] - mx) + tf['dx'], 2), round(my + tf['s'] * (l['at'][1] - my) + tf['dy'], 2)]
            l['r'] = round(l['r'] * tf['s'], 2); l['ry'] = round(l['ry'] * tf['s'], 2)
    trees.append(dict(foot=_foot(*t['foot']), height=round(height, 2), top=unproject(t['top'][0], t['top'][1], height)[0], lumps=lumps))
# fallen leaves: small red ovals lying on the grass by each tree's foot (pixel clusters of the frame)
rng = np.random.default_rng(5)
petals = []
for (cx0, cy0, sx, sy, n) in ((440, 548, 90, 60, 46), (1375, 300, 70, 20, 18)):
    for _ in range(n):
        petals.append(_foot(float(cx0 + rng.normal(0, sx / 2)), float(cy0 + rng.normal(0, sy / 2))))
out = dict(zoom=Z, trees=trees, petals=petals, levers=[dict(housing=unproject(a[0], a[1], z)[0], knob=unproject(b[0], b[1], z)[0], z=z) for a, b, z in PX['levers']], tufts=at(PX['tufts']), banks=[r1(b) for b in banks], crates=at(PX['crates']), bamboo=at(PX['bamboo']), pads=at(PX['pads']))
json.dump(out, open('art/lily_island/layout.json', 'w'))
allp = np.concatenate(banks)
print('banks', [len(b) for b in banks], 'bounds', allp.min(0).round(1), allp.max(0).round(1))
