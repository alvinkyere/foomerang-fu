"""The gong court's stone colours (2026-11-12), measured on the round's mosaic (Chrome's colours) through the fitted prisms (fit_stones.py):
  top     the tops' light lavender (the median of the top tone's pixels inside the tops' outlines)
  face    down a face from its top edge to the grass, in 8 steps (each step the median of every body's front-face pixels at that depth):
          the HQ's soft darkening towards the foot
  mint    the platforms' sunken tops
Writes stone_colours.json.

  python art/gong_court/stone_colours.py      (after fit_stones.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import pix, MOSAIC_ORIGIN
from geom import prisms

OX, OY = MOSAIC_ORIGIN
M = cv2.imread('art/gong_court/output/mosaic_chrome.png'); O = cv2.imread('art/gong_court/output/mosaic.png')
hsv = cv2.cvtColor(O, cv2.COLOR_BGR2HSV).astype(int)
STONE = (hsv[..., 0] >= 108) & (hsv[..., 0] <= 140) & (hsv[..., 1] > 40) & (hsv[..., 2] > 60)
MINT = (hsv[..., 0] >= 40) & (hsv[..., 0] <= 75) & (hsv[..., 1] >= 50) & (hsv[..., 2] >= 170)
hexc = lambda c: '#%02x%02x%02x' % (int(c[2]), int(c[1]), int(c[0]))
N = 8
steps = [[] for _ in range(N)]; tops = []; mints = []; wsteps = [[] for _ in range(N)]; wtops = []
for name, (poly, h, mint, kind) in prisms().items():
    up = np.float32([pix(x, y, h) for x, y in poly]) - [OX, OY]; dn = np.float32([pix(x, y, 0) for x, y in poly]) - [OX, OY]
    tm = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(tm, [np.int32(up)], 1)
    bm = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(bm, [np.int32(up)], 1); cv2.fillPoly(bm, [np.int32(dn)], 1)
    for i in range(len(poly)):
        j = (i + 1) % len(poly); cv2.fillConvexPoly(bm, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
    inner = cv2.erode(tm, np.ones((5, 5), np.uint8)) > 0
    (wtops if kind == 'wall' else tops).extend(M[inner & STONE & (hsv[..., 2] >= 205)].tolist()); mints.extend(M[inner & MINT].tolist())
    xs = np.nonzero(bm.any(0))[0]
    for x in xs[::2]:
        tcol = np.nonzero(tm[:, x])[0]; bcol = np.nonzero(bm[:, x])[0]
        if len(tcol) == 0: continue
        yt, yb = tcol.max() + 2, bcol.max() - 1
        if yb - yt < (4 if kind == 'wall' else 8): continue
        for y in range(yt, yb):
            if STONE[y, x] and hsv[y, x, 2] < 205: (wsteps if kind == 'wall' else steps)[min(N - 1, int((y - yt) / (yb - yt) * N))].append(M[y, x])
face = [hexc(np.median(np.array(s), 0)) for s in steps]
# the walls their own (thin, lit across: lighter and flatter than the platforms' deep faces)
wface = [hexc(np.median(np.array(s), 0)) if len(s) > 20 else face[k] for k, s in enumerate(wsteps)]
# by facing: each face's own pixels (between its top edge and its foot, in front of nothing else), the median of each, grouped by which way
# the face looks (its outward normal's angle in plan, 8 ways from east counter-clockwise): the HQ's light falls on some sides more
by = {k: [] for k in range(8)}
for name, (poly, h, mint, kind) in prisms().items():
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        nx, ny = (y1 - y0), -(x1 - x0)
        if ny > 0.2 * abs(nx): continue                       # (faces looking north turn from the camera)
        q = np.float32([pix(x0, y0, h), pix(x1, y1, h), pix(x1, y1, 0), pix(x0, y0, 0)]) - [OX, OY]
        fm = np.zeros(STONE.shape, np.uint8); cv2.fillConvexPoly(fm, np.int32(q), 1)
        fm = (cv2.erode(fm, np.ones((5, 5), np.uint8)) > 0) & STONE & (hsv[..., 2] < 205)
        if fm.sum() < 60: continue
        k = int(round(np.degrees(np.arctan2(ny, nx)) / 45)) % 8
        by[k].append((fm.sum(), np.median(M[fm], 0)))
out_by = {}
for k, v in by.items():
    if not v: continue
    w_ = np.array([a for a, _ in v], float); c_ = np.array([c for _, c in v])
    out_by[str(k)] = hexc((c_ * w_[:, None]).sum(0) / w_.sum())
out = dict(top=hexc(np.median(np.array(tops), 0)), face=face, wall_top=hexc(np.median(np.array(wtops), 0)), wall_face=wface, mint=hexc(np.median(np.array(mints), 0)), by_facing=out_by)
json.dump(out, open('art/gong_court/stone_colours.json', 'w'), indent=1)
print(out, [len(s) for s in steps])
