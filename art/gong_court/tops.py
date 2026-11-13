"""The gong court's platform tops (2026-11-13): what lies on each platform's mint (the maple's shadow and its fallen leaves on the north-
west one, the gong's shadow on the north-east one, the aloes' shadows on the southern ones), drawn as the ground is (ground.py): the
round's mosaic (Chrome's colours) laid flat at the platform's height, inside its mint; the mint's own colour (its median); every pixel
that departs from it by more than MIN (Lab) clustered, traced, each region its own measured colour. Writes tops.json: name -> {colour,
shapes: [{colour, pts, holes}]} (plan units, y north).

  python art/gong_court/tops.py      (after fit_stones.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import _H, Yc, MOSAIC_ORIGIN

PX, MIN, K = 20.0, 5.0, 8
OX, OY = MOSAIC_ORIGIN
M = cv2.imread('art/gong_court/output/mosaic_chrome.png')
T = np.array([[1, 0, -OX], [0, 1, -OY], [0, 0, 1]])
S = json.load(open('art/gong_court/stones.json'))
out = {}
for name, b in S.items():
    if not b.get('mint'): continue
    poly = np.array(b['mint'], float); x0, y0 = poly.min(0) - 0.2; x1, y1 = poly.max(0) + 0.2
    W, Hh = int((x1 - x0) * PX), int((y1 - y0) * PX)
    A = np.array([[1 / PX, 0, x0], [0, -1 / PX, y1 + Yc], [0, 0, 1]])
    flat = cv2.warpPerspective(M, T @ np.linalg.inv(_H(b['h'])) @ A, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    to_px = lambda pts: np.int32([[(x - x0) * PX, (y1 - y) * PX] for x, y in pts])
    inside = np.zeros((Hh, W), np.uint8); cv2.fillPoly(inside, [to_px(poly)], 1)
    inside = (cv2.erode(inside, np.ones((3, 3), np.uint8)) > 0) & (flat.sum(2) > 30)
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2Lab).astype(np.float32)
    base = np.median(lab[inside], 0); bgr = np.median(flat[inside], 0)
    res = cv2.GaussianBlur(lab - base, (0, 0), 1.0)
    off = (np.linalg.norm(res, axis=2) > MIN) & inside
    shapes = []
    if off.sum() > 50:
        _, lab_, cen = cv2.kmeans(res[off].reshape(-1, 3), K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 4,
                                  cv2.KMEANS_PP_CENTERS)
        lm = np.full((Hh, W), 255, np.uint8); lm[off] = lab_[:, 0]; lm = cv2.medianBlur(lm, 5); lm[~inside] = 255
        for q in np.argsort(np.linalg.norm(cen, axis=1)):
            m = cv2.morphologyEx((lm == q).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
            if hier is None: continue
            for ci, c in enumerate(cs):
                if hier[0][ci][3] >= 0 or cv2.contourArea(c) < 0.03 * PX * PX: continue
                region = cv2.drawContours(np.zeros_like(m), [c], -1, 1, -1) > 0
                med = np.median(flat[region & (m > 0)], 0)
                ap = cv2.approxPolyDP(c, 0.04 * PX, True).reshape(-1, 2)
                if len(ap) < 3: continue
                holes = [[[round(x0 + u / PX, 3), round(y1 - v / PX, 3)] for u, v in cv2.approxPolyDP(cs[hj], 0.04 * PX, True).reshape(-1, 2)]
                         for hj in range(len(cs)) if hier[0][hj][3] == ci and cv2.contourArea(cs[hj]) >= 0.02 * PX * PX]
                shapes.append(dict(colour='#%02x%02x%02x' % (int(med[2]), int(med[1]), int(med[0])),
                                   pts=[[round(x0 + u / PX, 3), round(y1 - v / PX, 3)] for u, v in ap], holes=[h for h in holes if len(h) >= 3]))
    out[name] = dict(colour='#%02x%02x%02x' % (int(bgr[2]), int(bgr[1]), int(bgr[0])), shapes=shapes)
    print('%-12s mint %s  %d shapes' % (name, out[name]['colour'], len(shapes)))
json.dump(out, open('art/gong_court/tops.json', 'w'))
