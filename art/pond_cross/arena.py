"""The cross pond's rules data (2026-10-27): writes games/foomerang-fu/src/rules/pondCrossArena.ts from layout.json. World units
are the plaza's (27.48 a plan unit); x east from plan X X0, y south from plan Y Y1.

  ground      the banks (grass and lip) and under the wall, a unit out over the water; beyond, a player falls
  walls       the stone wall and the boulders, as boxes covering their outlines (rows of the plan raster, merged)
  turntable   the raft: its two arms the ground, its four crates solid, turning 9.45 degrees a second counter-clockwise about its
              centre (the HQ, 4:26-4:28), carrying whoever stands on it
  spawns      six on the banks, well apart; Book spots likewise

  python art/pond_cross/arena.py       (from the repository root)
"""
import json, math
import numpy as np, cv2

S, X0, Y1, Y0, X1 = 27.48, -34.0, 107.0, 47.0, 33.0
MIN_HALF = 18
L = json.load(open('art/pond_cross/layout.json'))
G = json.load(open('art/pond_cross/ground.json'))['polygons']      # (ground.py: the banks)
STONES = json.load(open('art/pond_cross/stones.json'))               # (stones.py: each block's footprint)
w = lambda X, Y: (round((X - X0) * S), round((Y1 - Y) * S))          # (whole world units)
WIDTH, HEIGHT = round((X1 - X0) * S), round((Y1 - Y0) * S)
# the plan rastered at CELL units: the banks, the walls
CELL = 0.25
NX, NY = int((X1 - X0) / CELL), int((Y1 - Y0) / CELL)
def raster(polys):
    m = np.zeros((NY, NX), np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.int32([((x - X0) / CELL, (Y1 - y) / CELL) for x, y in p])], 1)
    return m
bank, wall = raster(G), raster([b['top'] for b in STONES])
solid_wall = wall                                      # (the stones' own footprints: slabs and boulders as the frame shows them)
# the ground: the banks and under the stones (solid all the same: no one falls at a stone's foot), reaching a unit out over the
# water: the rules drop a player whose middle leaves the ground, so with most of a body over the water, as the HQ's players
# stand at a bank's edge (and the CPUs' plan, which wants ground a body's radius all round, finds the narrow banks walkable).
# Outlines simplified to within 0.25 units: the data stays small.
reach = bank | wall      # (exactly the land as drawn and the stones on it: owner, 2026-11-06, "no player can walk on water"; it used to reach a unit out)
cs, _ = cv2.findContours(reach, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
ground = [[(round(float(c) * CELL * S), round(float(r) * CELL * S)) for c, r in cv2.approxPolyDP(k, 1.0, True).reshape(-1, 2)]
          for k in cs if cv2.contourArea(k) > 20]
# the walls as boxes: where a wall lies within 3 units of a bank (no one reaches the rest), rows of half a unit merged downward
near = solid_wall
ROW = 2                                               # (half a unit: the boxes reach no further into the bank)
runs = []
for r0 in range(0, NY, ROW):
    band = near[r0:r0 + ROW].max(0)
    c = 0
    while c < NX:
        if band[c]:
            c1 = c
            while c1 < NX and band[c1]: c1 += 1
            runs.append([r0, r0 + ROW, c, c1]); c = c1
        else: c += 1
merged = []
for r in runs:
    # (merged into the box above when its ends are within 3 cells of this row's: one box, what the two rows share, so no
    # box reaches out over the bank)
    m = next((m for m in merged if m[1] == r[0] and abs(m[2] - r[2]) <= 3 and abs(m[3] - r[3]) <= 3), None)
    if m: m[1], m[2], m[3] = r[1], max(m[2], r[2]), min(m[3], r[3])
    else: merged.append(r)
walls = []
for k, (r0, r1, c0, c1) in enumerate(merged):
    hw, hh = (c1 - c0) * CELL * S / 2, (r1 - r0) * CELL * S / 2
    walls.append(dict(id=f'WALL_{k}', kind='WALL', shape='box', x=round((c0 + c1) * CELL * S / 2),
                      y=round((r0 + r1) * CELL * S / 2), halfWidth=round(max(hw, MIN_HALF)),
                      halfHeight=round(max(hh, MIN_HALF)), angle=0))

# the raft: plan (Y north) to the rules (y south): its angle and its local v flip
R_ = json.load(open('art/pond_cross/raft.json'))                      # (ground.py: the raft trimmed to its pond)
cx, cy = w(*R_['centre'])
arm, wid = R_['arm'] * S, R_['width'] * S
quad = lambda a, b: [(-a / 2, -b / 2), (a / 2, -b / 2), (a / 2, b / 2), (-a / 2, b / 2)]
half = 1.43 * S / 2
raft = dict(x=cx, y=cy, degreesPerSecond=R_['degreesPerSecond'], startDegrees=-R_['degrees'],
            ground=[quad(arm, wid), quad(wid, arm)],
            walls=[dict(shape='box', x=round(u * S, 1), y=round(-v * S, 1), halfWidth=round(max(half, MIN_HALF), 1),
                        halfHeight=round(max(half, MIN_HALF), 1), angle=0) for u, v in R_['crates']])

# spawns and Book spots: open bank, clear of every wall and the water by more than a player's radius, spread far apart
solid = wall.copy()                                   # (the wall boxes as the rules have them, a little widened)
for o in walls:
    c0, r0 = int((o['x'] - o['halfWidth']) / S / CELL), int((o['y'] - o['halfHeight']) / S / CELL)
    c1, r1 = int((o['x'] + o['halfWidth']) / S / CELL) + 1, int((o['y'] + o['halfHeight']) / S / CELL) + 1
    solid[max(r0, 0):r1, max(c0, 0):c1] = 1
CLEAR = int(40 / S / CELL) + 1                        # a player's radius (36) and more, from any wall and the water
free = cv2.erode(bank, np.ones((2 * CLEAR + 1,) * 2, np.uint8)) & (1 - cv2.dilate(solid, np.ones((2 * CLEAR + 1,) * 2, np.uint8)))
ys, xs = np.nonzero(free)
cand = np.c_[(xs + 0.5) * CELL * S, (ys + 0.5) * CELL * S]
def spread(n, seed):
    chosen = [cand[np.argmin(np.hypot(*(cand - seed).T))]]
    while len(chosen) < n:
        d = np.min([np.hypot(*(cand - c).T) for c in chosen], 0)
        chosen.append(cand[int(np.argmax(d))])
    return [dict(x=round(float(x), 1), y=round(float(y), 1)) for x, y in chosen]
spawns = spread(6, np.array([0, 0]))
books = spread(10, np.array([WIDTH, HEIGHT]))[4:]

def obj(d):
    return '{ ' + ', '.join(f'{k}: ' + (f"'{v}'" if isinstance(v, str) else json.dumps(v)) for k, v in d.items()) + ' }'
def pts(poly):
    return 'Object.freeze([' + ', '.join(f'{{ x: {x}, y: {y} }}' for x, y in poly) + '])'
ts = f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Solid, Turntable }} from './arena';

