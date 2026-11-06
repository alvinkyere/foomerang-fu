"""The hex meadow's trees (2026-11-06): trunk feet read by hand off output/reference_fill.png (ff physics hq 2.mp4 1202.0 s; the gold
canopies merge in a colour mask), unprojected like layout.py; each canopy's starting lumps from the gold pixels nearest its trunk
(k-means), for fit_trees.py. Adds 'trees' and 'Yc' to layout.json and writes output/props_overlay.jpg.

  python art/hex_meadow/props.py       (after layout.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/hex_meadow')
from measure import plan, ref, Yc

# (kind, trunk-foot pixel x, y): the middle tree; the right one (its foot under its lowest clumps); the top-left one (the HUD's names over
# it); the bottom one and its neighbour (feet below the frame, read along their trunks); the top one (its crown above the frame)
TREES = [('g', 971, 512), ('g', 1748, 420), ('g', 215, 240), ('g', 1100, 1110), ('g', 1300, 1150), ('g', 762, 90)]

# each trunk's middle line, read off the frame from its foot up (pixels; a fork as its own branch from a point on the trunk): put back
# in 3D on the upright plane through its foot facing the camera (its height and sideways place the two unknowns each pixel fixes)
TRUNKS = [[[(971, 515), (968, 480), (980, 450), (1000, 420), (1020, 370), (1035, 320), (1045, 285)], [(988, 440), (965, 405), (948, 372), (942, 352)]],
          [[(1748, 420), (1746, 385), (1738, 352)]],
          [[(215, 242), (222, 180), (218, 120), (198, 62), (187, 25)]],
          [[(1105, 1110), (1118, 1060), (1128, 1010), (1136, 975)]],
          [[(1300, 1150), (1302, 1080)]],
          [[(757, 92), (752, 40), (748, 0), (745, -40)]]]
f = cv2.imread('art/hex_meadow/output/reference_fill.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
k = lambda n: np.ones((n, n), np.uint8)
L = json.load(open('art/hex_meadow/layout.json'))
L['trees'] = [dict(kind=k_, px=[x, y], plan=[round(float(v), 2) for v in plan([(x, y)])[0]]) for k_, x, y in TREES]
L['Yc'] = round(float(Yc), 3)      # (the ground point under the frame's centre: Blender's y = Yc + plan y)
gold = (H >= 14) & (H <= 28) & (S > 90) & (V > 120) & (V < 240)
anchors = np.array([(x, y - 140) for _, x, y in TREES], float)
ys_, xs_ = np.nonzero(cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_OPEN, k(5)))
d = (xs_[:, None] - anchors[None, :, 0]) ** 2 + (ys_[:, None] - anchors[None, :, 1]) ** 2
own = d.argmin(1)
for i, (k_, x, y) in enumerate(TREES):
    sel = own == i
    bx, by = L['trees'][i]['plan']
    if sel.sum() < 400: L['trees'][i]['lumps'] = [dict(x=0.0, z=5.0, r=2.4)]; continue
    cx, cy = float(xs_[sel].mean()), float(ys_[sel].mean())
    z = next(z for z in np.arange(0, 30, 0.05) if ref(bx, Yc + by, z)[1] <= cy)
    ppu0 = ref(bx + 1, Yc + by)[0] - ref(bx, Yc + by)[0]
    pts = np.float32(np.c_[xs_[sel], ys_[sel]])
    K = int(max(1, min(8, round(sel.sum() / 3500))))
    _, lab_, cen_ = cv2.kmeans(pts, K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    lumps = []
    for j in range(K):
        q = pts[lab_[:, 0] == j]
        if len(q) < 200: continue
        lumps.append(dict(x=round((float(cen_[j][0]) - x) / ppu0, 2), z=round(float(z + (cy - cen_[j][1]) / (ppu0 * 0.56)), 2),
                          r=round(max(0.9, float(np.sqrt(len(q) / np.pi)) / ppu0 * 1.08), 2)))
    L['trees'][i]['lumps'] = lumps
    print(i, TREES[i], 'plan', L['trees'][i]['plan'], len(lumps), 'lumps', int(sel.sum()), 'px')
from scipy.optimize import least_squares
for i, branches in enumerate(TRUNKS):
    fx, fy = L['trees'][i]['plan']; out = []
    for br in branches:
        pts = []
        for u, v in br:
            # (above the foot the trunk runs a little behind its plane, so its clumps' domes stand in front of it as the frame's do: the
            # trunk shows only in their gaps; each point still lands on its pixel)
            res = least_squares(lambda q: np.array(ref(q[0], Yc + fy, q[1])) - np.array((u, v)), [fx, 2.0], diff_step=1e-3)
            back = 3.0 * min(1.0, max(0.0, (float(res.x[1]) - 1.0) / 3.0))
            res = least_squares(lambda q: np.array(ref(q[0], Yc + fy + back, q[1])) - np.array((u, v)), res.x, diff_step=1e-3)
            pts.append([round(float(res.x[0]), 3), round(float(fy + back), 3), round(max(0.0, float(res.x[1])), 3)])
        out.append(pts)
    L['trees'][i]['trunk'] = out
    print(i, 'trunk', out)
json.dump(L, open('art/hex_meadow/layout.json', 'w'), indent=1)
ov = f.copy()
for k_, x, y in TREES: cv2.circle(ov, (x, y), 9, (0, 215, 255), -1); cv2.circle(ov, (x, y), 9, (0, 0, 0), 2)
cv2.imwrite('art/hex_meadow/output/props_overlay.jpg', cv2.resize(ov, (1280, 720)))
