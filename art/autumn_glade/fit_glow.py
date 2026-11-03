"""The portals' glow on the sand (2026-11-03), measured on the frame (ff physics hq 2.mp4 626.0 s, beams taken out): round each portal
the sand's lightness over the plain sand's, its centroid and spread (weighted moments) and the colour of its brightest 3%; put on the
plan: the glow's centre, its radius along x and y (2 sigma), its heart colour. Writes glow.json (in layout.json's portal order).

  python art/autumn_glade/fit_glow.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import plan
from beams_emu import remove

f = remove(cv2.imread('art/autumn_glade/output/reference.png')).astype(float)
lab = cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(float)
h = cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(int)
L = json.load(open('art/autumn_glade/layout.json'))
out = []
for p in L['portals']:
    x, y, w, hh = p['px']; left = p['side'] == 'W'
    x0, x1 = (x + w - 10, x + w + 170) if left else (x - 170, x + 10)
    y0, y1 = y - 60, y + hh + 60
    reg = lab[y0:y1, x0:x1]; hs = h[y0:y1, x0:x1]
    # the glow: pale (low saturation or very light) pixels that are not the cyan portal nor a rock
    notcyan = ~((hs[..., 0] >= 80) & (hs[..., 0] <= 102) & (hs[..., 1] > 90))
    notrock = ~((hs[..., 0] >= 100) & (hs[..., 0] <= 135) & (hs[..., 1] >= 40))
    base = np.median(lab[y1:y1 + 40, x0:x1].reshape(-1, 3), 0)[0]
    lift = np.clip(reg[..., 0] - base, 0, None) * notcyan * notrock
    W = lift ** 1.5; s = W.sum()
    gy, gx = np.mgrid[y0:y1, x0:x1]
    cx, cy = (W * gx).sum() / s, (W * gy).sum() / s
    sx, sy = np.sqrt((W * (gx - cx) ** 2).sum() / s), np.sqrt((W * (gy - cy) ** 2).sum() / s)
    top = lift >= np.percentile(lift[lift > 0], 97)
    heart = np.median(f[y0:y1, x0:x1][top], 0)
    c = plan([(cx, cy)])[0]; ex = plan([(cx + 2 * sx, cy)])[0]; ey = plan([(cx, cy + 2 * sy)])[0]
    out.append(dict(side=p['side'], centre=[round(float(v), 2) for v in c], rx=round(float(abs(ex[0] - c[0])), 2), ry=round(float(abs(ey[1] - c[1])), 2),
                    heart='#%02x%02x%02x' % tuple(int(v) for v in heart[::-1]), px=[round(float(cx)), round(float(cy))], sigma_px=[round(float(sx), 1), round(float(sy), 1)]))
    print(out[-1])
json.dump(out, open('art/autumn_glade/glow.json', 'w'))
