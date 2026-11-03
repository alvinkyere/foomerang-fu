"""The trees' shadows on the sand (2026-11-03) as the frame shows them (ff physics hq 2.mp4 626.0 s, beams taken out): the green shadow
pixels on a 3 px grid laid on the ground (z 0), each vertex the colour of a smooth shadow field there (the shadow pixels alone, inpainted
across what is not shadow, blurred 5 px): their outline the frame's, their tone its slow changes. Where a canopy or a rock hides the
ground the shadow goes on under it (props.py's polygons there). Writes shadow_mass.json.

  python art/autumn_glade/shadow_mass.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z
from beams_emu import remove

STEP = 3
f = remove(cv2.imread('art/autumn_glade/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
sh = (H >= 26) & (H <= 45) & (S >= 40) & (V >= 140) & (V <= 225)
sh[95:375, :215] = False; sh[470:620, 740:1190] = False
sh = cv2.morphologyEx(cv2.morphologyEx(sh.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(sh); keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 300; sh = keep[lab]
hole = (~sh).astype(np.uint8) * 255
field = cv2.GaussianBlur(cv2.inpaint(f, hole, 9, cv2.INPAINT_TELEA).astype(np.float32), (0, 0), 5)
gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = sh[gy, gx]
px, py = gx[ins].astype(float), gy[ins].astype(float)
xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T
cam = _C * 100; tt = (0.0 - cam[2]) / dirw[:, 2]; world = cam[None, :] + dirw * tt[:, None]
idx = -np.ones(gx.shape, int); idx[ins] = np.arange(len(px))
faces = []
for j in range(gx.shape[0] - 1):
    for i in range(gx.shape[1] - 1):
        q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; k = [v for v in q if v >= 0]
        if len(k) == 4: faces.append([int(v) for v in q])
        elif len(k) == 3: faces.append([int(v) for v in k])
cols = field[py.astype(int), px.astype(int)]
json.dump(dict(verts=[[round(float(world[i, 0]), 3), round(float(world[i, 1] - Yc), 3)] for i in range(len(px))], faces=faces,
               bgr=[[int(round(float(v))) for v in c] for c in cols]), open('art/autumn_glade/shadow_mass.json', 'w'))
print(len(px), 'vertices,', len(faces), 'faces; median shadow #%02x%02x%02x' % tuple(int(v) for v in np.median(cols, 0)[::-1]))
