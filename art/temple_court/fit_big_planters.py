"""The temple court's three big planters (under the trees): their canopies hide most of the purple, so each is fitted to its silhouette's
box read off the frame (121.5 s; left, right, back top edge, front foot in pixels), the small planters' height (1.5) and corner cut (0.33).
Adds them to planters.json.

  python art/temple_court/fit_big_planters.py      (after fit_planters.py)
"""
import json, sys
import numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, 'art/temple_court')
from measure import pix, plan
from fit_planters_shape import octagon

BOXES = {'big_n': (353, 585, 240, 353), 'big_m': (385, 587, 420, 620), 'big_s': (300, 557, 703, 837)}
H, K = 1.5, 0.33
P = json.load(open('art/temple_court/planters.json'))
for name, (l, r, t, b) in BOXES.items():
    def res(p):
        pts = np.array([pix(x, y, z) for x, y in octagon(p[0], p[1], p[2], p[3], K) for z in (0, H)])
        return [pts[:, 0].min() - l, pts[:, 0].max() - r, pts[:, 1].min() - t, pts[:, 1].max() - b]
    c = plan([((l + r) / 2, (t + b) / 2)])[0]
    s = least_squares(res, [c[0], c[1], 4, 3]).x
    P[name] = dict(cx=round(s[0], 3), cy=round(s[1], 3), a=round(s[2], 3), b=round(s[3], 3), k=K, h=H, iou=None)
    print(name, P[name], np.round(res(s), 2))
json.dump(P, open('art/temple_court/planters.json', 'w'), indent=1)
