"""Fits each tree's canopy to the HQ in the game's own view (as lily_island/fit_trees.py): per tree, a box in the reference frame and a colour class; moves and
scales the lumps (treefit.json, applied by layout.py) until the game's canopy mask sits on the HQ's.

  <shoot_hq.sh> name 1500; python art/bridge_islands/fit_trees.py art/bridge_islands/output/<name>.png; then layout.py ... package.py again
"""
import json, math, os, sys
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F_, C = CAM['focalPx'], np.array(CAM['centre'])
pxs = lambda X, Y, z: (lambda v: (960 + (F_ * v[0] / v[2]) * Z, 540 + (F_ * v[1] / v[2]) * Z))(R @ (np.array([X, Y, z]) / 100 - C))
BOXES = [(430, 110, 680, 330, 'red'), (300, 330, 560, 560, 'gold'), (1050, 440, 1330, 640, 'gold'), (1640, 100, 1920, 500, 'red'), (780, 0, 1000, 80, 'gold')]
g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)); h = cv2.imread('art/bridge_islands/output/reference.png')


def mask(f, kind):
    x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
    if kind == 'red': return ((x[..., 0] <= 12) | (x[..., 0] >= 170)) & (x[..., 1] > 90) & (x[..., 2] > 150)
    return (x[..., 0] >= 12) & (x[..., 0] <= 24) & (x[..., 1] > 90) & (x[..., 2] > 170)


L = json.load(open('art/bridge_islands/layout.json'))
fit = json.load(open('art/bridge_islands/treefit.json')) if os.path.exists('art/bridge_islands/treefit.json') else {}
for k, (x0, y0, x1, y1, kind) in enumerate(BOXES):
    a = mask(h, kind)[y0:y1, x0:x1]; b = mask(g, kind)[y0:y1, x0:x1]
    a = cv2.morphologyEx(a.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) > 0; b = cv2.morphologyEx(b.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)) > 0
    if a.sum() < 400 or b.sum() < 400: print('tree', k, 'no mask', a.sum(), b.sum()); continue
    ya, xa = np.nonzero(a); yb, xb = np.nonzero(b)
    sx, sy = xa.mean() - xb.mean(), ya.mean() - yb.mean(); ratio = math.sqrt(a.sum() / b.sum())
    t = L['trees'][k]; z = float(np.mean([l['z'] for l in t['lumps']])); at = t['lumps'][0]['at']
    p0 = np.array(pxs(at[0], at[1], z)); e = 0.5
    jx = (np.array(pxs(at[0] + e, at[1], z)) - p0) / e; jy = (np.array(pxs(at[0], at[1] + e, z)) - p0) / e
    d = np.linalg.solve(np.stack([jx, jy], 1), np.array([sx, sy]))
    o = fit.get(str(k), dict(dx=0.0, dy=0.0, s=1.0))
    fit[str(k)] = dict(dx=round(o['dx'] + float(d[0]), 3), dy=round(o['dy'] + float(d[1]), 3), s=round(o['s'] * ratio, 3))
    print('tree', k, 'must move (%.1f, %.1f) px, size x%.2f' % (sx, sy, ratio))
json.dump(fit, open('art/bridge_islands/treefit.json', 'w'))
