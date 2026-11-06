"""The water by the shores painted by numbers (2026-11-05), as grass_paint.py does the grass: the HQ's water within BAND px of land (outside
the light beams, which are added over everything there) is grouped into K tones, each region traced, unprojected onto the water's plane and
built as our own flat shapes in its measured colour (blender/build.py WATER_PAINT), over the shader's own edge look.

  python art/bridge_islands/water_paint.py
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/bridge_islands')
from mapcmp import mask

K, BAND = 7, 80
L = json.load(open('art/bridge_islands/layout.json')); WZ = L['water_z']
CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])
ref = lambda X, Y, z: (lambda v: (960 + (F * v[0] / v[2]) * Z, 540 + (F * v[1] / v[2]) * Z))(R @ (np.array([X, Y, z]) / 100 - C))
g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
Hm = cv2.findHomography(np.float32([ref(X, Y, WZ) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hm).reshape(-1, 2)

f = cv2.medianBlur(cv2.imread('art/bridge_islands/output/reference.png'), 5)
x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
water = ((x[..., 0] >= 85) & (x[..., 0] < 110) & (x[..., 1] > 30)).astype(np.uint8)
near = cv2.distanceTransform(water, cv2.DIST_L2, 5) <= BAND
b = json.load(open('art/bridge_islands/beams.json')); ab = np.array(b['above'], float)
Y, X = np.mgrid[0:1080, 0:1920]
beyond = (Y <= np.interp(X, ab[:, 0], ab[:, 1])) & (X > 950)
# under the beams the colour traced is the HQ's less the beams' light (the beams overlay adds it back over our shapes): fit_beams_grid.py's field
sys.argv = ['x', 'art/bridge_islands/output/reference.png']
_src = open('art/bridge_islands/fit_beams_grid.py').read().split('base = g - field(b)')[0]
_ns = {}; exec(_src, _ns)
light = _ns['field'](_ns['b'])[..., None] * np.array(_ns['ADD'])[::-1]       # (BGR)
f = np.clip(f.astype(float) - light, 0, 255).astype(np.uint8)
region = (water > 0) & (near | beyond) & mask()
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2)
_, lbl, _ = cv2.kmeans(lab[region], K, None, crit, 4, cv2.KMEANS_PP_CENTERS)
labels = np.full(region.shape, -1, int); labels[region] = lbl.ravel()
rgb = f.astype(int)[..., ::-1]
shapes = []
for k in range(K):
    m = cv2.morphologyEx((labels == k).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        if cv2.contourArea(c) < 30: continue
        one = np.zeros(m.shape, np.uint8); cv2.drawContours(one, [c], -1, 1, -1)
        col = '#%02x%02x%02x' % tuple(np.median(rgb[(one > 0) & (labels == k)], 0).astype(int))
        poly = cv2.approxPolyDP(c, 1.0, True).reshape(-1, 2) + np.array([0, -6])      # (the game's water plane ~6 px lower than this camera model)
        if len(poly) < 3: continue
        shapes.append(dict(plan=[[round(float(a), 3), round(float(bb), 3)] for a, bb in plan(poly)], colour=col, area=float(cv2.contourArea(c))))
shapes.sort(key=lambda s: -s['area'])
# the lily pads and their flowers, traced the same way (the HQ's own pad greens, darker veins, pale petals, the flowers' hearts), over the water
f0 = cv2.medianBlur(cv2.imread('art/bridge_islands/output/reference.png'), 3)
x0 = cv2.cvtColor(f0, cv2.COLOR_BGR2HSV).astype(int)
# the pads: green (hue 40-85, saturated) or the flowers' pale pink/white, in the open water (the pads' own boxes, fit_pads.py), not near land
PJ = json.load(open('art/bridge_islands/pads.json'))
inbox = np.zeros(water.shape, bool)
for pd in PJ['pads']:
    cx, cy = pd['c']; ax = pd['axes'][0] * 1.25 + 8
    inbox[int(max(cy - ax, 0)):int(cy + ax), int(max(cx - ax, 0)):int(cx + ax)] = True
for cx, cy, r in PJ['small']:
    inbox[int(max(cy - r - 6, 0)):int(cy + r + 6), int(max(cx - r - 6, 0)):int(cx + r + 6)] = True
padm = ((((x0[..., 0] >= 40) & (x0[..., 0] <= 85) & (x0[..., 1] >= 35)) | (x0[..., 1] <= 60) & (x0[..., 2] >= 200)) & inbox & mask())
grassy = np.zeros_like(padm); water_d = padm
n_, lab_, st_, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(padm.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)))
pads = np.zeros(padm.shape, bool)
for i in range(1, n_):
    comp = lab_ == i
    if st_[i, 4] >= 60 and (comp & grassy).sum() < 0.1 * st_[i, 4]: pads |= comp & padm
lab0 = cv2.cvtColor(f0, cv2.COLOR_BGR2LAB).astype(np.float32)
_, lp, _ = cv2.kmeans(lab0[pads], 6, None, crit, 4, cv2.KMEANS_PP_CENTERS)
labp = np.full(pads.shape, -1, int); labp[pads] = lp.ravel(); rgb0 = f0.astype(int)[..., ::-1]
order = sorted(range(6), key=lambda k: -(labp == k).sum())       # (the commonest tone, the pad's body, under the rest)
pad_shapes = []
for k in order:
    m = cv2.morphologyEx((labp == k).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        if cv2.contourArea(c) < 6: continue
        one = np.zeros(m.shape, np.uint8); cv2.drawContours(one, [c], -1, 1, -1)
        col = '#%02x%02x%02x' % tuple(np.median(rgb0[(one > 0) & (labp == k)], 0).astype(int))
        poly = cv2.approxPolyDP(c, 0.7, True).reshape(-1, 2) + np.array([0, -6])
        if len(poly) < 3: continue
        pad_shapes.append(dict(plan=[[round(float(a), 3), round(float(bb), 3)] for a, bb in plan(poly)], colour=col))
print(len(shapes), 'shapes over', int(region.sum()), 'px;', len(pad_shapes), 'pad shapes over', int(pads.sum()), 'px')
cv2.imwrite('art/bridge_islands/output/pads_mask.png', pads.astype(np.uint8) * 255)
json.dump(dict(z=WZ, shapes=shapes, pads=pad_shapes), open('art/bridge_islands/water_paint.json', 'w'))
