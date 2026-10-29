"""Fits the cross pond's raft to the HQ frame, pixel by pixel (2026-10-29: "the raft is not the same").

layout.py's raft came from a rough outline (a centre of the vertices, a width from the farthest stray). Here its centre, the arms'
length, their width, its angle and the deck's height are searched to maximise the overlap (IoU) of the cross, projected through the
HQ camera, with the tan deck of the 4:27 frame (where a crate or the edge hides the deck, the pixel is not counted). Writes raft_fit.json
(plan units, as layout.json); ground.py uses it in place of layout.json's raft.

  python art/pond_cross/fit_raft.py       (from the repository root; after layout.py)
"""
import json, math
import numpy as np, cv2
from scipy.optimize import minimize

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/pond_cross/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C0 = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C0)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


f = cv2.imread('art/pond_cross/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); v = f.max(2)
hud = np.arange(1920)[None, :] > 230
wood = hud & (h[..., 0] >= 5) & (h[..., 0] <= 24) & (h[..., 1] > 40) & (h[..., 1] < 170) & (v > 90) & (v < 215)
wood = cv2.morphologyEx(wood.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0
crate = hud & ((h[..., 0] >= 160) | (h[..., 0] <= 3)) & (h[..., 1] > 50) & (v > 110)
ignore = cv2.dilate(crate.astype(np.uint8), np.ones((25, 25), np.uint8)) > 0          # (a crate and its shadow hide the deck)
L = json.load(open('art/pond_cross/layout.json'))['raft']
x0 = [L['centre'][0], L['centre'][1], L['arm'], L['width'], L['degrees'], 0.2]


def cross(p):
    cx, cy, arm, wid, ang, zt = p; a = math.radians(ang); ux, uy = math.cos(a), math.sin(a)
    polys = []
    for (l, w) in ((arm, wid), (wid, arm)):
        pts = [(-l / 2, -w / 2), (l / 2, -w / 2), (l / 2, w / 2), (-l / 2, w / 2)]
        polys.append(np.int32([ref(cx + u * ux - vv * uy, cy + u * uy + vv * ux, zt) for u, vv in pts]))
    return polys


def iou(p):
    m = np.zeros(wood.shape, np.uint8)
    for poly in cross(p): cv2.fillPoly(m, [poly], 1)
    m = m > 0
    a, b = m & ~ignore, wood & ~ignore
    return (a & b).sum() / max((a | b).sum(), 1)


best = minimize(lambda p: -iou(p), x0, method='Nelder-Mead', options=dict(xatol=0.01, fatol=1e-5, maxiter=1500, initial_simplex=np.array([x0] + [np.array(x0) + d for d in np.diag([1.5, 1.5, 2.0, 1.0, 3.0, 0.6])])))
p = best.x
print('raft fit: IoU %.3f (was %.3f)' % (-best.fun, iou(x0)))
print('  centre (%.2f, %.2f) was (%.2f, %.2f); arm %.2f was %.2f; width %.2f was %.2f; angle %.2f was %.2f; deck height %.2f' % (p[0], p[1], *x0[:2], p[2], x0[2], p[3], x0[3], p[4], x0[4], p[5]))
out = dict(L); out.update(centre=[round(float(p[0]), 2), round(float(p[1]), 2)], arm=round(float(p[2]), 2), width=round(float(p[3]), 2), degrees=round(float(p[4]), 2), deck=round(float(p[5]), 2))
json.dump(out, open('art/pond_cross/raft_fit.json', 'w'))
