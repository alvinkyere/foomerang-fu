"""The warm-up's ground (2026-11-12): the round's mosaic in Chrome's colours laid flat on the ground (plan units, PX px a unit), what
stands on it or is not ground cut out (the moat, the trees and their fallen leaves, the hex fields, bamboo, pots, the stump, the bunting,
the dead's remains, the names' smudges) and filled in from the ground round it. Then our own drawing of it:

  base     the plain grass as a smooth measured field (a grid every DX units, blurred SIGMA units): its slow brightening to the middle
  shapes   crisp flat shapes where the ground departs from the base (lighter patches, shadows, the dark outskirts): each a level of
           the ground's lightness above or below the base (LEVELS), traced, smoothed and simplified, each in its own measured colour

Writes ground.json: {x0, y0, dx, nx, ny, bgr} (the base) and shapes [{level, colour, pts}] (plan units, y north), and
output/ground_check.png (the drawing against the flat mosaic; prints the mean Lab difference over the ground).

  python art/warm_up/ground.py      (after mosaic.py and moat.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up')
from measure import H as GROUND_H, Yc, MOSAIC_ORIGIN

PX = 10.0
X0, X1, Y0, Y1 = -60.0, 60.0, -42.0, 48.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
DX, SIGMA = 1.0, 2.5
LEVELS = [-60, -36, -18, -8, 8, 18]             # (Lab L of a shape's middle against the base: dark outskirts, shadows .. patches)
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
T = np.array([[1, 0, -MOSAIC_ORIGIN[0]], [0, 1, -MOSAIC_ORIGIN[1]], [0, 0, 1]])
Hm = T @ np.linalg.inv(GROUND_H) @ A
M = cv2.imread('art/warm_up/output/mosaic_chrome.png')
flat = cv2.warpPerspective(M, Hm, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
seen = cv2.erode((flat.sum(2) > 30).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
to_px = lambda pts: np.int32([[(x - X0) * PX, (Y1 - y) * PX] for x, y in pts])
hsv = cv2.cvtColor(flat, cv2.COLOR_BGR2HSV).astype(int); Hu, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]

# ---- what is not ground
moat = json.load(open('art/warm_up/moat.json'))
cut = np.zeros((Hh, W), np.uint8)
cv2.fillPoly(cut, [to_px(moat['outer'])], 1); cv2.fillPoly(cut, [to_px(moat['inner'])], 0)
cut = cv2.dilate(cut, np.ones((7, 7), np.uint8))
red = ((Hu <= 10) | (Hu >= 165)) & (S >= 110) & (V >= 120)                          # (the red tree and its leaves, the bunting)
gold = (Hu >= 10) & (Hu <= 24) & (S >= 110) & (V >= 150)                             # (the gold trees)
teal = (Hu >= 68) & (Hu <= 95) & (S >= 70) & (V >= 185)                              # (the hex fields' pads: light; the dark teal shade
# of the outskirts has their hue, never their lightness)
_fields = np.zeros((Hh, W), np.uint8)
for g_ in json.load(open('art/warm_up/hexfields.json')):
    xs_ = [p[0] for p in g_['pads']]; ys_ = [-p[1] - Yc for p in g_['pads']]
    cv2.rectangle(_fields, tuple(to_px([(min(xs_) - 2, max(ys_) + 1)])[0]), tuple(to_px([(max(xs_) + 2, min(ys_) - 6)])[0]), 1, -1)
teal &= _fields > 0
lav = (Hu >= 105) & (Hu <= 150) & (S >= 35) & (V >= 90)                              # (trunks, the stump, the remains, pots)
obj = (red | gold | lav).astype(np.uint8)
obj = cv2.dilate(cv2.morphologyEx(obj, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((9, 9), np.uint8))
# boxes (plan x0, y0, x1, y1): what colour alone misses (bamboo, the trees' and fields' stems and shadows' feet, the names' smudges)
BOXES = [(-40.5, 8, -34, 19),        # the bamboo and the names' smudges at the west edge
         (-25.5, -16.5, -21, -9.5), (31, -4, 35.5, 3.5), (27.5, -14, 31, -9.5),   # bamboo
         (-35.5, -3.5, -31.5, 0.5), (25.5, 25, 29.5, 29),                          # the potted aloes
         (-5.5, 25.5, -1.5, 30), (0, 26, 2.5, 30),                                 # the stump and its neighbour
         (33, 23, 40, 30)]                                                         # the bunting's corner
for x0, y0, x1, y1 in BOXES: cut[int((Y1 - y1) * PX):int((Y1 - y0) * PX), int((x0 - X0) * PX):int((x1 - X0) * PX)] = 1
for x, y in ((-11.0, 2.8), (3.7, -13.7)): cv2.circle(cut, (int((x - X0) * PX), int((Y1 - y) * PX)), int(1.6 * PX), 1, -1)   # (the dead)
cv2.circle(cut, (int((-3.5 - X0) * PX), int((Y1 - 4.0) * PX)), int(4.2 * PX), 1, -1)      # (the red tree and its fallen leaves)
hole = ((cut > 0) | (obj > 0) | ~seen).astype(np.uint8)
ground = cv2.inpaint(flat, hole * 255, 7, cv2.INPAINT_TELEA)
# under the hex fields' pads (the game draws the pads, which hide this ground from the fixed camera): their shadow's colour, so the
# shadow the frame shows south of them runs on under them unbroken
padm = cv2.dilate(cv2.morphologyEx(teal.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)), np.ones((5, 5), np.uint8)) > 0
ground[padm] = (0x8b, 0xc0, 0x7e)

# ---- the base: the plain grass (not in a patch, a shadow or the dark), blurred; then the shapes by their departure from it
lab = cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(np.float32); L = lab[..., 0] * 100 / 255 * 2.55     # (OpenCV's L, 0-255)
base_L = cv2.GaussianBlur(L, (0, 0), SIGMA * 2 * PX)
plain = (np.abs(L - base_L) < 6) & seen
for _ in range(2):                                   # (re-estimated on the plain grass only, filled across the rest)
    num = cv2.GaussianBlur(np.where(plain, L, 0).astype(np.float32), (0, 0), SIGMA * PX)
    den = cv2.GaussianBlur(plain.astype(np.float32), (0, 0), SIGMA * PX)
    base_L = np.where(den > 0.05, num / np.maximum(den, 1e-6), base_L)
    plain = (np.abs(L - base_L) < 6) & seen
num = cv2.GaussianBlur(np.where(plain[..., None], ground, 0).astype(np.float32), (0, 0), SIGMA * PX)
den = cv2.GaussianBlur(plain.astype(np.float32), (0, 0), SIGMA * PX)[..., None]
base = num / np.maximum(den, 1e-6)
far = den[..., 0] < 0.05                              # (no plain grass near: the dark outskirts) -> the outskirts' own blur
base[far] = cv2.GaussianBlur(ground.astype(np.float32), (0, 0), SIGMA * PX)[far]
nx, ny = int((X1 - X0) / DX) + 1, int((Y1 - Y0) / DX) + 1
grid = np.zeros((ny, nx, 3))
for j in range(ny):
    for i in range(nx):
        u, v = min(W - 1, int(i * DX * PX)), min(Hh - 1, int((Y1 - (Y0 + j * DX)) * PX))
        grid[j, i] = base[v, u]

# the departures from the base, in colour (Lab: lightness and hue, the teal shade and the light shafts differ in both): each pixel whose
# colour is more than MIN from the base's, its difference clustered (k-means, K kinds), the label map smoothed; each kind's regions
# traced, each region its own measured colour (the ground's median inside it); drawn from the faintest kind to the strongest
MIN, K = 4.0, 16
labg = cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(np.float32)
labb = cv2.cvtColor(np.clip(base, 0, 255).astype(np.uint8), cv2.COLOR_BGR2Lab).astype(np.float32)
res = cv2.GaussianBlur(labg - labb, (0, 0), 1.0)
inside = cv2.erode(seen.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
moat_only = np.zeros((Hh, W), np.uint8); cv2.fillPoly(moat_only, [to_px(moat['outer'])], 1); cv2.fillPoly(moat_only, [to_px(moat['inner'])], 0)
off = (np.linalg.norm(res, axis=2) > MIN) & inside & (moat_only == 0)
_, lab_, cen = cv2.kmeans(res[off].reshape(-1, 3), K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 4, cv2.KMEANS_PP_CENTERS)
lm = np.full((Hh, W), 255, np.uint8); lm[off] = lab_[:, 0]; lm = cv2.medianBlur(lm, 7)
lm[(moat_only > 0) | ~inside] = 255
shapes = []
strength = np.linalg.norm(cen, axis=1)
k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
for q in np.argsort(strength):
    m = cv2.morphologyEx((lm == q).astype(np.uint8), cv2.MORPH_OPEN, k5)
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None: continue
    for ci, c in enumerate(cs):
        if hier[0][ci][3] >= 0 or cv2.contourArea(c) < 0.4 * PX * PX: continue
        region = cv2.drawContours(np.zeros_like(m), [c], -1, 1, -1) > 0
        med = np.median(ground[region & (m > 0)] if (region & (m > 0)).any() else ground[region], 0)
        ap = cv2.approxPolyDP(c, 0.05 * PX, True).reshape(-1, 2)
        if len(ap) < 3: continue
        # (its holes: what lies inside it of another kind shows through)
        holes = []
        for hj in range(len(cs)):
            if hier[0][hj][3] == ci and cv2.contourArea(cs[hj]) >= 0.2 * PX * PX:
                hp = cv2.approxPolyDP(cs[hj], 0.05 * PX, True).reshape(-1, 2)
                if len(hp) >= 3: holes.append([[round(X0 + u / PX, 2), round(Y1 - v / PX, 2)] for u, v in hp])
        shapes.append(dict(colour='#%02x%02x%02x' % (int(med[2]), int(med[1]), int(med[0])),
                           pts=[[round(X0 + u / PX, 2), round(Y1 - v / PX, 2)] for u, v in ap], holes=holes))
json.dump(dict(x0=X0, y0=Y0, dx=DX, nx=nx, ny=ny, bgr=[[int(round(v)) for v in c] for c in grid.reshape(-1, 3)], shapes=shapes),
          open('art/warm_up/ground.json', 'w'))

# ---- the check: the drawing against the flat (filled) mosaic
draw = np.clip(base, 0, 255).astype(np.uint8).copy()
for s in shapes:
    c = s['colour']; mk = np.zeros((Hh, W), np.uint8); cv2.fillPoly(mk, [to_px(s['pts'])], 1)
    for hl in s.get('holes', []): cv2.fillPoly(mk, [to_px(hl)], 0)
    draw[mk > 0] = (int(c[5:7], 16), int(c[3:5], 16), int(c[1:3], 16))
dl = np.abs(cv2.cvtColor(draw, cv2.COLOR_BGR2Lab).astype(float) - cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(float)).sum(2)
ok = seen & ~(hole > 0)
print(len(shapes), 'shapes; ground drawing vs mosaic: mean dLab %.2f, median %.2f' % (dl[ok].mean(), np.median(dl[ok])))
cv2.imwrite('art/warm_up/output/ground_check.png', np.vstack([np.hstack([ground, draw])]))
