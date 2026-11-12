"""The warm-up's moat (2026-11-12): the round's mosaic in Chrome's colours (output/mosaic_chrome.png), its water and the lavender walls
seen on its far banks: one ring. Its outer and inner outlines are the grass's edge (the land's top, z 0), unprojected through the
camera and simplified to 0.12 units (the HQ's banks are straight runs at 45 degrees in the plan with soft corners). Writes moat.json: outer, inner (plan units).

  python art/warm_up/moat.py      (after mosaic.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up')
from measure import plan, MOSAIC_ORIGIN

c = cv2.imread('art/warm_up/output/mosaic_chrome.png'); h = cv2.cvtColor(c, cv2.COLOR_BGR2HSV).astype(int)
water = (h[..., 0] >= 96) & (h[..., 0] <= 112) & (h[..., 1] >= 90)
lav = (h[..., 0] >= 112) & (h[..., 0] <= 135) & (h[..., 1] >= 40) & (h[..., 2] >= 120)
# (the walls' faces only where they meet the water: the pens' walls left in the mosaic from the round's first frames are not the moat)
ring = water | (lav & (cv2.dilate(water.astype(np.uint8), np.ones((31, 31), np.uint8)) > 0))
ring = cv2.morphologyEx(ring.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
ring = cv2.morphologyEx(ring, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
n, lab, st, _ = cv2.connectedComponentsWithStats(ring); ring = (lab == 1 + int(np.argmax(st[1:, 4]))).astype(np.uint8)
cs, hier = cv2.findContours(ring, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
outer = max((k for k in range(len(cs)) if hier[0][k][3] < 0), key=lambda k: cv2.contourArea(cs[k]))
inner = max((k for k in range(len(cs)) if hier[0][k][3] == outer), key=lambda k: cv2.contourArea(cs[k]))
OX, OY = MOSAIC_ORIGIN
R2 = 2 ** 0.5
rot = lambda p: ((p[0] + p[1]) / R2, (p[1] - p[0]) / R2)            # (plan -> the moat's own axes: u north-east, v north-west)
unrot = lambda q: ((q[0] - q[1]) / R2, (q[0] + q[1]) / R2)


def rectilinear(pts, step=0.6):
    """The outline in the moat's axes as straight runs along u or v: each run's level the median of its points (the frame's edge is
    a pixel staircase with soft corners); runs shorter than `step` merged into their neighbours."""
    P = np.array([rot(p) for p in pts]); n = len(P)
    d = np.roll(P, -1, 0) - P; horiz = np.abs(d[:, 0]) >= np.abs(d[:, 1])
    runs = []                                                    # (axis, [point indices])
    for i in range(n):
        if runs and runs[-1][0] == horiz[i]: runs[-1][1].append(i)
        else: runs.append([horiz[i], [i]])
    if len(runs) > 1 and runs[0][0] == runs[-1][0]: runs[0][1][:0] = runs.pop()[1]
    def length(r): idx = r[1] + [(r[1][-1] + 1) % n]; Q = P[idx]; return np.abs(np.diff(Q[:, 0 if r[0] else 1])).sum()
    changed = True
    while changed and len(runs) > 4:
        changed = False
        for k, r in enumerate(runs):
            if length(r) < step:
                nb = runs[k - 1]; nb[1].extend(r[1]); runs.pop(k); changed = True; break
        merged = []
        for r in runs:
            if merged and merged[-1][0] == r[0]: merged[-1][1].extend(r[1])
            else: merged.append(r)
        if len(merged) > 1 and merged[0][0] == merged[-1][0]: merged[0][1][:0] = merged.pop()[1]
        runs = merged
    lv = [float(np.median(P[r[1], 1 if r[0] else 0])) for r in runs]       # (a u-run sits at a level of v, and the other way)
    corners = []
    for k, r in enumerate(runs):
        nxt = (k + 1) % len(runs)
        u = lv[nxt] if r[0] else lv[k]; v = lv[k] if r[0] else lv[nxt]
        corners.append(unrot((u, v)))
    return corners


out = {}
for name, k in (('outer', outer), ('inner', inner)):
    p = plan([(x + OX, y + OY) for x, y in cs[k][:, 0, :]])
    s = cv2.approxPolyDP(np.float32(p).reshape(-1, 1, 2), 0.12, True)[:, 0, :]      # (its measured outline: the HQ's corners are soft)
    out[name] = [[round(float(x), 2), round(float(y), 2)] for x, y in s]
    print(name, len(cs[k]), 'px ->', len(s), 'corners')
json.dump(out, open('art/warm_up/moat.json', 'w'))
v = c.copy()
for k in (outer, inner): cv2.drawContours(v, cs, k, (0, 0, 255), 2)
cv2.imwrite('art/warm_up/output/moat_overlay.jpg', cv2.resize(v, (1080, 620)))
