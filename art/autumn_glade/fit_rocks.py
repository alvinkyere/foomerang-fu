"""Fits each rock (a superellipsoid on the ground: centre, half sizes w and d, height h, roundness e1 and e2) to the frame's rock mask
(ff physics hq 2.mp4 626.0 s): the surface points are projected through the camera rig, their hull is the model's silhouette, and the
score is the hull's overlap with the mask over everything either covers that no canopy hides. Writes rocks.json (plan units, relative
to the frame's centre ground point).

  python art/autumn_glade/fit_rocks.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/autumn_glade')
from measure import CAM, R, F, C, Z, Yc

f = cv2.imread('art/autumn_glade/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
hud = np.arange(1920)[None, :] > 215
rock = hud & (H >= 104) & (H <= 132) & (S >= 40) & (V >= 90) & ((S >= 55) | (V < 150))      # (the lit faces and the shaded ones)
occl = cv2.dilate((hud & (((H <= 8) | (H >= 172)) & (S > 120) & (V > 150) | ((H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232)))).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
rock = cv2.morphologyEx(rock.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
L = json.load(open('art/autumn_glade/layout.json'))


def project(P):                      # P: n x 3 (plan x, plan y relative, z) -> pixels
    v = (R @ (np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100).T).T - (R @ C)[None, :] * 0
    v = (R @ ((np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100 - C).T)).T
    x, y = F * v[:, 0] / v[:, 2] + 960, F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * Z, 540 + (y - 540) * Z]


def surface(cx, cy, w, d, ht, e1, e2, n=28):
    u = np.linspace(0, math.pi / 2, n // 2)[:, None]; v = np.linspace(0, 2 * math.pi, n)[None, :]
    sg = np.sign
    fx, fy = sg(np.cos(v)) * np.abs(np.cos(v)) ** e2, sg(np.sin(v)) * np.abs(np.sin(v)) ** e2
    k = np.abs(np.cos(u)) ** e1
    X, Y, Zz = cx + w * fx * k, cy + d * fy * k, ht * np.abs(np.sin(u)) ** e1 + 0 * v
    return np.c_[X.ravel(), Y.ravel(), Zz.ravel()]


def score(p, region):
    cx, cy, w, d, ht, e1, e2 = p
    pts = project(surface(cx, cy, w, d, ht, e1, e2)).astype(np.float32)
    m = np.zeros(rock.shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(pts).astype(np.int32), 1)
    m = m.astype(bool) & region; r = rock & region
    un = (m | r) & ~occl
    return -((m & r & ~occl).sum() / max(un.sum(), 1))


items = sorted(L['rock'], key=lambda r: r['plan'][0])
NB = 2          # blocks per rock: the frame's rocks are a big block with a smaller one stepped in front of it


def score_blocks(p, region, e1, e2):
    m = np.zeros(rock.shape, np.uint8)
    for i in range(NB):
        cx, cy, w, d, ht = p[5 * i:5 * i + 5]
        pts = project(surface(cx, cy, w, d, ht, e1, e2)).astype(np.float32)
        cv2.fillConvexPoly(m, cv2.convexHull(pts).astype(np.int32), 1)
    m = m.astype(bool) & region; r = rock & region
    return -((m & r & ~occl).sum() / max(((m | r) & ~occl).sum(), 1))


out = []
for it in items:
    x, y = it['px']; region = np.zeros(rock.shape, bool); region[max(y - 190, 0):y + 190, max(x - 170, 0):x + 170] = True
    cx0, cy0 = it['plan']
    b = []
    for i in range(NB): b += [(cx0 - 3.5, cx0 + 3.5), (cy0 - 4, cy0 + 4), (0.8, 3.5), (0.8, 4.0), (1.0, 5.5)]
    f_ = lambda p: score_blocks(p[:-2], region, p[-2], p[-1])
    res = differential_evolution(f_, b + [(0.2, 0.4), (0.2, 0.4)], seed=5, maxiter=120, popsize=16, tol=1e-5, polish=False)
    x_ = [float(v) for v in res.x]
    blocks = [dict(cx=round(x_[5 * i], 2), cy=round(x_[5 * i + 1], 2), w=round(x_[5 * i + 2], 2), d=round(x_[5 * i + 3], 2), h=round(x_[5 * i + 4], 2)) for i in range(NB)]
    out.append(dict(side='W' if cx0 < 0 else 'E', e1=round(x_[-2], 2), e2=round(x_[-1], 2), blocks=blocks, iou=round(-res.fun, 3)))
    print(out[-1])
json.dump(out, open('art/autumn_glade/rocks.json', 'w'), indent=1)
