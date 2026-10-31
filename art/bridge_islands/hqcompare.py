"""The game against the HQ frame, the same view (2026-10-30; the owner: "compare the HQ screenshot with a scene in our game and ensure it is the same").

  FU=0 FV=0 <TMP>/shoot_hq.sh name 1500        (a Playwright shot of the game at ?arena=lily&frame=hq, 1920x1080; see docs/BRIDGE_ISLANDS_HANDOFF.md)
  python art/bridge_islands/hqcompare.py <game.png>        (from the repository root; the Python of art/audio/output/venv)

Finds how far the game's view is from the HQ's (phase correlation of their edges: the pixel shift, which is what `fu`/`fv` in the URL should
absorb), prints the shift and the share of pixels that still differ by more than 12 levels (HUD and players' names masked), and writes
output/hqcmp.jpg (HQ | game | |difference|).
"""
import sys
import numpy as np, cv2

g = cv2.imread(sys.argv[1]); h = cv2.imread('art/bridge_islands/output/reference.png')
g = cv2.resize(g, (h.shape[1], h.shape[0]))
def grass(f):
    hs = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
    m = (hs[..., 0] > 25) & (hs[..., 0] < 55) & (hs[..., 1] > 50) & (hs[..., 2] > 190); m[:, :215] = 0
    return m.astype(np.float32)


# how far the game's view is from the HQ's: the scale and shift that best lay the game's grass over the HQ's (the grass is the biggest, flattest thing)
A, B = grass(h), grass(g)
ax, ay = np.nonzero(A)[1].mean(), np.nonzero(A)[0].mean()
best = None
for sc_ in np.arange(0.92, 1.08, 0.004):
    Bs = cv2.warpAffine(B, cv2.getRotationMatrix2D((960, 540), 0, sc_), (1920, 1080))
    ys, xs = np.nonzero(Bs); bx, by = xs.mean(), ys.mean()
    for ddx in range(-9, 10, 3):
        for ddy in range(-9, 10, 3):
            Bb = cv2.warpAffine(Bs, np.float32([[1, 0, ax - bx + ddx], [0, 1, ay - by + ddy]]), (1920, 1080))
            iou = (A * Bb).sum() / max(((A + Bb) > 0).sum(), 1)
            if best is None or iou > best[0]: best = (iou, sc_, ax - bx + ddx, ay - by + ddy)
iou, sc_, dx, dy = best
print('grass IoU %.3f at scale %.3f, shift (%.1f, %.1f) px: the game wants fz x %.3f, fu +%.4f, fv +%.4f' % (iou, sc_, dx, dy, 1 / sc_, -dx / (960 * 0.9), dy / (540 * 0.9)))
M = cv2.getRotationMatrix2D((960, 540), 0, sc_); M[:, 2] += (dx, dy)
gs = cv2.warpAffine(g, M, (h.shape[1], h.shape[0]), borderMode=cv2.BORDER_REPLICATE)
mask = np.ones(h.shape[:2], bool); mask[:, :215] = False; mask[300:400, 1255:1470] = False
d = np.abs(gs.astype(int) - h.astype(int)).max(2); d0 = np.abs(g.astype(int) - h.astype(int)).max(2)
print('differing >12 levels: %.1f%% as shot, %.1f%% after the shift' % (100 * (d0[mask] > 12).mean(), 100 * (d[mask] > 12).mean()))
cv2.imwrite('art/bridge_islands/output/hqcmp.jpg', cv2.resize(np.hstack([h, gs, np.clip(np.repeat(d[..., None], 3, 2) * 3, 0, 255).astype(np.uint8)]), (2880, 540)))
