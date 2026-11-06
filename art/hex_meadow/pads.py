"""The hex meadow's pads, cell by cell (2026-11-06): each cell of the fitted lattice (lattice.json) projected through the camera at the pads'
height; a pad is there when most of a small disc at its middle is pad-green in the frame (output/reference_fill.png, beams of light
none here); its shade (light, mid, dark: how high it stands over its neighbours, the frame's lighter pads overlapping darker ones) from
its middle's lightness; a flower where a small pale dot sits at its middle. Cells hidden (the players, their power badges, the HUD,
the rocks, the trees) take their neighbours' majority. Writes pads.json: [{i, j, x, y, shade, flower}] in plan units.

  python art/hex_meadow/pads.py       (after fit_lattice.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/hex_meadow')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z

Lt = json.load(open('art/hex_meadow/lattice.json')); s, th, ox, oy, H = Lt['s'], math.radians(Lt['theta_deg']), Lt['ox'], Lt['oy'], Lt['H']
f = cv2.imread('art/hex_meadow/output/reference_fill.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
Hh, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
pad = (Hh >= 62) & (Hh <= 90) & (S >= 60) & (V >= 140)
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)[..., 0].astype(float)
# hidden: what is neither pad, ground nor shadow and not the pads' outline (players, badges, the HUD, rocks, trees, bamboo)
ground = (Hh >= 28) & (Hh <= 50) & (S >= 60) & (V >= 150)
hidden = ~(pad | ground)
hidden = cv2.dilate(hidden.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
hidden[95:375, :215] = True


def project(P):
    v = (_R @ ((np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100 - _C).T)).T
    x, y = _F * v[:, 0] / v[:, 2] + 960, _F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * _Z, 540 + (y - 540) * _Z]


span = 60
I, J = np.meshgrid(np.arange(-span, span + 1), np.arange(-span, span + 1)); I, J = I.ravel(), J.ravel()
X = 1.5 * s * I; Y = math.sqrt(3) * s * (J + I / 2.0)
X, Y = math.cos(th) * X - math.sin(th) * Y + ox, math.sin(th) * X + math.cos(th) * Y + oy
P = project(np.c_[X, Y, np.full(len(X), H)])
onscreen = (P[:, 0] > 6) & (P[:, 0] < 1913) & (P[:, 1] > 6) & (P[:, 1] < 1073)
state = {}           # (i, j) -> 1 pad, 0 none, None hidden
info = {}
# a small disc at each cell's middle (0.45 s round: inside the pad, clear of its outline)
for k in np.nonzero(onscreen)[0]:
    cx, cy = P[k]
    rpx = 0.45 * s * (project(np.array([[X[k] + 1, Y[k], H]]))[0, 0] - cx)
    r = max(2, int(rpx)); y0, y1, x0, x1 = int(cy) - r, int(cy) + r + 1, int(cx) - r, int(cx) + r + 1
    if y0 < 0 or x0 < 0 or y1 > 1080 or x1 > 1920: continue
    pm, hm = pad[y0:y1, x0:x1], hidden[y0:y1, x0:x1]
    key = (int(I[k]), int(J[k]))
    if hm.mean() > 0.4: state[key] = None; continue
    state[key] = 1 if pm.mean() > 0.55 else 0
    if state[key]:
        L = float(np.median(lab[y0:y1, x0:x1][pm]))
        dot = ((S[y0:y1, x0:x1] < 60) & (V[y0:y1, x0:x1] > 215)).sum()
        info[key] = dict(L=L, flower=bool(dot >= 3))
# hidden cells: their known neighbours' majority (repeated, so a hidden patch fills from its edge)
nb = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]
for _ in range(12):
    changed = False
    for key, v in list(state.items()):
        if v is not None: continue
        vals = [state.get((key[0] + a, key[1] + b)) for a, b in nb]; vals = [q for q in vals if q is not None]
        if len(vals) >= 3: state[key] = int(sum(vals) * 2 >= len(vals)); changed = True
    if not changed: break
Ls = np.array([d['L'] for d in info.values()]); lo, hi = np.percentile(Ls, 33), np.percentile(Ls, 66)
pads = []
for key, v in state.items():
    if v != 1: continue
    i, j = key; x = 1.5 * s * i; y = math.sqrt(3) * s * (j + i / 2.0)
    d = info.get(key)
    shade = 1 if d is None else (0 if d['L'] < lo else 2 if d['L'] > hi else 1)
    pads.append(dict(i=i, j=j, x=round(math.cos(th) * x - math.sin(th) * y + ox, 3), y=round(math.sin(th) * x + math.cos(th) * y + oy, 3), shade=shade,
                     flower=bool(d and d['flower'])))
json.dump(pads, open('art/hex_meadow/pads.json', 'w'))
print(len(pads), 'pads;', sum(p['flower'] for p in pads), 'with a flower;', 'shades', [sum(p['shade'] == k for p in pads) for k in range(3)],
      '; hidden cells filled', sum(1 for k, v in state.items() if k not in info and v == 1))
# an overlay to check
ov = f.copy()
for p in pads:
    q = project(np.array([[p['x'], p['y'], H]]))[0]; cv2.circle(ov, (int(q[0]), int(q[1])), 4, ((0, 0, 255), (0, 200, 255), (255, 255, 0))[p['shade']], -1)
cv2.imwrite('art/hex_meadow/output/pads_overlay.jpg', cv2.resize(ov, (1280, 720)))
