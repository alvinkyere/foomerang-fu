"""The lily island's rules data (2026-10-30): writes games/foomerang-fu/src/rules/lilyIslandArena.ts from layout.json. World units
are the plaza's (27.48 a plan unit); x east from plan X X0, y south from plan Y Y1.

  ground      the island (grass and lip), a unit out over the water; beyond, a player falls
  walls       the stone slabs and boulders, and the four crates, as boxes (rows of the plan raster, merged)
  spawns      six on the grass, well apart; Book spots likewise

  python art/lily_island/arena.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

S = 27.48
_G0 = json.load(open('art/lily_island/ground.json'))['polygons']
_S0 = json.load(open('art/lily_island/stones.json'))
_pts = np.concatenate([np.array(p) for p in _G0] + [np.array(b['top']) for b in _S0])
# the world: the island and its stones with 4 plan units of water round them (the camera and the water read the same box: arena.json)
X0, Y0 = float(np.floor(_pts[:, 0].min() - 4)), float(np.floor(_pts[:, 1].min() - 4))
X1, Y1 = float(np.ceil(_pts[:, 0].max() + 4)), float(np.ceil(_pts[:, 1].max() + 4))
json.dump(dict(X0=X0, X1=X1, Y0=Y0, Y1=Y1, S=S), open('art/lily_island/arena.json', 'w'))
MIN_HALF = 18
L = json.load(open('art/lily_island/layout.json'))
G = json.load(open('art/lily_island/ground.json'))['polygons']      # (ground.py: the banks)
STONES = json.load(open('art/lily_island/stones.json'))               # (stones.py: each block's footprint)
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
SLIDER_BLOCK = 2          # the NW slab: the lever-driven rock (the HQ, 10:37-10:48): a solid on rails, not a wall (sliders.ts)
bank, wall = raster(G), raster([b['top'] for b in STONES])
solid_wall = raster([b['top'] for i, b in enumerate(STONES) if i != SLIDER_BLOCK])                                      # (the stones' own footprints: slabs and boulders as the frame shows them)
# the ground: the banks and under the stones (solid all the same: no one falls at a stone's foot), reaching a unit out over the
# water: the rules drop a player whose middle leaves the ground, so with most of a body over the water, as the HQ's players
# stand at a bank's edge (and the CPUs' plan, which wants ground a body's radius all round, finds the narrow banks walkable).
# Outlines simplified to within 0.25 units: the data stays small.
reach = bank | wall      # (exactly the land as drawn and the stones on it: owner, 2026-11-06, "no player can walk on water"; it used to reach a unit out)
cs, _ = cv2.findContours(reach, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
ground = [[(round(float(c) * CELL * S), round(float(r) * CELL * S)) for c, r in cv2.approxPolyDP(k, 2.5, True).reshape(-1, 2)]
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

CRATE = 1.43 * S / 2
for k, (X, Y) in enumerate(L['crates']):
    cx, cy = w(X, Y)
    walls.append(dict(id=f'CRATE_{k}', kind='WALL', shape='box', x=cx, y=cy, halfWidth=round(CRATE, 1), halfHeight=round(CRATE, 1), angle=0))

# the sliding rock and its levers (rules sliders.ts): home = the slab's place; it runs along the island's long diagonal (screen top-left to
# bottom-right: plan +x, -y) until its centre reaches the island's edge: "all the way to the edge", where a player in its way is shoved off
SB = STONES[SLIDER_BLOCK]
rx, ry, rw_, rh_, ra_ = SB['rect']
home = w(rx, ry)
dx, dy = 1 / math.sqrt(2), 1 / math.sqrt(2)                      # (world: x east, y south: south-east is +x, +y)
px, py = float(home[0]), float(home[1]); end = (px, py); entered = False
for _ in range(2000):
    c_, r_ = int(px / S / CELL), int(py / S / CELL)
    on = 0 <= c_ < NX and 0 <= r_ < NY and bool(bank[r_, c_])
    if on: entered = True; end = (px, py)
    elif entered: break
    px += dx * 0.25 * S; py += dy * 0.25 * S
slider = dict(wall=dict(shape='box', x=home[0], y=home[1], halfWidth=round((rw_ + 0.5) / 2 * S, 1), halfHeight=round((rh_ + 0.5) / 2 * S, 1),
                        angle=round(math.radians(ra_), 4)),
              by=dict(x=round(end[0] - home[0]), y=round(end[1] - home[1])), speed=330,
              levers=[dict(x=w((lv['housing'][0] + lv['knob'][0]) / 2, (lv['housing'][1] + lv['knob'][1]) / 2)[0],
                           y=w((lv['housing'][0] + lv['knob'][0]) / 2, (lv['housing'][1] + lv['knob'][1]) / 2)[1], radius=round(1.3 * S)) for lv in L['levers']])
print('slider home', home, 'by', slider['by'], 'length', round(math.hypot(slider['by']['x'], slider['by']['y'])))

# spawns and Book spots: open bank, clear of every wall and the water by more than a player's radius, spread far apart
solid = wall.copy()                                   # (the wall boxes as the rules have them, a little widened; the sliding rock's whole run too)
for o in walls:
    c0, r0 = int((o['x'] - o['halfWidth']) / S / CELL), int((o['y'] - o['halfHeight']) / S / CELL)
    c1, r1 = int((o['x'] + o['halfWidth']) / S / CELL) + 1, int((o['y'] + o['halfHeight']) / S / CELL) + 1
    solid[max(r0, 0):r1, max(c0, 0):c1] = 1
for t_ in np.linspace(0, 1, 40):
    cc, rr = int((home[0] + (end[0] - home[0]) * t_) / S / CELL), int((home[1] + (end[1] - home[1]) * t_) / S / CELL)
    solid[max(rr - 14, 0):rr + 15, max(cc - 14, 0):cc + 15] = 1
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
import type {{ FuArena, Solid }} from './arena';
import type {{ SliderSpec }} from './sliders';

/**
 * THE LILY ISLAND (`lily_island`): the HQ's lime island in the water (foomerang-fu physics hq.mp4 10:37), measured from it
 * (art/lily_island). A grass island with stone slabs on it and boulders about it, four crates, bamboo, two trees, lily pads.
 * The island is the ground (the water is not: a player who steps into it falls); the slabs, the boulders and the crates are solid.
 *
 * GENERATED by art/lily_island/arena.py from art/lily_island/layout.json: do not edit by hand.
 */

export const LILY_ISLAND_WIDTH = {WIDTH};
export const LILY_ISLAND_HEIGHT = {HEIGHT};

export type LilyIslandWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const LILY_ISLAND_GROUND: readonly (readonly Vec2[])[] = Object.freeze([
{''.join('  ' + pts(p) + ',\n' for p in ground)}]);

export const LILY_ISLAND_WALLS: readonly LilyIslandWall[] = Object.freeze([
{''.join('  Object.freeze(' + obj(o) + '),\n' for o in walls)}]);

export const LILY_ISLAND_SLIDER: SliderSpec = Object.freeze({{
  wall: {json.dumps(slider['wall']).replace('"box"', "'box' as const")},
  by: {json.dumps(slider['by'])},
  speed: {slider['speed']},
  levers: {json.dumps(slider['levers'])},
}});

export const LILY_ISLAND_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const LILY_ISLAND_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

export const LILY_ISLAND_ARENA: FuArena = Object.freeze({{
  width: LILY_ISLAND_WIDTH,
  height: LILY_ISLAND_HEIGHT,
  ground: LILY_ISLAND_GROUND,
  walls: LILY_ISLAND_WALLS,
  sliders: Object.freeze([LILY_ISLAND_SLIDER]),
  spawns: LILY_ISLAND_SPAWNS,
}});
"""
open('games/foomerang-fu/src/rules/lilyIslandArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(ground), 'ground,', len(walls), 'walls')
