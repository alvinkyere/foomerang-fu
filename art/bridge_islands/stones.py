"""The cross pond's stone, block by block (2026-10-28): the ring of slabs and the boulders of foomerang-fu physics hq.mp4 4:27.

The first build took all the lavender as one flat region at ground level. It is a ring of separate blocks, each a tall
chamfered prism: a pale top, a darker side toward the camera, and a height of its own. For each block: its top face
(the pale region, one component each), the height from how many pixels of side show under it, and its footprint, which is
the top polygon unprojected at that height. Writes stones.json (plan units, as layout.json).

  python art/bridge_islands/stones.py       (from the repository root; the Python of art/audio/output/venv, see docs/AGENT_PLAYBOOK.md)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/bridge_islands/scale.json'))
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


f = cv2.imread('art/bridge_islands/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
v = f.max(2)
hud = np.arange(1920)[None, :] > 215
rock = hud & (h[..., 0] >= 98) & (h[..., 0] <= 135) & (h[..., 1] >= 25) & (h[..., 2] >= 140)
rock[300:400, 1255:1470] = False       # (the power icons over a player, in this frame)
top = rock & (v >= 180)
# the side: lavender down to its dark base (the foot of a rock darkens to V ~110-140 in its shadow: an earlier cut at V 140 stopped the
# count there and measured every rock too low)
lav = hud & (h[..., 0] >= 100) & (h[..., 0] <= 145) & (h[..., 1] >= 20) & (v >= 95)
side = lav & (v < 180)
# The blocks' tops, read off the frame (pixel polygons of each pale top face) with the pixels of side that show under it: the lavender
# here is one colour with the island's lip, so a colour cut cannot separate the blocks (tried 2026-10-30: it merged them with the lip).
HAND = [
    ([(495, 95), (535, 80), (560, 100), (560, 150), (520, 180), (495, 150)], 40, 'boulder'),                       # 0 NW islet's block
    ([(1020, 140), (1075, 125), (1090, 150), (1085, 180), (1040, 190), (1020, 170)], 30, 'boulder'),               # 1
    ([(1300, 335), (1360, 320), (1370, 350), (1340, 390), (1300, 385)], 30, 'boulder'),                            # 2
    ([(620, 520), (850, 300), (905, 320), (910, 345), (700, 570), (640, 555)], 40, 'slab'),                        # 3 the bridge's NW wall
    ([(880, 740), (1090, 570), (1100, 590), (930, 770), (880, 750)], 40, 'slab'),                                  # 4 the bridge's SE wall
    ([(315, 570), (380, 545), (415, 570), (415, 620), (360, 650), (320, 630)], 50, 'boulder'),                     # 5 W block
    ([(550, 525), (610, 510), (635, 540), (625, 580), (570, 590), (545, 560)], 40, 'boulder'),                      # 6 lever block
    ([(665, 800), (740, 790), (775, 815), (760, 850), (690, 850)], 35, 'boulder'),                                 # 7
    ([(835, 770), (900, 765), (915, 800), (900, 830), (860, 825)], 35, 'boulder'),                                 # 8 lever block
    ([(1230, 800), (1270, 785), (1295, 810), (1290, 880), (1250, 895), (1230, 860)], 80, 'boulder'),               # 9 the tall block in the water
    ([(1095, 545), (1140, 530), (1165, 560), (1150, 590), (1105, 590)], 40, 'boulder'),                            # 10
    ([(1100, 20), (1250, 30), (1640, 300), (1600, 350), (1460, 310), (1120, 110)], 80, 'slab'),                    # 11 the long back wall
    ([(1590, 90), (1640, 80), (1670, 110), (1660, 160), (1610, 170)], 40, 'boulder'),                              # 12
    ([(1670, 430), (1760, 400), (1850, 450), (1850, 520), (1760, 545), (1690, 510)], 90, 'boulder'),               # 13 the east islet's block
    ([(1500, 250), (1570, 240), (1610, 280), (1590, 330), (1520, 340)], 40, 'boulder'),                            # 14
]
blocks = []
for poly_px, px, kind in HAND:
    c = np.int32(poly_px).reshape(-1, 1, 2)
    cx, cy = (float(t) for t in np.mean(poly_px, 0))
    (X, Y), = plan([[cx, cy]], 0.0)
    dy = ref(X, Y, 1.0)[1] - ref(X, Y, 0.0)[1]            # pixels a plan unit of height moves a point (negative: up)
    height = round(abs(px / dy), 2) if dy else 0.0
    if kind == 'slab':
        # (the polygon read off the frame is a slab's whole silhouette, top and visible side: its top face is that, drawn in on itself and
        # lifted by about half the side showing)
        pts = np.float32(poly_px); mid = pts.mean(0)
        poly_px = [(float(mid[0] + 0.86 * (x - mid[0])), float(mid[1] + 0.86 * (y - mid[1]) - 0.3 * px)) for x, y in pts]
    poly = np.int32(poly_px)
    blocks.append(dict(_kind=kind, _c=c, _poly=poly, height=height, side_px=px, area_px=int(cv2.contourArea(c)), centre_px=[round(cx), round(cy)],
                       top=[[round(float(a), 2), round(float(b), 2)] for a, b in plan(poly, height)],
                       clean=[[round(float(a), 2), round(float(b), 2)] for a, b in plan(poly, height)]))
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
    b['kind'] = b.pop('_kind')
# the thin slivers (under 1.2 units wide) are the banks' lavender rim, which the banks carry (ground.py), not blocks
blocks = [b for b in blocks if min(b['size']) >= 1.2 and b['area_px'] >= 1500]
# the frame's lavender that is not a block: the island's lip along its south edge (the banks carry it)
DROP = json.load(open('art/bridge_islands/drop.json')) if __import__('os').path.exists('art/bridge_islands/drop.json') else []
blocks = [b for b in blocks if not any(abs(b['centre_px'][0] - x) < 40 and abs(b['centre_px'][1] - y) < 40 for x, y in DROP)]
raw = sorted((b['kind'][0], b['height']) for b in blocks)
print('raw heights (before the policy):', ' '.join('%s%.1f' % x for x in raw))
slab_h = float(np.median([b['height'] for b in blocks if b['kind'] == 'slab' and 0.8 <= b['height'] <= 4.0] or [1.6]))
for b in blocks:
    b['height'] = round(slab_h if b['kind'] == 'slab' else min(max(b['height'], 1.1 * slab_h), 3.0), 2)   # (a boulder stands over the slabs: 1.1x at least)
blocks.sort(key=lambda b: (b['centre_px'][1], b['centre_px'][0]))
# calibration (compare.py --fit): each block's height fitted so its silhouette matches the HQ's rock mask; it overrides the policy above
import os
if os.path.exists('art/bridge_islands/heights.json'):
    fitted = json.load(open('art/bridge_islands/heights.json'))
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
    b['px'] = b['_poly'].reshape(-1, 2).tolist()      # (the outline as the frame shows it: fit_stones.py re-reads it at each height it tries)
    del b['_c'], b['_poly']
blocks.sort(key=lambda b: (b['centre_px'][1], b['centre_px'][0]))
# the HQ fit (fit_stones.py): height, footprint size and place, so each block's silhouette covers the HQ's
if os.path.exists('art/bridge_islands/stonefit.json'):
    sf = json.load(open('art/bridge_islands/stonefit.json'))
    for i, b in enumerate(blocks):
        f = sf.get(str(i))
        if f is None: continue
        # the footprint is the outline in the frame read at the fitted height (a top seen at a pixel stands over another spot at each height)
        b['height'] = f['h']
        px = np.float32(b['px'])
        for key, src in (('top', px), ('clean', px)):
            pts = plan(src, f['h']); c0 = pts.mean(0)
            b[key] = [[round(float(x), 2), round(float(y), 2)] for x, y in c0 + f['s'] * (pts - c0) + np.float32([f['dx'], f['dy']])]
        (rx, ry), (rw, rh), ra = cv2.minAreaRect(np.float32(b['top']))
        if rw < rh: rw, rh, ra = rh, rw, ra + 90
        b['rect'] = [round(float(rx), 2), round(float(ry), 2), round(float(rw), 2), round(float(rh), 2), round(float(ra), 2)]
        b['size'] = [round(float(rw), 1), round(float(rh), 1)]
json.dump(blocks, open('art/bridge_islands/stones.json', 'w'))
hs = np.array([b['height'] for b in blocks])
print(len(blocks), 'blocks:', sum(b['kind'] == 'slab' for b in blocks), 'slabs at', slab_h, ',', sum(b['kind'] == 'boulder' for b in blocks), 'boulders')
print(' '.join('%d%s%.1f(%.0fx%.0f)' % (i, b['kind'][0], b['height'], *b['size']) for i, b in enumerate(blocks)))
