"""The long wall along the east island's north-east side (HQ 1:12, top right): measured, not traced as a blob.

Its top face is the pale lavender band (V >= 225, hue of the stone) running from the frame's top edge down to the raised grass block; its height is
the front face's span in the columns where nothing stands in front of it (x 1320-1370: 185 -> 250 px; below it to ~316 is water lit by the beams, a channel between the wall and the island (the gate stands before the wall)). The footprint is the top face unprojected
at that height, so the wall is a vertical prism standing on it. Writes ne_wall.json (plan units) for build.py.

  python art/bridge_islands/ne_wall.py
"""
import json, sys
import numpy as np, cv2
import math
CAM = json.load(open('art/sky_islands/camera.json')); _SC = json.load(open('art/bridge_islands/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):       # (stones.py's: plan -> reference pixels)
    v = R @ (np.array([X, Y, z]) / 100 - C)
    return 960 + (F * v[0] / v[2]) * Z, 540 + (F * v[1] / v[2]) * Z


def plan(pts, z):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    Hm = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hm).reshape(-1, 2)

f = cv2.imread('art/bridge_islands/output/reference.png'); x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
top = ((x[..., 0] >= 104) & (x[..., 0] <= 122) & (x[..., 2] >= 225) & (x[..., 1] >= 40) & (x[..., 1] <= 110)).astype(np.uint8)
roi = np.zeros_like(top); cv2.fillPoly(roi, [np.int32([(1100, 0), (1290, 0), (1530, 220), (1500, 300), (1460, 300), (1100, 60)])], 1)
m = cv2.morphologyEx(top & roi, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=cv2.contourArea)
rect = cv2.minAreaRect(c); box = cv2.boxPoints(rect)          # (a long thin parallelogram on screen: its min-area rectangle is close enough)
# height: the front face spans 185 -> 250 px; below it to ~316 is water lit by the beams, a channel between the wall and the island (the gate stands before the wall) at x 1350; find H with ref(top) - ref(foot) = 115 px there
FRONT_TOP, FRONT_FOOT, COL = 185, 250, 1350
best = None
for H in np.arange(0.5, 10.0, 0.05):
    p = plan([(COL, FRONT_TOP)], H)[0]
    dy = ref(p[0], p[1], 0.0)[1] - ref(p[0], p[1], H)[1]
    if best is None or abs(dy - (FRONT_FOOT - FRONT_TOP)) < best[0]: best = (abs(dy - (FRONT_FOOT - FRONT_TOP)), H)
H = round(float(best[1]), 2)
fp = plan(box, H)
# the wall runs on out of the frame to the north-west: lengthen it 8 units that way so its end is never seen
# the corners run SE end (0, 3) to NW end (1, 2): the NW end is lengthened 4 units (the HQ's wall runs on past the frame's top edge, x ~1000)
u = (fp[1] - fp[0]) / np.linalg.norm(fp[1] - fp[0]); fp[1] += u * 4.0; fp[2] += u * 4.0
print('top face box px', np.round(box).tolist(), 'height', H, 'footprint', np.round(fp, 2).tolist())
json.dump(dict(height=H, footprint=np.round(fp, 2).tolist(), box_px=np.round(box).tolist()), open('art/bridge_islands/ne_wall.json', 'w'))
