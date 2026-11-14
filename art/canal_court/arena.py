"""The canal court's rules data (2026-11-13): writes games/foomerang-fu/src/rules/canalCourtArena.ts from tops.json (fit_tops.py: the
aqueduct's and the rocks' outlines), basin.json (fit_basin.py) and cards.json (cards.py: where the props stand). World units are the
plaza's (27.48 a plan unit); x east from plan X X0, y south from plan Y Y1 (plan y is north).

  walls    the tower, the channel (in pieces along its centreline: each piece's part of the outline covered by turned boxes across it),
           the stub, the basin (the whole octagon: its blocks stand 2.3 high round its pool, nobody gets in), the four rocks; the barrels
           and the bucket (discs), the bench, the rack and the plank (turned boxes): the HQ's blasts and boomerangs never break them
  border   the dashed rectangle the HQ draws round the kerb's skirt (its Battle Royale closes it): safeZone
  spawns   six on the court's paving, clear of the walls, spread apart (the first four where the HQ's players stand at READY); Book
           spots likewise

  python art/canal_court/arena.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

S = 27.48
X0, X1, Y0, Y1 = -30.0, 32.0, -20.0, 22.0
json.dump(dict(X0=X0, X1=X1, Y0=Y0, Y1=Y1, S=S), open('art/canal_court/arena.json', 'w'))
w = lambda X, Y: (round((X - X0) * S), round((Y1 - Y) * S))
WIDTH, HEIGHT = round((X1 - X0) * S), round((Y1 - Y0) * S)
TOPS = json.load(open('art/canal_court/tops.json')); BA = json.load(open('art/canal_court/basin.json'))
AQ = json.load(open('art/canal_court/aqueduct.json')); CARDS = {c['name']: c for c in json.load(open('art/canal_court/cards.json'))}
KERB = json.load(open('art/canal_court/kerb.json'))['bands']
walls = []


def turned_box(id_, cx, cy, hx, hy, yaw=0.0):
    x, y = w(cx, cy)
    walls.append(dict(id=id_, kind='WALL', shape='box', x=x, y=y, halfWidth=round(max(hx * S, 18)), halfHeight=round(max(hy * S, 18)),
                      angle=round(-yaw, 4)))


def boxes_for(id_, poly, strips, yaw=None):
    """The outline covered by turned boxes: along its long axis (its minimum-area rectangle, or `yaw`), `strips` strips, each from the
    outline's nearest to its farthest extent across the axis inside that strip (drawn at 40 px a unit)."""
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(np.float32(poly))
    if yaw is None: yaw = math.radians(ang) if rw >= rh else math.radians(ang + 90)
    u = np.array([math.cos(yaw), math.sin(yaw)]); v = np.array([-u[1], u[0]])
    P = np.float32([[(np.array(p) - (cx, cy)) @ u, (np.array(p) - (cx, cy)) @ v] for p in poly])
    lo, hi = P.min(0), P.max(0); K = 40
    img = np.zeros((int((hi[1] - lo[1]) * K) + 3, int((hi[0] - lo[0]) * K) + 3), np.uint8)
    cv2.fillPoly(img, [np.int32((P - lo) * K)], 1)
    edges = np.linspace(0, img.shape[1], strips + 1).astype(int)
    for k in range(strips):
        part = img[:, edges[k]:edges[k + 1]]
        rows = np.nonzero(part.any(1))[0]; cols = np.nonzero(part.any(0))[0]
        if len(rows) == 0: continue
        a0, a1 = (edges[k] + cols.min()) / K + lo[0], (edges[k] + cols.max() + 1) / K + lo[0]
        b0, b1 = rows.min() / K + lo[1], (rows.max() + 1) / K + lo[1]
        c = np.array([cx, cy]) + u * (a0 + a1) / 2 + v * (b0 + b1) / 2
        turned_box(f'{id_}_{k}', c[0], c[1], (a1 - a0) / 2, (b1 - b0) / 2, yaw)


