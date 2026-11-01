"""Nudges every stone block in the game's own view (as fit_trees.py does the canopies): per block the box round its hand outline (stones.py HAND) in the
reference frame; the stone-coloured pixels of the HQ and of the game in it; the game's block is moved by the centroid difference and scaled by the area ratio
(stonefit.json dx/dy/s, which stones.py applies). Run until the numbers are ~0.

  <bi_loop.sh> name; python art/bridge_islands/fit_stones_game.py art/bridge_islands/output/<name>.png
"""
import json, math, os, sys
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F_, C = CAM['focalPx'], np.array(CAM['centre'])
pxs = lambda X, Y, z: (lambda v: (960 + (F_ * v[0] / v[2]) * Z, 540 + (F_ * v[1] / v[2]) * Z))(R @ (np.array([X, Y, z]) / 100 - C))
g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)); h = cv2.imread('art/bridge_islands/output/reference.png')
stone = lambda f: (lambda x: (x[..., 0] >= 106) & (x[..., 0] <= 135) & (x[..., 1] >= 40) & (x[..., 2] >= 110))(cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int))
blocks = json.load(open('art/bridge_islands/stones.json'))
fit = json.load(open('art/bridge_islands/stonefit.json'))
ma, mb = stone(h), stone(g)
for i, b in enumerate(blocks):
    px = np.int32(b['px']); x0, y0 = px.min(0) - 22; x1, y1 = px.max(0) + 22
    x0, y0 = max(x0, 215), max(y0, 0); x1, y1 = min(x1, 1919), min(y1, 1079)
    # only the pixels within the outline (grown), so a neighbour's stone does not pull it
    own = np.zeros((1080, 1920), np.uint8); cv2.fillPoly(own, [px], 1); own = cv2.dilate(own, np.ones((45, 45), np.uint8))[y0:y1, x0:x1] > 0
    a = ma[y0:y1, x0:x1] & own; c = mb[y0:y1, x0:x1] & own
    if a.sum() < 300 or c.sum() < 300: print(i, 'no mask', a.sum(), c.sum()); continue
    ya, xa = np.nonzero(a); yc, xc = np.nonzero(c)
    sx, sy = xa.mean() - xc.mean(), ya.mean() - yc.mean(); ratio = float(np.clip(math.sqrt(a.sum() / c.sum()), 0.7, 1.4))
    at = b['rect'][:2]; z = b['height'] * 0.5
    p0 = np.array(pxs(at[0], at[1], z)); e = 0.5
    jx = (np.array(pxs(at[0] + e, at[1], z)) - p0) / e; jy = (np.array(pxs(at[0], at[1] + e, z)) - p0) / e
    d = np.linalg.solve(np.stack([jx, jy], 1), np.array([sx, sy]))
    o = fit.get(str(i), dict(h=b['height'], s=1.0, dx=0.0, dy=0.0, iou=0.0))
    fit[str(i)] = dict(h=o['h'], s=round(o['s'] * ratio, 3), dx=round(o['dx'] + 0.8 * float(d[0]), 3), dy=round(o['dy'] + 0.8 * float(d[1]), 3), iou=o.get('iou', 0.0))
    print(i, 'move (%.1f, %.1f) px, size x%.2f' % (sx, sy, ratio))
json.dump(fit, open('art/bridge_islands/stonefit.json', 'w'))
