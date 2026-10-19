"""environ2 px (1280x720) <-> rules world units, exactly as apps/console/src/render/reconstructed/mapCamera.ts projects."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import json, math, numpy as np, cv2
M = json.load(open('apps/console/public/maps/market_plaza/manifest.json'))['camera']
th = math.radians(M['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])  # yaw = roll = 0
F, P, C, W = M['focalPx'], M['principal'], M['centre'], M['world']
u = W['unitsPerPlanUnit']
def project(x, y, z=0.0):
    v = R @ np.array([x / u + W['planOriginX'] - C[0], W['planOriginY'] - y / u - C[1], z / u - C[2]])
    return ((F * v[0]) / v[2] + P['x']) / 1.5, ((F * v[1]) / v[2] + P['y']) / 1.5   # canvas 1920 -> environ2 1280
grid = [(x, y) for x in (0, 700, 1500, 2209) for y in (0, 500, 1108)]
Hw = cv2.findHomography(np.float32([project(x, y) for x, y in grid]), np.float32(grid))[0]   # ground plane: exact
def to_world(px, py):
    p = cv2.perspectiveTransform(np.float32([[[px, py]]]), Hw)[0][0]
    return float(p[0]), float(p[1])
if __name__ == '__main__':
    for x, y in [(1104.5, 663.5), (271, 500), (1939, 500)]:
        e = project(x, y); print((x, y), '->', [round(v, 1) for v in e], '->', [round(v, 1) for v in to_world(*e)])
