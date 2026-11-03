"""The glade's light shafts as the renderer's light beams (render/three/beams.ts, the manifest's `beams` with a `grid`), fitted to the
frame (ff physics hq 2.mp4 626.0 s). They ADD light over everything (a canopy in one goes #c8645d -> #e17a5f: +25 red, +22 green, +2
blue), so `add` is [25/22, 1, 2/22] per level of green. The strength is a grid over (t, y): t in frame pixels along the bands' normal
from the frame's centre, y the screen row; each cell holds the median green lift of the plain sand in it over the plain sand's own green
(low in the frame, where no shaft falls), never negative; cells with no sand take their column's neighbours. The angle is searched for
the one whose bands explain the lift best. Writes beams.json.

  python art/autumn_glade/fit_beams.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

f = cv2.imread('art/autumn_glade/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
sand = (H >= 15) & (H <= 34) & (S >= 30) & (S <= 150) & (V >= 200); sand[95:375, :215] = False
sand = cv2.erode(sand.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
G = cv2.GaussianBlur(f[..., 1].astype(float), (0, 0), 1.5)
base = np.median(G[800:][sand[800:]])
lift = G - base
ys, xs = np.nonzero(sand); L_ = lift[ys, xs]
DT, DY = 6.0, 60.0


def grid_for(angle):
    a = math.radians(angle); t = (xs - 960) * math.sin(a) + (ys - 540) * -math.cos(a)
    t0 = math.floor(t.min() / DT) * DT; cols = int(math.ceil((t.max() - t0) / DT)) + 1; rows = int(1080 / DY) + 1
    c = np.clip(np.round((t - t0) / DT).astype(int), 0, cols - 1); r = np.clip(np.round(ys / DY).astype(int), 0, rows - 1)
    g = np.full((rows, cols), np.nan)
    key = r * cols + c; order = np.argsort(key); ks, idx = np.unique(key[order], return_index=True)
    for k, lo, hi in zip(ks, idx, list(idx[1:]) + [len(order)]):
        if hi - lo >= 20: g[k // cols, k % cols] = max(0.0, float(np.median(L_[order[lo:hi]])))
    for cc in range(cols):                                     # (no sand in a cell: its column's nearest rows)
        col = g[:, cc]; ok = ~np.isnan(col)
        g[:, cc] = np.interp(np.arange(rows), np.nonzero(ok)[0], col[ok]) if ok.any() else 0.0
    pred = g[r, c]
    return 1 - ((L_ - pred) ** 2).mean() / ((L_ - L_.mean()) ** 2).mean(), g, t0, cols, rows


best = max((grid_for(a) + (a,) for a in range(60, 181, 3)), key=lambda q: q[0])
for a in np.arange(best[5] - 2.5, best[5] + 2.6, 0.5):
    q = grid_for(a) + (float(a),)
    if q[0] > best[0]: best = q
r2, g, t0, cols, rows, angle = best
g = np.clip(g - 2.0, 0, None)                                   # (2 levels: the sand's own unevenness, not light)
g[rows - 4:] = 0.0                                              # (no shafts in the bottom quarter: the plain sand the base was read on)
out = dict(angle=round(float(angle), 1), fade=[0.0, 1.0], add=[round(25 / 22, 3), 1.0, round(2 / 22, 3)], stops=[[-1.0, 0.0], [1.0, 0.0]],
           grid=dict(t0=float(t0), dt=DT, y0=0.0, dy=DY, cols=int(cols), rows=int(rows), values=[round(float(v), 1) for v in g.ravel()]))
json.dump(out, open('art/autumn_glade/beams.json', 'w'))
print('angle', angle, 'explains %.0f%% of the sand\'s lift' % (100 * r2), 'grid', rows, 'x', cols, 'peak', round(float(g.max()), 1))
