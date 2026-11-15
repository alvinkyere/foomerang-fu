"""The gong court (2026-11-12): foomerang-fu physics hq.mp4 0:35 (35.0 s, the READY frame: the round's widest view, the camera at rest).
The frame read through the plaza's camera rig (art/sky_islands/camera.json, measured on the same video's sky-islands READY frame) at this
round's zoom (zoom.json K). First read as 1.34x the rig's reference zoom (the banana's yellow here against 9:05.7); in the game the
characters then stood ~1.27x too big against the court (2026-11-14, the owner: "the arena is smaller than in the HQ, or the characters
are bigger"): the same characters measured in this frame and in our game at this view (the mug's body 1.29x, its coffee 1.37x, the
banana's height 1.18x; the mug against the HQ's warm-up frame, whose zoom the levers fix, 1.20x), so K = 1.34 / 1.27 = 1.055. Plan units relative to the ground point under the frame's centre.

mosaic.py lays the round onto this frame: mosaic pixels are this frame's pixels shifted by MOSAIC_ORIGIN (output/mosaic.json).
(After art/temple_court/measure.py.)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_ZJ = json.load(open('art/gong_court/zoom.json'))
K = _ZJ['K']                                          # this READY view against the rig's reference zoom (zoom.json)
ZS = _ZJ['K0'] / K                                    # plan units now per plan unit at the first reading (1.34): hand-read sizes scale by it
Z = CAM['referenceZoom'] * K
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])
MOSAIC_ORIGIN = (-185, -111)                          # the mosaic's (0, 0) in this frame's pixels (output/mosaic.json)
REF_TIME = 35.0


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


Yc = next(y for y in np.linspace(0, 400, 40001) if ref(0, y)[1] <= 540)   # the ground point under the frame's centre
g = [(X, Yc + dY) for X in np.linspace(-60, 60, 9) for dY in np.linspace(-50, 50, 9)]


def _H(z):
    return cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]


H0 = _H(0.0)


def plan(pts, z=0.0):
    """This frame's pixels -> plan units (y relative to Yc) for points `z` above the ground."""
    H = H0 if z == 0 else _H(z)
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2) - [0, Yc]


def frame(pts):
    """Mosaic pixels -> this frame's pixels."""
    return [(x + MOSAIC_ORIGIN[0], y + MOSAIC_ORIGIN[1]) for x, y in pts]


def pix(X, Y, z=0.0):
    """Plan units (y relative to Yc) -> this frame's pixels."""
    return ref(X, Yc + Y, z)


def mpix(X, Y, z=0.0):
    """Plan units -> mosaic pixels."""
    x, y = pix(X, Y, z); return x - MOSAIC_ORIGIN[0], y - MOSAIC_ORIGIN[1]


if __name__ == '__main__':
    print('zoom %.4f  Yc %.3f' % (Z, Yc))
    for X, Y in ((0, 0), (10, 0), (0, 10), (0, -10)): print((X, Y), '->', [round(v, 1) for v in pix(X, Y)])
    print('a unit tall at the centre: %.1f px' % (pix(0, 0)[1] - pix(0, 0, 1)[1]))
