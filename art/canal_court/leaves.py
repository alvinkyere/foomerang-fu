"""The fallen leaves (2026-11-14): small gold ovals lying on the sand and the kerb round the trees (the READY frame where it reaches, the
round's mosaic beyond it). Each one a connected piece of the leaves' gold (OpenCV's decode: H 20-28, S >= 128, V 185-232) smaller than a
crown, its outline put on the ground (measure.plan) and kept as a polygon in its own colour (the median of its pixels, as Chrome shows
them): crisp flat shapes over the traced ground, which leaves them out (ground.py inpaints the gold). Writes leaves.json ([{colour,
pts}]), output/leaves_check.png.

  python art/canal_court/leaves.py      (after ready.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import plan, MOSAIC_ORIGIN
from chrome import chrome

OX, OY = MOSAIC_ORIGIN
m = cv2.imread('art/canal_court/output/mosaic.png')
m[-OY:-OY + 1080, -OX:-OX + 1920] = cv2.imread('art/canal_court/output/clean_ref_raw.png')
hsv = cv2.cvtColor(m, cv2.COLOR_BGR2HSV).astype(int)
# (the leaves' gold against the sand round it: more saturated (S 130-145 against the sand's 105-125) and darker (V 205-225 against 240+))
gold = ((hsv[..., 0] >= 20) & (hsv[..., 0] <= 28) & (hsv[..., 1] >= 128) & (hsv[..., 2] >= 185) & (hsv[..., 2] <= 232)).astype(np.uint8)
# (and the red-orange leaves heaped at the west tree's foot)
gold |= ((hsv[..., 0] >= 4) & (hsv[..., 0] <= 16) & (hsv[..., 1] >= 150) & (hsv[..., 2] >= 170)).astype(np.uint8)
gold = cv2.morphologyEx(gold, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(gold)
mc = chrome(m)
out = []; vis = mc.copy()
for i in range(1, n):
    x, y, w, h, a = st[i]
    if a < 12 or a > 2500 or w > 90 or h > 50: continue           # (a leaf: a few to a few hundred pixels; a crown is far bigger)
    piece = (lab == i).astype(np.uint8)
    c = max(cv2.findContours(piece, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
    ap = cv2.approxPolyDP(c, 0.6, True).reshape(-1, 2).astype(float)
    if len(ap) < 3: continue
    col = np.median(mc[piece > 0], 0).astype(int)
    P = plan([(u + OX, v + OY) for u, v in ap])
    out.append(dict(colour='#%02x%02x%02x' % (col[2], col[1], col[0]), pts=[[round(float(px), 3), round(float(py), 3)] for px, py in P]))
    cv2.drawContours(vis, [c], -1, (0, 0, 255), 1)
json.dump(out, open('art/canal_court/leaves.json', 'w'))
cv2.imwrite('art/canal_court/output/leaves_check.png', vis)
print(len(out), 'leaves')
