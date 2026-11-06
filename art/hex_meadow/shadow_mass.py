"""The hex meadow's still shadows (2026-11-06): the trees', the rocks' and the bamboo's, as the frame shows them (ff physics hq 2.mp4
1202.0 s). The frame's shadowed lime minus what the pads' own shadows explain (the game draws those, moving and burning with the pads:
render/three/hexPlantsView.ts): each pad's hexagon laid on the ground at its measured shadow shift (-0.75, +1.4) plan units, widened
3 px. The rest on a 3 px grid laid on the ground (z 0), each vertex the colour of a smooth shadow field there. Writes shadow_mass.json.

  python art/hex_meadow/shadow_mass.py       (after pads.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
HUD = np.load('art/hex_meadow/output/hud_hidden.npy')      # (the players' names' letters: hud_mask.py)
sys.path.insert(0, 'art/hex_meadow')
from measure import Yc, ref, R as _R, F as _F, C as _C, Z as _Z

STEP = 3
f = cv2.imread('art/hex_meadow/output/reference_fill.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
sh = (H >= 28) & (H <= 55) & (S >= 50) & (V >= 150) & (V < 216)
pads = json.load(open('art/hex_meadow/pads.json')); s = json.load(open('art/hex_meadow/lattice.json'))['s']
explained = np.zeros(H.shape, np.uint8)
for p in pads:
    pts = np.array([ref(p['x'] - 0.75 + s * math.cos(k * math.pi / 3), Yc + p['y'] + 1.4 + s * math.sin(k * math.pi / 3), 0) for k in range(6)], np.int32)
    cv2.fillConvexPoly(explained, pts, 1)
explained = cv2.dilate(explained, np.ones((7, 7), np.uint8)) > 0
padm = (H >= 62) & (H <= 90) & (S >= 60) & (V >= 120)
stems = cv2.dilate(padm.astype(np.uint8), np.ones((1, 1), np.uint8))
sh = sh & ~explained
sh[HUD] = False
for x0, y0, x1, y1 in ((425, 80, 600, 135), (1355, 110, 1480, 160), (380, 725, 570, 780), (1335, 740, 1575, 795)): sh[y0:y1, x0:x1] = False
for x, y in ((510, 180), (1418, 210), (465, 832), (1455, 848)): sh[y - 70:y + 70, x - 70:x + 90] = False      # (the players and their shadows)
sh = cv2.morphologyEx(cv2.morphologyEx(sh.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(sh); keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 400
# only what something still throws: near a rock, a canopy, a trunk or a bamboo, or the big shade reaching in at the frame's edge (the
# rest is the pads' shadows' fringe and their stems')
casters = ((H >= 100) & (H <= 135) & (S >= 40) & (V >= 80)) | ((H >= 14) & (H <= 28) & (S > 90) & (V > 120) & (V < 240))
for x0, y0, x1, y1 in ((150, 820, 260, 1000), (1790, 820, 1920, 930), (430, 0, 480, 20)): casters[y0:y1, x0:x1] = True      # (the bamboo)
casters = cv2.dilate(casters.astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
edge = np.zeros(H.shape, bool); edge[:4] = edge[-4:] = True; edge[:, :4] = edge[:, -4:] = True
for i in range(1, n):
    if not keep[i]: continue
    comp = lab == i
    keep[i] = bool((comp & casters).any()) or (bool((comp & edge).any()) and st[i, 4] > 2000)
sh = keep[lab]
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
               bgr=[[int(round(float(v))) for v in c] for c in cols]), open('art/hex_meadow/shadow_mass.json', 'w'))
print(len(px), 'vertices,', len(faces), 'faces; median shadow #%02x%02x%02x' % tuple(int(v) for v in np.median(cols, 0)[::-1]))
ov = f.copy(); ov[sh] = (0, 0, 255); cv2.imwrite('art/hex_meadow/output/shadow_overlay.jpg', cv2.resize(ov, (1280, 720)))
