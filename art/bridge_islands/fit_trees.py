"""Nudges each tree's canopy so it covers the HQ's in the GAME'S OWN view (2026-10-31; the owner: "the trees are misplaced and misaligned").

  <shoot_hq.sh> name 1500; cp the shot to art/bridge_islands/output/gameN.png
  python art/bridge_islands/fit_trees.py art/bridge_islands/output/gameN.png      then  layout.py -> ... -> build.py -> package.py again

The lumps were placed by unprojecting the HQ frame at a guessed height; the game's perspective differs a little from the preview's, and a
tall object shows it. This compares the orange canopy mask of the game with the HQ's, per tree (left x < 700, right x > 1200), and adds the
screen shift of their centres and the size ratio of their areas to treefit.json (cumulative: run it until the numbers are ~0 and 1).
"""
import json, math, os, sys
import numpy as np, cv2

g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)); h = cv2.imread('art/bridge_islands/output/reference.png')


def tree(f):
    x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
    m = ((x[..., 0] <= 14) | (x[..., 0] >= 170)) & (x[..., 1] > 100) & (x[..., 2] > 140)
    # the right tree stands in the light shafts: paler and less saturated, orange rather than red
    m[:, 1200:] = ((x[..., 0] <= 22) | (x[..., 0] >= 170))[:, 1200:] & (x[..., 1] > 70)[:, 1200:] & (x[..., 2] > 150)[:, 1200:]
    m[:, :215] = False
    m[600:, :] = False                      # (below the canopies: the fallen leaves and the players)
    m[300:, 1200:] = False
    return m


def parts(m):
    left = m.copy(); left[:, 700:] = False
    right = m.copy(); right[:, :1200] = False
    # the fallen leaves lie below the canopies: only the upper part of each (the leaves are small blobs: opened away)
    k = np.ones((9, 9), np.uint8)
    return [cv2.morphologyEx(p.astype(np.uint8), cv2.MORPH_OPEN, k) > 0 for p in (left, right)]


CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F_, C = CAM['focalPx'], np.array(CAM['centre'])
ref = lambda X, Y, z=0.0: ((960 + (F_ * (R @ (np.array([X, Y, z]) / 100 - C))[0] / (R @ (np.array([X, Y, z]) / 100 - C))[2]) * Z - 0), 0)
pxs = lambda X, Y, z: (lambda v: (960 + (F_ * v[0] / v[2]) * Z, 540 + (F_ * v[1] / v[2]) * Z))(R @ (np.array([X, Y, z]) / 100 - C))
L = json.load(open('art/bridge_islands/layout.json'))
fit = json.load(open('art/bridge_islands/treefit.json')) if os.path.exists('art/bridge_islands/treefit.json') else {}
for k, (ph, pg) in enumerate(zip(parts(tree(h)), parts(tree(g)))):
    if ph.sum() < 500 or pg.sum() < 500: continue
    yh, xh = np.nonzero(ph); yg, xg = np.nonzero(pg)
    sx, sy = xh.mean() - xg.mean(), yh.mean() - yg.mean()           # (screen px the game's canopy must move)
    ratio = math.sqrt(ph.sum() / pg.sum())
    t = L['trees'][k]; z = float(np.mean([l['z'] for l in t['lumps']])); at = t['lumps'][0]['at']
    # plan shift that moves a point at height z by (sx, sy) on screen (the camera looks along +y plan; a small-shift linearisation)
    p0 = np.array(pxs(at[0], at[1], z)); e = 0.5
    jx = (np.array(pxs(at[0] + e, at[1], z)) - p0) / e; jy = (np.array(pxs(at[0], at[1] + e, z)) - p0) / e
    d = np.linalg.solve(np.stack([jx, jy], 1), np.array([sx, sy]))
    o = fit.get(str(k), dict(dx=0.0, dy=0.0, s=1.0))
    fit[str(k)] = dict(dx=round(o['dx'] + float(d[0]), 3), dy=round(o['dy'] + float(d[1]), 3), s=round(o['s'] * ratio, 3))
    print('tree', k, 'canopy must move (%.1f, %.1f) px, size x%.2f -> plan shift (%.2f, %.2f)' % (sx, sy, ratio, d[0], d[1]))
json.dump(fit, open('art/bridge_islands/treefit.json', 'w'))
