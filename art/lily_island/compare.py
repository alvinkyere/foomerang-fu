"""How well the model's stones match the HQ's (2026-10-29): the stones' silhouette through the HQ camera (build.py ... mask) against the
rock regions of the 4:27 frame, pixel by pixel.

  Blender -b --python art/lily_island/blender/build.py -- <out_dir> mask
  python art/lily_island/compare.py <out_dir>/mask.png [--fit]    (from the repository root)

--fit: for each stone, how much lower the HQ's silhouette runs below its top than the model's, as a height change; written to
heights.json (stones.py uses it), a step at a time (run stones.py, the build and this again until the change is small).

Prints the overlap (IoU) of the two masks and what is only in the HQ or only in the model, and writes compare.png (green: both; red:
HQ only; blue: model only).
"""
import sys
import numpy as np, cv2

RAFT = '--raft' in sys.argv           # the raft's planks instead of the stones (build.py with POND_MASK=raft)
mine = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE) > 128
f = cv2.imread('art/lily_island/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
v = f.max(2)
hud = np.arange(1920)[None, :] > 230
rock = hud & (h[..., 0] >= 100) & (h[..., 0] <= 145) & (h[..., 1] >= 20) & (v >= 95)
# the stones (not the thin lavender lip round the banks, which the banks carry): what survives a 31 px opening
hq = cv2.morphologyEx(rock.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((31, 31), np.uint8)) > 0
if RAFT:
    # the raft: its tan deck and its dark red-brown edge (beside the deck)
    wood = hud & (h[..., 0] >= 5) & (h[..., 0] <= 24) & (h[..., 1] > 40) & (h[..., 1] < 170) & (v > 90) & (v < 215)
    wood = cv2.morphologyEx(wood.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0
    edge = hud & ((h[..., 0] <= 12) | (h[..., 0] >= 165)) & (h[..., 1] >= 50) & (v > 90) & (v < 200) & (cv2.dilate(wood.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0)
    crates = hud & ((h[..., 0] >= 160) | (h[..., 0] <= 3)) & (h[..., 1] > 50) & (v > 110) & (cv2.dilate(wood.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0)
    hq = cv2.morphologyEx((wood | edge | crates).astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)) > 0
both, only_hq, only_me = hq & mine, hq & ~mine, mine & ~hq
print('%s: overlap' % ('raft' if RAFT else 'stones') + ' (IoU) %.3f   HQ-only %.1f%%   model-only %.1f%%   (HQ %d px, model %d px)' % (
    both.sum() / (hq | mine).sum(), 100 * only_hq.sum() / hq.sum(), 100 * only_me.sum() / mine.sum(), hq.sum(), mine.sum()))
img = np.zeros(f.shape, np.uint8)
img[both] = (0, 160, 0); img[only_hq] = (0, 0, 220); img[only_me] = (220, 80, 0)
cv2.imwrite('art/lily_island/output/compare.png', cv2.resize(img, (960, 540)))

if '--fit' in sys.argv:
    import json, math, os
    CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/lily_island/scale.json'))
    Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
    R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C0 = CAM['focalPx'], np.array(CAM['centre'])
    def ref(X, Y, z=0.0):
        v_ = R @ (np.array([X, Y, z]) / 100 - C0); cx, cy = F * v_[0] / v_[2] + 960, F * v_[1] / v_[2] + 540
        return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z
    B = json.load(open('art/lily_island/stones.json'))
    heights = json.load(open('art/lily_island/heights.json')) if os.path.exists('art/lily_island/heights.json') else {}
    rep = []
    for i, b in enumerate(B):
        pts = np.int32([ref(x, y, b['height']) for x, y in b['top']]); x0, y0 = pts.min(0); x1, y1 = pts.max(0)
        dy = abs(ref(*np.mean(b['top'], 0), 1.0)[1] - ref(*np.mean(b['top'], 0), 0.0)[1])      # pixels a unit of height moves a point
        diffs = []
        for x in range(int(x0 + 0.2 * (x1 - x0)), int(x0 + 0.8 * (x1 - x0)) + 1, 3):
            y = int(pts[:, 1][np.abs(pts[:, 0] - x) <= 40].max()) if np.any(np.abs(pts[:, 0] - x) <= 40) else y1
            def run_end(m):
                k = y
                while k < 1079 and m[k, x]: k += 1
                return k
            if hq[min(y, 1079), x] and mine[min(y, 1079), x]: diffs.append(run_end(hq) - run_end(mine))
        if len(diffs) >= 3:
            d = float(np.median(diffs)); new = max(0.8, min(6.0, b['height'] + 0.8 * d / dy)); heights[str(i)] = round(new, 2)
            rep.append('%d: %+.0f px -> %.2f (was %.2f)' % (i, d, new, b['height']))
    # only a stone whose south face shows can be fitted (a long north-south wall shows one at its end only; one behind another is
    # hidden): the readings outside 1.5-5.5 are dropped, and a dropped stone takes the mean of its kind's good ones
    good = {i: heights[i] for i in heights if 1.5 <= heights[i] <= 5.5}
    for kind, e_w in (('slab', True), ('boulder', None)):
        idx = [i for i, b in enumerate(B) if b['kind'] == kind and (kind == 'boulder' or b['rect'][4] % 180 < 45 or b['rect'][4] % 180 > 135)]
        vals = [good[str(i)] for i in idx if str(i) in good]
        mean = round(float(np.mean(vals)), 2) if vals else None
        for i, b in enumerate(B):
            if b['kind'] != kind: continue
            if kind == 'slab' and i not in idx:
                heights[str(i)] = mean          # (a north-south wall: the mean of the east-west slabs')
            elif str(i) not in good and mean is not None:
                heights[str(i)] = mean
    json.dump(heights, open('art/lily_island/heights.json', 'w'))
    print('height fit:', '; '.join(rep))
