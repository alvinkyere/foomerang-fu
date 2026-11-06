"""The foam where the HQ draws it (2026-11-05): the procedural ribbons fell where the HQ has none, so the HQ frame's foam is traced as outlines
(the pale strokes on the water: whitish blue, brighter than the water round them), unprojected onto the water's plane, and built as our own flat
shapes (blender/build.py FOAM_TRACED), each in its own measured colour. The water shader's ribbons are then switched off for this map.

  python art/bridge_islands/foam.py
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/bridge_islands')
from mapcmp import mask

L = json.load(open('art/bridge_islands/layout.json')); WZ = L['water_z']
CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])
ref = lambda X, Y, z: (lambda v: (960 + (F * v[0] / v[2]) * Z, 540 + (F * v[1] / v[2]) * Z))(R @ (np.array([X, Y, z]) / 100 - C))
g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
Hm = cv2.findHomography(np.float32([ref(X, Y, WZ) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hm).reshape(-1, 2)

f = cv2.imread('art/bridge_islands/output/reference.png'); rgb = f.astype(int)[..., ::-1]
Rr, Gg, Bb = rgb[..., 0], rgb[..., 1], rgb[..., 2]
water = cv2.medianBlur(f, 21).astype(int)[..., ::-1]                   # (the water round each pixel, without its thin strokes)
lift = rgb.sum(2) - water.sum(2)
foam = (Bb > 215) & (Gg > 190) & (Rr > 140) & (Rr < 215) & (Bb - Rr > 25) & (lift > 45) & mask()
x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
nearwater = cv2.dilate(((x[..., 0] >= 85) & (x[..., 0] < 110) & (x[..., 1] > 30)).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
foam &= nearwater
foam = cv2.morphologyEx(foam.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
cs, _ = cv2.findContours(foam, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
out = []
for c in cs:
    if cv2.contourArea(c) < 12: continue
    poly = cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2)
    if len(poly) < 3: continue
    one = np.zeros(foam.shape, np.uint8); cv2.drawContours(one, [c], -1, 1, -1)
    col = '#%02x%02x%02x' % tuple(np.median(rgb[one > 0], 0).astype(int))
    poly = poly + np.array([0, -6])      # (the game draws the water plane ~6 px lower than this model of its camera: measured on a shot, 2026-11-05)
    out.append(dict(plan=[[round(float(a), 3), round(float(b), 3)] for a, b in plan(poly)], colour=col))
print(len(out), 'foam shapes,', int(foam.sum()), 'px (%.2f%% of the frame)' % (100 * foam.mean()))
json.dump(dict(z=WZ, shapes=out), open('art/bridge_islands/foam.json', 'w'))
cv2.imwrite('art/bridge_islands/output/foam_mask.png', foam * 255)
