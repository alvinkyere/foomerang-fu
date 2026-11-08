"""The temple court's rules data (2026-11-07): writes games/foomerang-fu/src/rules/templeCourtArena.ts from layout.json and planters.json.
World units are the plaza's (27.48 a plan unit); x east from plan X X0, y south from plan Y Y1.

  safeZone   the dashed border (layout.py): a player outside it for the config's limit explodes
  walls      every wing (its plinth and wall as one turned box), the corner towers, the planters (each octagon as two crossed boxes,
             the trees inside them), the gates' stone bases, the statues' slab, the east gate's posts and stone lanterns, the banners'
             poles. The hex fields are not walls: players and boomerangs go through them, pushing them aside (render/hexPlants.ts)
  spawns     six inside the border, clear of the walls, spread apart; Book spots likewise

  python art/temple_court/arena.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np

S = 27.48
L = json.load(open('art/temple_court/layout.json'))
PL = json.load(open('art/temple_court/planters.json'))
BORDER = L['border']
X0, X1, Y0, Y1 = BORDER['x0'] - 12, BORDER['x1'] + 12, BORDER['y0'] - 12, BORDER['y1'] + 12      # (12 units outside the border: the camera follows)
json.dump(dict(X0=X0, X1=X1, Y0=Y0, Y1=Y1, S=S, border=BORDER), open('art/temple_court/arena.json', 'w'))
w = lambda X, Y: (round((X - X0) * S), round((Y1 - Y) * S))
WIDTH, HEIGHT = round((X1 - X0) * S), round((Y1 - Y0) * S)
walls = []


def turned_box(id_, cx, cy, hx, hy, yaw=0.0):
    """A box in plan units (its half sizes along its own x and y, turned yaw radians counter-clockwise in plan) as a rules wall."""
    x, y = w(cx, cy)
    walls.append(dict(id=id_, kind='WALL', shape='box', x=x, y=y, halfWidth=round(max(hx * S, 9)), halfHeight=round(max(hy * S, 9)),
                      angle=round(-yaw, 4)))


def disc(id_, cx, cy, r):
    x, y = w(cx, cy); walls.append(dict(id=id_, kind='WALL', shape='disc', x=x, y=y, radius=max(18, round(r * S))))


Wd = L['wall']; FACE = dict(N=(0, 1), S=(0, -1), E=(1, 0), W=(-1, 0))
for wg in L['wings']:
    (ax, ay), (bx, by) = wg['a'], wg['b']; nx, ny = FACE[wg['face']]
    back, front = -Wd['w'] / 2 - 0.25, Wd['w'] / 2 + Wd['plinth_out']
    mid = (back + front) / 2
    pa, pb = wg.get('plinth_a', 0.0), wg.get('plinth_b', 0.0)
    length = math.hypot(bx - ax, by - ay) + 0.6 + pa + pb
    ux, uy = (bx - ax) / math.hypot(bx - ax, by - ay), (by - ay) / math.hypot(bx - ax, by - ay)
    cx, cy = (ax + bx) / 2 + nx * mid + ux * (pb - pa) / 2, (ay + by) / 2 + ny * mid + uy * (pb - pa) / 2
    yaw = math.atan2(by - ay, bx - ax)
    turned_box(f'WING_{wg["name"]}', cx, cy, length / 2, (front - back) / 2, yaw)
for k, (x, y) in enumerate(L['towers']): turned_box(f'TOWER_{k}', x, y, 1.05, 1.05)
for name, p in PL.items():
    turned_box(f'PLANTER_{name}_A', p['cx'], p['cy'], p['a'], p['b'] * (1 - p['k']))
    turned_box(f'PLANTER_{name}_B', p['cx'], p['cy'], p['a'] * (1 - p['k']), p['b'])
G = L['gate']
for k, gate in enumerate(L['gates']):
    for j, xp in enumerate(gate['posts']): turned_box(f'GATE_{k}_{j}', xp, gate['y'], G['base'][0] / 2, G['base'][1] / 2)
SL = L['slab']; turned_box('SLAB', (SL['x0'] + SL['x1']) / 2, (SL['y0'] + SL['y1']) / 2, (SL['x1'] - SL['x0']) / 2, (SL['y1'] - SL['y0']) / 2)
EG = L['east_gate']
for k, y in enumerate((EG['y0'], EG['y1'])): disc(f'EAST_GATE_{k}', EG['x'], y, 0.4)
for k, (x, y) in enumerate(L['stone_lanterns']): turned_box(f'STONELAMP_{k}', x, y, 0.9, 0.9)
for k, b in enumerate(L['banners']): disc(f'BANNER_{k}', b['x'], b['y'], 0.2)


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


# spawns and Books on the court's paving (not out on the strips behind the walls)
bx0, bx1 = w(-26.0, 0)[0], w(9.0, 0)[0]
by0, by1 = w(0, 15.0)[1], w(0, -14.6)[1]
cand = np.array([(x, y) for x in range(bx0, bx1, 20) for y in range(by0, by1, 20) if clear(x, y, 2.5 * S)], float)


def spread(n, seed):
    chosen = [cand[np.argmin(np.hypot(*(cand - seed).T))]]
    while len(chosen) < n:
        d = np.min([np.hypot(*(cand - c).T) for c in chosen], 0); chosen.append(cand[int(np.argmax(d))])
    return [dict(x=round(float(x), 1), y=round(float(y), 1)) for x, y in chosen]


spawns = spread(6, np.array([bx0, by0]))
books = spread(10, np.array([bx1, by1]))[4:]
sz = dict(x=w(BORDER['x0'], 0)[0], y=w(0, BORDER['y1'])[1], width=w(BORDER['x1'], 0)[0] - w(BORDER['x0'], 0)[0], height=w(0, BORDER['y0'])[1] - w(0, BORDER['y1'])[1])
obj = lambda d: '{ ' + ', '.join(f'{k}: ' + (f"'{v}'" if isinstance(v, str) else json.dumps(v)) for k, v in d.items()) + ' }'
ts = f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Rect, Solid }} from './arena';

/**
 * THE TEMPLE COURT (`temple_court`): ff physics hq 2.mp4 2:01 (art/temple_court). A paved court walled by red-roofed buildings, a
 * gate in the east wall and two gates to the south, lavender planters (three with trees), two orange hex fields, and a fork and a
 * knife standing on a slab to the north. The buildings, planters, gates' stones, slab, lanterns and poles are solid; a player outside
 * the dashed border for the config's limit explodes. The hex fields are no walls: they are pushed aside and burn (drawn only:
 * apps/console/src/render/hexPlants.ts).
 *
 * GENERATED by art/temple_court/arena.py from art/temple_court/layout.json: do not edit by hand.
 */

export const TEMPLE_COURT_WIDTH = {WIDTH};
export const TEMPLE_COURT_HEIGHT = {HEIGHT};

export type TempleCourtWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const TEMPLE_COURT_WALLS: readonly TempleCourtWall[] = Object.freeze([
{''.join('  Object.freeze(' + obj(o) + '),\n' for o in walls)}]);

export const TEMPLE_COURT_SAFE_ZONE: Rect = Object.freeze({json.dumps(sz).replace('"', '')});

export const TEMPLE_COURT_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const TEMPLE_COURT_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const TEMPLE_COURT_ARENA: FuArena = Object.freeze({{
  width: TEMPLE_COURT_WIDTH,
  height: TEMPLE_COURT_HEIGHT,
  walls: TEMPLE_COURT_WALLS,
  spawns: TEMPLE_COURT_SPAWNS,
  safeZone: TEMPLE_COURT_SAFE_ZONE,
}});
"""
open('games/foomerang-fu/src/rules/templeCourtArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(walls), 'walls, safe zone', sz, ', spawns', len(spawns))
