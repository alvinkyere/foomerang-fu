"""The canal court's water drawn as the HQ's (2026-11-15): the pool, the stream and the basin as the READY frame shows them, traced as our
own flat shapes. For each water body, in plan units over its own surface (its height: measure.pix), the frame's colours there (as Chrome
shows them) grouped into the body's few tones (k-means), the label map smoothed, each tone's regions traced as smooth polygons, then those
polygons drawn (anti-aliased) into one texture over the water's plan box: our drawing in measured colours, never the video's pixels. The
game samples it and makes it flow (render/three/canalWater.ts), keeping its hard cartoon edges by snapping to the body's palette.
Writes apps/console/public/maps/canal_court/water_<body>.png and art/canal_court/water_art.json ({body: {box, palette}}),
output/water_art_check.png (the drawing put back through the camera, beside the frame).

  python art/canal_court/water_art.py      (after ready.py, fit_tops.py, fit_basin.py; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import pix

OUT = 'apps/console/public/maps/canal_court/'
PXU = 40                                      # (texture pixels a plan unit)
f = cv2.imread('art/canal_court/output/clean_ref.png')
TOPS = json.load(open('art/canal_court/tops.json')); WAT = json.load(open('art/canal_court/water.json'))
BA = json.load(open('art/canal_court/basin.json')); AQ = json.load(open('art/canal_court/aqueduct.json'))
POOL_K = 0.68
octagon = lambda cx, cy, r, t=math.pi / 8: [(cx + r * math.cos(t + k * math.pi / 4), cy + r * math.sin(t + k * math.pi / 4)) for k in range(8)]
T = AQ['tower']
BODIES = {
    # name: plan outline, height, tones
    'pool': (octagon(T['cx'], T['cy'] + 0.15, T['r'] * POOL_K + 0.15), TOPS['tower']['h'], 2),      # (deep blue and the foam: a middle tone was the rim's blur, which the shader draws)
    'run': ([tuple(p) for p in WAT['run']['pts']], TOPS['channel']['h'], 4),
    'basin': (octagon(BA['cx'], BA['cy'], BA['rin'] + 0.15, BA['turn']), BA['hw'], 4),
}
allp = np.array([p for o, _, _ in BODIES.values() for p in o])
X0, Y0 = np.floor(allp.min(0)) - 1; X1, Y1 = np.ceil(allp.max(0)) + 1
W, H = int((X1 - X0) * PXU), int((Y1 - Y0) * PXU)
to_px = lambda pts: np.int32([((x - X0) * PXU, (Y1 - y) * PXU) for x, y in pts])
canvas = np.zeros((H, W, 3), np.uint8)
palettes = {}; check = f.copy()
for name, (outline, h, k) in BODIES.items():
    mask = np.zeros((H, W), np.uint8); cv2.fillPoly(mask, [to_px(outline)], 1)
    ys, xs = np.nonzero(mask)
    px = np.array([pix(X0 + (u + 0.5) / PXU, Y1 - (v + 0.5) / PXU, h) for u, v in zip(xs, ys)])
    ok = (px[:, 0] >= 0) & (px[:, 0] < 1919) & (px[:, 1] >= 0) & (px[:, 1] < 1079)
    sample = np.zeros((H, W, 3), np.float32)
    n_ = int(ok.sum()); side = int(math.ceil(math.sqrt(n_)))
    mx = np.zeros(side * side, np.float32); my = np.zeros(side * side, np.float32); mx[:n_] = px[ok, 0]; my[:n_] = px[ok, 1]
    got = cv2.remap(f, mx.reshape(side, side), my.reshape(side, side), cv2.INTER_LINEAR).reshape(-1, 3)[:n_]
    sample[ys[ok], xs[ok]] = got
    # (what is not water: the rims and the props over it (lavender, brown, the urns): left out of the tones, filled by the nearest tone)
    hsv = cv2.cvtColor(sample.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(int)
    water = (mask > 0) & (((hsv[..., 0] >= 82) & (hsv[..., 0] <= 110) & (hsv[..., 1] >= 40)) | ((hsv[..., 0] >= 95) & (hsv[..., 0] <= 118) & (hsv[..., 1] >= 115)))   # (cyan to deep blue; not the rims' lavender)
    _, lab, cen = cv2.kmeans(sample[water].reshape(-1, 3), k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2), 6, cv2.KMEANS_PP_CENTERS)
    order = np.argsort(cen.sum(1))                  # (dark to light)
    rank = np.empty(k, int); rank[order] = np.arange(k)
    lm = np.full((H, W), 255, np.uint8); lm[water] = rank[lab[:, 0]]
    # (the rest of the body: the nearest water's tone)
    dist, idx = cv2.distanceTransformWithLabels((lm == 255).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    src = np.full(idx.max() + 1, 255, np.uint8); zs = np.nonzero(lm != 255); src[idx[zs]] = lm[zs]
    lm = np.where(lm == 255, src[idx], lm); lm[mask == 0] = 255
    lm = cv2.medianBlur(lm, 5); lm[mask == 0] = 255
    pal = cen[order]
    palettes[name] = ['#%02x%02x%02x' % (int(c[2]), int(c[1]), int(c[0])) for c in pal]
    # each tone drawn from the darkest up: its regions as smooth polygons (super-sampled 4x, then down: anti-aliased edges)
    SS = 4; big = np.zeros((H * SS, W * SS, 3), np.uint8)
    for t in range(k):
        reg = (lm >= t) & (lm != 255) if t > 0 else (lm != 255)
        reg = cv2.morphologyEx(reg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        if t > 0: reg &= (lm == t) | (lm > t)
        cs, _ = cv2.findContours(reg, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        for c in cs:
            if cv2.contourArea(c) < 6: continue
            ap = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2).astype(float)
            if len(ap) < 3: continue
            for _ in range(2):                          # (Chaikin: the drawn edges round, not pixel steps)
                ap = np.vstack([np.vstack([0.75 * ap[i] + 0.25 * ap[(i + 1) % len(ap)], 0.25 * ap[i] + 0.75 * ap[(i + 1) % len(ap)]]) for i in range(len(ap))])
            cv2.fillPoly(big, [np.int32(ap * SS)], tuple(int(v) for v in pal[t]), lineType=cv2.LINE_AA)
    small = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)
    canvas[mask > 0] = small[mask > 0]
    # (the check: the drawing put back on the frame)
    for u, v, (fx, fy) in zip(xs[ok][::1], ys[ok][::1], px[ok]):
        check[int(fy), int(fx)] = canvas[v, u]
# each body's own texture over its box grown PAD units, beyond its outline its nearest drawn tone (a flowing sample never runs off the edge)
PAD = 3.0; art = {}
for name, (outline, h, k) in BODIES.items():
    P = np.array(outline); bx0, by0 = P.min(0) - PAD; bx1, by1 = P.max(0) + PAD
    u0, v0 = int((bx0 - X0) * PXU), int((Y1 - by1) * PXU); u1, v1 = int((bx1 - X0) * PXU), int((Y1 - by0) * PXU)
    big = np.zeros((v1 - v0, u1 - u0, 3), np.uint8); inside = np.zeros(big.shape[:2], np.uint8)
    cu0, cv0 = max(0, u0), max(0, v0); cu1, cv1 = min(W, u1), min(H, v1)
    big[cv0 - v0:cv1 - v0, cu0 - u0:cu1 - u0] = canvas[cv0:cv1, cu0:cu1]
    m_ = np.zeros((H, W), np.uint8); cv2.fillPoly(m_, [to_px(outline)], 1); m_ = cv2.erode(m_, np.ones((3, 3), np.uint8))
    inside[cv0 - v0:cv1 - v0, cu0 - u0:cu1 - u0] = m_[cv0:cv1, cu0:cu1]
    _, idx = cv2.distanceTransformWithLabels((inside == 0).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    src = np.zeros((idx.max() + 1, 3), np.uint8); zs = np.nonzero(inside); src[idx[zs]] = big[zs]
    big = np.where(inside[..., None] > 0, big, src[idx])
    cv2.imwrite(OUT + 'water_%s.png' % name, big)
    art[name] = dict(box=[round(float(bx0), 3), round(float(by0), 3), round(float(bx1), 3), round(float(by1), 3)], palette=palettes[name])
json.dump(art, open('art/canal_court/water_art.json', 'w'), indent=1)
cv2.imwrite('art/canal_court/output/water_art_check.png', check)
print('water art', {k: v['box'] for k, v in art.items()}, palettes)
