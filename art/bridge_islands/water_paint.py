"""The water by the shores painted by numbers (2026-11-05), as grass_paint.py does the grass: the HQ's water within BAND px of land (outside
the light beams, which are added over everything there) is grouped into K tones, each region traced, unprojected onto the water's plane and
built as our own flat shapes in its measured colour (blender/build.py WATER_PAINT), over the shader's own edge look.

  python art/bridge_islands/water_paint.py
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/bridge_islands')
from mapcmp import mask

K, BAND = 6, 40
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
region = (water > 0) & near & ~beyond & mask()
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
print(len(shapes), 'shapes over', int(region.sum()), 'px')
json.dump(dict(z=WZ, shapes=shapes), open('art/bridge_islands/water_paint.json', 'w'))
