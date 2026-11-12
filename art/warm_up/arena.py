"""The warm-up's rules data (2026-11-12): writes games/foomerang-fu/src/rules/warmUpArena.ts. World units are the plaza's (27.48 a plan
unit); x east from plan X X0, y south from plan Y Y1 (plan y is north).

  ground    everything but the moat: the island, and the land round the moat (as two pieces, west and east, overlapping a unit: the
            rules' ground is simple polygons). A player whose middle leaves it (into the water) falls; a dash carries one over
  pens      each pen's four walls, sliders that drop (sliders.ts `drops`) when the pen's lever (on the island end) is struck
  walls     the trees' trunks, the bamboo, the potted aloes (discs)
  border    the dashed square round the moat, turned 45 degrees (safeZoneTurn)
  spawns    four at the pens' outer ends (the HQ's players start there), two on the island; Book spots on the island

  python art/warm_up/arena.py       (after moat.py, fit_pens.py, layout.py; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

S = 27.48
X0, X1, Y0, Y1 = -40.0, 40.0, -38.0, 40.0
json.dump(dict(X0=X0, X1=X1, Y0=Y0, Y1=Y1, S=S), open('art/warm_up/arena.json', 'w'))
w = lambda X, Y: (round((X - X0) * S, 1), round((Y1 - Y) * S, 1))
WIDTH, HEIGHT = round((X1 - X0) * S), round((Y1 - Y0) * S)
R2 = math.sqrt(2)
uv = lambda x, y: ((x + y) / R2, (y - x) / R2)
xy = lambda u, v: ((u - v) / R2, (u + v) / R2)
MOAT = json.load(open('art/warm_up/moat.json'))
PENS = json.load(open('art/warm_up/pens.json'))
L = json.load(open('art/warm_up/layout.json'))

# ---- ground
CELL = 0.25
NX, NY = int((X1 - X0) / CELL), int((Y1 - Y0) / CELL)
cellpx = lambda pts: np.int32([((x - X0) / CELL, (Y1 - y) / CELL) for x, y in pts])
moat = np.zeros((NY, NX), np.uint8); cv2.fillPoly(moat, [cellpx(MOAT['outer'])], 1); cv2.fillPoly(moat, [cellpx(MOAT['inner'])], 0)
land = 1 - moat
island = np.zeros_like(moat); cv2.fillPoly(island, [cellpx(MOAT['inner'])], 1)
outer = land & (1 - island)
cut = int((0 - X0) / CELL)
pieces = [island.copy()]
for lo, hi in ((0, cut + 4), (cut - 4, NX)):                   # (west and east, overlapping a unit)
    m = np.zeros_like(outer); m[:, lo:hi] = outer[:, lo:hi]; pieces.append(m)
ground = []
for m in pieces:
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for k in cs:
        if cv2.contourArea(k) < 40: continue
        ground.append([dict(x=round(float(c) * CELL * S, 1), y=round(float(r) * CELL * S, 1)) for c, r in cv2.approxPolyDP(k, 1.0, True).reshape(-1, 2)])

# ---- pens: four walls each (turned boxes: angle clockwise on the screen; a wall along u runs up-right on the screen, -45 degrees)
a, b, t = PENS['a'], PENS['b'], PENS['t']
sliders, spawns = [], []
for name, p in PENS['pens'].items():
    ang = math.radians(45 + p['turn']); ux, uy = math.cos(ang), math.sin(ang); vx, vy = -uy, ux
    P = lambda s, r: (p['cx'] + ux * s + vx * r, p['cy'] + uy * s + vy * r)
    lever = L['levers'][name]
    # (which end is the island's: the end nearer the moat's middle)
    inner_sign = 1 if math.hypot(*P(a, 0)) < math.hypot(*P(-a, 0)) else -1
    walls = [(0, -(b - t / 2), a, t / 2, 0), (0, b - t / 2, a, t / 2, 0), (-(a - t / 2), 0, t / 2, b, 1), (a - t / 2, 0, t / 2, b, 1)]
    for s, r, hs, hr, _ in walls:
        cx, cy = P(s, r); X, Y = w(cx, cy)
        sliders.append(dict(wall=dict(shape='box', x=X, y=Y, halfWidth=round(max(hs * S, 19), 1), halfHeight=round(max(hr * S, 19), 1),
                                      angle=round(-ang, 4)),
                            by=dict(x=0, y=0), speed=0, levers=[dict(x=w(*lever)[0], y=w(*lever)[1], radius=30)], drops=True))
    sx, sy = P(-inner_sign * (a - t - 1.8), 0); X, Y = w(sx, sy); spawns.append(dict(x=X, y=Y))
for x, y in ((-6.0, -4.0), (5.0, -2.5)):                       # (five and six: on the island, no pen)
    X, Y = w(x, y); spawns.append(dict(x=X, y=Y))

# ---- walls: trunks, bamboo, pots
walls = []
for k, (x, y, r) in enumerate(L['solids']):
    X, Y = w(x, y); walls.append(dict(id=f'SOLID_{k}', kind='WALL', shape='disc', x=X, y=Y, radius=max(18, round(r * S))))

# ---- the border: the dashed square in the moat's axes (u from U0 to U1, v from V0 to V1), turned -45 degrees on the screen
U0, U1, V0, V1 = L['border']['u0'], L['border']['u1'], L['border']['v0'], L['border']['v1']
cu, cv = (U0 + U1) / 2, (V0 + V1) / 2; cx, cy = xy(cu, cv); CX, CY = w(cx, cy)
hw, hh = (U1 - U0) / 2 * S, (V1 - V0) / 2 * S
zone = dict(x=round(CX - hw, 1), y=round(CY - hh, 1), width=round(2 * hw, 1), height=round(2 * hh, 1))
books = [dict(x=w(*q)[0], y=w(*q)[1]) for q in ((0.0, 8.0), (-8.0, 0.0), (8.0, -6.0), (0.0, -8.0))]

def obj(d):
    """A dict / list as a TypeScript literal (strings quoted, keys bare)."""
    if isinstance(d, dict): return '{ ' + ', '.join(f'{k}: {obj(v)}' for k, v in d.items()) + ' }'
    if isinstance(d, list): return '[' + ', '.join(obj(v) for v in d) + ']'
    if isinstance(d, bool): return 'true' if d else 'false'
    if isinstance(d, str): return "'" + d + "'"
    return json.dumps(d)


ts = f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Rect, Solid }} from './arena';
import type {{ SliderSpec }} from './sliders';

/**
 * THE WARM-UP (`warm_up`): foomerang-fu physics hq.mp4 0:00 (art/warm_up), the practice round at the start of every match. A grass island
 * inside a moat, a square border turned round it. Each player starts in a walled pen across the moat; a slash on (or a boomerang over)
 * the pen's lever, on the island end, drops its walls (sliders.ts `drops`). The water is no ground: a player falls in it, a dash carries
 * one over. The trees' trunks, the bamboo and the pots are solid; the hex fields are plants (drawn only).
 *
 * GENERATED by art/warm_up/arena.py: do not edit by hand.
 */

export const WARM_UP_WIDTH = {WIDTH};
export const WARM_UP_HEIGHT = {HEIGHT};

export type WarmUpWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const WARM_UP_WALLS: readonly WarmUpWall[] = Object.freeze([
{''.join('  Object.freeze(' + obj(o) + '),\n' for o in walls)}]);

/** The pens' walls: four a pen, each dropped by its pen's lever. */
export const WARM_UP_PENS: readonly SliderSpec[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in sliders)}]);

export const WARM_UP_GROUND: readonly (readonly Vec2[])[] = Object.freeze([
{''.join('  [' + ', '.join(obj(q) for q in g) + '],\n' for g in ground)}]);

export const WARM_UP_SAFE_ZONE: Rect = Object.freeze({obj(zone)});

export const WARM_UP_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const WARM_UP_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const WARM_UP_ARENA: FuArena = Object.freeze({{
  width: WARM_UP_WIDTH,
  height: WARM_UP_HEIGHT,
  walls: WARM_UP_WALLS,
  sliders: WARM_UP_PENS,
  ground: WARM_UP_GROUND,
  spawns: WARM_UP_SPAWNS,
  safeZone: WARM_UP_SAFE_ZONE,
  safeZoneTurn: -Math.PI / 4,
}});
"""
open('games/foomerang-fu/src/rules/warmUpArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(ground), 'ground pieces,', len(sliders), 'pen walls,', len(walls), 'walls; zone', zone)
