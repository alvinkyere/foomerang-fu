"""The sky islands' grass, drawn as flat colour shapes (2026-10-22): the island tops' texture.

The video's grass is one light yellow-green (#ddf6a8, 73%) with soft patches of green (#c1e7a3, 13%) and of light yellow
(#f2f8af, 11%): k-means over the centre island in the close-up (9:41.64). Where they lie comes from the grass seen from
above (output/plan.png), ranked by brightness (the median is softer than any frame) into those proportions;
where an object stands (a tree, a pot, the gong) the tone round it runs on; the shapes are smoothed into clean regions with
soft (1 px) edges. Nothing of the video's pixels is kept, only the tones and the shapes of their regions. Writes
art/sky_islands/blender/tops.png (the plan's extent, 20 px a unit) for build.py.

  python art/sky_islands/tops.py       (from the repository root)
"""
import json
import numpy as np, cv2

TONES = ['#ddf6a8', '#c1e7a3', '#f2f8af']          # the grass, its soft green patches, its light yellow ones
SHARES = (0.73, 0.126, 0.114)                     # as the close-up shows them (9:41.64: k-means over the centre island)
RES = 20                                           # px a unit
plan = cv2.imread('art/sky_islands/output/plan.png')
L = json.load(open('art/sky_islands/layout.json'))
cam = json.load(open('art/sky_islands/camera.json'))['plan']
K, X0, Y1 = cam['px_per_unit'], cam['x0'], cam['y1']
inside = np.zeros(plan.shape[:2], np.uint8)
for o in L['islands'].values():
    cv2.fillPoly(inside, [np.int32([[(x - X0) * K, (Y1 - y) * K] for x, y in o])], 1)
hsv = cv2.cvtColor(plan, cv2.COLOR_BGR2HSV)
h, s, v = (hsv[..., i].astype(int) for i in range(3))
grassy = (inside > 0) & (h >= 25) & (h <= 60) & (s > 30) & (v > 200)     # (not the darker hex plants and tufts)
bgr = np.array([[int(t[i:i + 2], 16) for i in (5, 3, 1)] for t in TONES], np.float32)
# the median is softer than the frames, so its tones are matched by rank, not by colour: its darkest grass the green
# patches, its brightest the yellow ones, in the close-up's proportions
lum = cv2.GaussianBlur(plan.astype(np.float32), (0, 0), 2).mean(2)
# (only the patches: the broad light across an island taken away, its average over ~3 units)
w = cv2.GaussianBlur(grassy.astype(np.float32), (0, 0), 3 * K)
lum = lum - cv2.GaussianBlur(lum * grassy, (0, 0), 3 * K) / np.maximum(w, 1e-3)
known = grassy.astype(np.uint8)
_, nearest = cv2.distanceTransformWithLabels(1 - known, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys, xs = np.where(known > 0)
idx = np.zeros(nearest.max() + 1, np.int64); idx[nearest[known > 0]] = np.arange(len(xs))
fill = (ys[idx[nearest]], xs[idx[nearest]])          # where an object stands, the nearest grass's tone runs on
small_inside = cv2.resize(inside, (plan.shape[1] * RES // K, plan.shape[0] * RES // K), interpolation=cv2.INTER_NEAREST) > 0


def regions(qg, qy):
    lo, hi = np.quantile(lum[grassy], [qg, 1 - qy])
    label = np.where(lum <= lo, 1, np.where(lum >= hi, 2, 0)).astype(np.uint8)[fill]
    small = cv2.resize(label, (plan.shape[1] * RES // K, plan.shape[0] * RES // K), interpolation=cv2.INTER_NEAREST)
    votes = np.stack([cv2.blur((small == k).astype(np.float32), (9, 9)) for k in range(len(TONES))], -1)
    return votes.argmax(-1)


# clean regions (a majority vote over ~0.4 units) in the close-up's proportions: the thresholds tuned until they are
qg, qy = SHARES[1], SHARES[2]
for _ in range(8):
    win = regions(qg, qy)
    got = [float((win[small_inside] == k).mean()) for k in range(3)]
    qg *= SHARES[1] / max(got[1], 1e-3); qy *= SHARES[2] / max(got[2], 1e-3)
    qg, qy = min(qg, 0.5), min(qy, 0.5)
win = regions(qg, qy)
soft = np.stack([cv2.GaussianBlur((win == k).astype(np.float32), (0, 0), 1.0) for k in range(len(TONES))], -1)
img = (soft[..., :, None] * bgr[None, None]).sum(2) / soft.sum(-1, keepdims=True)
cv2.imwrite('art/sky_islands/blender/tops.png', np.clip(img, 0, 255).astype(np.uint8))
print('tops', img.shape[1], 'x', img.shape[0], 'shares on the islands', [round(float((win[small_inside] == k).mean()), 3) for k in range(len(TONES))])