def clip(poly, keep):
    """The polygon's part inside the plan polygon `keep` (drawn at 40 px a unit; its largest piece)."""
    K = 40; allp = np.array(poly + keep); lo = allp.min(0) - 1
    to = lambda pts: np.int32([((x - lo[0]) * K, (y - lo[1]) * K) for x, y in pts])
    sz = (int((allp.max(0)[1] - lo[1] + 1) * K), int((allp.max(0)[0] - lo[0] + 1) * K))
    a = np.zeros(sz, np.uint8); cv2.fillPoly(a, [to(poly)], 1); b = np.zeros(sz, np.uint8); cv2.fillPoly(b, [to(keep)], 1)
    cs, _ = cv2.findContours(a & b, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs: return None
    c = max(cs, key=cv2.contourArea).reshape(-1, 2)
    return [(x / K + lo[0], y / K + lo[1]) for x, y in c]


boxes_for('TOWER', TOPS['tower']['pts'], 4)
boxes_for('STUB', TOPS['stub']['pts'], 2)
# the channel: a piece for each run of its centreline (the outline's part within a band round it), boxes along that run
line = TOPS['channel']['line']
for k, (a, b) in enumerate(zip(line[:-1], line[1:])):
    a, b = np.array(a), np.array(b); d = b - a; L = np.linalg.norm(d); u = d / L; n = np.array([-u[1], u[0]]); half = 3.0
    band = [tuple(p) for p in (a - u * 0.6 + n * half, b + u * 0.6 + n * half, b + u * 0.6 - n * half, a - u * 0.6 - n * half)]
    piece = clip(TOPS['channel']['pts'], band)
    if piece: boxes_for(f'CHANNEL{k}', piece, max(1, int(L / 2.5)), yaw=math.atan2(u[1], u[0]))
oct_ = [(BA['cx'] + (BA['r'] + 0.6) * math.cos(BA['turn'] + k * math.pi / 4), BA['cy'] + (BA['r'] + 0.6) * math.sin(BA['turn'] + k * math.pi / 4)) for k in range(8)]
boxes_for('BASIN', oct_, 5)
for name in ('rock_sw', 'rock_n', 'rock_e', 'rock_se'):
    boxes_for(name.upper(), TOPS[name]['pts'], 3)
# the props, from their feet (cards.py: the lowest point of each, its front): their middles that far behind
for name, r in (('barrel_nw', 1.0), ('barrel_n', 1.0), ('barrel_s', 1.0), ('bucket', 0.7)):
    fx, fy = CARDS[name]['anchor']; x, y = w(fx, fy + r * 0.8)
    walls.append(dict(id=name.upper(), kind='WALL', shape='disc', x=x, y=y, radius=max(18, round(r * S))))
fx, fy = CARDS['bench']['anchor']; turned_box('BENCH', fx, fy + 0.9, 1.5, 0.75)
fx, fy = CARDS['rack']['anchor']; turned_box('RACK', fx + 0.3, fy + 0.2, 2.6, 0.3)
fx, fy = CARDS['plank']['anchor']; turned_box('PLANK', fx - 0.3, fy + 1.0, 1.3, 0.45, yaw=math.radians(-48))

# the border: the kerb's skirt's outer outline's box (the HQ's dashes run along it, 662-665 s)
P = np.array(KERB[0]['pts']); bx0, by0 = w(P[:, 0].min(), P[:, 1].max()); bx1, by1 = w(P[:, 0].max(), P[:, 1].min())
zone = dict(x=bx0, y=by0, width=bx1 - bx0, height=by1 - by0)


def clear(px, py, m):
    for o in walls:
        if o['shape'] == 'disc':
            if math.hypot(px - o['x'], py - o['y']) < o['radius'] + m: return False
            continue
        c, s_ = math.cos(o['angle']), math.sin(o['angle'])
        dx, dy = px - o['x'], py - o['y']
        lx, ly = abs(dx * c + dy * s_), abs(-dx * s_ + dy * c)
        if lx < o['halfWidth'] + m and ly < o['halfHeight'] + m: return False
    return True


# the court's paving, inside the kerb (KERB[-1]: the court's edge), a unit and a half in
C = np.array(KERB[-1]['pts']); cx0, cy0 = w(C[:, 0].min() + 1.5, C[:, 1].max() - 1.5); cx1, cy1 = w(C[:, 0].max() - 1.5, C[:, 1].min() + 1.5)
cand = np.array([(x, y) for x in range(cx0, cx1, 20) for y in range(cy0, cy1, 20) if clear(x, y, 2.0 * S)], float)
# (the HQ's READY frame: players stand west by the rack, north-east by the rocks, south-east by the slab, south-west by the barrel)
HQ = [(-18.5, 6.5), (20.0, 12.5), (18.5, -9.5), (-12.0, -9.0)]
spawns = []
for p in HQ:
    q = np.array(w(*p), float); spawns.append(cand[np.argmin(np.hypot(*(cand - q).T))])
while len(spawns) < 6:
    d = np.min([np.hypot(*(cand - c).T) for c in spawns], 0); spawns.append(cand[int(np.argmax(d))])
books = []
for _ in range(6):
    d = np.min([np.hypot(*(cand - c).T) for c in spawns + books], 0); books.append(cand[int(np.argmax(d))])
spawns = [dict(x=round(float(x), 1), y=round(float(y), 1)) for x, y in spawns]
books = [dict(x=round(float(x), 1), y=round(float(y), 1)) for x, y in books[2:]]
obj = lambda d: '{ ' + ', '.join(f'{k}: ' + (f"'{v}'" if isinstance(v, str) else json.dumps(v)) for k, v in d.items()) + ' }'
ts = f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Rect, Solid }} from './arena';

/**
 * THE CANAL COURT (`canal_court`): foomerang-fu physics hq.mp4 10:55 (art/canal_court). A paved court on a stepped kerb in the sand: a
 * lavender aqueduct (an octagonal tower, its pool spilling into a zigzag channel) runs into an octagonal basin of brown blocks; four
 * lavender rocks, barrels, a bench, a rack and a plank. Every one of them is solid (the HQ's blasts break none). The dashed border runs
 * round the kerb's skirt.
 *
 * GENERATED by art/canal_court/arena.py: do not edit by hand.
 */

export const CANAL_COURT_WIDTH = {WIDTH};
export const CANAL_COURT_HEIGHT = {HEIGHT};

export type CanalCourtWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const CANAL_COURT_WALLS: readonly CanalCourtWall[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in walls)}]);

export const CANAL_COURT_SAFE_ZONE: Rect = Object.freeze({obj(zone)});

export const CANAL_COURT_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const CANAL_COURT_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const CANAL_COURT_ARENA: FuArena = Object.freeze({{
  width: CANAL_COURT_WIDTH,
  height: CANAL_COURT_HEIGHT,
  walls: CANAL_COURT_WALLS,
  spawns: CANAL_COURT_SPAWNS,
  safeZone: CANAL_COURT_SAFE_ZONE,
}});
"""
open('games/foomerang-fu/src/rules/canalCourtArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(walls), 'walls; zone', zone, '; spawns', spawns)
