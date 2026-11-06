"""The hex meadow (2026-11-06): ff physics hq 2.mp4 20:02 (1202.0 s, the READY frame, camera still; output/reference.png, local only).
Slice 1: the frame read through the plaza's camera rig (art/sky_islands/camera.json) at the plaza's zoom, the dashed border and the
props' places unprojected onto the ground (z 0) in plan units, relative to the ground point under the frame's centre.

  python art/hex_meadow/measure.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
Z = CAM['referenceZoom']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


Yc = next(y for y in np.linspace(0, 400, 40001) if ref(0, y)[1] <= 540)   # the ground point under the frame's centre
g = [(X, Yc + dY) for X in np.linspace(-60, 60, 7) for dY in np.linspace(-60, 60, 7)]
H = cv2.findHomography(np.float32([ref(X, Y) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2) - [0, Yc]

def plan_at(pts, z):
    """Pixels -> plan units for points that stand `z` above the ground (a log's top edge, a cylinder's silhouette)."""
    Hz = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hz).reshape(-1, 2) - [0, Yc]


LOG_R = 0.65       # a log's radius in plan units (its silhouette is read at its axis' height)

if __name__ == '__main__':
    # the dashed border's four corners, read off the frame (pixels)
    B = [(388, 148), (1726, 148), (1856, 1052), (203, 1052)]
    P = plan(B)
    print('border corners (plan units, x east, y north):'); [print(' ', np.round(p, 2)) for p in P]
    e = [P[(i + 1) % 4] - P[i] for i in range(4)]
    print('sides', [round(float(np.hypot(*v)), 2) for v in e])
    ang = lambda a, b: math.degrees(math.acos(np.dot(a, b) / np.hypot(*a) / np.hypot(*b)))
    print('corner angles', [round(ang(-e[i - 1], e[i]), 1) for i in range(4)])
