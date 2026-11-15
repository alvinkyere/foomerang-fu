"""The red bushes along the south (2026-11-14): beyond the kerb's south side the HQ has a band of low red-orange bushes (seen whenever the
camera follows a player south; the round's frames before the Battle Royale, mosaic_early.py). Their tops' outline in the mosaic, put on
the plane BUSH_H above the ground (measure.plan_at): soft mounds that tall (build.py), in the frame's three reds. Each piece of the red,
its outline simplified. Writes bushes.json ({h, colours, pieces: [[x, y], ...]}), output/bushes_check.png.

  python art/canal_court/bushes.py      (after mosaic_early.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import plan_at, MOSAIC_ORIGIN

BUSH_H = 1.6
OX, OY = MOSAIC_ORIGIN
m = cv2.imread('art/canal_court/output/mosaic.png')
hsv = cv2.cvtColor(m, cv2.COLOR_BGR2HSV).astype(int)
red = (((hsv[..., 0] <= 12) | (hsv[..., 0] >= 170)) & (hsv[..., 1] >= 100) & (hsv[..., 2] >= 140)).astype(np.uint8)
red = cv2.morphologyEx(cv2.morphologyEx(red, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(red)
pieces = []; vis = m.copy()
for i in range(1, n):
    if st[i, 4] < 3000: continue
    c = max(cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
    ap = cv2.approxPolyDP(c, 4.0, True).reshape(-1, 2).astype(float)
    P = plan_at([(u + OX, v + OY) for u, v in ap], BUSH_H)
    pieces.append([[round(float(x), 3), round(float(y), 3)] for x, y in P])
    cv2.drawContours(vis, [c], -1, (255, 0, 0), 2)
from chrome import chrome
rgb = chrome(m)[red > 0][:, ::-1]
lum = rgb.sum(1); cols = ['#%02x%02x%02x' % tuple(int(v) for v in np.median(rgb[(lum >= np.percentile(lum, a)) & (lum <= np.percentile(lum, b))], 0)) for a, b in ((70, 100), (30, 70), (0, 30))]
json.dump(dict(h=BUSH_H, colours=cols, pieces=pieces), open('art/canal_court/bushes.json', 'w'))
cv2.imwrite('art/canal_court/output/bushes_check.png', vis)
print(len(pieces), 'pieces; colours (light, mid, dark)', cols)
