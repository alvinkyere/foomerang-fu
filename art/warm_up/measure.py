"""The warm-up (2026-11-12): foomerang-fu physics hq.mp4 0:00 (the READY frame of the warm-up round: the camera still to 0.6 s), read
through the plaza's camera rig (art/sky_islands/camera.json) at the plaza's zoom (zoom.json: the levers' knobs and the banana measure
as in the lily island's frame), relative to the ground point under the frame's centre.

The round's camera follows the players (0.6-28 s), so mosaic.py lays its frames onto this one (output/mosaic.png, local only); mosaic
pixels are this frame's shifted by MOSAIC_ORIGIN. Colours: the frame as Chrome shows it (output/chrome_0.png; colour.json converts
OpenCV's decode, the mosaic's).

  python art/warm_up/measure.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
Z = CAM['referenceZoom']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])
MOSAIC_ORIGIN = (-120, -80)       # the mosaic's (0, 0) in this frame's pixels
REF_TIME = 0.0


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


Yc = next(y for y in np.linspace(0, 400, 40001) if ref(0, y)[1] <= 540)   # the ground point under the frame's centre
g = [(X, Yc + dY) for X in np.linspace(-80, 80, 9) for dY in np.linspace(-70, 70, 9)]
H = cv2.findHomography(np.float32([ref(X, Y) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2) - [0, Yc]


def plan_at(pts, z):
    """Pixels -> plan units for points that stand `z` above the ground."""
    Hz = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hz).reshape(-1, 2) - [0, Yc]


def mosaic(pts):
    """Mosaic pixels -> this frame's pixels."""
    return [(x + MOSAIC_ORIGIN[0], y + MOSAIC_ORIGIN[1]) for x, y in pts]


def pix(X, Y, z=0.0):
    """Plan units (y relative to Yc) -> this frame's pixels."""
    return ref(X, Yc + Y, z)
