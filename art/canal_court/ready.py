"""The READY frame as the reference (2026-11-14): the frame itself (654.5 s, output/reference.png: crisp, its water as drawn at that
moment), only what is not the map filled from the round's mosaic: the three players, their power icons and the names list. (The mosaic
alone, a median over a moving camera's frames, smears everything that moves: the water's streaks, the pool's vortex, the props' edges.)
Writes output/clean_ref_raw.png (OpenCV's decode) and output/clean_ref.png (as Chrome shows it: chrome.py).

  python art/canal_court/ready.py      (after mosaic.py; the Python of art/audio/output/venv)
"""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from chrome import chrome
from measure import MOSAIC_ORIGIN

f = cv2.imread('art/canal_court/output/reference.png')
OX, OY = MOSAIC_ORIGIN
m = cv2.imread('art/canal_court/output/mosaic.png')[-OY:-OY + 1080, -OX:-OX + 1920]
hole = np.zeros(f.shape[:2], np.uint8)
for x, y, r in ((307, 300, 48), (1612, 205, 48), (1562, 760, 52)):            # (the banana, the eggplant, the donut)
    cv2.circle(hole, (x, y), r, 1, -1)
for x0, y0, x1, y1 in ((248, 130, 300, 200), (250, 195, 375, 255), (1520, 100, 1585, 165), (1455, 640, 1660, 715)):   # (the icons)
    hole[y0:y1, x0:x1] = 1
out = f.copy(); out[hole > 0] = m[hole > 0]
# (the names, printed over the frame's top left: every frame has them there, so no frame shows the ground under them: the whole box
# painted over from round about (the west tree standing there is a model: blender/build.py))
nm = np.zeros(out.shape[:2], np.uint8); nm[95:385, 0:220] = 255
out = cv2.inpaint(out, nm, 15, cv2.INPAINT_TELEA)
cv2.imwrite('art/canal_court/output/clean_ref_raw.png', out)
cv2.imwrite('art/canal_court/output/clean_ref.png', chrome(out))
np.save('art/canal_court/output/ready_hole.npy', hole)
print('filled', int(hole.sum()), 'px from the mosaic')
