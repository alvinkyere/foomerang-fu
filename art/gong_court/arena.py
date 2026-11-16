"""The gong court's rules data (2026-11-13): writes games/foomerang-fu/src/rules/gongCourtArena.ts from stones.json (fit_stones.py) and
props.json (props.py: where the pots stand). World units are the plaza's (27.48 a plan unit); x east from plan X X0, y south from Y1.

  walls    every stone body (walls, platforms, blocks, the centre planter, the boulders): each outline turned to its own long axis and
           covered by STRIPS turned boxes across it (each strip as wide as the outline there), so a player meets the outline's own
           shape; the pots (discs). The HQ's court has no dashed border: its walls close it on every side, so there is no safeZone.
  spawns   six on the court's grass, clear of the walls, spread apart; Book spots likewise

  python art/gong_court/arena.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from geom import prisms

S = 27.48
ZS = json.load(open("art/gong_court/zoom.json"))["K0"] / json.load(open("art/gong_court/zoom.json"))["K"]
X0, X1, Y0, Y1 = [round(v * ZS, 2) for v in (-20.5, 17.5, -17.0, 19.0)]                 # (the court and its corner platforms: nobody gets past the walls; the south edge -17.0 (x ZS), 3.3 units south of the south wall: every spot in the arena inside the game's view at the true zoom)
json.dump(dict(X0=X0, X1=X1, Y0=Y0, Y1=Y1, S=S), open('art/gong_court/arena.json', 'w'))
w = lambda X, Y: (round((X - X0) * S), round((Y1 - Y) * S))
WIDTH, HEIGHT = round((X1 - X0) * S), round((Y1 - Y0) * S)
walls = []


def turned_box(id_, cx, cy, hx, hy, yaw=0.0):
    x, y = w(cx, cy)
    # (a wall thinner than a player's radius is widened to one, as the rules require: the court's walls are 0.6 units, 16.5 world)
    walls.append(dict(id=id_, kind='WALL', shape='box', x=x, y=y, halfWidth=round(max(hx * S, 18)), halfHeight=round(max(hy * S, 18)),
                      angle=round(-yaw, 4)))


def boxes_for(id_, poly, strips):
    """The outline covered by turned boxes: along its long axis (its minimum-area rectangle), `strips` strips, each from the outline's
    nearest to its farthest extent across the axis inside that strip (drawn at 40 px a unit)."""
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(np.float32(poly))
    yaw = math.radians(ang) if rw >= rh else math.radians(ang + 90)
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


for name, (poly, h, mint, kind) in prisms().items():
    if name.startswith('boulder'): continue            # (outside the court: out of reach, and out of the arena)
    strips = 1 if kind == 'wall' else 5 if kind == 'platform' else 3
    boxes_for(name.upper(), poly, strips)
for name, p_ in json.load(open('art/gong_court/props.json'))['pots'].items():      # (the pots: props.py, each its own measured radius)
    if X0 < p_['foot'][0] < X1 and Y0 < p_['foot'][1] < Y1:
        x, y = w(*p_['foot']); walls.append(dict(id=name.upper(), kind='WALL', shape='disc', x=x, y=y, radius=max(18, round(p_['r'] * 0.9 * S))))

# the bamboo stalks: solid (owner, 2026-11-15: "make the bamboos solid"), each a disc at its foot, its measured radius plus a little for the
# sleeve, at least 18 (the rules' floor: no solid thinner than a player's radius, 36 across, so nothing tunnels through; the drawn stalk is ~10); a stalk on the planter is inside the planter's own boxes already
for b_ in json.load(open('art/gong_court/props.json'))['bamboo']:
    (fx, fy, fz) = b_['foot']
    if fz > 0 or not (X0 < fx < X1 and Y0 < fy < Y1): continue
    x, y = w(fx, fy); walls.append(dict(id='BAMBOO_' + b_['name'].upper(), kind='WALL', shape='disc', x=x, y=y, radius=max(18, round(b_['r'] * 1.2 * S))))


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


# spawns and Books on the court's grass: inside the four walls (at the first reading's units, x ZS: wall_w x -16.5, wall_e 13.4, wall_n y 15.1,
# wall_s -14.5)
bx0, bx1 = w(-15.0 * ZS, 0)[0], w(12.0 * ZS, 0)[0]
by0, by1 = w(0, 13.5 * ZS)[1], w(0, -13.0 * ZS)[1]
cand = np.array([(x, y) for x in range(bx0, bx1, 20) for y in range(by0, by1, 20) if clear(x, y, 2.5 * S)], float)


def spread(n, seed):
    chosen = [cand[np.argmin(np.hypot(*(cand - seed).T))]]
    while len(chosen) < n:
        d = np.min([np.hypot(*(cand - c).T) for c in chosen], 0); chosen.append(cand[int(np.argmax(d))])
    return [dict(x=round(float(x), 1), y=round(float(y), 1)) for x, y in chosen]


spawns = spread(6, np.array([bx0, by0]))
books = spread(10, np.array([bx1, by1]))[4:]
obj = lambda d: '{ ' + ', '.join(f'{k}: ' + (f"'{v}'" if isinstance(v, str) else json.dumps(v)) for k, v in d.items()) + ' }'
ts = f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Solid }} from './arena';

/**
 * THE GONG COURT (`gong_court`): foomerang-fu physics hq.mp4 0:35 (art/gong_court). A grass court closed by low lavender walls, a
 * raised platform at each corner (a maple on the north-west one, the gong on the north-east one, potted aloes on the southern two),
 * a planter of bamboo, two fallen blocks and an L of them on the grass; maples, bamboo, pots and boulders round it. Every stone body
 * and the pots are solid. The HQ shows no dashed border: the walls close the court.
 *
 * GENERATED by art/gong_court/arena.py from art/gong_court/stones.json: do not edit by hand.
 */

export const GONG_COURT_WIDTH = {WIDTH};
export const GONG_COURT_HEIGHT = {HEIGHT};

export type GongCourtWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const GONG_COURT_WALLS: readonly GongCourtWall[] = Object.freeze([
{''.join('  Object.freeze(' + obj(o) + '),\n' for o in walls)}]);

export const GONG_COURT_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const GONG_COURT_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const GONG_COURT_ARENA: FuArena = Object.freeze({{
  width: GONG_COURT_WIDTH,
  height: GONG_COURT_HEIGHT,
  walls: GONG_COURT_WALLS,
  spawns: GONG_COURT_SPAWNS,
}});
"""
open('games/foomerang-fu/src/rules/gongCourtArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(walls), 'walls, spawns', len(spawns), ', candidates', len(cand))
