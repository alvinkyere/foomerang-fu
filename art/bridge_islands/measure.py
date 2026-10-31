"""How close the build is to the HQ frame (2026-10-30): our pixel-aligned render (Blender, the game's light) against output/reference.png.

  python art/bridge_islands/measure.py <render.png>        (from the repository root; the Python of art/audio/output/venv)

Prints the IoU of the grass, stone and tree masks, the median colour of each class in both (as #rrggbb) and the share of pixels that
differ by more than 12 levels (HUD and the players' names masked). Writes output/diff.png (the absolute difference, x3). Every
number here is a gap to close; none is a pass mark on its own.
"""
import sys
import numpy as np, cv2

ours = cv2.imread(sys.argv[1]); hq = cv2.imread('art/bridge_islands/output/reference.png')
ours = cv2.resize(ours, (hq.shape[1], hq.shape[0]))
hud = np.zeros(hq.shape[:2], bool); hud[:, :215] = True; hud[300:400, 1255:1470] = True      # names, the power icons over a player


def masks(f):
    h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
    grass = (((h[..., 0] > 25) & (h[..., 0] < 55) & (h[..., 1] > 50) & (h[..., 2] > 190)) | ((h[..., 0] >= 55) & (h[..., 0] <= 95) & (h[..., 1] > 30) & (h[..., 1] < 95) & (h[..., 2] >= 228)))
    stone = (h[..., 0] >= 108) & (h[..., 0] <= 130) & (h[..., 1] >= 55) & (h[..., 2] >= 120)
    tree = ((h[..., 0] <= 14) | (h[..., 0] >= 170)) & (h[..., 1] > 110) & (h[..., 2] > 150)
    return dict(grass=grass & ~hud, stone=stone & ~hud, tree=tree & ~hud)


a, b = masks(ours), masks(hq)
hexc = lambda px: '#%02x%02x%02x' % tuple(int(v) for v in px[::-1])
for k in a:
    inter, union = (a[k] & b[k]).sum(), (a[k] | b[k]).sum()
    ma = hexc(np.median(ours[a[k] & b[k]], 0)) if (a[k] & b[k]).any() else '-'
    mb = hexc(np.median(hq[a[k] & b[k]], 0)) if (a[k] & b[k]).any() else '-'
    print(f'{k:6s} IoU {inter / max(union, 1):.3f}  ours {ma}  HQ {mb}   (ours {a[k].sum()} px, HQ {b[k].sum()} px)')
d = np.abs(ours.astype(int) - hq.astype(int)).max(2)
d[hud] = 0
print('pixels differing by more than 12 levels: %.1f%%' % (100 * (d > 12).mean()))
cv2.imwrite('art/bridge_islands/output/diff.png', np.clip(d * 3, 0, 255).astype(np.uint8))
