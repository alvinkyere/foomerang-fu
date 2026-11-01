"""Where the render (output/render.png) still differs from the frame (output/reference.png): the per-pixel colour difference (Lab, CIE76),
outside the HUD and the READY text; prints the mean and its share over thresholds, writes output/heat.jpg (the difference, bright = far)
beside the two images.

  python art/autumn_glade/heat.py       (from the repository root; the Python of art/audio/output/venv)
"""
import numpy as np, cv2
a = cv2.imread('art/autumn_glade/output/render.png'); b = cv2.imread('art/autumn_glade/output/reference.png')
la, lb = cv2.cvtColor(a, cv2.COLOR_BGR2LAB).astype(float), cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(float)
la[..., 0] *= 100 / 255; lb[..., 0] *= 100 / 255; la[..., 1:] -= 128; lb[..., 1:] -= 128
d = np.sqrt(((la - lb) ** 2).sum(-1))
valid = np.ones(d.shape, bool); valid[:, :215] = False; valid[470:620, 740:1190] = False
v = d[valid]
print('mean dE %.2f  median %.2f  >5: %.1f%%  >10: %.1f%%  >20: %.1f%%' % (v.mean(), np.median(v), (v > 5).mean() * 100, (v > 10).mean() * 100, (v > 20).mean() * 100))
# by region (a 4x3 grid): the mean dE of each cell
for r in range(3):
    print(' '.join('%5.1f' % d[r * 360:(r + 1) * 360, c * 480:(c + 1) * 480][valid[r * 360:(r + 1) * 360, c * 480:(c + 1) * 480]].mean() for c in range(4)))
hm = cv2.applyColorMap(np.clip(cv2.GaussianBlur(d, (0, 0), 3) * 8, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO); hm[~valid] = 0
cv2.imwrite('art/autumn_glade/output/heat.jpg', cv2.resize(hm, (960, 540)))
