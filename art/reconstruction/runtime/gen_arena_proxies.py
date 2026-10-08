"""Rules geometry for a map reconstructed as a PROXY KIT: blocked = every primitive's footprint (unless it sets blocks: false)
plus WATER (cells of the ground texture in the measured water colour class). Water only BLOCKS, as a wall does: any water
mechanic (drowning, pushing) is GAMEPLAY INTERACTION: DEFERRED - REQUIRES RULE APPROVAL. Blocked cells on a 40-unit lattice (the rules require walls at least a player radius thick)
are merged greedily into rectangles; spawns and Book spots are farthest-point picks on open floor (as for market_plaza).
The arena box (plan units) comes from the map config ("arena": {"plan_box": [x0, x1, y0, y1], "player_radius", "block_polygons"}).
python gen_arena_proxies.py <map> <ground_tex.png> > <out.json>        (--ts <CONST_PREFIX> prints the TS module instead; its doc is the map config's "rules_doc")"""
import sys, os, json, math, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'analysis')); import proxies
MAP, GT = sys.argv[1], sys.argv[2]; TS = '--ts' in sys.argv
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); wm = cfg['world']; u = wm['units_per_plan_unit']; ar = cfg['arena']
kit = proxies.load(os.path.join(HERE, '..', 'maps', 'proxies', f'{MAP}.json'))
gt = cv2.imread(GT); gm = json.load(open(GT.replace('.png', '.json'))); GX0, GX1, GY0, GY1 = gm['box']; GS = gm['px_per_unit']
hsv = cv2.cvtColor(gt, cv2.COLOR_BGR2HSV); water = (hsv[..., 0] > 85) & (hsv[..., 0] < 115) & (hsv[..., 1] > 50)
water = cv2.morphologyEx(water.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0
bx0, bx1, by0, by1 = ar['plan_box']; W = round((bx1 - bx0) * u); H = round((by1 - by0) * u); R = ar['player_radius']; GRID = 40          # >= the rules' minimum wall thickness (a player radius)
assert abs(bx0 - wm['plan_origin_x']) < 1e-9 and abs(by1 - wm['plan_origin_y']) < 1e-9, 'world origin = arena top-left corner'
def plan(xw, yw): return xw / u + bx0, by1 - yw / u
polys = [(p['name'], np.array(poly, np.float32)) for p in kit['primitives'] if p.get('blocks', True) and p['group'] != 'ground' for poly in proxies.footprint(p)]
polys += [(b['name'], np.array(b['polygon'], np.float32)) for b in ar.get('block_polygons', [])]          # e.g. water seen through an arch
nx, ny = math.ceil(W / GRID), math.ceil(H / GRID); B = np.zeros((ny, nx), bool); WT = np.zeros((ny, nx), bool); NAME = {}
for r in range(ny):
    for c in range(nx):
        x, y = plan((c + 0.5) * GRID, (r + 0.5) * GRID)
        for name, pg in polys:
            if cv2.pointPolygonTest(pg.reshape(-1, 1, 2), (float(x), float(y)), False) >= 0: B[r, c] = True; NAME[(r, c)] = name; break
        j, i = int((x - GX0) * GS), int((GY1 - y) * GS)
        if not B[r, c] and 0 <= i < water.shape[0] and 0 <= j < water.shape[1] and water[i, j]: B[r, c] = WT[r, c] = True
walls = []; left = B.copy()
while left.any():
    r, c = np.argwhere(left)[0]; w = 1
    while c + w < nx and left[r, c + w] and WT[r, c + w] == WT[r, c]: w += 1
    h = 1
    while r + h < ny and left[r + h, c:c + w].all() and (WT[r + h, c:c + w] == WT[r, c]).all(): h += 1
    left[r:r + h, c:c + w] = False
    kind = 'WATER' if WT[r, c] else 'SOLID'; src = NAME.get((r, c), 'water')
    x0, x1, y0, y1 = c * GRID, min((c + w) * GRID, W), r * GRID, min((r + h) * GRID, H)
    x0, y0 = min(x0, x1 - GRID), min(y0, y1 - GRID)          # a rectangle clipped at the boundary keeps the full thickness
    walls.append(dict(id=f'{kind}{len(walls)}', kind=kind, source=src, x=int(x0), y=int(y0), width=int(x1 - x0), height=int(y1 - y0)))
def d2rect(p, w):
    dx = max(w['x'] - p[0], 0, p[0] - (w['x'] + w['width'])); dy = max(w['y'] - p[1], 0, p[1] - (w['y'] + w['height'])); return math.hypot(dx, dy)
def clear(p, m): return all(d2rect(p, w) >= m for w in walls) and R + 10 <= p[0] <= W - R - 10 and R + 10 <= p[1] <= H - R - 10
cand = [(x, y) for x in range(48, W - 47, 32) for y in range(48, H - 47, 32) if clear((x, y), R + 30)]
# spawns and Books only in the LARGEST connected walkable region: players must be able to reach each other
_lab = cv2.connectedComponentsWithStats((~B).astype(np.uint8), connectivity=4)
_big = 1 + int(np.argmax(_lab[2][1:, cv2.CC_STAT_AREA])) if _lab[0] > 1 else 0
cand = [p for p in cand if _lab[1][min(ny - 1, int(p[1] // GRID)), min(nx - 1, int(p[0] // GRID))] == _big]
def spread_from(first):          # greedy farthest-point order from one start: every prefix (2-6 players) is spread
    out = [first]
    while len(out) < 6: out.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in out)))
    return out
def min_gap(ss): return min(math.hypot(a[0] - b[0], a[1] - b[1]) for i, a in enumerate(ss) for b in ss[i + 1:])
def improve(sp):          # move each spawn to the open cell farthest from the others while the smallest gap grows
    sp = list(sp)
    for _ in range(20):
        better = False
        for i in range(6):
            rest = sp[:i] + sp[i + 1:]; best = max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in rest))
            if min_gap(rest + [best]) > min_gap(sp) + 1e-9: sp[i] = best; better = True
        if not better: break
    return sp
