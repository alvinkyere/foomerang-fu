"""The basin fitted to the frame (2026-11-13): an octagon of brown blocks (outer radius r, inner rin, their top hb) on a navy footing
(radius rf, its top hf), the pool inside at hw; one centre and turn. Each part's silhouette through measure.py's camera against the frame's
own pixels of its colour (brown, navy, the pool's cyan where it shows inside), the parameters moved until they overlap most. The block on
the side the channel comes in is left out (the frame: none there). Writes basin.json, output/basin_fit.png.

  python art/canal_court/fit_basin.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/canal_court')
from measure import pix

f = cv2.imread('art/canal_court/output/clean_ref_raw.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H_, S_, V_ = hsv[..., 0], hsv[..., 1], hsv[..., 2]
BOX = (1180, 420, 1560, 780)
reg = np.zeros(H_.shape, bool); reg[BOX[1]:BOX[3], BOX[0]:BOX[2]] = True
brown = reg & ((H_ >= 160) | (H_ <= 14)) & (S_ >= 35) & (V_ >= 55) & (V_ <= 210)
navy = reg & (H_ >= 100) & (H_ <= 135) & (S_ >= 50) & (V_ < 130) & ~brown
water = reg & (H_ >= 80) & (H_ <= 112) & (S_ >= 40) & (V_ >= 150)
lav = (H_ >= 105) & (H_ <= 135) & (S_ >= 40) & (V_ >= 130)
TOPS = json.load(open('art/canal_court/tops.json'))
ENT = TOPS['channel']['pts']


def octagon(cx, cy, r, turn):
    return [(cx + r * math.cos(turn + k * math.pi / 4), cy + r * math.sin(turn + k * math.pi / 4)) for k in range(8)]


def prism(poly, z1, z0=0.0):
    m = np.zeros(H_.shape, np.uint8); pts = [pix(x, y, z) for x, y in poly for z in (z0, z1)]
    cv2.fillPoly(m, [cv2.convexHull(np.int32(pts))], 1); return m > 0


def flat(poly, z):
    m = np.zeros(H_.shape, np.uint8); cv2.fillPoly(m, [np.int32([pix(x, y, z) for x, y in poly])], 1); return m > 0


def parts(v):
    cx, cy, r, rin, rf, hb, hf, hw, turn = v
    foot = prism(octagon(cx, cy, rf, turn), hf)
    blocks = prism(octagon(cx, cy, r, turn), hb, hf)
    inner = flat(octagon(cx, cy, rin, turn), hb)                     # (the blocks' inner rim at their top: inside it, the pool)
    pool = flat(octagon(cx, cy, rin, turn), hw) & inner
    return foot, blocks, inner, pool


def cost(v):
    foot, blocks, inner, pool = parts(v)
    b = blocks & ~(inner & pool)                                     # (what shows brown: the blocks, less the pool seen inside)
    n_ = foot & ~blocks
    w_ = pool
    iou = lambda a, w: (a & w).sum() / max((a | w).sum(), 1)
    # (the lavender channel's end lies over the blocks' west side: there, neither is counted)
    keep = ~lav
    return 1 - (2 * iou(b & keep, brown) + iou(n_ & keep, navy) + iou(w_ & keep, water)) / 4


S0 = json.load(open('art/canal_court/solids.json'))['basin']
v0 = [S0['cx'], S0['cy'], S0['r'], S0['r'] - 1.3, S0['r'] + 0.3, 2.0, 0.6, 1.0, S0['turn']]
best = v0
for _ in range(3):
    best = minimize(cost, best, method='Nelder-Mead', options=dict(xatol=0.003, fatol=1e-6, maxiter=1500, adaptive=True)).x
names = ['cx', 'cy', 'r', 'rin', 'rf', 'hb', 'hf', 'hw', 'turn']
out = {k: round(float(x), 4) for k, x in zip(names, best)}; out['score'] = round(1 - cost(best), 3)
print(out)
json.dump(out, open('art/canal_court/basin.json', 'w'), indent=1)
foot, blocks, inner, pool = parts(best)
vis = f.copy()
for m_, w_, c in ((blocks & ~(inner & pool), brown, (0, 0, 255)), (foot & ~blocks, navy, (255, 0, 255)), (pool, water, (0, 255, 0))):
    cs, _ = cv2.findContours(m_.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cv2.drawContours(vis, cs, -1, c, 1)
cv2.imwrite('art/canal_court/output/basin_fit.png', vis[BOX[1] - 20:BOX[3] + 20, BOX[0] - 20:BOX[2] + 20])
