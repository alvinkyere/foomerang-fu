"""The temple court's yellow ground as a smooth measured field (2026-11-07): the round's mosaic laid flat (shadow_mass.py's view), on a
grid of 1.5 plan units, each cell's median colour over its plain ground (no paving, shadow, plants or anything standing: hue 14-34,
S over 70, L over 212); cells never seen or never plain take their neighbours' (spread outwards), then the field is smoothed (sigma 1.5
cells). It warms from lemon in the middle to apricot at the edges, as the HQ's late light does. Writes ground_field.json (bgr per cell,
row by row from y0, x0 west).

  python art/temple_court/ground_field.py      (after shadow_mass.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/temple_court')
from measure import H as GROUND_H, Yc, MOSAIC_ORIGIN

PX, DX = 10.0, 1.5
X0, X1, Y0, Y1 = -66.0, 66.0, -48.0, 54.0
W, Hh = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
M = cv2.imread('art/temple_court/output/mosaic.png')
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
T = np.array([[1, 0, -MOSAIC_ORIGIN[0]], [0, 1, -MOSAIC_ORIGIN[1]], [0, 0, 1]])
Hm = T @ np.linalg.inv(GROUND_H) @ A
flat = cv2.warpPerspective(M, Hm, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
seen = cv2.warpPerspective(np.full(M.shape[:2], 255, np.uint8), Hm, (W, Hh), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP) > 0
seen = cv2.erode(seen.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
hsv = cv2.cvtColor(flat, cv2.COLOR_BGR2HSV).astype(int); lab = cv2.cvtColor(flat, cv2.COLOR_BGR2Lab).astype(int)
plain = seen & (hsv[..., 0] >= 12) & (hsv[..., 0] <= 34) & (hsv[..., 1] >= 70) & (lab[..., 0] >= 165)      # (L from 165: the apricot ground east of the walls in the late light, 2026-11-11)
nx, ny = int((X1 - X0) / DX) + 1, int((Y1 - Y0) / DX) + 1
F = np.full((ny, nx, 3), np.nan)
for j in range(ny):
    for i in range(nx):
        x, y = X0 + i * DX, Y0 + j * DX
        u0, u1 = int((x - DX / 2 - X0) * PX), int((x + DX / 2 - X0) * PX); v0, v1 = int((Y1 - y - DX / 2) * PX), int((Y1 - y + DX / 2) * PX)
        u0, v0 = max(0, u0), max(0, v0); m = plain[v0:v1, u0:u1]
        if m.sum() > 0.3 * m.size: F[j, i] = np.median(flat[v0:v1, u0:u1][m], 0)
known = ~np.isnan(F[..., 0])
for _ in range(200):
    if known.all(): break
    nb = np.zeros_like(F); cnt = np.zeros((ny, nx))
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(np.where(known[..., None], F, 0), dj, 0), di, 1); k = np.roll(np.roll(known, dj, 0), di, 1)
        nb += sh; cnt += k
    grow = ~known & (cnt > 0)
    F[grow] = nb[grow] / cnt[grow][:, None]; known |= grow
F = cv2.GaussianBlur(F.astype(np.float32), (0, 0), 1.5)
json.dump(dict(x0=X0, y0=Y0, dx=DX, nx=nx, ny=ny, bgr=[[int(round(v)) for v in F[j, i]] for j in range(ny) for i in range(nx)]),
          open('art/temple_court/ground_field.json', 'w'))
print('ground field', nx, 'x', ny, 'cells; mean', F.reshape(-1, 3).mean(0).round()[::-1])
