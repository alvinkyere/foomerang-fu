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
from measure import _H, Yc, MOSAIC_ORIGIN, ZS

PX, MIN, K = 20.0 / ZS, 5.0, 8
OX, OY = MOSAIC_ORIGIN
M = cv2.imread('art/gong_court/output/mosaic_chrome.png')
T = np.array([[1, 0, -OX], [0, 1, -OY], [0, 0, 1]])
S = json.load(open('art/gong_court/stones.json'))
# (the bamboo is 3D now, props.py: what it covers on a mint is the mint's own colour, never a traced stalk; its shadows stay)
from measure import pix
from geom import bamboo_mask, aloes_mask
STANDING = bamboo_mask(M.shape[:2], pix, np.float32([OX, OY]))
ALOES = aloes_mask(M.shape[:2], pix, np.float32([OX, OY]))      # (the aloes are 3D: nothing of them lies on a mint)
out = {}
for name, b in S.items():
    if not b.get('mint'): continue
    poly = np.array(b['mint'], float); x0, y0 = poly.min(0) - 0.2; x1, y1 = poly.max(0) + 0.2
    W, Hh = int((x1 - x0) * PX), int((y1 - y0) * PX)
    A = np.array([[1 / PX, 0, x0], [0, -1 / PX, y1 + Yc], [0, 0, 1]])
    flat = cv2.warpPerspective(M, T @ np.linalg.inv(_H(b['h'])) @ A, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    to_px = lambda pts: np.int32([[(x - x0) * PX, (y1 - y) * PX] for x, y in pts])
    inside = np.zeros((Hh, W), np.uint8); cv2.fillPoly(inside, [to_px(poly)], 1)
    # (0.3 units in from the mint's edge: the soft blend of the rim's lavender into the mint traced as a pale band all round it)
    ER = int(round(0.3 * PX)) * 2 + 1
    full = (cv2.erode(inside, np.ones((3, 3), np.uint8)) > 0) & (flat.sum(2) > 30)
    _in = (cv2.erode(inside, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ER, ER))) > 0) & (flat.sum(2) > 30)
    inside = _in if _in.sum() > 50 else (inside > 0) & (flat.sum(2) > 30)      # (a mint too small for it: as it is)
    standing = cv2.warpPerspective(STANDING, T @ np.linalg.inv(_H(b['h'])) @ A, (W, Hh), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP) > 0
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2Lab).astype(np.float32)
    base = np.median(lab[inside], 0); bgr = np.median(flat[inside], 0)
    res = cv2.GaussianBlur(lab - base, (0, 0), 1.0)
    off = (np.linalg.norm(res, axis=2) > MIN) & inside
    # under the bamboo: a stalk's own greens (saturated, darker than the mint) are left out; its shadow (paler, bluer) stays
    stalkish = (lab[..., 2] - base[2] > 4) | (lab[..., 0] < base[0] - 22)
    off &= ~(standing & stalkish)
    off &= ~(cv2.warpPerspective(ALOES, T @ np.linalg.inv(_H(b['h'])) @ A, (W, Hh), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP) > 0)
    # a maple's crown hanging over the mint is the crown (cards.py draws it, upright), not something lying on the mint: the large red
    # regions are left out (the fallen leaves, small, stay)
    hsv_ = cv2.cvtColor(flat, cv2.COLOR_BGR2HSV).astype(int)
    red_ = (((hsv_[..., 0] <= 12) | (hsv_[..., 0] >= 165)) & (hsv_[..., 1] >= 80) & (hsv_[..., 2] >= 100)).astype(np.uint8)
    red_ = cv2.morphologyEx(red_, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))      # (not grown: the leaves near the crown stay apart)
    n_, cl_, st_, _ = cv2.connectedComponentsWithStats(red_)
    crown = np.isin(cl_, [i for i in range(1, n_) if st_[i, 4] > 1.5 * PX * PX])
    crown = cv2.dilate(crown.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0      # (and its soft edge's blend, which traced as a tan halo)
    off &= ~crown
    # the fallen leaves: each small red region traced on its own, in the median of its reddest pixels (clustered with the rest they
    # blended into the grass: muddy brown); left out of the clustering below
    leaves_ = []
    leaf = (red_ > 0) & ~crown & inside
    n2, cl2, st2, _ = cv2.connectedComponentsWithStats(leaf.astype(np.uint8))
    for i in range(1, n2):
        if st2[i, 4] < 6: continue
        reg = (cl2 == i).astype(np.uint8)
        cs_, _ = cv2.findContours(cv2.dilate(reg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if not cs_: continue
        ap = cv2.approxPolyDP(max(cs_, key=cv2.contourArea), 0.6, True).reshape(-1, 2)
        if len(ap) < 3: continue
        px_ = flat[reg > 0]; sat = cv2.cvtColor(px_[None].astype(np.uint8), cv2.COLOR_BGR2HSV)[0][:, 1]
        med = np.median(px_[sat >= np.percentile(sat, 50)], 0)
        leaves_.append(dict(colour='#%02x%02x%02x' % (int(med[2]), int(med[1]), int(med[0])),
                            pts=[[round(x0 + u / PX, 3), round(y1 - v / PX, 3)] for u, v in ap], holes=[]))
    # the leaves, the crown and their soft edges painted out with what lies round them (the shadow under the crown, the mint), then
    # the departures measured again: cut out instead, the bare mint showed through as a pale ring round every leaf
    gone = cv2.dilate((leaf | crown).astype(np.uint8), np.ones((7, 7), np.uint8))
    flat = cv2.inpaint(flat, gone * 255, 5, cv2.INPAINT_TELEA)
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2Lab).astype(np.float32)
    res = cv2.GaussianBlur(lab - base, (0, 0), 1.0)
    off = (np.linalg.norm(res, axis=2) > MIN) & inside & ~(standing & stalkish)
    off &= ~(cv2.warpPerspective(ALOES, T @ np.linalg.inv(_H(b['h'])) @ A, (W, Hh), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP) > 0)
    shapes = []
    if off.sum() > 50:
        _, lab_, cen = cv2.kmeans(res[off].reshape(-1, 3), K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 4,
                                  cv2.KMEANS_PP_CENTERS)
        lm = np.full((Hh, W), 255, np.uint8); lm[off] = lab_[:, 0]; lm = cv2.medianBlur(lm, 5); lm[~inside] = 255
        # out to the mint's edge: each pixel of the band left out of the tracing takes the label (or the plain mint) nearest inside
        band = full & ~inside
        if band.any() and inside.any():
            _, near = cv2.distanceTransformWithLabels((~inside).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
            iy, ix = np.nonzero(inside); lut = np.full(near.max() + 1, 255, np.uint8); lut[near[iy, ix]] = lm[iy, ix]
            lm[band] = lut[near[band]]
        # the mint's own colour: the tone that covers most of it (the median of the whole, dragged by its shadows, came out greyed,
        # #b6ce97 for #b5e99b, and showed so wherever nothing was traced)
        labs_, cnts_ = np.unique(lm[full], return_counts=True)
        top_ = labs_[np.argmax(cnts_)]
        if top_ != 255: bgr = np.median(flat[full & (lm == top_)], 0)
        for q in np.argsort(np.linalg.norm(cen, axis=1)):
            m = cv2.morphologyEx((lm == q).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
            if hier is None: continue
            for ci, c in enumerate(cs):
                if hier[0][ci][3] >= 0 or cv2.contourArea(c) < 0.03 * PX * PX: continue
                region = cv2.drawContours(np.zeros_like(m), [c], -1, 1, -1) > 0
                med = np.median(flat[region & (m > 0)], 0)
                # (small bluish bits along the edge: the rim's lavender blended in, not something on the mint)
                if med[0] > med[1] - 10 and cv2.contourArea(c) < 0.3 * PX * PX: continue
                ap = cv2.approxPolyDP(c, 0.04 * PX, True).reshape(-1, 2)
                if len(ap) < 3: continue
                holes = [[[round(x0 + u / PX, 3), round(y1 - v / PX, 3)] for u, v in cv2.approxPolyDP(cs[hj], 0.04 * PX, True).reshape(-1, 2)]
                         for hj in range(len(cs)) if hier[0][hj][3] == ci and cv2.contourArea(cs[hj]) >= 0.02 * PX * PX]
                shapes.append(dict(colour='#%02x%02x%02x' % (int(med[2]), int(med[1]), int(med[0])),
                                   pts=[[round(x0 + u / PX, 3), round(y1 - v / PX, 3)] for u, v in ap], holes=[h for h in holes if len(h) >= 3]))
    out[name] = dict(colour='#%02x%02x%02x' % (int(bgr[2]), int(bgr[1]), int(bgr[0])), shapes=shapes + leaves_)
    print('%-12s mint %s  %d shapes' % (name, out[name]['colour'], len(shapes)))
json.dump(out, open('art/gong_court/tops.json', 'w'))
