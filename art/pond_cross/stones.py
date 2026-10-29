"""The cross pond's stone, block by block (2026-10-28): the ring of slabs and the boulders of foomerang-fu physics hq.mp4 4:27.

The first build took all the lavender as one flat region at ground level. It is a ring of separate blocks, each a tall
chamfered prism: a pale top, a darker side toward the camera, and a height of its own. For each block: its top face
(the pale region, one component each), the height from how many pixels of side show under it, and its footprint, which is
the top polygon unprojected at that height. Writes stones.json (plan units, as layout.json).

  python art/pond_cross/stones.py       (from the repository root; the Python of art/audio/output/venv, see docs/AGENT_PLAYBOOK.md)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/pond_cross/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']      # the zoom the frame is read at: the HQ's, over the scale (scale.json: the pond is `scale` times larger beside the characters)
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


def homography(z):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    return cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]


def plan(pts, z):
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), homography(z)).reshape(-1, 2)


f = cv2.imread('art/pond_cross/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
v = f.max(2)
hud = np.arange(1920)[None, :] > 230
rock = hud & (h[..., 0] >= 105) & (h[..., 0] <= 135) & (h[..., 1] >= 25) & (h[..., 2] >= 140)
top = rock & (v >= 210)
# the side: lavender down to its dark base (the foot of a rock darkens to V ~110-140 in its shadow: an earlier cut at V 140 stopped the
# count there and measured every rock too low)
lav = hud & (h[..., 0] >= 100) & (h[..., 0] <= 145) & (h[..., 1] >= 20) & (v >= 95)
side = lav & (v < 210)
tops = cv2.morphologyEx(top.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(tops)
blocks = []
for i in range(1, n):
    if st[i, 4] < 800: continue
    m = (lab == i).astype(np.uint8)
    c = max(cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
    # side px: below the top's lower edge, column by column, the run of side-face pixels
    runs = []
    ys, xs = np.nonzero(m)
    for x in range(xs.min() + 2, xs.max() - 1, 2):
        col = ys[xs == x]
        if len(col) == 0: continue
        y = col.max() + 1
        # (under the flat top, the chamfer is still pale for a few pixels: skip that band, then count the side down to its dark foot)
        lead = 0
        while lead < 16 and y + lead < 1080 and lav[y + lead, x] and v[y + lead, x] >= 210: lead += 1
        k = 0
        while y + lead + k < 1080 and side[y + lead + k, x]: k += 1
        runs.append(lead + k)
    px = float(np.median(runs)) if runs else 0.0
    cx, cy = cen[i]
    (X, Y), = plan([[cx, cy]], 0.0)
    dy = ref(X, Y, 1.0)[1] - ref(X, Y, 0.0)[1]            # pixels a plan unit of height moves a point (negative: up)
    height = round(abs(px / dy), 2) if dy else 0.0
    poly = cv2.approxPolyDP(c, 2.0, True).reshape(-1, 2)
    foot = plan(poly, height)
    # a boulder's top is a convex few-sided facet (the HQ's are octagons): its outline cleaned to the hull in a few straight sides, so
    # the tracing's wobble does not show as creases in the model
    hull = cv2.convexHull(c)
    clean = plan(cv2.approxPolyDP(hull, 3.0, True).reshape(-1, 2), height)
    blocks.append(dict(_c=c, _poly=poly, height=height, side_px=px, area_px=int(st[i, 4]), centre_px=[round(float(cx)), round(float(cy))],
                       top=[[round(float(a), 2), round(float(b), 2)] for a, b in foot],
                       clean=[[round(float(a), 2), round(float(b), 2)] for a, b in clean]))
# slab or boulder: a run of the ring is long and thin (6+ units, 2.2x as long as wide); a boulder is chunky. The ring's slabs stand one
# height (the median of the slabs measured: where a neighbour hides a slab's side its own measure is short, so the median, not
# the mean; an earlier cut at 2.0 threw away the south wall's 2.7-3.4 and made the ring too low); a boulder
# keeps its own, but never under 1.1x the slab's (the HQ's boulders stand over the wall; one a neighbour hides is not shorter).
for b in blocks:
    pts = np.float32(b['top'])
    (rx, ry), (rw, rh), ra = cv2.minAreaRect(pts)
    fill = cv2.contourArea(pts) / max(rw * rh, 1e-6)
    if rw < rh: rw, rh, ra = rh, rw, ra + 90                 # (the long side first)
    b['rect'] = [round(float(rx), 2), round(float(ry), 2), round(float(rw), 2), round(float(rh), 2), round(float(ra), 2)]
    b['size'] = [round(float(rw), 1), round(float(rh), 1)]
    b['kind'] = 'slab' if max(rw, rh) >= 6.0 and max(rw, rh) / max(min(rw, rh), 1e-6) >= 2.2 else 'boulder'
# the thin slivers (under 1.2 units wide) are the banks' lavender rim, which the banks carry (ground.py), not blocks
blocks = [b for b in blocks if min(b['size']) >= 1.2 and b['area_px'] >= 1500]
raw = sorted((b['kind'][0], b['height']) for b in blocks)
print('raw heights (before the policy):', ' '.join('%s%.1f' % x for x in raw))
slab_h = float(np.median([b['height'] for b in blocks if b['kind'] == 'slab' and 0.8 <= b['height'] <= 4.0] or [1.6]))
for b in blocks:
    b['height'] = round(slab_h if b['kind'] == 'slab' else min(max(b['height'], 1.1 * slab_h), 3.0), 2)   # (a boulder stands over the slabs: 1.1x at least)
blocks.sort(key=lambda b: (b['centre_px'][1], b['centre_px'][0]))
# calibration (compare.py --fit): each block's height fitted so its silhouette matches the HQ's rock mask; it overrides the policy above
import os
if os.path.exists('art/pond_cross/heights.json'):
    fitted = json.load(open('art/pond_cross/heights.json'))
    for i, b in enumerate(blocks):
        if str(i) in fitted: b['height'] = fitted[str(i)]
# the footprints again, at the heights now decided: a top seen at a pixel stands over a different spot of the ground at each height,
# so a footprint taken at the first measure and a body built at the final height would sit apart (the rocks were drawn shifted)
for b in blocks:
    hgt = b['height']
    b['top'] = [[round(float(x), 2), round(float(y), 2)] for x, y in plan(b['_poly'], hgt)]
    hull = cv2.convexHull(b['_c'])
    nonconvex = cv2.contourArea(hull) > 1.25 * cv2.contourArea(b['_c'])
    keep = b['kind'] == 'boulder' and not nonconvex and max(b['size']) <= 8
    # a boulder's top is a convex few-sided facet (the HQ's are octagons): the hull in a few straight sides, so the tracing's wobble
    # does not show as creases; an L-shaped run (a corner of the wall) keeps its own outline
    src = cv2.approxPolyDP(hull, 3.0, True).reshape(-1, 2) if keep else b['_poly']
    b['clean'] = [[round(float(x), 2), round(float(y), 2)] for x, y in plan(src, hgt)]
    (rx, ry), (rw, rh), ra = cv2.minAreaRect(np.float32(b['top']))
    if rw < rh: rw, rh, ra = rh, rw, ra + 90
    b['rect'] = [round(float(rx), 2), round(float(ry), 2), round(float(rw), 2), round(float(rh), 2), round(float(ra), 2)]
    b['size'] = [round(float(rw), 1), round(float(rh), 1)]
    del b['_c'], b['_poly']
blocks.sort(key=lambda b: (b['centre_px'][1], b['centre_px'][0]))
json.dump(blocks, open('art/pond_cross/stones.json', 'w'))
hs = np.array([b['height'] for b in blocks])
print(len(blocks), 'blocks:', sum(b['kind'] == 'slab' for b in blocks), 'slabs at', slab_h, ',', sum(b['kind'] == 'boulder' for b in blocks), 'boulders')
print(' '.join('%d%s%.1f(%.0fx%.0f)' % (i, b['kind'][0], b['height'], *b['size']) for i, b in enumerate(blocks)))
