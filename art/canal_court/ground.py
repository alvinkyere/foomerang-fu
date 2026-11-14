"""The canal court's ground (2026-11-13): the round's mosaic in Chrome's colours laid flat on the ground (plan units, PX px a unit), what
stands on it or is not ground cut out (the moat, the trees and their fallen leaves, the hex fields, bamboo, pots, the stump, the bunting,
the dead's remains, the names' smudges) and filled in from the ground round it. Then our own drawing of it:

  base     the plain grass as a smooth measured field (a grid every DX units, blurred SIGMA units): its slow brightening to the middle
  shapes   crisp flat shapes where the ground departs from the base (lighter patches, shadows, the dark outskirts): each a level of
           the ground's lightness above or below the base (LEVELS), traced, smoothed and simplified, each in its own measured colour

Writes ground.json: {x0, y0, dx, nx, ny, bgr} (the base) and shapes [{level, colour, pts}] (plan units, y north), and
output/ground_check.png (the drawing against the flat mosaic; prints the mean Lab difference over the ground).

  python art/canal_court/ground.py      (after mosaic.py, fit_aqueduct.py, fit_solids.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import H as GROUND_H, Yc, MOSAIC_ORIGIN

PX = 20.0
X0, X1, Y0, Y1 = -42.0, 42.0, -34.0, 36.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
DX, SIGMA = 1.0, 2.5
LEVELS = [-60, -36, -18, -8, 8, 18]             # (Lab L of a shape's middle against the base: dark outskirts, shadows .. patches)
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
T = np.array([[1, 0, -MOSAIC_ORIGIN[0]], [0, 1, -MOSAIC_ORIGIN[1]], [0, 0, 1]])
Hm = T @ np.linalg.inv(GROUND_H) @ A
M = cv2.imread('art/canal_court/output/mosaic_chrome.png')
# (the ground from the frame at 654.5 s wherever nothing stands that moves: its camera is still and crisp; the mosaic under the players,
# their power icons and the names)
_F = cv2.imread('art/canal_court/output/chrome_0.png'); _keep = np.ones(_F.shape[:2], np.uint8)
for _x, _y in ((305, 300), (690, 210), (1650, 760), (1555, 690), (1625, 320), (1580, 230), (300, 220)): cv2.circle(_keep, (_x, _y), 70, 0, -1)
_keep[0:380, 0:230] = 0
_M = M.copy()
_M[-MOSAIC_ORIGIN[1]:-MOSAIC_ORIGIN[1] + 1080, -MOSAIC_ORIGIN[0]:-MOSAIC_ORIGIN[0] + 1920][_keep > 0] = _F[_keep > 0]
flat = cv2.warpPerspective(_M, Hm, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
seen = cv2.erode((flat.sum(2) > 30).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
to_px = lambda pts: np.int32([[(x - X0) * PX, (Y1 - y) * PX] for x, y in pts])
hsv = cv2.cvtColor(flat, cv2.COLOR_BGR2HSV).astype(int); Hu, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]

# ---- what is not ground: the aqueduct, the basin, the rocks (their fitted footprints, grown), the props (by colour: wood, urns, the
# rack, the trees' trunks and crowns), and the Battle Royale's red the mosaic took in at its edges (a power, not the map)
import math
AQ = json.load(open('art/canal_court/aqueduct.json')); TOPS = json.load(open('art/canal_court/tops.json'))
BA = json.load(open('art/canal_court/basin.json'))
cut = np.zeros((Hh, W), np.uint8)
oct_ = lambda cx, cy, r, t=math.pi / 8: [(cx + r * math.cos(t + k * math.pi / 4), cy + r * math.sin(t + k * math.pi / 4)) for k in range(8)]
# (each solid's own footprint as fitted (fit_tops.py, fit_basin.py), a hair grown: the HQ's soft contact shadow round each base is
# ground, and is traced)
M_ = 0.15
T_ = AQ['tower']; cv2.fillPoly(cut, [to_px(oct_(T_['cx'], T_['cy'], T_['r'] + M_))], 1)
for n in ('channel', 'stub', 'rock_sw', 'rock_n', 'rock_e', 'rock_se'):
    P = np.array(TOPS[n]['pts']); c_ = P.mean(0)
    cv2.fillPoly(cut, [to_px([c_ + (p - c_) * (1 + M_ / max(0.5, np.linalg.norm(p - c_))) for p in P])], 1)
cv2.fillPoly(cut, [to_px(oct_(BA['cx'], BA['cy'], BA['r'] + 0.6 + M_, BA['turn']))], 1)
red = ((Hu <= 8) | (Hu >= 170)) & (S >= 120) & (V >= 150)
wood = (Hu <= 20) & (S >= 60) & (S <= 200) & (V >= 50) & (V <= 190)
lav = (Hu >= 105) & (Hu <= 150) & (S >= 45) & (V >= 60)
gold = (Hu >= 12) & (Hu <= 24) & (S >= 110) & (V >= 160)
water = (Hu >= 85) & (Hu <= 112) & (S >= 80)
obj = (wood | lav | gold | water).astype(np.uint8)
obj = cv2.dilate(cv2.morphologyEx(obj, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((5, 5), np.uint8))
cut |= cv2.dilate(red.astype(np.uint8), np.ones((15, 15), np.uint8))
hole = ((cut > 0) | (obj > 0) | ~seen).astype(np.uint8)
ground = cv2.inpaint(flat, hole * 255, 7, cv2.INPAINT_TELEA)

# ---- the base, in two regions the kerb (kerb.py, drawn crisp over all this) parts: the court inside its edge, the sand outside its skirt;
# each one's plain ground (not a patch, a shadow or an object) blurred and filled across that region alone (never across the kerb)
KB = json.load(open('art/canal_court/kerb.json'))['bands']
court_m = np.zeros((Hh, W), np.uint8); cv2.fillPoly(court_m, [to_px(KB[-1]['pts'])], 1)
out_m = np.ones((Hh, W), np.uint8); cv2.fillPoly(out_m, [to_px(KB[0]['pts'])], 0)
court_m = cv2.dilate(court_m, np.ones((5, 5), np.uint8)) > 0; out_m = cv2.dilate(out_m, np.ones((5, 5), np.uint8)) > 0
lab = cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(np.float32); L = lab[..., 0]
base = np.zeros((Hh, W, 3), np.float32)
court_wide = cv2.dilate(court_m.astype(np.uint8), np.ones((21, 21), np.uint8)) > 0      # (the court's base reaches 1 unit under the kerb:
for region, paint in ((out_m, ~court_wide), (court_m, court_wide)):                     #  the ground's grid blends its nodes 1 unit round)
    sel = region & seen & ~(hole > 0)
    base_L = cv2.GaussianBlur(np.where(sel, L, 0), (0, 0), SIGMA * 2 * PX) / np.maximum(cv2.GaussianBlur(sel.astype(np.float32), (0, 0), SIGMA * 2 * PX), 1e-6)
    plain = (np.abs(L - base_L) < 6) & sel
    for _ in range(2):
        num = cv2.GaussianBlur(np.where(plain, L, 0).astype(np.float32), (0, 0), SIGMA * PX)
        den = cv2.GaussianBlur(plain.astype(np.float32), (0, 0), SIGMA * PX)
        base_L = np.where(den > 0.05, num / np.maximum(den, 1e-6), base_L)
        plain = (np.abs(L - base_L) < 6) & sel
    acc = np.zeros((Hh, W, 3), np.float32); have = np.zeros((Hh, W), bool)
    for sig in (SIGMA, SIGMA * 3, SIGMA * 9, SIGMA * 27):     # (filled outwards: blurs of growing reach, each where the last had none)
        num = cv2.GaussianBlur(np.where(plain[..., None], ground, 0).astype(np.float32), (0, 0), sig * PX)
        den = cv2.GaussianBlur(plain.astype(np.float32), (0, 0), sig * PX)[..., None]
        ok_ = (den[..., 0] > 0.02) & ~have
        acc[ok_] = (num / np.maximum(den, 1e-6))[ok_]; have |= ok_
    base[paint] = acc[paint]
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
moat_only = np.zeros((Hh, W), np.uint8)
off = (np.linalg.norm(res, axis=2) > MIN) & inside & (court_m | out_m)
_, lab_, cen = cv2.kmeans(res[off].reshape(-1, 3), K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 4, cv2.KMEANS_PP_CENTERS)
lm = np.full((Hh, W), 255, np.uint8); lm[off] = lab_[:, 0]; lm = cv2.medianBlur(lm, 7)
lm[~inside | ~(court_m | out_m)] = 255
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
          open('art/canal_court/ground.json', 'w'))

# ---- the check: the drawing against the flat (filled) mosaic
draw = np.clip(base, 0, 255).astype(np.uint8).copy()
for s in shapes:
    c = s['colour']; mk = np.zeros((Hh, W), np.uint8); cv2.fillPoly(mk, [to_px(s['pts'])], 1)
    for hl in s.get('holes', []): cv2.fillPoly(mk, [to_px(hl)], 0)
    draw[mk > 0] = (int(c[5:7], 16), int(c[3:5], 16), int(c[1:3], 16))
dl = np.abs(cv2.cvtColor(draw, cv2.COLOR_BGR2Lab).astype(float) - cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(float)).sum(2)
ok = seen & ~(hole > 0)
print(len(shapes), 'shapes; ground drawing vs mosaic: mean dLab %.2f, median %.2f' % (dl[ok].mean(), np.median(dl[ok])))
cv2.imwrite('art/canal_court/output/ground_check.png', np.vstack([np.hstack([ground, draw])]))

