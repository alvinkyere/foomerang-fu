"""The temple court's four small planters refitted (2026-11-11; owner: the HQ's chunky stones): each an octagonal stone ring (half sizes
a, b; corners cut by k; height h; the ring `ring` wide, the soil `drop` below its top), fitted to the round's mosaic (players and READY gone) by what the
camera shows of it: its stone (the outer prism's silhouette less the soil seen through its opening) and its soil, both at once
(differential evolution on 1 - the mean of the two IoUs). The outline alone (fit_planters.py) could not tell the corners' cut from the
width, nor the ring's thickness. Updates planters.json's small rings (adds `ring`, `drop`).

  python art/temple_court/fit_rings.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/temple_court')
from measure import pix
from fit_planters_shape import octagon

# (the round's mosaic: no players, no READY; its pixels are the frame's shifted by MOSAIC_ORIGIN)
from measure import MOSAIC_ORIGIN
OX, OY = MOSAIC_ORIGIN
f = cv2.imread('art/temple_court/output/mosaic.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
STONE = (hsv[..., 0] >= 115) & (hsv[..., 0] <= 150) & (hsv[..., 1] >= 35) & (hsv[..., 2] >= 80)
SOIL = (hsv[..., 0] >= 22) & (hsv[..., 0] <= 34) & (hsv[..., 1] >= 60) & (hsv[..., 2] >= 150)
BOXES = {'small_n': (720, 300, 920, 470), 'small_s': (720, 560, 900, 735), 'small_ne': (1010, 190, 1185, 345), 'small_se': (1005, 700, 1200, 885)}
PL = json.load(open('art/temple_court/planters.json'))


def masks(p, x0, y0, shape):
    cx, cy, a, b, k, h, ring, drop = p
    proj = lambda poly, z: (np.array([pix(x, y, z) for x, y in poly]) - [x0, y0]).astype(np.float32)      # (box-local: the box is the frame's, its mask cut from the mosaic)
    outer = octagon(cx, cy, a, b, k); inner = octagon(cx, cy, a - ring, b - ring, k)
    m = np.zeros(shape, np.uint8)
    cv2.fillConvexPoly(m, cv2.convexHull(np.concatenate([proj(outer, 0), proj(outer, h)])).astype(np.int32), 1)
    top = np.zeros(shape, np.uint8); cv2.fillConvexPoly(top, proj(inner, h).astype(np.int32), 1)
    low = np.zeros(shape, np.uint8); cv2.fillConvexPoly(low, proj(inner, h - drop).astype(np.int32), 1)
    soil = (top & low) > 0
    return (m > 0) & ~soil, soil


for name, (x0, y0, x1, y1) in BOXES.items():
    st, so = STONE[y0 - OY:y1 - OY, x0 - OX:x1 - OX], SOIL[y0 - OY:y1 - OY, x0 - OX:x1 - OX]
    # (the soil is only what lies inside the ring's outline: the warm yellow paving beside some rings has its colour)
    cnts, _ = cv2.findContours(st.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = np.zeros(st.shape, np.uint8); cv2.drawContours(hull, [max(cnts, key=cv2.contourArea)], -1, 1, -1); so = so & (hull > 0)
    p = PL[name]
    def cost(v):
        ms, mo = masks(v, x0, y0, st.shape)
        i1 = (ms & st).sum() / max(1, (ms | st).sum()); i2 = (mo & so).sum() / max(1, (mo | so).sum())
        return 1 - (i1 + i2) / 2
    bounds = [(p['cx'] - 0.8, p['cx'] + 0.8), (p['cy'] - 0.8, p['cy'] + 0.8), (p['a'] * 0.85, p['a'] * 1.25), (p['b'] * 0.85, p['b'] * 1.25),
              (0.2, 0.6), (1.0, 2.6), (0.5, 1.4), (0.15, 1.0)]
    r = differential_evolution(cost, bounds, seed=2, maxiter=60, popsize=18, tol=1e-6, polish=True)
    cx, cy, a, b, k, h, ring, drop = [float(v) for v in r.x]
    PL[name] = dict(cx=round(cx, 3), cy=round(cy, 3), a=round(a, 3), b=round(b, 3), k=round(k, 3), h=round(h, 3), ring=round(ring, 3),
                    drop=round(drop, 3), iou=round(1 - r.fun, 3))
    print(name, PL[name])
json.dump(PL, open('art/temple_court/planters.json', 'w'), indent=1)
