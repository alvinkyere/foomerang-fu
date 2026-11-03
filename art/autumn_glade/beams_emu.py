"""The renderer's light beams (render/three/beams.ts beamStrength with a `grid`) applied to an image, so a Blender render can be compared
with the frame as the game will show it: each pixel gains `add` x strength levels (0..255). Also `remove()`, the frame with the beams
taken out (sand.py traces the sand without its shafts: the game adds them back).
"""
import json, math
import numpy as np

B = json.load(open('art/autumn_glade/beams.json'))


def strength(b=B, w=1920, h=1080):
    a = math.radians(b['angle']); ys, xs = np.mgrid[0:h, 0:w].astype(float)
    t = (xs - 960) * math.sin(a) + (ys - 540) * -math.cos(a)
    g = b['grid']; vals = np.array(g['values'], float).reshape(g['rows'], g['cols'])
    c = (t - g['t0']) / g['dt']; r = np.clip((ys - g['y0']) / g['dy'], 0, g['rows'] - 1)
    inside = (c >= 0) & (c <= g['cols'] - 1)
    c = np.clip(c, 0, g['cols'] - 1)
    c0 = np.minimum(np.floor(c).astype(int), g['cols'] - 2); r0 = np.minimum(np.floor(r).astype(int), max(g['rows'] - 2, 0)); r1 = np.minimum(r0 + 1, g['rows'] - 1)
    fc, fr = c - c0, r - r0
    top = vals[r0, c0] * (1 - fc) + vals[r0, c0 + 1] * fc; bot = vals[r1, c0] * (1 - fc) + vals[r1, c0 + 1] * fc
    return np.where(inside, top * (1 - fr) + bot * fr, 0.0)


def apply(img_bgr, sign=1.0):
    s = strength()
    add = np.array(B['add'][::-1], float)               # (BGR)
    return np.clip(img_bgr.astype(float) + sign * s[..., None] * add[None, None, :], 0, 255).astype(np.uint8)


def remove(img_bgr):
    return apply(img_bgr, -1.0)
