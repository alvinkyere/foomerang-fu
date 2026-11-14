"""The court's paving joints (2026-11-14): the HQ's court is laid in irregular rectangular stones, their joints faint darker lines (~2 px in
the READY frame). The frame laid flat on the ground (PX px a unit), a black-hat (what a small closing fills: thin dark lines, not the
shadows' broad steps) over the court inside its kerb and away from every solid, prop and patch edge; each joint a thin ribbon traced from
it, coloured as the frame is under it (its median). Writes tiles.json ([{colour, pts}]), output/tiles_check.png.

  python art/canal_court/tiles.py      (after kerb.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import H as GH, Yc

PX = 20.0
X0, X1, Y0, Y1 = -26.0, 28.0, -16.0, 19.0
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
f = cv2.imread('art/canal_court/output/clean_ref.png')
fl = cv2.warpPerspective(f, np.linalg.inv(GH) @ A, (int((X1 - X0) * PX), int((Y1 - Y0) * PX)), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
g = cv2.cvtColor(fl, cv2.COLOR_BGR2GRAY).astype(np.float32)
bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
hsv = cv2.cvtColor(fl, cv2.COLOR_BGR2HSV).astype(int); Hu, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
to_px = lambda pts: np.int32([((x - X0) * PX, (Y1 - y) * PX) for x, y in pts])
court = np.zeros(g.shape, np.uint8); cv2.fillPoly(court, [to_px(json.load(open('art/canal_court/kerb.json'))['bands'][-1]['pts'])], 1)
court = cv2.erode(court, np.ones((9, 9), np.uint8)) > 0
# (not the solids, the water, the props, the grass: anything saturated, and round it; nor where colour changes broadly: patch edges)
busy = (S > 45) | (V < 150)
busy = cv2.dilate(busy.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
grad = cv2.morphologyEx(cv2.GaussianBlur(g, (0, 0), 2.0), cv2.MORPH_GRADIENT, np.ones((5, 5), np.uint8))
line = (bh > 1.3) & court & ~busy & (grad < 14)
line = cv2.morphologyEx(line.astype(np.uint8), cv2.MORPH_OPEN, np.ones((1, 1), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(line)
out = []
vis = fl.copy()
for i in range(1, n):
    x, y, w, h, a = st[i]
    if max(w, h) < 0.8 * PX or a < 10: continue          # (a joint runs a unit or more; specks are not joints)
    m = (lab == i).astype(np.uint8)
    col = np.median(fl[m > 0], 0).astype(int)
    for c in cv2.findContours(cv2.dilate(m, np.ones((2, 2), np.uint8)), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]:
        ap = cv2.approxPolyDP(c, 0.6, True).reshape(-1, 2)
        if len(ap) < 3: continue
        out.append(dict(colour='#%02x%02x%02x' % (col[2], col[1], col[0]), pts=[[round(X0 + u / PX, 3), round(Y1 - v / PX, 3)] for u, v in ap]))
        cv2.drawContours(vis, [c], -1, (0, 0, 255), 1)
json.dump(out, open('art/canal_court/tiles.json', 'w'))
cv2.imwrite('art/canal_court/output/tiles_check.png', vis)
print(len(out), 'joints')
