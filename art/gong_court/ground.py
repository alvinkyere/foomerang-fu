"""The gong court's ground (2026-11-12): the round's mosaic in Chrome's colours laid flat on the ground (plan units, PX px a unit), what
stands on it cut out (the stone, measured as prisms by fit_stones.py and projected; the maples, the gong, pots, trunks by colour; the
bamboo, aloes, tufts and the names' smudges by box) and filled in from the ground round it. Then our own drawing of it (after
art/warm_up/ground.py):

  base     the plain grass as a smooth measured field (a grid every DX units, blurred SIGMA units)
  shapes   crisp flat shapes where the ground departs from the base (the pale sun patches, the shadows, the darker outskirts): the
           departures clustered (Lab), traced, each region its own measured colour

Writes ground.json and output/ground_check.png (the drawing against the filled flat mosaic; prints the mean Lab difference).

  python art/gong_court/ground.py      (after mosaic.py and fit_stones.py; the Python of art/audio/output/venv)
"""
import json, os, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import H0 as GROUND_H, Yc, MOSAIC_ORIGIN, pix
from geom import prisms

PX = float(os.environ.get("GPX", "20"))      # (px a plan unit for the ground drawing: 20 keeps thin shadow strokes; 10 scored 3.99, 20 3.90)
X0, X1, Y0, Y1 = -36.0, 34.0, -23.0, 25.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
import os; STONE_PAD = int(os.environ.get("STONE_PAD", "3"))      # (px round the stone left out of the ground: its edge, not its contact shadow; 1, 3, 5, 9 scored 4.92, 4.80, 4.84, 4.88)
DX, SIGMA = float(os.environ.get("GDX", "0.5")), float(os.environ.get("GSIGMA", "1.2"))      # (the base field: 0.5/1.2 scored 4.84 against the still view; 1.0/2.5 5.15, 0.5/0.7 4.86, 0.5/1.6 4.95)
OX, OY = MOSAIC_ORIGIN
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
T = np.array([[1, 0, -OX], [0, 1, -OY], [0, 0, 1]])
Hm = T @ np.linalg.inv(GROUND_H) @ A
M = cv2.imread('art/gong_court/output/mosaic_chrome.png')
to_flat = lambda img, interp=cv2.INTER_LINEAR: cv2.warpPerspective(img, Hm, (W, Hh), flags=interp | cv2.WARP_INVERSE_MAP)
flat = to_flat(M)
seen = cv2.erode((flat.sum(2) > 30).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
to_px = lambda pts: np.int32([[(x - X0) * PX, (Y1 - y) * PX] for x, y in pts])

# ---- what is not ground: the stone's silhouettes (in the mosaic, then laid flat), dilated a little
stone = np.zeros(M.shape[:2], np.uint8)
for name, (poly, h, mint, kind) in prisms().items():
    up = np.float32([pix(x, y, h) for x, y in poly]) - [OX, OY]; dn = np.float32([pix(x, y, 0) for x, y in poly]) - [OX, OY]
    cv2.fillPoly(stone, [np.int32(up)], 1); cv2.fillPoly(stone, [np.int32(dn)], 1)
    for i in range(len(poly)):
        j = (i + 1) % len(poly); cv2.fillConvexPoly(stone, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
stone = cv2.dilate(stone, np.ones((STONE_PAD, STONE_PAD), np.uint8))
hsv_m = cv2.cvtColor(M, cv2.COLOR_BGR2HSV).astype(int); Hu, S, V = hsv_m[..., 0], hsv_m[..., 1], hsv_m[..., 2]
red = ((Hu <= 12) | (Hu >= 165)) & (S >= 90) & (V >= 100)                        # (the maples and their fallen leaves, the flowers)
dark = (V < 110)                                                                  # (the gong's frame, the pots' mouths)
brown = (Hu >= 5) & (Hu <= 22) & (S >= 70) & (V >= 80) & (V < 220)              # (the pots, the gong)
gold = (Hu >= 18) & (Hu <= 32) & (S >= 70) & (V >= 120) & (V < 235)              # (the gong's face)
lav = (Hu >= 105) & (Hu <= 150) & (S >= 30) & (V >= 80)                           # (the trunks, the stone's edges)
obj = (red | dark | brown | gold | lav).astype(np.uint8) | stone
obj = cv2.dilate(cv2.morphologyEx(obj, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((11, 11), np.uint8))
# boxes (mosaic px x0, y0, x1, y1): what colour alone misses (bamboo, aloes, tufts, the names' smudges)
BOXES = [(0, 80, 175, 400),                                                     # the players' names
         (530, 1000, 630, 1060), (1690, 920, 1770, 1020),                                         # the aloes' pots
         (1480, 360, 1560, 470), (590, 580, 660, 700), (1710, 440, 1780, 490), (1420, 340, 1460, 370),   # tufts
         (480, 790, 535, 850), (1430, 260, 1520, 380)]                                            # the banana's corner, the gong's foot
for x0, y0, x1, y1 in BOXES: obj[y0:y1, x0:x1] = 1
# the bamboo (cards.py traces it with its shadows): its boxes are not ground
for x0, y0, x1, y1 in [(590, 260, 680, 420), (980, 0, 1175, 170), (385, 730, 500, 890), (740, 460, 980, 760), (1675, 250, 1775, 380),
                       (760, 1110, 845, 1240), (1340, 1060, 1470, 1240)]: obj[y0:y1, x0:x1] = 1
hole = ((to_flat(obj * 255, cv2.INTER_NEAREST) > 0) | ~seen).astype(np.uint8)
ground = cv2.inpaint(flat, hole * 255, 7, cv2.INPAINT_TELEA)

# ---- the base: the plain grass, blurred; then the shapes by their departure from it
lab = cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(np.float32); L = lab[..., 0]
base_L = cv2.GaussianBlur(L, (0, 0), SIGMA * 2 * PX)
plain = (np.abs(L - base_L) < 6) & seen
for _ in range(2):
    num = cv2.GaussianBlur(np.where(plain, L, 0).astype(np.float32), (0, 0), SIGMA * PX)
    den = cv2.GaussianBlur(plain.astype(np.float32), (0, 0), SIGMA * PX)
    base_L = np.where(den > 0.05, num / np.maximum(den, 1e-6), base_L)
    plain = (np.abs(L - base_L) < 6) & seen
num = cv2.GaussianBlur(np.where(plain[..., None], ground, 0).astype(np.float32), (0, 0), SIGMA * PX)
den = cv2.GaussianBlur(plain.astype(np.float32), (0, 0), SIGMA * PX)[..., None]
base = num / np.maximum(den, 1e-6)
far = den[..., 0] < 0.05
base[far] = cv2.GaussianBlur(ground.astype(np.float32), (0, 0), SIGMA * PX)[far]
nx, ny = int((X1 - X0) / DX) + 1, int((Y1 - Y0) / DX) + 1
grid = np.zeros((ny, nx, 3))
for j in range(ny):
    for i in range(nx):
        u, v = min(W - 1, int(i * DX * PX)), min(Hh - 1, int((Y1 - (Y0 + j * DX)) * PX))
        grid[j, i] = base[v, u]

MIN, K = 4.0, 16
labg = cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(np.float32)
labb = cv2.cvtColor(np.clip(base, 0, 255).astype(np.uint8), cv2.COLOR_BGR2Lab).astype(np.float32)
res = cv2.GaussianBlur(labg - labb, (0, 0), 1.0)
inside = cv2.erode(seen.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
off = (np.linalg.norm(res, axis=2) > MIN) & inside
_, lab_, cen = cv2.kmeans(res[off].reshape(-1, 3), K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 4, cv2.KMEANS_PP_CENTERS)
lm = np.full((Hh, W), 255, np.uint8); lm[off] = lab_[:, 0]; lm = cv2.medianBlur(lm, 5 if PX > 12 else 7); lm[~inside] = 255
shapes = []
k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3) if PX > 12 else (5, 5))
for q in np.argsort(np.linalg.norm(cen, axis=1)):
    m = cv2.morphologyEx((lm == q).astype(np.uint8), cv2.MORPH_OPEN, k5)
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None: continue
    for ci, c in enumerate(cs):
        if hier[0][ci][3] >= 0 or cv2.contourArea(c) < 0.4 * PX * PX: continue
        region = cv2.drawContours(np.zeros_like(m), [c], -1, 1, -1) > 0
        med = np.median(ground[region & (m > 0)] if (region & (m > 0)).any() else ground[region], 0)
        ap = cv2.approxPolyDP(c, 0.05 * PX, True).reshape(-1, 2)
        if len(ap) < 3: continue
        holes = []
        for hj in range(len(cs)):
            if hier[0][hj][3] == ci and cv2.contourArea(cs[hj]) >= 0.2 * PX * PX:
                hp = cv2.approxPolyDP(cs[hj], 0.05 * PX, True).reshape(-1, 2)
                if len(hp) >= 3: holes.append([[round(X0 + u / PX, 2), round(Y1 - v / PX, 2)] for u, v in hp])
        shapes.append(dict(colour='#%02x%02x%02x' % (int(med[2]), int(med[1]), int(med[0])),
                           pts=[[round(X0 + u / PX, 2), round(Y1 - v / PX, 2)] for u, v in ap], holes=holes))
json.dump(dict(x0=X0, y0=Y0, dx=DX, nx=nx, ny=ny, bgr=[[int(round(v)) for v in c] for c in grid.reshape(-1, 3)], shapes=shapes),
          open('art/gong_court/ground.json', 'w'))

draw = np.clip(base, 0, 255).astype(np.uint8).copy()
for s in shapes:
    c = s['colour']; mk = np.zeros((Hh, W), np.uint8); cv2.fillPoly(mk, [to_px(s['pts'])], 1)
    for hl in s.get('holes', []): cv2.fillPoly(mk, [to_px(hl)], 0)
    draw[mk > 0] = (int(c[5:7], 16), int(c[3:5], 16), int(c[1:3], 16))
dl = np.linalg.norm(cv2.cvtColor(draw, cv2.COLOR_BGR2Lab).astype(float) - cv2.cvtColor(ground, cv2.COLOR_BGR2Lab).astype(float), axis=2) * 100 / 255
ok = seen & ~(hole > 0)
print(len(shapes), 'shapes; ground drawing vs mosaic: mean dLab %.2f, median %.2f' % (dl[ok].mean(), np.median(dl[ok])))
cv2.imwrite('art/gong_court/output/ground_check.png', np.vstack([ground, draw]))
