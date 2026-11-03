"""Fits each tree's canopy lumps to the HQ frame directly (2026-11-01): the canopy's mask (red or gold) in the tree's box is explained by N ellipses
(the lumps as the camera sees them), placed and sized to maximise their union's IoU with the mask. Prints the TREES lumps (x, y, rx, ry) for layout.py.

  python art/bridge_islands/fit_lumps.py
"""
import numpy as np, cv2
from scipy.optimize import minimize

h = cv2.imread('art/bridge_islands/output/reference.png'); x = cv2.cvtColor(h, cv2.COLOR_BGR2HSV).astype(int)
MASK = {'red': ((x[..., 0] <= 12) | (x[..., 0] >= 170)) & (x[..., 1] > 90) & (x[..., 2] > 150),
        'gold': (x[..., 0] >= 12) & (x[..., 0] <= 24) & (x[..., 1] > 90) & (x[..., 2] > 170)}
TREES = [((780, 0, 1000, 80), 'gold', 3), ((430, 110, 680, 330), 'red', 4), ((300, 330, 560, 560), 'gold', 6), ((1050, 440, 1330, 640), 'gold', 5), ((1640, 100, 1920, 500), 'red', 8)]
for (x0, y0, x1, y1), kind, n in TREES:
    m = cv2.morphologyEx(MASK[kind][y0:y1, x0:x1].astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    H, W = m.shape; yy, xx = np.mgrid[0:H, 0:W]

    def union(p):
        u = np.zeros((H, W), bool)
        for i in range(n):
            cx, cy, rx, ry = p[4 * i:4 * i + 4]
            u |= ((xx - cx) / max(rx, 3)) ** 2 + ((yy - cy) / max(ry, 3)) ** 2 <= 1
        return u

    cost = lambda p: 1 - (union(p) & m).sum() / max((union(p) | m).sum(), 1)
    # start: k-means of the mask's pixels into n groups
    pts = np.float32(np.column_stack(np.nonzero(m)[::-1]))
    _, lab, cen = cv2.kmeans(pts, n, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5), 5, cv2.KMEANS_PP_CENTERS)
    p0 = []
    for i in range(n):
        q = pts[lab.ravel() == i]; p0 += [cen[i][0], cen[i][1], q[:, 0].std() * 1.8 + 5, q[:, 1].std() * 1.8 + 5]
    best = minimize(cost, p0, method='Powell', options=dict(maxiter=4000, xtol=0.5, ftol=1e-4))
    p = best.x
    lumps = [(int(round(x0 + p[4 * i])), int(round(y0 + p[4 * i + 1])), int(round(abs(p[4 * i + 2]))), int(round(abs(p[4 * i + 3])))) for i in range(n)]
    print(kind, 'IoU %.3f' % (1 - best.fun), 'lumps', sorted(lumps, key=lambda l: l[1]))
