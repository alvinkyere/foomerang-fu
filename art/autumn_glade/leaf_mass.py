"""The fallen leaves as the frame shows them (2026-11-03): ff physics hq 2.mp4 626.0 s, the small red and gold blobs on the sand clear
of every canopy (beams taken out), on a 2 px grid laid on the ground (z 0.06), each leaf one flat tone (its own median): their outlines
the frame's. Writes leaf_mass.json.

  python art/autumn_glade/leaf_mass.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z
from beams_emu import remove

STEP = 2
f = remove(cv2.imread('art/autumn_glade/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
red = ((H <= 12) | (H >= 170)) & (S > 100) & (V > 120); gold = (H >= 15) & (H <= 28) & (S > 120) & (V > 150) & (V < 234) & ~red
lv = np.zeros(H.shape, bool); tone_of = np.zeros(H.shape, np.int32) - 1; tones = []
for m in (red, gold):
    big = cv2.dilate(cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((11, 11), np.uint8)), np.ones((7, 7), np.uint8)) > 0
    small = (m & ~big).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(small)
    for i in range(1, n):
        if not 12 <= st[i, 4] <= 450: continue
        sel = lab == i
        tones.append('#%02x%02x%02x' % tuple(int(v) for v in np.median(f[sel], 0)[::-1])); tone_of[sel] = len(tones) - 1; lv |= sel
lv[95:375, :215] = False; lv[470:620, 740:1190] = False
for x0, y0, x1, y1 in ((415, 225, 500, 300), (1315, 145, 1385, 205), (1545, 830, 1620, 905), (290, 760, 390, 850)): lv[y0:y1, x0:x1] = False      # (the players)
lv = cv2.dilate(lv.astype(np.uint8), np.ones((2, 2), np.uint8)) > 0      # (a leaf's edge pixel: the grid needs its corners in)
tone_of = cv2.dilate(tone_of + 1, np.ones((3, 3), np.uint8).astype(np.uint8)) - 1 if False else tone_of
gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = lv[gy, gx]
px, py = gx[ins].astype(float), gy[ins].astype(float)
xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T
cam = _C * 100; tt = (0.06 - cam[2]) / dirw[:, 2]; world = cam[None, :] + dirw * tt[:, None]
idx = -np.ones(gx.shape, int); idx[ins] = np.arange(len(px))
faces = []
for j in range(gx.shape[0] - 1):
    for i in range(gx.shape[1] - 1):
        q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; k = [v for v in q if v >= 0]
        if len(k) == 4: faces.append([int(v) for v in q])
        elif len(k) == 3: faces.append([int(v) for v in k])
# each vertex: its leaf's tone (the nearest leaf pixel's, for the dilated rim)
dist, nearest = cv2.distanceTransformWithLabels((tone_of < 0).astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
ys_, xs_ = np.nonzero(tone_of >= 0); lut = np.zeros(nearest.max() + 1, np.int32); lut[nearest[ys_, xs_]] = tone_of[ys_, xs_]
vt = lut[nearest[py.astype(int), px.astype(int)]]
json.dump(dict(verts=[[round(float(world[i, 0]), 3), round(float(world[i, 1] - Yc), 3)] for i in range(len(px))], faces=faces, tones=tones,
               tone=[int(v) for v in vt]), open('art/autumn_glade/leaf_mass.json', 'w'))
print(len(tones), 'leaves,', len(px), 'vertices,', len(faces), 'faces')
