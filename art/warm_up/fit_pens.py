"""The warm-up's four pens (2026-11-12): each a rectangle of lavender walls round a player at the start (the READY frame, 0.0 s), its
walls `t` thick and `h` tall, standing on the ground (a pen crosses the moat: its walls bridge the water). Fitted to the frame's pen
walls (lavender in the frame and not in the round's mosaic, where the pens are gone: output/pen_mask.npy) by their silhouette through
the camera: the four walls' boxes projected and filled, against the mask in a box round each pen (differential evolution on 1 - IoU).
The rectangle in the moat's axes (u north-east, v north-west): centre, half lengths a (along u) and b (along v), its turn off them.
Writes pens.json (plan units).

  python art/warm_up/fit_pens.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/warm_up')
from measure import pix, plan

pen = np.load('art/warm_up/output/pen_mask.npy')
# each pen: its box in the frame and a rough middle (pixels): its player at one end, its lever at the other
BOXES = {'W': (160, 280, 720, 700), 'N': (640, 0, 1160, 330), 'E': (1060, 300, 1640, 760), 'S': (620, 620, 1110, 1080)}
R2 = math.sqrt(2)


def walls(p):
    """The pen's four walls as boxes (plan corner lists) for parameters (cx, cy, a, b, turn, t)."""
    cx, cy, a, b, turn, t = p[:6]
    ang = math.radians(45 + turn); ux, uy = math.cos(ang), math.sin(ang); vx, vy = -uy, ux
    P = lambda s, r: (cx + ux * s + vx * r, cy + uy * s + vy * r)
    return [[P(-a, -b), P(a, -b), P(a, -b + t), P(-a, -b + t)], [P(-a, b - t), P(a, b - t), P(a, b), P(-a, b)],
            [P(-a, -b), P(-a + t, -b), P(-a + t, b), P(-a, b)], [P(a - t, -b), P(a, -b), P(a, b), P(a - t, b)]]


def silhouette(p, x0, y0, shape):
    h = p[6]; m = np.zeros(shape, np.uint8)
    for w in walls(p):
        q = np.array([pix(x, y, z) for x, y in w for z in (0.0, h)], np.float32) - [x0, y0]
        cv2.fillConvexPoly(m, cv2.convexHull(q.astype(np.float32)).astype(np.int32), 1)
    return m > 0


# the four pens are one design: their size, walls and height fitted together, each its own place and turn (the separate fits agreed on
# the size, ~14 x 9.2, and disagreed on the height where a pen's far side is cut off by the frame's edge or the names)
START = {'W': (-17.4, 1.2), 'N': (-0.8, 17.8), 'E': (16.9, 0.1), 'S': (0.3, -16.2)}      # (each pen fitted alone first)
names = list(BOXES)
tg = {n: pen[y0:y1, x0:x1] for n, (x0, y0, x1, y1) in BOXES.items()}


def cost(v):
    a, bb, t, h = v[:4]; e = 0.0
    for k, n in enumerate(names):
        x0, y0, x1, y1 = BOXES[n]; cx, cy, turn = v[4 + 3 * k:7 + 3 * k]
        sm = silhouette([cx, cy, a, bb, turn, t, h], x0, y0, tg[n].shape)
        e += 1 - (sm & tg[n]).sum() / max(1, (sm | tg[n]).sum())
    return e / 4


bounds = [(6.0, 8.0), (4.0, 5.5), (0.3, 1.2), (0.5, 2.5)]
for n in names:
    cx0, cy0 = START[n]
    bounds += [(cx0 - 1.5, cx0 + 1.5), (cy0 - 1.5, cy0 + 1.5), (-6, 6)]
r = differential_evolution(cost, bounds, seed=4, maxiter=150, popsize=12, tol=1e-7, polish=True)
v = [float(q) for q in r.x]; a, bb, t, h = v[:4]
out = dict(a=round(a, 3), b=round(bb, 3), t=round(t, 3), h=round(h, 3), iou=round(1 - r.fun, 3), pens={})
for k, n in enumerate(names):
    cx, cy, turn = v[4 + 3 * k:7 + 3 * k]
    x0, y0, x1, y1 = BOXES[n]; sm = silhouette([cx, cy, a, bb, turn, t, h], x0, y0, tg[n].shape)
    out['pens'][n] = dict(cx=round(cx, 3), cy=round(cy, 3), turn=round(turn, 2), iou=round((sm & tg[n]).sum() / max(1, (sm | tg[n]).sum()), 3))
print(json.dumps(out))
json.dump(out, open('art/warm_up/pens.json', 'w'), indent=1)
