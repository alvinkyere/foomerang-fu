"""The lily island (2026-10-30): foomerang-fu physics hq.mp4 10:37 (output/reference.png, 637.0 s: local only, not committed), measured
through the plaza's camera rig (art/sky_islands/camera.json) at this view's zoom (scale.json): a lime island of grass with a lavender lip,
set 45 degrees in the plan, stone slabs and boulders on and about it, two orange trees, bamboo, four crates, lily pads on the water.
Colour masks of reference.png, outlines unprojected onto the ground (z 0) in plan units; writes layout.json. The props' places are
read off the frame (pixel centres below) and unprojected the same way.

  python art/lily_island/layout.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/lily_island/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
H = cv2.findHomography(np.float32([ref(X, Y) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)
r1 = lambda a: [[round(float(x), 2), round(float(y), 2)] for x, y in a]

f = cv2.imread('art/lily_island/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
hud = np.arange(1920)[None, :] > 215
grass = hud & (((h[..., 0] > 25) & (h[..., 0] < 55) & (h[..., 1] > 50) & (h[..., 2] > 190)) | ((h[..., 0] >= 55) & (h[..., 0] <= 95) & (h[..., 1] > 30) & (h[..., 1] < 95) & (h[..., 2] >= 228)))   # (the light shaft tints the grass cyan: paler and less saturated than the water)
rock = hud & (h[..., 0] >= 104) & (h[..., 0] <= 125) & (h[..., 1] >= 55) & (h[..., 2] >= 140)
k = lambda n: np.ones((n, n), np.uint8)
clean = lambda m, n=7: cv2.morphologyEx(cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k(n)), cv2.MORPH_OPEN, k(n))
cs, _ = cv2.findContours(clean(grass, 11), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
banks = [plan(cv2.approxPolyDP(c, 1.5, True).reshape(-1, 2)) for c in cs if cv2.contourArea(c) > 20000]

# props, read off the frame (pixel centres at the foot of each): [x, y] in the 1920x1080 reference
PX = dict(
    crates=[(640, 385), (668, 415), (1313, 575), (665, 898)],
    bamboo=[(762, 215), (845, 245), (880, 225), (913, 232), (1050, 752), (1102, 742), (870, 985), (925, 965)],
    pads=[(640, 258), (497, 303), (50, 700), (1617, 580), (1280, 18)],
    trees=[(375, 440), (1435, 205)],
)
at = lambda pts: r1(plan(pts))
out = dict(zoom=Z, banks=[r1(b) for b in banks], crates=at(PX['crates']), bamboo=at(PX['bamboo']), pads=at(PX['pads']), trees=at(PX['trees']))
json.dump(out, open('art/lily_island/layout.json', 'w'))
allp = np.concatenate(banks)
print('banks', [len(b) for b in banks], 'bounds', allp.min(0).round(1), allp.max(0).round(1))
