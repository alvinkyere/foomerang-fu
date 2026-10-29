"""The cross pond's small things, from the 4:27 frame (2026-10-28): lily pads and their flowers, the leafy tufts at the walls'
feet, the bunting, the bamboo. Positions and sizes in plan units, colours from the frame's own medians. Writes props.json.

  python art/pond_cross/props.py       (from the repository root; after ground.py)
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


def plan(pts, z=0.0):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    H = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)


f = cv2.imread('art/pond_cross/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
v = f.max(2)
hud = np.arange(1920)[None, :] > 230
G = json.load(open('art/pond_cross/ground.json'))['polygons']
on_ground = lambda p: any(cv2.pointPolygonTest(np.float32(g), (float(p[0]), float(p[1])), False) >= 0 for g in G)
hexof = lambda m: '#%02x%02x%02x' % tuple(int(x) for x in np.median(f[m], 0)[::-1])


def blobs(mask, least, most):
    n, lab, st, cen = cv2.connectedComponentsWithStats(cv2.morphologyEx(mask.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)))
    return [(i, st[i], cen[i]) for i in range(1, n) if least <= st[i, 4] <= most]


# lily pads on the water and the bushes on land, one green: told apart by size and by what they lie on
green = hud & (h[..., 0] >= 50) & (h[..., 0] <= 80) & (h[..., 1] >= 70) & (h[..., 2] >= 100) & (h[..., 2] <= 200)
pink = hud & (v >= 215) & (h[..., 1] >= 15) & (h[..., 1] <= 90) & ((h[..., 0] >= 160) | (h[..., 0] <= 8))
pads, dots, tufts = [], [], []
for i, s, c in blobs(green, 40, 20000):
    (X, Y), = plan([c])
    if s[4] <= 2500 and on_ground((X, Y)):                       # a green clump on land, 350-2500 px: a bush at a wall's foot
        if s[4] >= 350:
            tufts.append(dict(at=[round(float(X), 2), round(float(Y), 2)], r=round(float(math.sqrt(s[4] / math.pi) / 17.0), 2)))
        continue
    r = math.sqrt(s[4] / math.pi) / 17.0                          # (~17 px a plan unit on the ground at this zoom)
    ok = s[2] < 160 and s[3] < 160                                # (not a long thin thing: a rim, a leaf's shadow)
    if not ok: continue
    (X, Y), = plan([c], -0.54)                                    # (it floats on the water: build.py's WATER_Z -0.6 + 0.06)
    (pads if s[4] > 1500 else dots).append(dict(at=[round(float(X), 2), round(float(Y), 2)], r=round(float(r), 2)))
red = hud & ((h[..., 0] >= 172) | (h[..., 0] <= 6)) & (h[..., 1] >= 140) & (v >= 150)
# the bunting's two strings (the HQ frame's top edge, read by eye from a 2x crop): each rises from the end of the north wall's gap, up
# and out of the top of the frame. A string starts at the wall's top (its pixel, at the slabs' height) and passes the frame's top edge
# at a pixel; taken as straight, it ends on that pixel's ray at height 6 (it goes on up beyond the frame).
SLAB = json.load(open('art/pond_cross/stones.json'))
wall_h = float(np.median([b['height'] for b in SLAB if b['kind'] == 'slab']))
STRINGS = [((925, 52), (957, 0)), ((1335, 75), (1220, 0))]
strings = []
for (ex, ey), (tx, ty) in STRINGS:
    (a,), (b,) = plan([(ex, ey)], wall_h), plan([(tx, ty)], 6.0)
    strings.append(dict(a=[round(float(a[0]), 2), round(float(a[1]), 2), round(wall_h, 2)], b=[round(float(b[0]), 2), round(float(b[1]), 2), 6.0]))
# bamboo: stalks read by eye from the frame (their bases, pixels), a stalk too thin to segment against the grass
BAMBOO = [(1300, 255), (1330, 245), (1405, 355), (360, 480), (345, 495), (455, 690)]
bamboo = [dict(at=[round(float(a), 2), round(float(b), 2)]) for a, b in plan(BAMBOO)]
colours = dict(pad=hexof(green & (np.arange(1920)[None, :] > 1500)), flower=hexof(pink), flag=hexof(red))
json.dump(dict(pads=pads, dots=dots, tufts=tufts, strings=strings, bamboo=bamboo, colours=colours), open('art/pond_cross/props.json', 'w'))
print('pads', len(pads), 'dots', len(dots), 'tufts', len(tufts), 'strings', strings, 'bamboo', len(bamboo), colours)
