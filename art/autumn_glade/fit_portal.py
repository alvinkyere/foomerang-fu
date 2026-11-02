"""Fits the portals' N (2026-11-01) to the frame's cyan (ff physics hq 2.mp4 626.0 s). A portal is a sheet standing on its foot (props.py
'portals'), face to the camera: a thick stroke from x = -W * t0 to W * t1, a line from its top (W * d0) down to the bottom (W * d1), a line
back up to W * r1; widths wd and wr (plan units); the whole shifted by dx towards the field. The strokes are projected through the camera
rig and rastered; the score is the overlap with the frame's cyan in a box round each portal. One shape for both (mirrored), its own
shift each. Writes portal.json.

  python art/autumn_glade/fit_portal.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/autumn_glade')
from measure import ref, Yc

f = cv2.imread('art/autumn_glade/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
cyan = (h[..., 0] >= 80) & (h[..., 0] <= 102) & (h[..., 1] > 90) & (h[..., 2] > 180)
L = json.load(open('art/autumn_glade/layout.json'))
P = L['portals']


def polys(p, prm, dx):
    t0, t1, d0, d1, r1, wd, wr = prm
    W, H_ = p['halfWidth'], p['height']; mir = 1 if p['side'] == 'W' else -1
    x0, y0 = p['foot'][0] + mir * dx, p['foot'][1]
    out = [[(-W * t0, 0.05), (W * t1, 0.05), (W * t1 + 0.08 * W, H_ * 0.95), (-W * t0 + 0.07 * W, H_ * 0.97)]]
    for (ax, az), (bx, bz), wdt in (((W * d0, H_ * 0.95), (W * d1, 0.08), wd), ((W * d1, 0.08), (W * r1, H_ * 0.92), wr)):
        n = math.hypot(bx - ax, bz - az); nx, nz = -(bz - az) / n * wdt, (bx - ax) / n * wdt
        out.append([(ax - nx, az - nz), (ax + nx, az + nz), (bx + nx, bz + nz), (bx - nx, bz - nz)])
    return [np.int32([ref(x0 + mir * px, Yc + y0, pz) for px, pz in poly]) for poly in out]


def boxes():
    out = []
    for p in P:
        x, y, w, h_ = p['px']; out.append((max(y - 30, 0), y + h_ + 30, max(x - 40, 0), x + w + 40))
    return out
BOX = boxes()


def score(v):
    prm, dxs = v[:7], v[7:]
    tot = 0.0
    for p, dx, (y0, y1, x0, x1) in zip(P, dxs, BOX):
        m = np.zeros(cyan.shape, np.uint8)
        for poly in polys(p, prm, dx): cv2.fillPoly(m, [poly], 1)
        a, b = m[y0:y1, x0:x1] > 0, cyan[y0:y1, x0:x1]
        tot += (a & b).sum() / max((a | b).sum(), 1)
    return -tot / len(P)


b = [(0.6, 1.1), (-0.4, 0.4), (-0.4, 0.5), (0.2, 0.9), (0.6, 1.1), (0.05, 0.3), (0.05, 0.25)] + [(-0.5, 1.2)] * len(P)
res = differential_evolution(score, b, seed=7, maxiter=150, popsize=16, tol=1e-6, polish=False)
v = [round(float(x), 3) for x in res.x]
out = dict(t0=v[0], t1=v[1], d0=v[2], d1=v[3], r1=v[4], wd=v[5], wr=v[6], dx={p['side']: v[7 + i] for i, p in enumerate(P)}, iou=round(-res.fun, 3))
json.dump(out, open('art/autumn_glade/portal.json', 'w'))
print(out)
