"""The grass painted by numbers (2026-11-05): the HQ's grass is flat lime with drawn shapes on it (pale patches, the shadows the plants cast,
the pale stripe round each island's edge). Its grass pixels are grouped into K tones (k-means in Lab, after a small median filter), each
group's regions traced as outlines, unprojected onto the ground plane, and built as our own flat shapes in the region's own measured colour
(blender/build.py GRASS_PAINT). The commonest tone is the lime under everything and is not drawn.

  python art/bridge_islands/grass_paint.py
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/bridge_islands')
from mapcmp import mask

K = 7
CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])
ref = lambda X, Y, z: (lambda v: (960 + (F * v[0] / v[2]) * Z, 540 + (F * v[1] / v[2]) * Z))(R @ (np.array([X, Y, z]) / 100 - C))
g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
Hm = cv2.findHomography(np.float32([ref(X, Y, 0.0) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hm).reshape(-1, 2)

f = cv2.medianBlur(cv2.imread('art/bridge_islands/output/reference.png'), 5)
x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
grass = (x[..., 0] >= 25) & (x[..., 0] <= 55) & (x[..., 1] > 50) & (x[..., 2] > 150) & mask()
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
pts = lab[grass]
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2)
_, lbl, cen = cv2.kmeans(pts, K, None, crit, 4, cv2.KMEANS_PP_CENTERS)
lbl = lbl.ravel(); base = np.bincount(lbl).argmax()
labels = np.full(grass.shape, -1, int); labels[grass] = lbl
rgb = f.astype(int)[..., ::-1]
shapes = []
for k in range(K):
    m = cv2.morphologyEx((labels == k).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        if cv2.contourArea(c) < 40: continue
        if k == base and cv2.contourArea(c) > 30000: continue      # (the lime itself is the ground's; only its small patches inside other tones are drawn)
        one = np.zeros(m.shape, np.uint8); cv2.drawContours(one, [c], -1, 1, -1)
        col = '#%02x%02x%02x' % tuple(np.median(rgb[(one > 0) & (labels == k)], 0).astype(int))
        poly = cv2.approxPolyDP(c, 1.0, True).reshape(-1, 2) + np.array([-1, -6])      # (the game draws the ground plane ~6 px lower than this camera model: measured, 2026-11-05)
        if len(poly) < 3: continue
        shapes.append(dict(plan=[[round(float(a), 3), round(float(b), 3)] for a, b in plan(poly)], colour=col, area=float(cv2.contourArea(c))))
shapes.sort(key=lambda s: -s['area'])           # (big ones first: the small ones on top)
print(K, 'tones; base', '#%02x%02x%02x' % tuple(np.median(rgb[labels == base], 0).astype(int)), ';', len(shapes), 'shapes')
json.dump(dict(shapes=shapes), open('art/bridge_islands/grass_paint.json', 'w'))
