"""The temple court's flagstones (2026-11-07): the paving's faint joints, read off the round's mosaic laid flat (shadow_mass.py's view,
10 px a unit) by a high-pass (the image less its 4 px blur): the rows' joints are where the mean across a row dips; within each row,
the stones' ends are where the mean down that row dips. Where nothing is seen (under planters, players' paths) a row keeps its
neighbours' rhythm. Writes joints.json: segments in plan units ([x0, y0, x1, y1]).

  python art/temple_court/joints.py      (after shadow_mass.py; the Python of art/audio/output/venv)
"""
import json
import numpy as np, cv2
from scipy.signal import find_peaks

PX, X0, Y1 = 10.0, -45.0, 30.0
f = cv2.imread('art/temple_court/output/flat.png').astype(np.float32); g = f.mean(2)
hp = g - cv2.GaussianBlur(g, (0, 0), 4)
FL = json.load(open('art/temple_court/floor.json'))
pav = np.zeros(g.shape, np.uint8)
for p in FL['bands'][-1]['polys']: cv2.fillPoly(pav, [np.int32([[(x - X0) * PX, (Y1 - y) * PX] for x, y in p])], 1)
inside = pav > 0
pav = cv2.erode(pav, np.ones((9, 9), np.uint8)) > 0
pav &= cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2Lab)[..., 0] > 238
X = lambda u: round(X0 + u / PX, 2); Y = lambda v: round(Y1 - v / PX, 2)
segs = []
# the rows: mean across each pixel row (where paving is seen), minima at least 3 units apart
cnt = pav.sum(1); prof = np.where(cnt > 20, (hp * pav).sum(1) / np.maximum(cnt, 1), 0)
rows, _ = find_peaks(-prof, distance=int(3.0 * PX), prominence=0.4)
rows = [r for r in rows if cnt[r] > 20]
for r in rows:
    xs = np.nonzero(inside[r])[0]
    if len(xs): segs.append([X(xs.min()), Y(r), X(xs.max()), Y(r)])
edges = [int(np.nonzero(inside.any(1))[0].min())] + list(rows) + [int(np.nonzero(inside.any(1))[0].max())]
for a, b in zip(edges, edges[1:]):
    if b - a < 15: continue
    band = pav[a + 3:b - 2]; c = band.sum(0); pr = np.where(c > 0.3 * (b - a), (hp[a + 3:b - 2] * band).sum(0) / np.maximum(c, 1), 0)
    cols, _ = find_peaks(-pr, distance=int(2.5 * PX), prominence=0.5)
    for u in cols:
        if c[u] > 0.3 * (b - a): segs.append([X(u), Y(a), X(u), Y(b)])
json.dump(segs, open('art/temple_court/joints.json', 'w'))
print(len(rows), 'rows,', len(segs), 'joints')
vis = np.clip(128 + hp * 20, 0, 255).astype(np.uint8); vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
for x0, y0, x1, y1 in segs: cv2.line(vis, (int((x0 - X0) * PX), int((Y1 - y0) * PX)), (int((x1 - X0) * PX), int((Y1 - y1) * PX)), (0, 0, 255), 1)
cv2.imwrite('art/temple_court/output/joints_overlay.png', vis[100:520, 100:620])