starts = sorted((spread_from(c) for c in cand[::max(1, len(cand) // 300)]), key=min_gap, reverse=True)[:10]
spawns = max((improve(s0) for s0 in starts), key=min_gap)          # the best of ten improved starts
order = [spawns[0]]          # farthest-point order again, so every prefix (2-6 players) is spread
while len(order) < 6: order.append(max((p for p in spawns if p not in order), key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in order)))
spawns = order
books = []
for _ in range(8): books.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in spawns + books)))
if not TS:
    print(json.dumps(dict(width=W, height=H, walls=walls, spawns=[dict(x=p[0], y=p[1]) for p in spawns], books=[dict(x=p[0], y=p[1]) for p in books]), indent=1)); sys.exit(0)
P = sys.argv[sys.argv.index('--ts') + 1]; DOC = '\n'.join(' * ' + line for line in cfg['rules_doc']);          # the map config owns the rules doc
T = ''.join(w.capitalize() for w in P.lower().split('_'))
v = lambda p: f'  Object.freeze({{ x: {p[0]}, y: {p[1]} }}),'
print(f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Rect }} from './arena';

/**
{DOC}
 *
 * GENERATED by art/reconstruction/runtime/gen_arena_proxies.py from the map's proxy kit (art/reconstruction/maps/proxies/{MAP}.json)
 * and ground texture — do not edit by hand. SOLID = a measured structure's footprint; WATER = the moat, which only blocks (any
 * water mechanic is GAMEPLAY INTERACTION: DEFERRED — REQUIRES RULE APPROVAL). No gates, platforms or hazards: no new mechanic.
 */

export const {P}_WIDTH = {W};
export const {P}_HEIGHT = {H};

export interface {T}Wall extends Rect {{
  readonly id: string;
  readonly kind: 'SOLID' | 'WATER';
}}

export const {P}_WALLS: readonly {T}Wall[] = Object.freeze([""")
for w in walls: print(f"  Object.freeze({{ id: '{w['id']}', kind: '{w['kind']}', x: {w['x']}, y: {w['y']}, width: {w['width']}, height: {w['height']} }}),")
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
