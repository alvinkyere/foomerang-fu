"""A line of the mosaic sampled in plan units (for reading edges): python art/temple_court/profile.py X0 Y0 X1 Y1 [n] [z]"""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/temple_court')
from measure import pix, MOSAIC_ORIGIN

M = cv2.imread('art/temple_court/output/mosaic.png')


def sample(X, Y, z=0.0):
    u, v = pix(X, Y, z); x, y = int(round(u - MOSAIC_ORIGIN[0])), int(round(v - MOSAIC_ORIGIN[1]))
    if not (0 <= x < M.shape[1] and 0 <= y < M.shape[0]): return None
    b, g, r = M[y, x]; return '#%02x%02x%02x' % (r, g, b)


if __name__ == '__main__':
    X0, Y0, X1, Y1 = map(float, sys.argv[1:5]); n = int(sys.argv[5]) if len(sys.argv) > 5 else 40; z = float(sys.argv[6]) if len(sys.argv) > 6 else 0
    for t in np.linspace(0, 1, n):
        X, Y = X0 + (X1 - X0) * t, Y0 + (Y1 - Y0) * t; print('%7.2f %7.2f' % (X, Y), sample(X, Y, z))
