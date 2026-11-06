"""The glade's sand as a smooth colour field (2026-11-03), replacing sand.py's flat levels where the frame shows the ground: a grid every
DX plan units over the frame's footprint, each vertex the colour of the sand there, measured on the frame (ff physics hq 2.mp4 626.0 s)
with the light beams taken out (the game adds them back), every object, character and the text inpainted from the sand round it, and
blurred (sigma BLUR px): a coarse measured field, like the bridge islands' grade grid, never the frame's pixels. Towards the frame's
edges and outside it the field eases to the plain sand colour. Writes ground_field.json (plan units relative to the frame's centre
ground point, as layout.json).

  python art/autumn_glade/ground_field.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import ref, Yc
from beams_emu import remove

DX, BLUR = 0.5, 6
f = remove(cv2.imread('art/autumn_glade/output/reference.png'))
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
sand = (h[..., 0] >= 15) & (h[..., 0] <= 34) & (h[..., 1] >= 30) & (h[..., 1] <= 150) & (h[..., 2] >= 200)
sand[95:375, :215] = False; sand[470:620, 740:1190] = False
sand = cv2.erode(sand.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
hole = cv2.dilate((~sand).astype(np.uint8), np.ones((11, 11), np.uint8))
# the portals' glow is not the sand's (owner, 2026-11-05: "this white spot in front of the portals: take them out"): a circle round each
# glow (fit_glow.py's centre, 3 sigma of the west one's) filled from the sand round it
import os as _os
if _os.path.exists('art/autumn_glade/glow.json'):
    _gw = next(g for g in json.load(open('art/autumn_glade/glow.json')) if g['side'] == 'W'); _rad = int(3 * max(_gw['sigma_px']))
    for _p in json.load(open('art/autumn_glade/layout.json'))['portals']:
        _x, _y, _w, _h = _p['px']; _cx = _x + _w + 10 if _p['side'] == 'W' else _x - 10
        cv2.circle(hole, (int(_cx), int(_y + _h / 2)), _rad, 1, -1)
filled = cv2.inpaint(f, hole * 255, 15, cv2.INPAINT_TELEA)
smooth = cv2.GaussianBlur(filled.astype(np.float32), (0, 0), BLUR)
L = json.load(open('art/autumn_glade/layout.json'))
xs = [p[0] for p in L['frame']]; ys = [p[1] for p in L['frame']]
X0, X1, Y0, Y1 = np.floor(min(xs)) - 2, np.ceil(max(xs)) + 2, np.floor(min(ys)) - 2, np.ceil(max(ys)) + 2
nx, ny = int((X1 - X0) / DX) + 1, int((Y1 - Y0) / DX) + 1
base = np.median(smooth[sand], 0)
cols = np.zeros((ny, nx, 3), np.float32)
for j in range(ny):
    for i in range(nx):
        x, y = X0 + i * DX, Y0 + j * DX
        px, py = ref(x, Yc + y, 0.0)
        # inside the frame by `m` px: the measured colour; easing to the plain sand over the last 40 px and outside
        m = min(px, 1919 - px, py, 1079 - py)
        w = float(np.clip(m / 40.0, 0, 1))
        c = smooth[int(np.clip(py, 0, 1079)), int(np.clip(px, 0, 1919))] if m > -1 else base
        cols[j, i] = w * c + (1 - w) * base
json.dump(dict(x0=float(X0), y0=float(Y0), dx=DX, nx=nx, ny=ny, base='#%02x%02x%02x' % tuple(int(v) for v in base[::-1]),
               bgr=[[int(round(float(v))) for v in c] for c in cols.reshape(-1, 3)]), open('art/autumn_glade/ground_field.json', 'w'))
print('ground field', nx, 'x', ny, 'base', '#%02x%02x%02x' % tuple(int(v) for v in base[::-1]))
