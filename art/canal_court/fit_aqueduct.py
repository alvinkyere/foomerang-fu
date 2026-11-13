"""The aqueduct fitted to the frame (2026-11-12): the tower an octagonal prism, the channel a chain of boxes along a centreline, the west
stub one box, each standing on the ground; their outlines through measure.py's camera against the frame's aqueduct (its lavender and the
water on it), the parameters moved to make the overlap (IoU) largest (Nelder-Mead, piece by piece, then all together). Writes
aqueduct.json (plan units, y north) and output/aqueduct_fit.png.

  python art/canal_court/fit_aqueduct.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/canal_court')
from measure import pix

f = cv2.imread('art/canal_court/output/clean_ref.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
lav = (h[..., 0] >= 105) & (h[..., 0] <= 135) & (h[..., 1] >= 55) & (h[..., 2] >= 95)
water = (h[..., 0] >= 85) & (h[..., 0] <= 112) & (h[..., 1] >= 70) & (h[..., 2] >= 150)
REGION = np.zeros(lav.shape, np.uint8)
cv2.fillPoly(REGION, [np.int32([(380, 180), (790, 180), (800, 420), (1270, 440), (1290, 560), (1230, 650), (900, 720), (380, 640)])], 1)
want = (lav | water) & (REGION > 0)
want = cv2.morphologyEx(want.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0


def prism(poly, H):
    """The screen outline of a convex prism over a plan polygon, from the ground to H."""
    pts = [pix(x, y, z) for x, y in poly for z in (0.0, H)]
    m = np.zeros(lav.shape, np.uint8); cv2.fillPoly(m, [cv2.convexHull(np.int32(pts))], 1); return m > 0


def octagon(cx, cy, r, turn=math.pi / 8):
    return [(cx + r * math.cos(turn + k * math.pi / 4), cy + r * math.sin(turn + k * math.pi / 4)) for k in range(8)]


def box(a, b, w):
    (ax, ay), (bx, by) = a, b; d = math.hypot(bx - ax, by - ay) or 1; nx, ny = -(by - ay) / d * w / 2, (bx - ax) / d * w / 2
    ex, ey = (bx - ax) / d * w / 2, (by - ay) / d * w / 2      # (each box runs on half its width past its ends: the joints close)
    return [(ax - ex + nx, ay - ey + ny), (bx + ex + nx, by + ey + ny), (bx + ex - nx, by + ey - ny), (ax - ex - nx, ay - ey - ny)]


# parameters: tower (cx, cy, r, H), channel width, channel H, centreline points (5 of them after the tower's), stub (x0, y0, x1, y1, w, H)
P0 = dict(tower=[-9.75, 5.9, 4.0, 5.4], cw=3.5, ch=4.1,
          line=[[-9.6, -1.4], [-4.5, -5.0], [2.5, -3.6], [4.2, -1.4], [10.0, -2.6]],
          stub=[-17.0, -3.4, -10.5, -1.3, 2.0, 2.4])


def unpack(v):
    t = v[0:4]; cw, ch = v[4], v[5]; line = v[6:16].reshape(5, 2); stub = v[16:22]
    return t, cw, ch, line, stub


def shape(v):
    t, cw, ch, line, stub = unpack(v)
    m = prism(octagon(t[0], t[1], t[2]), t[3])
    pts = [(t[0], t[1])] + [tuple(p) for p in line]
    for a, b in zip(pts[:-1], pts[1:]): m |= prism(box(a, b, cw), ch)
    m |= prism(box((stub[0], stub[1]), (stub[2], stub[3]), stub[4]), stub[5])
    return m & (REGION > 0)


STUB_END = (-17.0, -3.4)      # (the stub's west end, read off the frame: the fit's region cuts it, so the fit would run it on)


def cost(v):
    v = v.copy(); v[16], v[17] = STUB_END
    s = shape(v); return 1 - (s & want).sum() / max((s | want).sum(), 1)


v0 = np.array(P0['tower'] + [P0['cw'], P0['ch']] + sum(P0['line'], []) + P0['stub'], float)
print('start IoU %.3f' % (1 - cost(v0)))
best = v0
for it in range(3):
    r = minimize(cost, best, method='Nelder-Mead', options=dict(maxiter=3000, xatol=0.01, fatol=1e-5, adaptive=True))
    best = r.x; print('pass', it, 'IoU %.3f' % (1 - r.fun))
best[16], best[17] = STUB_END
t, cw, ch, line, stub = unpack(best)
out = dict(tower=dict(cx=round(t[0], 3), cy=round(t[1], 3), r=round(t[2], 3), h=round(t[3], 3)),
           channel=dict(width=round(cw, 3), h=round(ch, 3), line=[[round(t[0], 3), round(t[1], 3)]] + [[round(a, 3), round(b, 3)] for a, b in line]),
           stub=dict(a=[round(stub[0], 3), round(stub[1], 3)], b=[round(stub[2], 3), round(stub[3], 3)], width=round(stub[4], 3), h=round(stub[5], 3)),
           iou=round(1 - cost(best), 3))
json.dump(out, open('art/canal_court/aqueduct.json', 'w'), indent=1)
s = shape(best); vis = f.copy(); vis[s & ~want] = (0, 0, 255); vis[want & ~s] = (0, 255, 0)
cv2.imwrite('art/canal_court/output/aqueduct_fit.png', vis[150:760, 350:1320])
print(json.dumps(out))
