"""The light shafts' lift as a field (2026-11-01), for blender/build.py to add to the objects that stand in them. The frame (ff physics hq 2.mp4
626.0 s) adds light in slanting bands over everything: where the sand is lifted most, a canopy goes #c8645d -> #e17a5f (+25 red, +22
green, +2 blue). The sand already carries its shafts (sand.py); the canopies, trunks, leaves and logs get the same lift, read here from the
sand: its green over the plain sand's, inpainted across the objects, blurred, never negative (the darker patches are not light), on a
240 x 135 grid of the frame. Writes lift.json: {w, h, add: per-channel lift per unit of green lift, data: rows of green lift (0..255)}.

  python art/autumn_glade/lift.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json
import numpy as np, cv2

f = cv2.imread('art/autumn_glade/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
sand = (H >= 15) & (H <= 34) & (S >= 30) & (S <= 150) & (V >= 200); sand[:, :215] = False
sand = cv2.erode(sand.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
hole = cv2.dilate((~sand).astype(np.uint8), np.ones((9, 9), np.uint8))
filled = cv2.inpaint(f, hole * 255, 12, cv2.INPAINT_TELEA).astype(float)
g = cv2.GaussianBlur(filled[..., 1], (0, 0), 7)
base = np.median(g[800:, 215:])
lift = np.clip(g - base - 3, 0, None)                       # (3: the sand's own unevenness, not light)
lift[:, :215] = lift[:, 215:216]                            # (the HUD's strip: the nearest column)
W, Hh = 240, 135
small = cv2.resize(lift, (W, Hh), interpolation=cv2.INTER_AREA)
json.dump(dict(w=W, h=Hh, add=[25 / 22, 1.0, 2 / 22], data=[[round(float(v), 1) for v in row] for row in small]), open('art/autumn_glade/lift.json', 'w'))
print('lift max %.1f, mean over the top third %.1f' % (small.max(), small[:45].mean()))
