"""The sky islands' rules data (2026-10-22): writes games/foomerang-fu/src/rules/gongIslandsArena.ts from layout.json and
objects.json. World units are the plaza's (27.48 a plan unit: the plaza's 2748 per 100); x east from plan X -34, y south from
plan Y 106.

  ground      the island tops, the bridges and their stone landings (falling off them kills)
  walls       the stone blocks (the smallest turned box round each top; not the piers the bridges rest on), the gong's posts, the maples' trunks, the bamboo,
              the aloe (discs); a solid thinner than a player is widened to one, as on the plaza
  breakables  the pots (discs) and crates (turned boxes)
  fences      the bridges' rails (a turned box along each long side): solid to bodies, not to boomerangs
  spawns      six, on open ground, well apart; Book spots likewise

  python art/sky_islands/arena.py       (from the repository root)
"""
import json, math
import numpy as np, cv2

S, X0, Y1 = 27.48, -34.0, 106.0
MIN_HALF = 18                     # a solid's least half-size (the rules: no shove carries a body through)
L = json.load(open('art/sky_islands/layout.json'))
O = json.load(open('art/sky_islands/objects.json'))['objects']
w = lambda X, Y: (round((X - X0) * S, 1), round((Y1 - Y) * S, 1))
WIDTH, HEIGHT = round((40 - X0) * S), round((Y1 - 49) * S)

ground = [[w(x, y) for x, y in o] for o in L['islands'].values()]
ground += [[w(x, y) for x, y in b['corners']] for b in L['bridges'].values()]
# the stone landings the bridges rest on, level with the grass (layout.py): walked on as the HQ's players do
ground += [[w(x, y) for x, y in L['blocks'][i]['top']] for i in L['landings']]


def turned(points, id_, kind):
    (cx, cy), (bw, bh), a = cv2.minAreaRect(np.float32(points))
    a = math.radians(a)
    while a > math.pi / 4: a -= math.pi / 2; bw, bh = bh, bw
    while a <= -math.pi / 4: a += math.pi / 2; bw, bh = bh, bw
    return dict(id=id_, kind=kind, shape='box', x=round(float(cx), 1), y=round(float(cy), 1),
                halfWidth=round(max(bw / 2, MIN_HALF), 1), halfHeight=round(max(bh / 2, MIN_HALF), 1), angle=round(a, 4))


# the blocks the bridges rest on, and the one in the seam where the north bar's lobe meets the tilted island: the opening frame
# (9:04.0) shows the planks and logs running onto them, so the way across goes over them; they are not walls
PIERS = set(L['piers'])
walls = []
for i, b in enumerate(L['blocks']):
    pts = [w(x, y) for x, y in b['top']]
    if cv2.contourArea(np.float32(pts)) < 900: continue          # slivers of a block's top: its neighbour covers it
    if i in PIERS: continue
    walls.append(turned(pts, f'BLOCK_{i:02d}', 'BLOCK'))
# the bridges' rails (owner, 2026-10-23: "3D with actual barriers"): a fence along each long side, just outside it, the
# bridge's whole length; so a bridge is crossed, never fallen off
def bridge_frame(B):
    c = [np.array(p, float) for p in B['corners']]
    origin = sum(c) / 4
    a = math.radians(B['along'])
    u = np.array([math.cos(a), math.sin(a)]); v = np.array([-u[1], u[0]])
    length = max((p - origin) @ u for p in c) - min((p - origin) @ u for p in c)
    width = max((p - origin) @ v for p in c) - min((p - origin) @ v for p in c)
    return origin, u, v, length, width


RAIL = 2 * MIN_HALF / S            # a rail's thickness, plan units
fences = []                        # (fences: solid to bodies; a boomerang flies over a rail, a slash reaches across it)
for key, B in L['bridges'].items():
    origin, u, v, length, width = bridge_frame(B)
    for side, name in ((-1, 'l'), (1, 'r')):
        near, far = origin + v * side * width / 2, origin + v * side * (width / 2 + RAIL)
        pts = [w(*(p + u * t * length / 2)) for p in (near, far) for t in (-1, 1)]
        fences.append(turned(pts, f'RAIL_{key}_{name}', 'RAIL'))
