"""The light beams as a grid of profiles down the screen (beams.json `grid`, render/three/beams.ts): the HQ's bands brighten and fade along their
length, which one profile with one fade cannot follow. Per screen row band (60 px, overlapping), the light along the beams' direction that makes
the game's pixels the HQ's (the shot's own beams taken out: the shot was made with the beams.json it is given), in 6 px bins, median.

  <bi_loop.sh> name; python art/bridge_islands/fit_beams_grid.py art/bridge_islands/output/<name>.png
"""
import json, math, sys
import numpy as np, cv2

b = json.load(open('art/bridge_islands/beams.json'))
h = cv2.imread('art/bridge_islands/output/reference.png').astype(np.float32)[..., ::-1]
g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)).astype(np.float32)[..., ::-1]
Y, X = np.mgrid[0:1080, 0:1920].astype(np.float32)
ab = np.array(b['above'], float); beyond = Y <= np.interp(X, ab[:, 0], ab[:, 1])
ADD = np.array(b['add'], np.float32)
a = math.radians(b['angle']); t = (X - 960) * math.sin(a) + (Y - 540) * -math.cos(a)


def field(bb):
    if 'grid' in bb:
        G = bb['grid']; V = np.array(G['values'], float).reshape(G['rows'], G['cols'])
        c = (t - G['t0']) / G['dt']; r = np.clip((Y - G['y0']) / G['dy'], 0, G['rows'] - 1)
        c0 = np.clip(np.floor(c).astype(int), 0, G['cols'] - 2); r0 = np.clip(np.floor(r).astype(int), 0, max(G['rows'] - 2, 0)); r1 = np.minimum(r0 + 1, G['rows'] - 1)
        fc, fr = c - c0, r - r0
        v = (V[r0, c0] * (1 - fc) + V[r0, c0 + 1] * fc) * (1 - fr) + (V[r1, c0] * (1 - fc) + V[r1, c0 + 1] * fc) * fr
        return np.where((c >= 0) & (c <= G['cols'] - 1), v, 0) * beyond
    st = np.array(bb['stops'], float); s = np.interp(t, st[:, 0], st[:, 1], left=0, right=0)
    u = np.clip((Y / 1080 - bb['fade'][0]) / (bb['fade'][1] - bb['fade'][0]), 0, 1)
    return s * (1 - u * u * (3 - 2 * u)) * beyond


base = g - field(b)[..., None] * ADD
roi = beyond & (Y < 760) & (X > 950)
light = ((h - base) @ ADD) / float(ADD @ ADD)
RH, DT = 60, 6.0
tr = t[roi]; T0, T1 = float(np.floor(tr.min() / DT) * DT), float(np.ceil(tr.max() / DT) * DT)
cols = int((T1 - T0) / DT) + 1; rows_y = np.arange(0, 760, RH)
V = np.zeros((len(rows_y), cols))
for i, yc in enumerate(rows_y):
    sel = roi & (Y >= yc - RH) & (Y < yc + RH)
    ci = np.round((t[sel] - T0) / DT).astype(int); w = light[sel]
    o = np.argsort(ci); si, sw = ci[o], w[o]; cuts = np.searchsorted(si, np.arange(cols + 1))
    for k in range(cols):
        seg = sw[cuts[k]:cuts[k + 1]]
        if len(seg) > 15: V[i, k] = max(float(np.median(seg)), 0.0)
V = np.clip(V, 0, 120)
was = (np.abs(g - h).max(2) > 12)[roi].mean()
nb = dict(b); nb['grid'] = dict(t0=T0, dt=DT, y0=float(rows_y[0]), dy=float(RH), cols=cols, rows=len(rows_y), values=[round(float(v), 1) for v in V.ravel()])
pred = base + field(nb)[..., None] * ADD
print('beyond the wall: %.1f%% differing as shot, %.1f%% with the grid (%d x %d)' % (100 * was, 100 * (np.abs(np.clip(pred, 0, 255) - h).max(2) > 12)[roi].mean(), len(rows_y), cols))
json.dump(nb, open('art/bridge_islands/beams.json', 'w'))
