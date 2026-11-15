"""The props fitted to the READY frame (2026-11-14), to be built in 3D (blender/build.py) instead of traced cards: the barrels, the bucket
and the urns as upright cylinders (middle, radius, height, standing on z0: the urns on the basin's blocks), the bench and the plank as
turned boxes (middle, half sizes, turn, height). Each one's silhouette through measure.py's camera against the frame's own pixels of it
(everything in its box that is not the ground's colours), moved until they overlap most. Writes props.json, output/props_fit.png.

  python art/canal_court/fit_props.py <wide render.png>      (blender/build.py <dir> render wide; after ready.py; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/canal_court')
from measure import pix, plan_at

f = cv2.imread('art/canal_court/output/clean_ref.png')
B = json.load(open('art/canal_court/basin.json'))
# name: kind, frame box, z0, first guess (cylinder: cx cy r h; box: cx cy a b turn h)
PROPS = {
    'barrel_nw': ('cyl', (350, 132, 432, 226), 0.0),
    'barrel_n': ('cyl', (1156, 128, 1232, 210), 0.0),
    'barrel_s': ('cyl', (608, 724, 694, 818), 0.0),
    'bucket': ('cyl', (1018, 208, 1062, 258), 0.0),
    'urn_n': ('cyl', (1404, 428, 1462, 476), B['hb']),
    'urn_s': ('cyl', (1287, 616, 1334, 670), B['hb']),
    'bench': ('box', (1064, 200, 1174, 276), 0.0),
    'plank': ('box', (1010, 790, 1102, 894), 0.0),
}
# (what is not our own render of everything else: blender/build.py's wide render, which draws no cards, at the frame's place in it)
R_ = cv2.imread(sys.argv[1])[97:97 + 1080, 229:229 + 1920]


def cyl_sil(v, z0, shape):
    cx, cy, r, h = v; m = np.zeros(shape, np.uint8)
    pts = [pix(cx + r * math.cos(a), cy + r * math.sin(a), z) for a in np.linspace(0, 2 * math.pi, 40, endpoint=False) for z in (z0, z0 + h)]
    cv2.fillPoly(m, [cv2.convexHull(np.int32(pts))], 1); return m > 0


def box_sil(v, z0, shape):
    cx, cy, a, b, t, h = v; m = np.zeros(shape, np.uint8); c, s = math.cos(t), math.sin(t)
    q = [(cx + c * x - s * y, cy + s * x + c * y) for x, y in ((-a, -b), (a, -b), (a, b), (-a, b))]
    pts = [pix(x, y, z) for x, y in q for z in (z0, z0 + h)]
    cv2.fillPoly(m, [cv2.convexHull(np.int32(pts))], 1); return m > 0


out = {}; vis = f.copy()
for name, (kind, (x0, y0, x1, y1), z0) in PROPS.items():
    dist = np.abs(f[y0:y1, x0:x1].astype(int) - R_[y0:y1, x0:x1].astype(int)).max(2)
    want = np.zeros(f.shape[:2], bool); want[y0:y1, x0:x1] = dist > 28
    raw = cv2.cvtColor(cv2.imread('art/canal_court/output/clean_ref_raw.png'), cv2.COLOR_BGR2HSV).astype(int)
    if name.startswith('urn'):        # (orange clay on the brown blocks)
        want[y0:y1, x0:x1] = (((raw[..., 0] <= 22) | (raw[..., 0] >= 172)) & (raw[..., 1] >= 110) & (raw[..., 2] >= 110))[y0:y1, x0:x1]
    if name == 'bucket':              # (its dark slate and its water, not the grass round it)
        want[y0:y1, x0:x1] = ((raw[..., 2] < 120) | ((raw[..., 0] >= 80) & (raw[..., 0] <= 105) & (raw[..., 1] >= 60)))[y0:y1, x0:x1]
    want = cv2.morphologyEx(want.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    reg = np.zeros(f.shape[:2], bool); reg[y0 - 10:y1 + 10, x0 - 10:x1 + 10] = True
    ys, xs = np.nonzero(want); foot = (xs[ys >= ys.max() - 4].mean(), ys.max())
    (fx, fy), = plan_at([foot], z0)
    if kind == 'cyl':
        w = (x1 - x0) / 33.0; v0 = [fx, fy + w / 2, w / 2, w]; sil = cyl_sil
    else:
        v0 = [fx, fy + 1.0, 1.4, 0.7, 0.0, 1.0]; sil = box_sil
    cost = lambda v: 1 - ((sil(v, z0, want.shape) & reg) & want).sum() / max(((sil(v, z0, want.shape) & reg) | want).sum(), 1)
    best = np.array(v0, float)
    for _ in range(2):
        step = np.array([0.3, 0.3, 0.2, 0.3] if kind == 'cyl' else [0.3, 0.3, 0.3, 0.2, 0.3, 0.3])
        simplex = np.vstack([best] + [best + np.eye(len(best))[j] * step[j] for j in range(len(best))])
        best = minimize(cost, best, method='Nelder-Mead', options=dict(xatol=0.002, fatol=1e-6, maxiter=3000, initial_simplex=simplex)).x
    out[name] = dict(kind=kind, z0=round(float(z0), 3), v=[round(float(x), 3) for x in best], iou=round(1 - cost(best), 3))
    print(name, out[name])
    cs, _ = cv2.findContours(sil(best, z0, want.shape).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(vis, cs, -1, (0, 0, 255), 1)
json.dump(out, open('art/canal_court/props.json', 'w'), indent=1)
cv2.imwrite('art/canal_court/output/props_fit.png', vis)
