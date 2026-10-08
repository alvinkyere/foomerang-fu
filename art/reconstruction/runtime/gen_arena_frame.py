"""Rules geometry for a FRAME-MODE map (build_frame_map.py): every 40-unit cell is projected (z = 0) into the cleaned reference frame
and is walkable only where that pixel is a walkable surface class ("walkable": [{"hue": [lo, hi], "min_sat": s, "min_val": v}] in
OpenCV HSV) or inside a "walkable_polygons" plan polygon (e.g. a stone disc); everything else blocks - void, cliffs, rocks, and any
cell outside the observed frame. Void and drops only BLOCK: falling is GAMEPLAY INTERACTION: DEFERRED - REQUIRES RULE APPROVAL.
python gen_arena_frame.py <map> <bake_dir>  [--ts <CONST_PREFIX>]  (the module doc is the map config's "rules_doc" lines)"""
import sys, os, json, math, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'analysis'))
from proj import plane_H
MAP, BAKE = sys.argv[1], sys.argv[2]; TS = '--ts' in sys.argv
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); fm = cfg['frame_mode']; wm = cfg['world']; ar = cfg['arena']; u = wm['units_per_plan_unit']
img = cv2.resize(cv2.imread(os.path.join(BAKE, 'ground.png')), (640, 360), interpolation=cv2.INTER_AREA); hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
walk = np.zeros((360, 640), bool)
for c in ar['walkable']:
    lo, hi = c['hue']; walk |= (hsv[..., 0] >= lo) & (hsv[..., 0] <= hi) & (hsv[..., 1] >= c.get('min_sat', 0)) & (hsv[..., 2] >= c.get('min_val', 0))