/**
 * THE CROSS POND (`pond_cross`): the HQ's stone-walled pond (foomerang-fu physics hq.mp4 4:27), measured from it
 * (art/pond_cross). Grass banks inside a stone wall round a pond; a wooden cross raft turns in the middle, 9.45 degrees a second
 * counter-clockwise (its angle measured over 0.9 s of the video), its four crates on it. The banks and the raft are the ground (the water is not: a player who steps into it falls);
 * the wall, the boulders and the raft's crates are solid; whoever stands on the raft turns with it.
 *
 * GENERATED by art/pond_cross/arena.py from art/pond_cross/layout.json: do not edit by hand.
 */

export const POND_CROSS_WIDTH = {WIDTH};
export const POND_CROSS_HEIGHT = {HEIGHT};

export type PondCrossWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const POND_CROSS_GROUND: readonly (readonly Vec2[])[] = Object.freeze([
{''.join('  ' + pts(p) + ',\n' for p in ground)}]);

export const POND_CROSS_WALLS: readonly PondCrossWall[] = Object.freeze([
{''.join('  Object.freeze(' + obj(o) + '),\n' for o in walls)}]);

export const POND_CROSS_RAFT: Turntable = Object.freeze({{
  x: {raft['x']},
  y: {raft['y']},
  degreesPerSecond: {raft['degreesPerSecond']},
  startDegrees: {raft['startDegrees']},
  ground: Object.freeze([{', '.join(pts(p) for p in raft['ground'])}]),
  walls: Object.freeze([
{''.join("    Object.freeze(" + obj(o).replace("'box'", "'box' as const") + '),\n' for o in raft['walls'])}  ]),
}});

export const POND_CROSS_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const POND_CROSS_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const POND_CROSS_ARENA: FuArena = Object.freeze({{
  width: POND_CROSS_WIDTH,
  height: POND_CROSS_HEIGHT,
  ground: POND_CROSS_GROUND,
  walls: POND_CROSS_WALLS,
  turntables: Object.freeze([POND_CROSS_RAFT]),
  spawns: POND_CROSS_SPAWNS,
}});
"""
open('games/foomerang-fu/src/rules/pondCrossArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(ground), 'ground,', len(walls), 'walls, raft at', cx, cy, 'start', raft['startDegrees'])
