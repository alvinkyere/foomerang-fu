"""The hex meadow's plants (2026-11-06): flat-topped hexagonal pads on a lattice, on stems ~2.9 units tall (stem lengths read at the
fields' edges in output/reference_fill.png, ff physics hq 2.mp4 1202.0 s). Fits the lattice in plan units at height H: the hexagon's
circumradius s, a turn theta, an offset (ox, oy); for each trial the pads' edges are projected through the camera rig and the score is
how dark the frame is along them against the pads' middles (the pads meet in thin darker lines). Writes lattice.json.

  python art/hex_meadow/fit_lattice.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/hex_meadow')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z

H = 2.9
f = cv2.imread('art/hex_meadow/output/reference_fill.png'); g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
g = cv2.GaussianBlur(g, (0, 0), 0.8)
hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
pad = (hsv[..., 0] >= 62) & (hsv[..., 0] <= 90) & (hsv[..., 1] >= 70) & (hsv[..., 2] >= 150)
pad = cv2.erode(pad.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0          # (well inside a field: every edge there is a pad's)


def project(P):
    v = (_R @ ((np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100 - _C).T)).T
    x, y = _F * v[:, 0] / v[:, 2] + 960, _F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * _Z, 540 + (y - 540) * _Z]


def cells(s, th, ox, oy, span=40):
    """Flat-topped hexagons: centres at (1.5 s i, sqrt3 s (j + i / 2)), turned by th, moved by (ox, oy)."""
    i, j = np.meshgrid(np.arange(-span, span + 1), np.arange(-span, span + 1))
    x = 1.5 * s * i; y = math.sqrt(3) * s * (j + i / 2.0)
    c, sn = math.cos(th), math.sin(th)
    return np.c_[(c * x - sn * y).ravel() + ox, (sn * x + c * y).ravel() + oy]


def score(v):
    s, th, ox, oy = v
    C = cells(s, th, ox, oy)
    C = C[(np.abs(C[:, 0]) < 30) & (np.abs(C[:, 1]) < 24)]
    # samples: along each hexagon's 6 edges (at its corners' midpoints and quarter points) and at its middle
    ang = np.radians(np.arange(6) * 60 + math.degrees(th))
    corners = np.stack([np.cos(ang), np.sin(ang)], 1) * s
    edge_pts = []
    for k in range(6):
        a, b = corners[k], corners[(k + 1) % 6]
        for u in (0.25, 0.5, 0.75): edge_pts.append(a + (b - a) * u)
    edge_pts = np.array(edge_pts)
    E = (C[:, None, :] + edge_pts[None, :, :]).reshape(-1, 2); M = C
    pe = project(np.c_[E, np.full(len(E), H)]); pm = project(np.c_[M, np.full(len(M), H)])
    def sample(p):
        x = np.clip(p[:, 0].astype(int), 0, 1919); y = np.clip(p[:, 1].astype(int), 0, 1079)
        return g[y, x], pad[y, x]
    ve, ie = sample(pe); vm, im = sample(pm)
    ie = ie.reshape(len(C), -1).all(1); im = im & ie                      # (cells wholly inside a field)
    if im.sum() < 40: return 0.0
    ve = ve.reshape(len(C), -1)[im].mean(); vm = vm[im].mean()
    return -(vm - ve)                                                     # (the edges darker than the middles: the more, the better)


res = differential_evolution(score, [(0.45, 1.0), (math.radians(-12), math.radians(12)), (0, 2.0), (0, 2.0)], seed=3, maxiter=80, popsize=24, tol=1e-6, polish=True)
s, th, ox, oy = [float(x) for x in res.x]
json.dump(dict(H=H, s=round(s, 4), theta_deg=round(math.degrees(th), 3), ox=round(ox, 4), oy=round(oy, 4), contrast=round(-res.fun, 2)), open('art/hex_meadow/lattice.json', 'w'))
print('s %.3f units (a pad %.2f across corners), theta %.2f deg, offset (%.3f, %.3f), edge contrast %.1f grey levels' % (s, 2 * s, math.degrees(th), ox, oy, -res.fun))
