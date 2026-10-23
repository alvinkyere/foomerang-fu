"""The gong islands' grass tops (2026-10-23): our own crisp texture of the island tops, measured from the HQ, writes
blender/tops.png and blender/tops.json (its extent in plan units) for build.py.

What the HQ shows on the tops (9:04.0, reference.png; 9:41.6; ff physics hq 2.mp4 7:27-8:40), measured:
  - one flat grass tone, #dff9ab;
  - a darker band just inside every edge: #c4efa9 at the edge, back to the grass ~0.45 units in (the edge profiles across
    the centre island's west, south and north edges in reference.png, ~27.7 px a unit);
  - a few large, soft light-yellow areas (#f4faaf) and darker green ones (#c6f0a9: mostly the shadows the plants, the trees
    and the gong cast to the lower right). Where they lie is read from the grass seen from above (output/plan.png, the
    median of the round, so no players): its local brightness, with the objects themselves left out. Each is traced as a
    smooth outline and painted crisply; no pixel of the video is kept, only those outlines.

  python art/sky_islands/tops.py       (from the repository root, after layout.py)
"""
import json
import numpy as np, cv2

BASE, EDGE, LIGHT, DARK = '#dff9ab', '#c4efa9', '#f4faaf', '#c6f0a9'
EDGE_IN = 0.45            # units: how far in from the edge the darker band runs
RIM = 0.3                 # units: the lavender lip round the grass (build.py rounds the top's edge this much)
RES = 32                  # px a unit
MIN_AREA = 0.6            # square units: smaller specks are noise

L = json.load(open('art/sky_islands/layout.json'))
cam = json.load(open('art/sky_islands/camera.json'))['plan']
K, PX0, PY1 = cam['px_per_unit'], cam['x0'], cam['y1']
plan = cv2.imread('art/sky_islands/output/plan.png')


def bgr(h):
    return np.array([int(h[i:i + 2], 16) for i in (5, 3, 1)], np.float32)


# where the light and dark areas lie, on the plan (K px a unit)
inside = np.zeros(plan.shape[:2], np.uint8)
for b in L['bodies']:
    cv2.fillPoly(inside, [np.int32([[(x - PX0) * K, (PY1 - y) * K] for x, y in b])], 1)
inner = cv2.erode(inside, np.ones((19, 19), np.uint8)) > 0                # (an edge's own band is drawn separately)
lab = cv2.cvtColor(cv2.medianBlur(plan, 21), cv2.COLOR_BGR2LAB).astype(int)
lum, a, b_ = lab[..., 0], lab[..., 1], lab[..., 2]
grassy = inner & (a < 118) & (b_ > 145)                                   # grass-coloured: not an object, not rock
mid = np.median(lum[grassy])
masks = {'light': grassy & (lum >= mid + 4), 'dark': grassy & (lum <= mid - 5)}

# the extent of the texture: the bodies, a unit round
xs = [x for bd in L['bodies'] for x, _ in bd]; ys = [y for bd in L['bodies'] for _, y in bd]
X0, X1, Y0, Y1 = min(xs) - 1, max(xs) + 1, min(ys) - 1, max(ys) + 1
W, H = int((X1 - X0) * RES), int((Y1 - Y0) * RES)
to_tex = lambda x, y: ((x - X0) * RES, (Y1 - y) * RES)


def outlines(mask):
    """The areas as smooth closed outlines in plan units (Chaikin-smoothed), small specks dropped."""
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))   # round, no spurs
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < MIN_AREA * K * K: continue
        p = cv2.approxPolyDP(c, 0.08 * K, True)[:, 0, :].astype(np.float64)
        for _ in range(3):                                                # Chaikin: round every corner
            q = np.roll(p, -1, axis=0)
            p = np.concatenate([0.75 * p + 0.25 * q, 0.25 * p + 0.75 * q], axis=1).reshape(-1, 2)
        out.append([(x / K + PX0, PY1 - y / K) for x, y in p])
    return out


def paint(shapes, size, scale=8):
    """Shapes filled crisply: drawn at `scale` times and reduced (anti-aliased edges, nothing soft)."""
    big = np.zeros((size[1] * scale, size[0] * scale), np.uint8)
    for s in shapes:
        cv2.fillPoly(big, [np.int32([[u * scale, v * scale] for u, v in (to_tex(x, y) for x, y in s)])], 255)
    return cv2.resize(big, size, interpolation=cv2.INTER_AREA).astype(np.float32)[..., None] / 255


img = np.tile(bgr(BASE), (H, W, 1))
areas = {k: outlines(m) for k, m in masks.items()}
for k, colour in (('light', LIGHT), ('dark', DARK)):
    a_ = paint(areas[k], (W, H))
    img = img * (1 - a_) + bgr(colour) * a_
# the darker band inside every edge: by distance from the grass's edge (the body's outline less the lip)
body = paint(L['bodies'], (W, H))[..., 0] > 0.5
d = cv2.distanceTransform(body.astype(np.uint8), cv2.DIST_L2, 5) / RES - RIM
t = np.clip(d / EDGE_IN, 0, 1)
t = (t * t * (3 - 2 * t))[..., None]
img = img * t + bgr(EDGE) * (1 - t)
cv2.imwrite('art/sky_islands/blender/tops.png', np.clip(img, 0, 255).astype(np.uint8))
json.dump(dict(x0=X0, x1=X1, y0=Y0, y1=Y1, px_per_unit=RES, light=len(areas['light']), dark=len(areas['dark'])),
          open('art/sky_islands/blender/tops.json', 'w'), indent=1)
print('tops', W, 'x', H, 'px;', len(areas['light']), 'light areas,', len(areas['dark']), 'dark areas')
