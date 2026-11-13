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
steps = [[] for _ in range(N)]; tops = []; mints = []
for name, (poly, h, mint, kind) in prisms().items():
    up = np.float32([pix(x, y, h) for x, y in poly]) - [OX, OY]; dn = np.float32([pix(x, y, 0) for x, y in poly]) - [OX, OY]
    tm = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(tm, [np.int32(up)], 1)
    bm = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(bm, [np.int32(up)], 1); cv2.fillPoly(bm, [np.int32(dn)], 1)
    for i in range(len(poly)):
        j = (i + 1) % len(poly); cv2.fillConvexPoly(bm, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
    inner = cv2.erode(tm, np.ones((5, 5), np.uint8)) > 0
    tops.extend(M[inner & STONE & (hsv[..., 2] >= 205)].tolist()); mints.extend(M[inner & MINT].tolist())
    xs = np.nonzero(bm.any(0))[0]
    for x in xs[::2]:
        tcol = np.nonzero(tm[:, x])[0]; bcol = np.nonzero(bm[:, x])[0]
        if len(tcol) == 0: continue
        yt, yb = tcol.max() + 2, bcol.max() - 1
        if yb - yt < 8: continue
        for y in range(yt, yb):
            if STONE[y, x] and hsv[y, x, 2] < 205: steps[min(N - 1, int((y - yt) / (yb - yt) * N))].append(M[y, x])
face = [hexc(np.median(np.array(s), 0)) for s in steps]
out = dict(top=hexc(np.median(np.array(tops), 0)), face=face, mint=hexc(np.median(np.array(mints), 0)))
json.dump(out, open('art/gong_court/stone_colours.json', 'w'), indent=1)
print(out, [len(s) for s in steps])
