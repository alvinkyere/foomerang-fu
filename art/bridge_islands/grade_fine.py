"""The water's screen-space grade at a finer grid (2026-11-05), fitted on a map-only shot (`?bare=on`): the existing grade resampled to
COLS x ROWS, then each cell's offset moved by DAMP times the mean HQ - game difference over the open water both show near it (pixels next to
land left out: the edge's own look is the shader's, not the grade's). Cumulative: shoot, run, repeat until the change is ~0.

  <shoot_bare.sh> name; python art/bridge_islands/grade_fine.py art/bridge_islands/output/<name>.png
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/bridge_islands')
from mapcmp import mask

COLS, ROWS, DAMP = 17, 10, 0.7
H = cv2.imread('art/bridge_islands/output/reference.png'); G = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080))
water = lambda f: (lambda x: (x[..., 0] >= 85) & (x[..., 0] < 110) & (x[..., 1] > 30))(cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int))
m = water(H) & water(G) & mask()
m = cv2.erode(m.astype(np.uint8), np.ones((11, 11), np.uint8)) > 0
gd = json.load(open('art/bridge_islands/grade.json'))
old = np.array(gd['offsets'], float).reshape(gd['rows'], gd['cols'], 3)
def basis(cols, rows, xs, ys):
    """Each pixel's bilinear weights on the grid's nodes, as the shader blends them (nodes at the canvas's edges and evenly between)."""
    gx = np.clip(xs / 1920, 0, 1) * (cols - 1); gy = np.clip(ys / 1080, 0, 1) * (rows - 1)
    x0 = np.minimum(np.floor(gx), cols - 2).astype(int); y0 = np.minimum(np.floor(gy), rows - 2).astype(int); fx, fy = gx - x0, gy - y0
    B = np.zeros((len(xs), rows * cols))
    for dy, wy in ((0, 1 - fy), (1, fy)):
        for dx, wx in ((0, 1 - fx), (1, fx)):
            np.add.at(B, (np.arange(len(xs)), (y0 + dy) * cols + x0 + dx), wy * wx)
    return B


# the old grade, at its own grid, evaluated at the new grid's nodes (exactly what the shader drew there)
nx, ny = np.meshgrid(np.arange(COLS) * 1920 / (COLS - 1), np.arange(ROWS) * 1080 / (ROWS - 1))
Bo = basis(gd['cols'], gd['rows'], nx.ravel(), ny.ravel())
old = (Bo @ np.array(gd['offsets'], float)).reshape(ROWS, COLS, 3)
ys, xs = np.nonzero(m); pick = np.random.default_rng(0).choice(len(xs), min(len(xs), 60000), replace=False); ys, xs = ys[pick], xs[pick]
B = basis(COLS, ROWS, xs.astype(float), ys.astype(float))
diff = (H.astype(float) - G.astype(float))[ys, xs][:, ::-1]           # RGB
lam = 50.0                                                              # (a little smoothing: cells with little water lean on their neighbours)
L = np.zeros((0, ROWS * COLS))
rowsL = []
for r in range(ROWS):
    for c in range(COLS):
        for rr, cc in ((r, c + 1), (r + 1, c)):
            if rr < ROWS and cc < COLS:
                v = np.zeros(ROWS * COLS); v[r * COLS + c] = 1; v[rr * COLS + cc] = -1; rowsL.append(v)
L = np.array(rowsL)
A = B.T @ B + lam * L.T @ L
delta = np.linalg.solve(A, B.T @ diff)
new = old + 0.5 * delta.reshape(ROWS, COLS, 3)      # (the shader adds the offset in linear colour, which the screen shows ~2x as large near the water's tones)
print('mean |change| %.2f levels, largest %.1f' % (np.abs(new - old).mean(), np.abs(new - old).max()))
json.dump(dict(cols=COLS, rows=ROWS, offsets=[[round(float(v), 1) for v in o] for o in new.reshape(-1, 3)]), open('art/bridge_islands/grade.json', 'w'))
