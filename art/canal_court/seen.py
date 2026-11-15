"""Where the round's frames (before the Battle Royale) saw the ground (2026-11-15): the mosaic's covered pixels, laid on ground.json's grid
(1 unit a node), shrunk a unit. blender/build.py lays the sand where no frame saw (the game's follow camera can look beyond what the HQ's
showed; ground.py's base fills those parts with a blur of whatever was nearest, a khaki smear by the east grass). Writes seen.json.

  python art/canal_court/seen.py      (after mosaic_early.py and ground.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import pix, MOSAIC_ORIGIN
G = json.load(open('art/canal_court/ground.json'))
m = cv2.imread('art/canal_court/output/mosaic.png'); cov = cv2.erode((m.sum(2) > 30).astype(np.uint8), np.ones((15, 15), np.uint8))
OX, OY = MOSAIC_ORIGIN; out = []
for j in range(G['ny']):
    for i in range(G['nx']):
        u, v = pix(G['x0'] + i * G['dx'], G['y0'] + j * G['dx']); u, v = int(round(u - OX)), int(round(v - OY))
        out.append(int(0 <= v < cov.shape[0] and 0 <= u < cov.shape[1] and cov[v, u] > 0))
json.dump(out, open('art/canal_court/seen.json', 'w'))
print(sum(out), 'of', len(out), 'nodes seen')
