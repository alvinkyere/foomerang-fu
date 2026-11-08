"""The render against the HQ (ff physics hq 2.mp4 121.5 s): side by side, a 50% blend, and the mean Lab difference over the frame
(the players' names masked). python art/temple_court/compare.py <render.png> <out_prefix> [mosaic]
With `mosaic`, the render is laid against the mosaic's part inside the frame (the round's median: no players, no READY)."""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/temple_court')
from measure import MOSAIC_ORIGIN

r = cv2.imread(sys.argv[1]); out = sys.argv[2]
if len(sys.argv) > 3 and sys.argv[3] == 'mosaic':
    M = cv2.imread('art/temple_court/output/mosaic.png'); ox, oy = -MOSAIC_ORIGIN[0], -MOSAIC_ORIGIN[1]; f = M[oy:oy + 1080, ox:ox + 1920]
else:
    f = cv2.imread('art/temple_court/output/reference.png')
mask = np.ones(f.shape[:2], bool); mask[90:390, :230] = False
d = np.linalg.norm(cv2.cvtColor(r, cv2.COLOR_BGR2Lab).astype(float) - cv2.cvtColor(f, cv2.COLOR_BGR2Lab).astype(float), axis=2) * (100 / 255)
print('mean dLab %.2f median %.2f, >10: %.1f%%' % (d[mask].mean(), np.median(d[mask]), 100 * (d[mask] > 10).mean()))
cv2.imwrite(out + '_blend.jpg', cv2.resize(cv2.addWeighted(r, 0.5, f, 0.5, 0), (960, 540)))
cv2.imwrite(out + '_side.jpg', np.vstack([cv2.resize(r, (960, 540)), cv2.resize(f, (960, 540))]))
cv2.imwrite(out + '_diff.jpg', cv2.resize(np.clip(d * 6, 0, 255).astype(np.uint8), (960, 540)))
