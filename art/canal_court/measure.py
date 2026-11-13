"""The canal court (2026-11-12): foomerang-fu physics hq.mp4 10:55 (654.5 s: the camera at rest over the whole court, before READY), read
through the plaza's camera rig (art/sky_islands/camera.json) at this round's zoom (zoom.json: the characters measure 1.15x their size at
the rig's reference zoom: the banana 28 x 34 px here, 25 x 29 px at 9:05.7), relative to the ground point under the frame's centre.

The round's camera follows the players (657-675 s), so mosaic.py lays its frames onto this one (output/mosaic.png, local only); mosaic
pixels are this frame's shifted by MOSAIC_ORIGIN. Colours: chrome.py converts OpenCV's decode to the video as Chrome shows it (colour.json:
the warm-up's fit, the same video). (After art/warm_up/measure.py.)

  python art/canal_court/measure.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, os
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
Z = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zoom.json')))['zoom']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])
MOSAIC_ORIGIN = (-229, -97)       # the mosaic's (0, 0) in this frame's pixels
REF_TIME = 654.5
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


if __name__ == '__main__':
    print('zoom %.4f  Yc %.3f' % (Z, Yc))
    for X, Y in ((0, 0), (10, 0), (0, 10)): print((X, Y), '->', [round(float(v), 1) for v in pix(X, Y)])
    print('a unit tall at the centre: %.1f px' % (pix(0, 0)[1] - pix(0, 0, 1)[1]))