walk = cv2.morphologyEx(walk.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
Href = plane_H(fm['camera_key'], fm['reference_frame'], 0.0)
# ground HIDDEN behind a cut-out (a rock, a tower) is unseen: it is taken as walkable (INFERRED: the surface continues behind it), except
# the cut-out's own footprint (build_frame_map.py footprints.json), which blocks
hidden = np.zeros((360, 640), np.uint8)
for c in cfg.get('cutouts', []): cv2.fillPoly(hidden, [np.array(c['polygon_px'], np.int32)], 1)
fp_path = os.path.join(BAKE, 'footprints.json'); FOOT = [np.array(v, np.float32).reshape(-1, 1, 2) for v in json.load(open(fp_path)).values()] if os.path.exists(fp_path) else []
FOOT = [cv2.convexHull(f) for f in FOOT if len(f) >= 3]
bx0, bx1, by0, by1 = ar['plan_box']; W = round((bx1 - bx0) * u); H = round((by1 - by0) * u); R = ar['player_radius']; GRID = 40
assert abs(bx0 - wm['plan_origin_x']) < 1e-9 and abs(by1 - wm['plan_origin_y']) < 1e-9, 'world origin = arena top-left corner'
polys = [np.array(p['polygon'], np.float32).reshape(-1, 1, 2) for p in ar.get('walkable_polygons', [])]
def open_cell(xw, yw):
    x, y = xw / u + bx0, by1 - yw / u
    if any(cv2.pointPolygonTest(pg, (float(x), float(y)), False) >= 0 for pg in polys): return True
    q = Href @ np.array([x, y, 1.0]); px, py = q[0] / q[2], q[1] / q[2]
    if not (2 <= px < 638 and 2 <= py < 358): return False          # never observed: out of bounds
    if any(cv2.pointPolygonTest(f, (float(x), float(y)), False) >= 0 for f in FOOT): return False          # a cut-out's footprint
    if hidden[int(py), int(px)]: return True          # behind a cut-out: INFERRED walkable
    return bool(walk[int(py), int(px)])
nx, ny = math.ceil(W / GRID), math.ceil(H / GRID)
B = np.array([[not open_cell((c + 0.5) * GRID, (r + 0.5) * GRID) for c in range(nx)] for r in range(ny)])
B = ~(cv2.morphologyEx((~B).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0)          # open floor needs room for a player
walls = []; left = B.copy()
while left.any():
    r, c = np.argwhere(left)[0]; w = 1
    while c + w < nx and left[r, c + w]: w += 1
    h = 1
    while r + h < ny and left[r + h, c:c + w].all(): h += 1
    left[r:r + h, c:c + w] = False
    x0, x1, y0, y1 = c * GRID, min((c + w) * GRID, W), r * GRID, min((r + h) * GRID, H); x0, y0 = min(x0, x1 - GRID), min(y0, y1 - GRID)
    walls.append(dict(id=f'BLOCK{len(walls)}', kind='BLOCK', x=int(x0), y=int(y0), width=int(x1 - x0), height=int(y1 - y0)))
def d2rect(p, w):
    dx = max(w['x'] - p[0], 0, p[0] - (w['x'] + w['width'])); dy = max(w['y'] - p[1], 0, p[1] - (w['y'] + w['height'])); return math.hypot(dx, dy)
def clear(p, m): return all(d2rect(p, w) >= m for w in walls) and R + 10 <= p[0] <= W - R - 10 and R + 10 <= p[1] <= H - R - 10
cand = [(x, y) for x in range(48, W - 47, 32) for y in range(48, H - 47, 32) if clear((x, y), R + ar.get('spawn_clearance', 30))]          # narrow islands: smaller clearance
# spawns and Books only in the LARGEST connected walkable region: players must be able to reach each other
_lab = cv2.connectedComponentsWithStats((~B).astype(np.uint8), connectivity=4)
_big = 1 + int(np.argmax(_lab[2][1:, cv2.CC_STAT_AREA])) if _lab[0] > 1 else 0
cand = [p for p in cand if _lab[1][min(ny - 1, int(p[1] // GRID)), min(nx - 1, int(p[0] // GRID))] == _big]
def spread_from(first):          # greedy farthest-point order from one start: every prefix (2-6 players) is spread
    out = [first]
    while len(out) < 6: out.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in out)))
    return out
def min_gap(ss): return min(math.hypot(a[0] - b[0], a[1] - b[1]) for i, a in enumerate(ss) for b in ss[i + 1:])
spawns = max((spread_from(c) for c in cand[::max(1, len(cand) // 60)]), key=min_gap)          # the start that spreads six best
books = []
for _ in range(8): books.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in spawns + books)))
if not TS:
    print(json.dumps(dict(width=W, height=H, walls=walls, spawns=[dict(x=p[0], y=p[1]) for p in spawns], books=[dict(x=p[0], y=p[1]) for p in books], open_cells=len(cand)), indent=1)); sys.exit(0)
P = sys.argv[sys.argv.index('--ts') + 1]; DOC = '\n'.join(' * ' + line for line in cfg['rules_doc']);          # the map config owns the rules doc
T = ''.join(w.capitalize() for w in P.lower().split('_'))
v = lambda p: f'  Object.freeze({{ x: {p[0]}, y: {p[1]} }}),'
print(f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Rect }} from './arena';

/**
{DOC}
 *
 * GENERATED by art/reconstruction/runtime/gen_arena_frame.py from the map's cleaned reference frame (art/reconstruction/maps/{MAP}.json)
 * — do not edit by hand. Walkable = the surface classes the map config names; every BLOCK is void, cliff, rock or unobserved ground.
 * Drops only block: falling is GAMEPLAY INTERACTION: DEFERRED — REQUIRES RULE APPROVAL. No gates, platforms or hazards.
 */

export const {P}_WIDTH = {W};
export const {P}_HEIGHT = {H};

export interface {T}Wall extends Rect {{
  readonly id: string;
  readonly kind: 'BLOCK';
}}

export const {P}_WALLS: readonly {T}Wall[] = Object.freeze([""")
for w in walls: print(f"  Object.freeze({{ id: '{w['id']}', kind: 'BLOCK', x: {w['x']}, y: {w['y']}, width: {w['width']}, height: {w['height']} }}),")
print(f"""] as const);

/** One spawn per slot; greedy farthest-point order so every prefix (2 to 6 players) is spread. */
export const {P}_SPAWNS: readonly Vec2[] = Object.freeze([""")
for p in spawns: print(v(p))
print(f"""]);

/** Where Books may appear: open floor away from every spawn. */
export const {P}_BOOK_SPOTS: readonly Vec2[] = Object.freeze([""")
for p in books: print(v(p))
print(f"""]);

export const {P}_ARENA: FuArena = Object.freeze({{
  width: {P}_WIDTH,
  height: {P}_HEIGHT,
  walls: Object.freeze({P}_WALLS.map(({{ x, y, width, height }}) => Object.freeze({{ x, y, width, height }}))),
  spawns: {P}_SPAWNS,
}});""")
