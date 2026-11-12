"""The warm-up's four hex fields (2026-11-12) as the game's own plants (the meadow's: pushed aside, springing back, burning): each
field's hexagonal lattice fitted to the round's mosaic (Chrome's colours) as art/hex_meadow/bridge_bushes.py fits the bridge's (the
pads' edges darker than their middles), its pads read cell by cell, its flowers (pale dots), the stems' height fitted with it.
Writes hexfields.json (the manifest's `plants`, scene ground units: x, z = -(Yc + y)).

  python art/warm_up/hexfields.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/warm_up')
from measure import plan, Yc, R as _R, F as _F, C as _C, Z as _Z, MOSAIC_ORIGIN

OX, OY = MOSAIC_ORIGIN


def project(P):
    v = (_R @ (np.asarray(P, float) / 100 - _C).T).T
    x, y = _F * v[:, 0] / v[:, 2] + 960, _F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * _Z - OX, 540 + (y - 540) * _Z - OY]          # (mosaic pixels)


f = cv2.imread('art/warm_up/output/mosaic_chrome.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
g = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 0.8)
pad = (hsv[..., 0] >= 66) & (hsv[..., 0] <= 92) & (hsv[..., 1] >= 50) & (hsv[..., 2] >= 130)
FIELDS = {'nw': (740, 300, 885, 430), 'ne': (1510, 320, 1680, 445), 'w': (455, 740, 585, 890), 'sw': (695, 935, 860, 1125)}


def cells(s, t, ox, oy, span=7):
    i, j = np.meshgrid(np.arange(-span, span + 1), np.arange(-span, span + 1))
    x = 1.5 * s * i; y = math.sqrt(3) * s * (j + i / 2.0); c, sn = math.cos(t), math.sin(t)
    return np.c_[(c * x - sn * y).ravel() + ox, (sn * x + c * y).ravel() + oy]


groups = []
# the four fields are one design: their pads' size and stems' height fitted together, each its own turn and place
info = {}
for name, (x0, y0, x1, y1) in FIELDS.items():
    win = np.zeros(pad.shape, bool); win[y0:y1, x0:x1] = True
    inner = cv2.erode((pad & win).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    ys, xs = np.nonzero(pad & win)
    info[name] = (inner, plan([(xs.mean() + OX, ys.mean() + OY)])[0])


def contrast(s, t, ox, oy, H, inner, ax, ay):
    Cc = cells(s, t, ax + ox, ay + oy)
    ang = np.arange(6) * math.pi / 3 + t; cr = np.stack([np.cos(ang), np.sin(ang)], 1) * s
    E = np.concatenate([Cc + (cr[q] + (cr[(q + 1) % 6] - cr[q]) * u) for q in range(6) for u in (0.3, 0.5, 0.7)])
    pe = project(np.c_[E[:, 0], Yc + E[:, 1], np.full(len(E), H)]); pm = project(np.c_[Cc[:, 0], Yc + Cc[:, 1], np.full(len(Cc), H)])
    def sample(p):
        x = np.clip(p[:, 0].astype(int), 0, f.shape[1] - 1); y = np.clip(p[:, 1].astype(int), 0, f.shape[0] - 1); return g[y, x], inner[y, x]
    ve, ie = sample(pe); vm, im = sample(pm)
    ie = ie.reshape(18, -1).all(0); im = im & ie
    if im.sum() < 5: return 0.0
    return -(vm[im].mean() - ve.reshape(18, -1)[:, im].mean())


names = list(FIELDS)
S_ = 0.517      # (the fields' pads one size: the median of each field fitted alone, 0.46-0.68)
for k, name in enumerate(names):
    (x0, y0, x1, y1) = FIELDS[name]; inner, (ax, ay) = info[name]
    r_ = differential_evolution(lambda v: contrast(S_, v[0], v[1], v[2], v[3], inner, ax, ay),
                                [(-math.pi / 6, math.pi / 6), (-1.5, 1.5), (-1.5, 3.5), (2.2, 3.4)], seed=3, maxiter=100, popsize=24, tol=1e-7, polish=True)
    t, ox, oy, H = [float(v) for v in r_.x]; s = S_
    class _R_: fun = contrast(s, t, ox, oy, H, inner, ax, ay)
    res_ = _R_
    Cc = cells(s, t, ax + ox, ay + oy)
    P = project(np.c_[Cc[:, 0], Yc + Cc[:, 1], np.full(len(Cc), H)])
    ppu = project(np.array([[ax + 1, Yc + ay, H]]))[0, 0] - project(np.array([[ax, Yc + ay, H]]))[0, 0]
    pads = []
    for (x, y), (px, py) in zip(Cc, P):
        if not (x0 <= px < x1 and y0 <= py < y1): continue
        r = max(2, int(0.45 * s * ppu)); ya, yb, xa, xb = int(py) - r, int(py) + r + 1, int(px) - r, int(px) + r + 1
        if pad[ya:yb, xa:xb].mean() < 0.5: continue
        Lm = float(np.median(cv2.cvtColor(f[ya:yb, xa:xb], cv2.COLOR_BGR2LAB)[..., 0]))
        dot = ((hsv[ya:yb, xa:xb, 1] < 70) & (hsv[ya:yb, xa:xb, 2] > 200)).sum() >= 3
        pads.append((x, y, Lm, bool(dot), (int(px), int(py))))
    near = lambda p: sum(1 for q in pads if 0 < math.hypot(p[0] - q[0], p[1] - q[1]) < math.sqrt(3) * s * 1.15)
    for _ in range(2): pads = [p for p in pads if near(p) >= 2]
    Ls = np.array([p[2] for p in pads]); lo, hi = np.percentile(Ls, 33), np.percentile(Ls, 66)
    tones = [[], [], []]; rows = []
    for x, y, Lm, dot, (px, py) in pads:
        q = 0 if Lm < lo else 2 if Lm > hi else 1
        rows.append([round(x, 3), round(-(Yc + y), 3), q, dot]); tones[q].append(f[py - 2:py + 3, px - 2:px + 3].reshape(-1, 3))
    shade = ['#%02x%02x%02x' % tuple(int(v) for v in np.median(np.concatenate(tq), 0)[::-1]) for tq in tones]
    groups.append(dict(s=round(s, 3), height=round(H, 3), turn=round(-t % (math.pi / 3), 4), shade=shade, pads=rows))
    print(name, len(rows), 'pads,', sum(r[3] for r in rows), 'flowers; s %.3f turn %.1f deg, stems %.2f, contrast %.1f' % (s, math.degrees(t), H, -res_.fun), shade)
json.dump(groups, open('art/warm_up/hexfields.json', 'w'))
