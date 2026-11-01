"""Fits the water's screen-space colour grade (waterShader.ts `grade`) to the HQ frame: per cell of a COLS x ROWS grid, the mean difference HQ - game over the water
pixels both show as water is added to the cell's offset (grade.json), so the haze and the light's tint come out as the video's. Cumulative: run it after each shot.

  <bi_loop.sh> name; python art/bridge_islands/grade.py art/bridge_islands/output/<name>.png
"""
import json, os, sys
import numpy as np, cv2

COLS, ROWS = 9, 6
g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)).astype(float); h = cv2.imread('art/bridge_islands/output/reference.png').astype(float)
water = lambda f: (lambda x: (x[..., 0] >= 90) & (x[..., 0] <= 110) & (x[..., 1] > 40) & (x[..., 2] > 130) & (x[..., 2] < 235))(cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(int))
m = water(h) & water(g); m[:, :215] = False
m = cv2.erode(m.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
old = np.array(json.load(open('art/bridge_islands/grade.json'))['offsets'], float) if os.path.exists('art/bridge_islands/grade.json') else np.zeros((ROWS * COLS, 3))
new = old.copy(); have = np.zeros(ROWS * COLS, bool)
cw, ch = 1920 / (COLS - 1), 1080 / (ROWS - 1)
for r in range(ROWS):
    for c in range(COLS):
        cx, cy = c * cw, r * ch
        x0, x1, y0, y1 = int(max(cx - cw, 0)), int(min(cx + cw, 1920)), int(max(cy - ch, 0)), int(min(cy + ch, 1080))
        mm = m[y0:y1, x0:x1]
        if mm.sum() < 1500: continue
        d = (h[y0:y1, x0:x1][mm] - g[y0:y1, x0:x1][mm]).mean(0)[::-1]      # RGB
        new[r * COLS + c] += 0.5 * d; have[r * COLS + c] = True
for i in np.nonzero(~have)[0]:                                            # (a cell with no water: its neighbours' mean)
    r, c = divmod(i, COLS)
    nb = [new[rr * COLS + cc] for rr in range(max(r - 1, 0), min(r + 2, ROWS)) for cc in range(max(c - 1, 0), min(c + 2, COLS)) if have[rr * COLS + cc]]
    if nb: new[i] = np.mean(nb, 0)
print('mean |change| per cell: %.2f levels, largest %.1f' % (np.abs(new - old).mean(), np.abs(new - old).max()))
json.dump(dict(cols=COLS, rows=ROWS, offsets=[[round(float(v), 1) for v in o] for o in new]), open('art/bridge_islands/grade.json', 'w'))
