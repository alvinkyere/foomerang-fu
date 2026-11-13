"""Where the render still differs from the round's mosaic (inside the READY frame, names masked): the mean Lab difference's share by
what the pixel shows in the HQ (each stone body's silhouette, each card's box, the rest: ground), largest first.
  python art/gong_court/breakdown.py <render.png>      (the Python of art/audio/output/venv)"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import pix, MOSAIC_ORIGIN
from geom import prisms
OX, OY = MOSAIC_ORIGIN
r = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)); m = cv2.imread('art/gong_court/output/mosaic_chrome.png')[-OY:-OY + 1080, -OX:-OX + 1920]
lab = lambda im: cv2.cvtColor(im, cv2.COLOR_BGR2Lab).astype(float) * [100 / 255, 1, 1] - [0, 128, 128]
d = np.linalg.norm(lab(r) - lab(m), axis=2); ok = np.ones(d.shape, bool); ok[60:330, 0:230] = False; ok &= m.sum(2) > 30
total = d[ok].sum(); used = np.zeros(d.shape, bool); rows = []
for name, (poly, h, mint, kind) in prisms().items():
    up = np.float32([pix(x, y, h) for x, y in poly]); dn = np.float32([pix(x, y, 0) for x, y in poly]); s = np.zeros(d.shape, np.uint8)
    cv2.fillPoly(s, [np.int32(up)], 1); cv2.fillPoly(s, [np.int32(dn)], 1)
    for i in range(len(poly)): j = (i + 1) % len(poly); cv2.fillConvexPoly(s, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
    s = cv2.dilate(s, np.ones((7, 7), np.uint8)) > 0; s &= ok & ~used; used |= s
    rows.append((d[s].sum() / total, name, d[s].mean() if s.any() else 0))
cards = {}
exec(open('art/gong_court/cards.py').read().split('OBJECTS = ')[1].split('\n}\n')[0].join(['cards = ', '\n}\n']))
for name, ((x0, y0, x1, y1), *_r) in cards.items():
    s = np.zeros(d.shape, bool); s[max(0, y0 + OY):max(0, y1 + OY), max(0, x0 + OX):max(0, x1 + OX)] = True; s &= ok & ~used; used |= s
    rows.append((d[s].sum() / total, 'card ' + name, d[s].mean() if s.any() else 0))
s = ok & ~used; rows.append((d[s].sum() / total, 'ground (the rest)', d[s].mean()))
print('mean dLab %.2f' % d[ok].mean())
for share, name, mean in sorted(rows, reverse=True)[:22]: print('%5.1f%%  %-22s mean %.1f' % (100 * share, name, mean))
