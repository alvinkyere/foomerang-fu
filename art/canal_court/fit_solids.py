"""The basin and the rocks fitted to the frame (2026-11-13), as fit_aqueduct.py does the aqueduct: the basin an octagonal prism (its brown
blocks and the water inside), each rock a box turned in the plan; their outlines through measure.py's camera against the frame's own
pixels of that colour in a box round each, the parameters moved to make the overlap largest. Writes solids.json, output/solids_fit.png.

  python art/canal_court/fit_solids.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/canal_court')
from measure import pix, plan

f = cv2.imread('art/canal_court/output/clean_ref.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H_, S_, V_ = h[..., 0], h[..., 1], h[..., 2]
lav = (H_ >= 105) & (H_ <= 135) & (S_ >= 55) & (V_ >= 95)
brown = ((H_ >= 160) | (H_ <= 12)) & (S_ >= 40) & (V_ >= 60) & (V_ <= 200)
navy = (H_ >= 105) & (H_ <= 135) & (S_ >= 60) & (V_ < 95)
water = (H_ >= 85) & (H_ <= 112) & (S_ >= 70) & (V_ >= 150)


def prism(poly, z1, z0=0.0):
    pts = [pix(x, y, z) for x, y in poly for z in (z0, z1)]
    m = np.zeros(lav.shape, np.uint8); cv2.fillPoly(m, [cv2.convexHull(np.int32(pts))], 1); return m > 0


def octagon(cx, cy, r, turn):
    return [(cx + r * math.cos(turn + k * math.pi / 4), cy + r * math.sin(turn + k * math.pi / 4)) for k in range(8)]


def rbox(cx, cy, a, b, ang):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + c * x - s * y, cy + s * x + c * y) for x, y in ((-a, -b), (a, -b), (a, b), (-a, b))]


def fit(name, box, want, shape, v0):
    x0, y0, x1, y1 = box; reg = np.zeros(lav.shape, bool); reg[y0:y1, x0:x1] = True; w = want & reg
    w = cv2.morphologyEx(w.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    cost = lambda v: 1 - ((shape(v) & reg) & w).sum() / max(((shape(v) & reg) | w).sum(), 1)
    best = np.array(v0, float)
    for _ in range(2):
        r = minimize(cost, best, method='Nelder-Mead', options=dict(maxiter=2500, xatol=0.01, fatol=1e-5, adaptive=True)); best = r.x
    print(name, 'IoU %.3f' % (1 - r.fun), np.round(best, 3).tolist())
    return best, 1 - r.fun, shape(best) & reg, w


def start(box_px, z=0.0):
    (cx, cy), = plan([((box_px[0] + box_px[2]) / 2, (box_px[1] + box_px[3]) / 2)]); return float(cx), float(cy)


out, vis = {}, f.copy()
# the basin: brown blocks round the water, standing on a dark navy footing
BB = (1200, 420, 1560, 770); cx, cy = start((1260, 460, 1520, 720))
bv, iou, s, w = fit('basin', BB, brown | water | navy, lambda v: prism(octagon(v[0], v[1], v[2], v[3]), v[4]), [cx, cy - 1.5, 4.8, math.pi / 8, 2.0])
out['basin'] = dict(cx=round(bv[0], 3), cy=round(bv[1], 3), r=round(bv[2], 3), turn=round(bv[3], 4), h=round(bv[4], 3), iou=round(iou, 3))
vis[s & ~w] = (0, 0, 255); vis[w & ~s] = (0, 255, 0)
ROCKS = {'sw': (260, 700, 520, 900), 'n': (1420, 140, 1560, 300), 'e': (1570, 260, 1760, 390), 'se': (1630, 620, 1800, 860)}
rocks = {}
for name, B in ROCKS.items():
    cx, cy = start(B)
    a0 = (B[2] - B[0]) / 2 / 31.3
    rv, iou, s, w = fit('rock_' + name, B, lav, lambda v: prism(rbox(v[0], v[1], v[2], v[3], v[4]), v[5]), [cx, cy - 1.0, a0 * 0.9, a0 * 0.6, 0.3, 2.5])
    rocks[name] = dict(cx=round(rv[0], 3), cy=round(rv[1], 3), a=round(abs(rv[2]), 3), b=round(abs(rv[3]), 3), turn=round(rv[4], 4),
                       h=round(rv[5], 3), iou=round(iou, 3))
    vis[s & ~w] = (0, 0, 255); vis[w & ~s] = (0, 255, 0)
out['rocks'] = rocks
json.dump(out, open('art/canal_court/solids.json', 'w'), indent=1)
cv2.imwrite('art/canal_court/output/solids_fit.png', vis)
