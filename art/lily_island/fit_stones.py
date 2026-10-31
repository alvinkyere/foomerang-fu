"""Fits each stone block to the HQ frame (2026-10-30): its height, footprint size and place, so that the silhouette our model makes
through the HQ camera (the convex hull of its footprint at the ground and at its top) covers the HQ's stone pixels in its box.
Writes stonefit.json ({index: {h, s, dx, dy}}), which stones.py applies on its next run.

  python art/lily_island/stones.py; python art/lily_island/fit_stones.py; python art/lily_island/stones.py     (from the repository root)
"""
import json, math, os
import numpy as np, cv2
from scipy.optimize import minimize

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/lily_island/scale.json'))
Z = SC['hqZoom'] / SC['scale']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F_, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F_ * v[0] / v[2] + 960, F_ * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


proj = lambda P, z: np.float32([ref(x, y, z) for x, y in P])


def unproject(P, z):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    Hz = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(P).reshape(-1, 1, 2), Hz).reshape(-1, 2)
hq = cv2.imread('art/lily_island/output/reference.png')
h = cv2.cvtColor(hq, cv2.COLOR_BGR2HSV).astype(int)
stone = ((h[..., 0] >= 108) & (h[..., 0] <= 130) & (h[..., 1] >= 55) & (h[..., 2] >= 120)).astype(np.uint8)
stone[:, :215] = 0; stone[300:400, 1255:1470] = 0
# the two blocks under the light shafts (the small NE boulder, the blue slab) are paler and bluer: a wider cut inside their own boxes
shaft_stone = ((h[..., 0] >= 106) & (h[..., 0] <= 135) & (h[..., 1] >= 35) & (h[..., 2] >= 170)).astype(np.uint8)
SHAFTED = {0, 1}
MANUAL = {7: dict(h=4.6, s=0.95), 5: dict(h=3.6, s=0.9), 1: dict(h=2.0, s=1.0), 2: dict(h=2.0, s=1.0), 6: dict(h=2.0, s=1.0), 3: dict(h=6.4, s=1.0), 4: dict(h=1.0, s=1.0)}      # the E cube (its side shows ~85 px) and the low rock under its corner
CUBES = {3, 4}        # (the E boulder and the low rock beside it: straight-sided, not tapered; build.py BLOCK_TAPER)
blocks = json.load(open('art/lily_island/stones.json'))
old = json.load(open('art/lily_island/stonefit.json')) if os.path.exists('art/lily_island/stonefit.json') else {}
fit = {}
for i, b in enumerate(blocks):
    PX = np.float32(b['px']); F0 = unproject(PX, b['height']); c = F0.mean(0); H0 = b['height']
    if str(i) in old:                       # (the footprint in stones.json already carries the last fit: refit from there)
        H0 = old[str(i)]['h']
    both = np.vstack([proj(F0, 0), proj(F0, H0)])
    x0, y0 = np.maximum(both.min(0).astype(int) - 45, 0); x1, y1 = np.minimum(both.max(0).astype(int) + 45, [1919, 1079])
    M = (shaft_stone if i in SHAFTED else stone)[y0:y1, x0:x1]

    def sil(p):
        H, s, dx, dy = p
        F1 = unproject(PX, max(H, 0.05)); F = F1.mean(0) + s * (F1 - F1.mean(0)) + np.float32([dx, dy])
        tp = 1.0 if i in CUBES else 0.88 if b['kind'] == 'boulder' else 0.93         # (the top drawn in: build.py `taper`)
        cc = F.mean(0)
        pts = np.vstack([proj(F, 0), proj(cc + tp * (F - cc), max(H, 0.05))]) - np.float32([x0, y0])
        m = np.zeros(M.shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(pts.astype(np.float32)).astype(np.int32), 1)
        return m

    def loss(p):
        lo, hi = (2.2, 7.5) if b['kind'] == 'boulder' else (0.5, 2.2) if b['kind'] == 'slab' else (0.6, 1.3)     # (the HQ's boulders stand tall, its slabs low)
        if p[1] < 0.6 or p[1] > 1.15 or p[0] < lo or p[0] > hi or abs(p[2]) > 0.6 or abs(p[3]) > 0.6: return 1.0
        m = sil(p)
        return 1 - (m & M).sum() / max((m | M).sum(), 1)

    if i in MANUAL:        # (touching blocks share one mask: a fit would grow one into the other; set from the picture)
        fit[str(i)] = dict(MANUAL[i], dx=0.0, dy=0.0, iou=0.0)
        continue
    if i in SHAFTED:       # (no usable mask under the shafts: set by hand from the picture)
        fit[str(i)] = dict(h=2.8 if b['kind'] == 'boulder' else 1.3, s=1.0, dx=0.0, dy=0.0, iou=0.0)
        continue
    best = min((minimize(loss, [H, s, 0, 0], method='Nelder-Mead', options=dict(xatol=1e-3, fatol=1e-4, maxiter=500, initial_simplex=np.array([[H, s, 0, 0], [H * 1.3, s, 0, 0], [H, s * 1.12, 0, 0], [H, s, 0.5, 0], [H, s, 0, 0.5]])))
                for H in ((3.5, 5.0, 6.5) if b['kind'] == 'boulder' else (0.7, 1.0, 1.25)) for s in (0.8, 1.0)), key=lambda r: r.fun)
    H, s, dx, dy = best.x
    fit[str(i)] = dict(h=round(float(H), 2), s=round(float(s), 3), dx=round(float(dx), 2), dy=round(float(dy), 2), iou=round(1 - float(best.fun), 3))
    print(i, b['kind'], fit[str(i)])
json.dump(fit, open('art/lily_island/stonefit.json', 'w'))
