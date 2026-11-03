"""The trunks where the frame shows them (2026-11-03): ff physics hq 2.mp4 626.0 s, the birch's pale lavender-white and its navy dashes
(beams taken out) in a window above each tree's foot (props.py), put on the vertical plane through the trunk (plan y = the foot's) and
built as a 2 px grid: its outline and its dashes where the frame has them, its colours our two flat birch tones with a cylinder's shading
across it. Writes trunk_mass.json (per tree: vertices in plan units relative to the frame's centre ground point, faces, navy flags,
the shading across); canopy_mass.py leaves these pixels open.

  python art/autumn_glade/trunk_mass.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z
from beams_emu import remove

STEP = 2
f = remove(cv2.imread('art/autumn_glade/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
pale = (H >= 95) & (H <= 150) & (S >= 6) & (S <= 100) & (V >= 120)      # (its lit and its shaded side: #bba4ba .. #7d797f .. #8f90cc)
navy = (H >= 100) & (H <= 130) & (S >= 60) & (V >= 60) & (V < 165)
L = json.load(open('art/autumn_glade/layout.json'))
# the rocks' own blue, only round the two rocks (elsewhere the same blue is a trunk's shaded side)
near_rock = np.zeros(H.shape, bool)
for it in L['rock']:
    cx, cy = it['px']; near_rock[max(0, cy - 140):cy + 140, max(0, cx - 120):cx + 120] = True
rockish = (cv2.dilate(((H >= 104) & (H <= 132) & (S >= 55) & (S < 150) & (V >= 150)).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0) & near_rock
trunk_all = np.zeros(H.shape, bool)
out = []
for t in L['trees']:
    fx, fy = t['px']; by = t['plan'][1]
    win = np.zeros(H.shape, bool); win[max(0, fy - 320):min(1080, fy + 8), max(0, fx - 70):min(1920, fx + 70)] = True
    m = (pale | navy) & win & ~rockish
    m[95:375, :215] = False
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 150                  # (specks and slivers are not trunk: up close they float)
    m = keep[lab]
    trunk_all |= m
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; inside = m[gy, gx]
    pts = np.argwhere(inside)
    if len(pts) < 10: out.append(None); continue
    px = gx[inside].astype(float); py = gy[inside].astype(float)
    # each pixel's ray meets the vertical plane through the trunk (world y = Yc + by)
    xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
    dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T
    cam = _C * 100; tt = ((Yc + by) - cam[1]) / dirw[:, 1]
    world = cam[None, :] + dirw * tt[:, None]
    idx = -np.ones(gx.shape, int); idx[inside] = np.arange(len(px))
    faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; k = [v for v in q if v >= 0]
            if len(k) == 4: faces.append([int(v) for v in q])
            elif len(k) == 3: faces.append([int(v) for v in k])
    # the shading across: where the pixel sits in its row's run (0 left .. 1 right)
    across = np.zeros(len(px))
    for j in np.unique(pts[:, 0]):
        sel = pts[:, 0] == j; xs = px[sel]
        across[sel] = (xs - xs.min()) / max(xs.max() - xs.min(), 1)
    out.append(dict(verts=[[round(float(world[i, 0]), 3), round(float(world[i, 1] - Yc), 3), round(float(world[i, 2]), 3)] for i in range(len(px))],
                    faces=faces, navy=[int(navy[int(py[i]), int(px[i])]) for i in range(len(px))], across=[round(float(a), 2) for a in across]))
json.dump(out, open('art/autumn_glade/trunk_mass.json', 'w'))
np.save('art/autumn_glade/output/trunk_pixels.npy', trunk_all)
print('trunks shown:', sum(1 for o in out if o), 'of', len(out), '; pixels', int(trunk_all.sum()))