disc = lambda id_, kind, X, Y, r: dict(id=id_, kind=kind, shape='disc', x=w(X, Y)[0], y=w(X, Y)[1], radius=round(max(r * S, MIN_HALF), 1))
breakables = []
for i, o in enumerate(O):
    k = o['kind']
    if k == 'gong':
        for s in (-1, 1): walls.append(disc(f'GONG_post{"lr"[s > 0]}', 'GONG', o['x'] + s * o['width'] * 0.4, o['y'], 0.34))
    elif k == 'maple' and o['z'] == 0: walls.append(disc(f'MAPLE_{i}', 'TREE', o['x'], o['y'], 0.38))
    elif k == 'bamboo': walls.append(disc(f'BAMBOO_{i}', 'BAMBOO', o['x'], o['y'], o['width'] / 2))
    elif k == 'aloe': walls.append(disc(f'ALOE_{i}', 'POT', o['x'], o['y'], o['width'] * 0.4))
    elif k == 'pot': breakables.append(disc(f'POT_{i}', 'POT', o['x'], o['y'], o['width'] / 2))
    elif k == 'crate':
        h = o['width'] / 2
        breakables.append(turned([w(o['x'] + dx, o['y'] + dy) for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h))], f'CRATE_{i}', 'CRATE'))

# spawns and Book spots: on each island, the open places farthest from any edge or solid (a body's width clear at least),
# spread out: the six islands' most open places start the round, the next most open ones take the Books
from shapely_free_poly import clearance_points  # noqa: E402  (a helper beside this script)
SPAWNS, BOOKS = clearance_points([[w(x, y) for x, y in o] for k, o in L['islands'].items() if not k.endswith('_join')],
                                 walls + breakables + fences, w)
spawns = [dict(x=x, y=y) for x, y in SPAWNS]
books = [dict(x=x, y=y) for x, y in BOOKS]

fmt = lambda o: 'Object.freeze(' + json.dumps(o).replace('"', "'").replace("'x'", 'x') + ')'
def obj(d):
    return 'Object.freeze({ ' + ', '.join(f'{k}: ' + (f"'{v}'" if isinstance(v, str) else json.dumps(v)) for k, v in d.items()) + ' })'
def pts(poly):
    return 'Object.freeze([' + ', '.join(f'{{ x: {x}, y: {y} }}' for x, y in poly) + '])'
ts = f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ Breakable, FuArena, Solid }} from './arena';

/**
 * THE GONG ISLANDS (`gong_islands`): the sky islands of the HQ videos (foomerang-fu physics hq.mp4 9:03-9:47, ff physics hq
 * 2.mp4 7:24-8:43), measured from them (art/sky_islands). Grass islands on cliffs over the mist, joined by two plank bridges and
 * a log bridge: the island tops and the bridges are the ground, and a player who leaves it falls (owner, 2026-10-22). Stone
 * blocks, the gong's posts, the maples' trunks, the bamboo and the aloe are solid; pots and crates break; the bridges' rails
 * (2026-10-23) are fences: a body cannot cross one, a boomerang flies over it.
 *
 * GENERATED by art/sky_islands/arena.py from art/sky_islands/layout.json and objects.json: do not edit by hand.
 */

export const GONG_ISLANDS_WIDTH = {WIDTH};
export const GONG_ISLANDS_HEIGHT = {HEIGHT};

export type GongIslandsWall = Solid & {{
  readonly id: string;
  readonly kind: 'BLOCK' | 'GONG' | 'TREE' | 'BAMBOO' | 'POT';
}};
export type GongIslandsFence = Solid & {{ readonly id: string; readonly kind: 'RAIL' }};
export type GongIslandsBreakable = Breakable & {{ readonly kind: 'CRATE' | 'POT' }};

export const GONG_ISLANDS_GROUND: readonly (readonly Vec2[])[] = Object.freeze([
{''.join('  ' + pts(p) + ',\n' for p in ground)}]);

export const GONG_ISLANDS_WALLS: readonly GongIslandsWall[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in walls)}]);

export const GONG_ISLANDS_BREAKABLES: readonly GongIslandsBreakable[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in breakables)}]);

export const GONG_ISLANDS_FENCES: readonly GongIslandsFence[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in fences)}]);

export const GONG_ISLANDS_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const GONG_ISLANDS_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const GONG_ISLANDS_ARENA: FuArena = Object.freeze({{
  width: GONG_ISLANDS_WIDTH,
  height: GONG_ISLANDS_HEIGHT,
  ground: GONG_ISLANDS_GROUND,
  walls: GONG_ISLANDS_WALLS,
  breakables: GONG_ISLANDS_BREAKABLES,
  fences: GONG_ISLANDS_FENCES,
  spawns: GONG_ISLANDS_SPAWNS,
}});
"""
open('games/foomerang-fu/src/rules/gongIslandsArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(ground), 'ground,', len(walls), 'walls,', len(breakables), 'breakables,',
      len(fences), 'fences')
