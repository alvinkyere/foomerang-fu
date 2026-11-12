"""What stands on the warm-up's ground (2026-11-12): the round's mosaic (Chrome's colours) against our wide render of the ground and the
moat alone (blender/build.py `render wide`: the mosaic's own view): where they differ by more than DIFF, and away from the moat, the hex
fields' pads (the game's own plants) and the mosaic's edge, is something standing. Connected pieces, numbered; the ones kept (KEEP) are
written to output/objects.npy (a label image in the mosaic's pixels) for cards.py. Writes output/objects.jpg (numbered).

  python art/warm_up/objects.py <wide render.png>      (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up')
from measure import pix, MOSAIC_ORIGIN

DIFF = 30
r = cv2.imread(sys.argv[1]); m = cv2.imread('art/warm_up/output/mosaic_chrome.png')
OX, OY = MOSAIC_ORIGIN
d = np.abs(r.astype(int) - m.astype(int)).max(2)
h = cv2.cvtColor(m, cv2.COLOR_BGR2HSV).astype(int); Hu, S, V = h[..., 0], h[..., 1], h[..., 2]
seen = cv2.erode((m.sum(2) > 30).astype(np.uint8), np.ones((25, 25), np.uint8)) > 0
moat = np.zeros(d.shape, np.uint8); MOAT = json.load(open('art/warm_up/moat.json'))
to = lambda poly: np.int32([[x - OX, y - OY] for x, y in (pix(px, py) for px, py in poly)])
cv2.fillPoly(moat, [to(MOAT['outer'])], 1); cv2.fillPoly(moat, [to(MOAT['inner'])], 0)
moat = cv2.dilate(moat, np.ones((15, 15), np.uint8)) > 0
teal = (Hu >= 68) & (Hu <= 92) & (S >= 60) & (V >= 140)                      # (the hex fields' pads: the game's plants)
grassy = (Hu >= 25) & (Hu <= 62) & (S < 150) & (V >= 150) & (d < 60)          # (ground the render's base missed by a little)
obj = (d > DIFF) & seen & ~moat & ~teal & ~grassy
obj = cv2.morphologyEx(cv2.morphologyEx(obj.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(obj)
v = m.copy(); v[obj > 0] = (v[obj > 0] * 0.4 + np.array([0, 0, 255]) * 0.6).astype(np.uint8)
keep = [i for i in range(1, n) if st[i, 4] >= 150]
for i in keep: cv2.putText(v, str(i), (int(cen[i][0]), int(cen[i][1])), 0, 0.9, (255, 255, 255), 3); cv2.putText(v, str(i), (int(cen[i][0]), int(cen[i][1])), 0, 0.9, (0, 0, 0), 1)
cv2.imwrite('art/warm_up/output/objects.jpg', v)
np.save('art/warm_up/output/objects_all.npy', lab.astype(np.int32))
print(len(keep), 'pieces:', [(i, int(st[i, 4]), (int(cen[i][0]), int(cen[i][1]))) for i in keep])
