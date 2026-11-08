"""The temple court's still shadows (2026-11-07): the soft blobs the trees round the court (and the court's own trees) lay on the
ground in the round's mosaic (output/mosaic.png), traced as our own flat shapes: the mosaic laid flat onto the ground (plan units,
10 px a unit), each shadow class found by its colour where it can fall, smoothed, its outline simplified to 0.08 units, one measured
flat colour per class:

  warm   on the paving, pale yellow #f3e8a9 (Lab L 226-241, b 148-170)
  cool   on the paving, pale blue #d6e3df (b under 134)
  olive  on the yellow ground, #cbcb81 (L 188-214, b 152-174); not where the hex fields' own shadows fall (the game draws those)

Writes shadow_mass.json: {class: {colour, polys}} in plan units.

  python art/temple_court/shadow_mass.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/temple_court')
from measure import H as GROUND_H, Yc, MOSAIC_ORIGIN

PX = 10.0; X0, X1, Y0, Y1 = -45.0, 45.0, -30.0, 30.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
M = cv2.imread('art/temple_court/output/mosaic.png')
# plan image pixel (u, v) -> plan (X0 + u / PX, Y1 - v / PX) -> the frame (GROUND_H maps the frame to (x, Yc + y)) -> the mosaic
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
T = np.array([[1, 0, -MOSAIC_ORIGIN[0]], [0, 1, -MOSAIC_ORIGIN[1]], [0, 0, 1]])
Hm = T @ np.linalg.inv(GROUND_H) @ A                                   # plan image -> mosaic
flat = cv2.warpPerspective(M, Hm, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
seen = cv2.warpPerspective(np.full(M.shape[:2], 255, np.uint8), Hm, (W, Hh), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP) > 0
seen &= flat.sum(2) > 30
lab = cv2.cvtColor(flat, cv2.COLOR_BGR2Lab).astype(int); L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
hsv = cv2.cvtColor(flat, cv2.COLOR_BGR2HSV).astype(int)
to_px = lambda pts: np.int32([[(x - X0) * PX, (Y1 - y) * PX] for x, y in pts])

FL = json.load(open('art/temple_court/floor.json'))
paving = np.zeros((Hh, W), np.uint8)
for poly in FL['bands'][0]['polys']: cv2.fillPoly(paving, [to_px(poly)], 1)
paving = paving > 0
# what stands on the ground (never a shadow there): planters, plinths, gate stones, the slab, grown a little
L_ = json.load(open('art/temple_court/layout.json')); PL = json.load(open('art/temple_court/planters.json'))
solid = np.zeros((Hh, W), np.uint8)
for p in PL.values():
    cv2.ellipse(solid, (int((p['cx'] - X0) * PX), int((Y1 - p['cy']) * PX)), (int((p['a'] + 0.4) * PX), int((p['b'] + 1.2) * PX)), 0, 0, 360, 1, -1)
FACE = dict(N=(0, 1), S=(0, -1), E=(1, 0), W=(-1, 0))
for wg in L_['wings']:          # (a wing and the smear of its wall and roof, which stand up to ~6.5 tall: laid flat they run north)
    (ax, ay), (bx, by) = wg['a'], wg['b']
    xs, ys = sorted((ax, bx)), sorted((ay, by))
    cv2.rectangle(solid, tuple(to_px([(xs[0] - 1.6, ys[1] + 4.5)])[0]), tuple(to_px([(xs[1] + 1.6, ys[0] - 1.6)])[0]), 1, -1)
HF = json.load(open('art/temple_court/hexfields.json'))
plants = np.zeros((Hh, W), np.uint8)
for p in HF['pads']:
    for k in range(4):        # (their stems' feet and their shadows, west of them: package.py's fall per unit of height)
        x, y = p['x'] - 0.75 * HF['H'] * k / 3, p['y'] - 0.1 * HF['H'] * k / 3 - 0.9
        cv2.circle(plants, (int((x - X0) * PX), int((Y1 - y) * PX)), int(1.1 * PX), 1, -1)
solid, plants = solid > 0, plants > 0

classes = {
    'warm': (paving & ~solid & (L >= 226) & (L <= 241) & (b >= 148) & (b <= 170), '#f3e8a9'),
    'cool': (paving & ~solid & (b < 134) & (L >= 205) & (L <= 240), '#d6e3df'),
    'olive': (~paving & ~solid & ~plants & (L >= 188) & (L <= 214) & (b >= 152) & (b <= 174) & (hsv[..., 0] >= 26), '#cbcb81'),
}
out = {}
k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)); k7 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
for name, (m, colour) in classes.items():
    m = (m & seen).astype(np.uint8)
    m = cv2.medianBlur(m * 255, 5) > 127
    m = cv2.morphologyEx(cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, k3), cv2.MORPH_CLOSE, k7)
    m = (cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.0) > 0.5).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    polys = []
    for c in cs:
        if cv2.contourArea(c) < 1.5 * PX * PX: continue
        ap = cv2.approxPolyDP(c, 0.08 * PX, True).reshape(-1, 2)
        if len(ap) < 3: continue
        med = np.median(flat[m.astype(bool) & (cv2.drawContours(np.zeros_like(m), [c], -1, 1, -1) > 0)], 0)
        polys.append(dict(colour='#%02x%02x%02x' % (int(med[2]), int(med[1]), int(med[0])), pts=[[round(X0 + u / PX, 2), round(Y1 - v / PX, 2)] for u, v in ap]))
    out[name] = dict(colour=colour, polys=polys)
    print(name, len(polys), 'shapes,', int(m.sum() / PX / PX), 'square units')
json.dump(out, open('art/temple_court/shadow_mass.json', 'w'))
cv2.imwrite('art/temple_court/output/flat.png', flat)
vis = flat.copy()
for name, col in (('warm', (0, 200, 255)), ('cool', (255, 0, 0)), ('olive', (0, 120, 0))):
    for p in out[name]['polys']: cv2.polylines(vis, [to_px(p['pts'])], True, col, 1)
cv2.imwrite('art/temple_court/output/shadows_overlay.png', vis)
