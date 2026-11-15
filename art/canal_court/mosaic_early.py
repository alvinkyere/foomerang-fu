"""The round's mosaic from its frames before the Battle Royale (2026-11-14): from ~664 s the power darkens everything outside its
closing ring and fills the outskirts with its red, and a median over the whole round took that darkening in (the east sand came out
khaki). The same canvas and homographies as mosaic.py (H.json, mosaic.json's origin), the median over the frames before T_END only;
what they never saw stays black (ground.py treats it as unseen). The names' corner of every frame is left out. Writes output/mosaic.png (the whole round's kept as mosaic_all.png).

  python art/canal_court/mosaic_early.py      (after mosaic.py; the Python of art/audio/output/venv)
"""
import json, os, shutil
import numpy as np, cv2
O = 'art/canal_court/output/'
T_END = 664.0
Hs = {k: np.array(v) for k, v in json.load(open(O + 'H.json')).items() if int(k[:5]) / 60 < T_END}
mj = json.load(open(O + 'mosaic.json')); x0, y0 = mj['origin']
if not os.path.exists(O + 'mosaic_all.png'): shutil.copy(O + 'mosaic.png', O + 'mosaic_all.png')
Hh, W = cv2.imread(O + 'mosaic_all.png').shape[:2]
ims = {k: cv2.imread(O + 'frames/' + k) for k in Hs}
# (the screen's overlays, the same in every frame: the players' names at the top left: no part of any frame's mosaic)
VALID = np.full((1080, 1920), 255, np.uint8); VALID[50:400, 0:240] = 0
out = np.zeros((Hh, W, 3), np.uint8); STR = 64
for ys in range(0, Hh, STR):
    T = np.array([[1, 0, -x0], [0, 1, -y0 - ys], [0, 0, 1]], float); st = []
    for k, h in Hs.items():
        v = cv2.warpPerspective(VALID, T @ h, (W, STR), flags=cv2.INTER_NEAREST) > 0
        if not v.any(): continue
        w = cv2.warpPerspective(ims[k], T @ h, (W, STR)).astype(np.float32); w[~v] = np.nan; st.append(w)
    if st: out[ys:ys + STR] = np.nan_to_num(np.nanmedian(np.stack(st), 0))[:Hh - ys]
cv2.imwrite(O + 'mosaic.png', out)
import sys; sys.path.insert(0, 'art/canal_court'); from chrome import chrome
cv2.imwrite(O + 'mosaic_chrome.png', chrome(out))
print('mosaic of', len(Hs), 'frames before', T_END)
