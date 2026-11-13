"""The READY frame (Chrome's) laid flat on the ground (z 0) through measure.py's camera: a plan view, 10 px a plan unit, x east, y north
(top), for reading the plan's shapes. Writes output/flat.png; flat_px(x, y) gives a plan point's pixel in it.

  python art/canal_court/flat.py [image]      (the Python of art/audio/output/venv)
"""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import H as GROUND_H, Yc

PX = 10.0
X0, X1, Y0, Y1 = -60.0, 60.0, -45.0, 50.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
flat_px = lambda x, y: ((x - X0) * PX, (Y1 - y) * PX)
if __name__ == '__main__':
    f = cv2.imread(sys.argv[1] if len(sys.argv) > 1 else 'art/canal_court/output/chrome_0.png')
    out = cv2.warpPerspective(f, np.linalg.inv(GROUND_H) @ A, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    for x in range(int(X0), int(X1) + 1, 5):
        cv2.line(out, (int((x - X0) * PX), 0), (int((x - X0) * PX), Hh), (255, 255, 255) if x % 10 else (0, 0, 255), 1)
    for y in range(int(Y0), int(Y1) + 1, 5):
        cv2.line(out, (0, int((Y1 - y) * PX)), (W, int((Y1 - y) * PX)), (255, 255, 255) if y % 10 else (0, 0, 255), 1)
    cv2.imwrite('art/canal_court/output/flat.png', out)
