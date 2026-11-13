"""The round's mosaic (Chrome's colours) laid flat on the ground at PX px a plan unit over X0..X1, Y0..Y1 (y north), a unit grid drawn
(every 5 in red): output/plan.png, for reading the plan's shapes by hand. plan_px(x, y) gives a plan point's pixel in it.

  python art/canal_court/plan_view.py [z]      (z: lay it at that height instead of the ground: for reading tops)
"""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import ref, Yc, MOSAIC_ORIGIN

PX = 20.0
X0, X1, Y0, Y1 = -28.0, 28.0, -24.0, 24.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
plan_px = lambda x, y: ((x - X0) * PX, (Y1 - y) * PX)
if __name__ == '__main__':
    z = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
    g = [(X, Y) for X in np.linspace(X0, X1, 9) for Y in np.linspace(Y0, Y1, 9)]
    src = np.float32([plan_px(X, Y) for X, Y in g])
    dst = np.float32([[a - MOSAIC_ORIGIN[0], b - MOSAIC_ORIGIN[1]] for a, b in (ref(X, Yc + Y, z) for X, Y in g)])
    Hm = cv2.findHomography(src, dst)[0]
    m = cv2.imread('art/canal_court/output/mosaic_chrome.png')
    out = cv2.warpPerspective(m, Hm, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    for x in range(int(X0), int(X1) + 1):
        u = int((x - X0) * PX); cv2.line(out, (u, 0), (u, Hh), (0, 0, 255) if x % 5 == 0 else (150, 150, 150), 1)
        if x % 5 == 0: cv2.putText(out, str(x), (u + 2, 12), 0, 0.4, (0, 0, 255), 1)
    for y in range(int(Y0), int(Y1) + 1):
        v = int((Y1 - y) * PX); cv2.line(out, (0, v), (W, v), (0, 0, 255) if y % 5 == 0 else (150, 150, 150), 1)
        if y % 5 == 0: cv2.putText(out, str(y), (2, v - 2), 0, 0.4, (0, 0, 255), 1)
    cv2.imwrite('art/canal_court/output/plan%s.png' % ('' if z == 0 else '_z%g' % z), out)
