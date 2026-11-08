"""The temple court's planters (ff physics hq 2.mp4 121.5 s and the round's mosaic): each a lavender octagonal prism (half sizes a, b,
corners cut by k of the half size, height h), fitted to the purple mask of the mosaic (its holes filled: the soil and the trunks)
by its silhouette through the camera (Nelder-Mead on 1 - IoU). Writes planters.json (plan units, y north).

  python art/temple_court/fit_planters.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/temple_court')
from measure import pix, plan, MOSAIC_ORIGIN
from fit_planters_shape import octagon

M = cv2.imread('art/temple_court/output/mosaic.png')
hsv = cv2.cvtColor(M, cv2.COLOR_BGR2HSV).astype(int)
PUR = ((hsv[..., 0] >= 118) & (hsv[..., 0] <= 140) & (hsv[..., 1] > 40) & (hsv[..., 2] > 90)).astype(np.uint8)
PUR = cv2.morphologyEx(PUR, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
OX, OY = MOSAIC_ORIGIN

# each planter: a mosaic box around it (purple inside it is the planter, the trees' trunks and leaves filled)
BOXES = {'small_ne': (1170, 285, 1345, 420), 'small_n': (893, 400, 1065, 540), 'small_s': (883, 668, 1060, 815),
         'small_se': (1175, 805, 1360, 960), 'big_n': (505, 290, 765, 445), 'big_m': (540, 495, 760, 705), 'big_s': (455, 765, 725, 925)}


def silhouette(p, shape, x0, y0):
    cx, cy, a, b, k, h = p
    pts = [pix(x, y, z) for x, y in octagon(cx, cy, a, b, k) for z in (0, h)]
    pts = np.array([(u - OX - x0, v - OY - y0) for u, v in pts], np.float32)
    m = np.zeros(shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(pts).astype(np.int32), 1); return m


out = {}
for name, (x0, y0, x1, y1) in BOXES.items():
    t = PUR[y0:y1, x0:x1].copy()
    cnts, _ = cv2.findContours(t, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    big = max(cnts, key=cv2.contourArea); t = np.zeros_like(t); cv2.drawContours(t, [big], -1, 1, -1)
    ys, xs = np.nonzero(t)
    c = plan([((xs.mean() + x0 + OX), (ys.mean() + y0 + OY))])[0]
    wpx = (xs.max() - xs.min()) / 27.0
    p0 = [c[0], c[1] + 0.6, wpx / 2, wpx / 2.6, 0.3, 1.5]
    f = lambda p: 1 - (np.logical_and(silhouette(p, t.shape, x0, y0), t).sum() / max(1, np.logical_or(silhouette(p, t.shape, x0, y0), t).sum()))
    r = minimize(f, p0, method='Nelder-Mead', options=dict(maxiter=1500, xatol=1e-3, fatol=1e-5, initial_simplex=None))
    r = minimize(f, r.x, method='Nelder-Mead', options=dict(maxiter=1500, xatol=1e-3, fatol=1e-5))
    cx, cy, a, b, k, h = r.x
    out[name] = dict(cx=round(cx, 3), cy=round(cy, 3), a=round(a, 3), b=round(b, 3), k=round(k, 3), h=round(h, 3), iou=round(1 - r.fun, 3))
    print(name, out[name])
json.dump(out, open('art/temple_court/planters.json', 'w'), indent=1)
