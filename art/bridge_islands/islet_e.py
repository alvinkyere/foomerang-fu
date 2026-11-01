"""The east islet (HQ 1:12, right): a tall round rock with grass on top, its red tree standing up there, two lower blocks before it. Fitted, not traced:
an octagonal pillar (plan centre, radius, height) whose silhouette (top at its height, foot at the water's) best covers the HQ's rock and grass
there, the pixels the canopy hides not counted. Writes islet_e.json (plan units) for layout.py / build.py.

  python art/bridge_islands/islet_e.py
"""
import json, math
import numpy as np, cv2
from scipy.optimize import minimize

CAM = json.load(open('art/sky_islands/camera.json')); _SC = json.load(open('art/bridge_islands/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])
WATER_Z = json.load(open('art/bridge_islands/layout.json'))['water_z']


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    return 960 + (F * v[0] / v[2]) * Z, 540 + (F * v[1] / v[2]) * Z


f = cv2.imread('art/bridge_islands/output/reference.png'); x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H_, S_, V_ = x[..., 0], x[..., 1], x[..., 2]
rock = (((H_ >= 104) & (H_ <= 128) & (S_ >= 40) & (V_ >= 120)) | ((H_ >= 25) & (H_ <= 55) & (S_ > 50) & (V_ > 180)))
red = ((H_ <= 12) | (H_ >= 170)) & (S_ > 90) & (V_ > 150)
import sys
NAME = sys.argv[1] if len(sys.argv) > 1 else 'e'
# per islet: its box in the frame, its sides, a start (plan centre), and the rows hidden by something in front (the bunting's)
CFG = {'e': dict(box=(1640, 300, 1920, 600), sides=8, start=None, skip_top=40),
       'nw': dict(box=(470, 230, 680, 440), sides=6, start=(-14.7, 82.8), skip_top=0)}[NAME]
box = CFG['box']
want = rock[box[1]:box[3], box[0]:box[2]]; hide = cv2.dilate(red.astype(np.uint8), np.ones((5, 5), np.uint8))[box[1]:box[3], box[0]:box[2]] > 0
care = ~hide
care[:CFG['skip_top'], :] = False


def octagon(cx, cy, r):
    n = CFG['sides']
    return [(cx + r * math.cos(math.pi / n + i * 2 * math.pi / n), cy + r * math.sin(math.pi / n + i * 2 * math.pi / n)) for i in range(n)]


def silhouette(p):
    cx, cy, r, h = p
    pts = [ref(X, Y, h) for X, Y in octagon(cx, cy, r)] + [ref(X, Y, WATER_Z) for X, Y in octagon(cx, cy, r)]
    m = np.zeros((1080, 1920), np.uint8); cv2.fillPoly(m, [cv2.convexHull(np.int32(pts))], 1)
    return m[box[1]:box[3], box[0]:box[2]] > 0


def cost(p):
    s = silhouette(p)
    inter = (s & want & care).sum(); uni = ((s | want) & care).sum()
    return 1 - inter / max(uni, 1)


S = json.load(open('art/bridge_islands/stones.json'))
c0 = CFG['start'] or S[7]['rect'][:2]
best = None
for h0 in (1.0, 2.0, 3.0, 5.0):
    for r0 in (2.0, 3.0, 4.0):
        r_ = minimize(cost, [c0[0], c0[1], r0, h0], method='Nelder-Mead', options=dict(xatol=0.02, fatol=1e-4, maxiter=600))
        if best is None or r_.fun < best.fun: best = r_
cx, cy, r, h = best.x
print('islet_%s: centre (%.2f, %.2f) radius %.2f height %.2f, IoU %.3f' % (NAME, cx, cy, r, h, 1 - best.fun))
json.dump(dict(centre=[round(cx, 2), round(cy, 2)], radius=round(r, 2), height=round(h, 2), sides=CFG['sides'], iou=round(1 - best.fun, 3)),
          open('art/bridge_islands/islet_%s.json' % NAME, 'w'))
