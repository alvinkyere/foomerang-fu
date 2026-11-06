"""The hex meadow's rocks (2026-11-06): each a rounded block (a superellipsoid: half sizes w, d, height h, roundness e1 / e2) turned by a
yaw, fitted to the frame's rock mask (ff physics hq 2.mp4 1202.0 s): the surface's points projected through the camera rig, their hull
the model's outline, the score its overlap with the rock's pixels (what the pads, trees and players hide is left out). Writes rocks.json.

  python art/hex_meadow/fit_rocks.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
HUD = np.load('art/hex_meadow/output/hud_hidden.npy')      # (the players' names' letters: hud_mask.py)
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/hex_meadow')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z, plan

f = cv2.imread('art/hex_meadow/output/reference_fill.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
rock = (H >= 100) & (H <= 135) & (S >= 40) & (V >= 80); rock[HUD] = False
rock = cv2.morphologyEx(rock.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
occl = ~((H >= 28) & (H <= 50) & (S >= 60)) & (rock == 0)            # (anything that is neither ground nor rock may hide it)
n, lab, st, cen = cv2.connectedComponentsWithStats(rock)
# the four rocks (the frame's other lavender: the blue toast, a birch trunk, the players' power badges): picked by where they lie
ROCKS_PX = [(351, 16), (1200, 285), (715, 681), (1219, 678)]
comps = [i for i in range(1, n) if st[i, 4] > 1500 and min(abs(cen[i][0] - x) + abs(cen[i][1] - y) for x, y in ROCKS_PX) < 40]


def project(P):
    v = (_R @ ((np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100 - _C).T)).T
    x, y = _F * v[:, 0] / v[:, 2] + 960, _F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * _Z, 540 + (y - 540) * _Z]


def surface(cx, cy, w, d, ht, yaw, e1, e2, n_=28):
    u = np.linspace(0, math.pi / 2, n_ // 2)[:, None]; v = np.linspace(0, 2 * math.pi, n_)[None, :]
    fx, fy = np.sign(np.cos(v)) * np.abs(np.cos(v)) ** e2, np.sign(np.sin(v)) * np.abs(np.sin(v)) ** e2
    k = np.abs(np.cos(u)) ** e1
    lx, ly = w * fx * k, d * fy * k
    c, s = math.cos(yaw), math.sin(yaw)
    X, Y, Zz = cx + c * lx - s * ly, cy + s * lx + c * ly, ht * np.abs(np.sin(u)) ** e1 + 0 * v
    return np.c_[X.ravel(), Y.ravel(), Zz.ravel()]


out = []
for i in comps:
    x, y, w_, h_, a_ = st[i]; region = np.zeros(rock.shape, bool); region[max(y - 40, 0):y + h_ + 40, max(x - 40, 0):x + w_ + 40] = True
    target = (lab == i)
    c0 = plan([cen[i]])[0]
    def score(p):
        m = np.zeros(rock.shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(project(surface(*p)).astype(np.float32)).astype(np.int32), 1)
        m = (m > 0) & region
        return -((m & target).sum() / max(((m | target) & ~occl & region).sum(), 1))
    b = [(c0[0] - 3, c0[0] + 3), (c0[1] - 4, c0[1] + 3), (0.6, 4.0), (0.6, 4.0), (0.8, 4.0), (-math.pi / 2, math.pi / 2), (0.2, 0.6), (0.15, 0.6)]
    res = differential_evolution(score, b, seed=5, maxiter=100, popsize=16, tol=1e-6, polish=False)
    v = [float(q) for q in res.x]
    out.append(dict(cx=round(v[0], 3), cy=round(v[1], 3), w=round(v[2], 3), d=round(v[3], 3), h=round(v[4], 3), yaw=round(math.degrees(v[5]), 2),
                    e1=round(v[6], 3), e2=round(v[7], 3), iou=round(-res.fun, 3), px=[int(cen[i][0]), int(cen[i][1])]))
    print(out[-1])
json.dump(out, open('art/hex_meadow/rocks.json', 'w'), indent=1)
