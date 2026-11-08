"""The temple court's three tree crowns (ff physics hq 2.mp4 121.5 s): each an ellipsoid (radius r across, rz up) whose silhouette
through the camera is fitted to the frame's canopy green (hue 33-50, V under 215: not the planters' paler soil) in a box round it,
its middle 6.0 up (one view cannot tell height from depth along the line of sight: all three alike, their trunks ~5 tall). Adds
`crown` and `r` to layout.json's trees.

  python art/temple_court/fit_crowns.py      (after layout.py; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/temple_court')
from measure import pix

f = cv2.imread('art/temple_court/output/reference.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
green = ((hsv[..., 0] >= 33) & (hsv[..., 0] <= 50) & (hsv[..., 1] >= 70) & (hsv[..., 2] < 215)).astype(np.uint8)
green = cv2.morphologyEx(green, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
L = json.load(open('art/temple_court/layout.json'))
BOXES = [(380, 40, 560, 240), (380, 235, 580, 440), (330, 560, 520, 720)]       # (each crown's own box: the next one below is out)
sph = [(math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e)) for a in np.linspace(0, 2 * math.pi, 24) for e in np.linspace(-1.5, 1.5, 9)]
for t, (x0, y0, x1, y1) in zip(L['trees'], BOXES):
    tgt = green[y0:y1, x0:x1]
    fx, fy = t['foot']
    def sil(p):
        cx, cy, cz, r, rz = p
        P = (np.array([pix(cx + r * u, cy + r * v, cz + rz * w) for u, v, w in sph]) - [x0, y0]).astype(np.float32)
        m = np.zeros(tgt.shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(P).astype(np.int32), 1); return m
    CZ = 6.0
    def cost(p):
        s = sil([p[0], p[1], CZ, p[2], p[3]]); return 1 - (s & tgt).sum() / max(1, (s | tgt).sum())
    best = minimize(cost, [t['crown'][0], fy + 3.0, 2.5, 2.5], method='Nelder-Mead', options=dict(maxiter=1200, xatol=1e-3, fatol=1e-5))
    (cx, cy, r, rz), cz = best.x, CZ
    t['rz'] = round(rz, 2)
    t['crown'] = [round(cx, 2), round(cy, 2), round(cz, 2)]; t['r'] = round(r / 1.0, 2)
    print('crown', t['crown'], 'r', t['r'], 'rz', t['rz'], 'IoU %.2f' % (1 - best.fun))
json.dump(L, open('art/temple_court/layout.json', 'w'), indent=1)
