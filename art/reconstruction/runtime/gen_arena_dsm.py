"""Rules geometry (walls, spawns, Book spots) for a map reconstructed as a height map (analysis/dsm_mesh.py output).
Blocked = raised cells (z > the mesh threshold) or WATER (the measured water colour class; water is out of bounds, never a hazard:
GAMEPLAY INTERACTION with water is DEFERRED - it just blocks, as a wall does). The arena box (plan units) and the world mapping come
from maps/<map>.json. Blocked cells are sampled on a GRID world-unit lattice and merged greedily into rectangles.
python gen_arena_dsm.py <map> <mesh_dir> <sweep.npz>  > <map>_arena.json"""
import sys, os, json, math, numpy as np, cv2
MAP, MESH, NPZ = sys.argv[1:4]; HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); wm = cfg['world']; u = wm['units_per_plan_unit']; ar = cfg['arena']
Z = np.load(os.path.join(MESH, 'height_clean.npy')); g = json.load(open(os.path.join(MESH, 'groups.json'))); X0, X1, Y0, Y1 = g['box']; S = g['px_per_unit']
COL = np.load(NPZ)['colour']; hsv = cv2.cvtColor(COL, cv2.COLOR_BGR2HSV)
water = (hsv[..., 0] > 85) & (hsv[..., 0] < 115) & (hsv[..., 1] > 50) & (Z == 0)
water = cv2.morphologyEx(water.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
blocked = (Z > 0) | water
W, H, R, GRID = ar['width'], ar['height'], ar['player_radius'], 20
def plan(xw, yw): return xw / u + wm['plan_origin_x'], wm['plan_origin_y'] - yw / u
def cell(xw, yw, grid):
    x, y = plan(xw, yw); j, i = int((x - X0) * S), int((Y1 - y) * S)
    if not (0 <= i < Z.shape[0] and 0 <= j < Z.shape[1]): return True        # never observed: out of bounds
    return bool(grid[i, j])
nx, ny = math.ceil(W / GRID), math.ceil(H / GRID)
B = np.array([[cell((c + 0.5) * GRID, (r + 0.5) * GRID, blocked) for c in range(nx)] for r in range(ny)])
Wt = np.array([[cell((c + 0.5) * GRID, (r + 0.5) * GRID, water) for c in range(nx)] for r in range(ny)], float)
B = cv2.morphologyEx(B.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0          # drop single-cell specks
walls = []; left = B.copy()
while left.any():          # greedy maximal rectangles, widest first
    r, c = np.argwhere(left)[0]; w = 1
    while c + w < nx and left[r, c + w]: w += 1
    h = 1
    while r + h < ny and left[r + h, c:c + w].all(): h += 1
    left[r:r + h, c:c + w] = False
    kind = 'WATER' if Wt[r:r + h, c:c + w].mean() > 0.5 else 'BLOCK'
    walls.append(dict(id=f'W{len(walls)}', kind=kind, x=int(c * GRID), y=int(r * GRID), width=int(min(w * GRID, W - c * GRID)), height=int(min(h * GRID, H - r * GRID))))
def d2rect(p, w):
    dx = max(w['x'] - p[0], 0, p[0] - (w['x'] + w['width'])); dy = max(w['y'] - p[1], 0, p[1] - (w['y'] + w['height'])); return math.hypot(dx, dy)
def clear(p, m): return all(d2rect(p, w) >= m for w in walls) and R + 10 <= p[0] <= W - R - 10 and R + 10 <= p[1] <= H - R - 10
cand = [(x, y) for x in range(48, W - 47, 32) for y in range(48, H - 47, 32) if clear((x, y), R + 24)]
spawns = [min(cand, key=lambda p: math.hypot(p[0] - W * 0.15, p[1] - H * 0.2))]
while len(spawns) < 6: spawns.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in spawns)))
books = []
for _ in range(8): books.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in spawns + books)))
print(json.dumps(dict(width=W, height=H, walls=walls, spawns=[dict(x=p[0], y=p[1]) for p in spawns], books=[dict(x=p[0], y=p[1]) for p in books],
                      open_cells=len(cand)), indent=1))
