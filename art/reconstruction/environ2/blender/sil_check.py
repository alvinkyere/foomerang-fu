"""Silhouette exactness of a painted render (its alpha) against step-3 masks: IoU, and pixels missing / extra."""
import sys, cv2, numpy as np
R = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
mine = R[..., 3] > 127
img = np.zeros(mine.shape, bool)
for f in sys.argv[2:]:
    img |= np.load(f) > 0
print(f'IoU {(mine & img).sum() / (mine | img).sum():.4f}  missing {int((img & ~mine).sum())}  extra {int((mine & ~img).sum())}  of {int(img.sum())}')
