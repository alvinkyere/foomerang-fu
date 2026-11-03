"""The lily island's rules data (2026-10-30): writes games/foomerang-fu/src/rules/bridgeIslandsArena.ts from layout.json. World units
are the plaza's (27.48 a plan unit); x east from plan X X0, y south from plan Y Y1.

  ground      the island (grass and lip), a unit out over the water; beyond, a player falls
  walls       the stone slabs and boulders, and the four crates, as boxes (rows of the plan raster, merged)
  spawns      six on the grass, well apart; Book spots likewise

  python art/bridge_islands/arena.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math
import numpy as np, cv2

S = 27.48
_G0 = json.load(open('art/bridge_islands/ground.json'))['polygons']
_S0 = json.load(open('art/bridge_islands/stones.json'))
_pts = np.concatenate([np.array(p) for p in _G0] + [np.array(b['top']) for b in _S0])
# the world: the island and its stones with 4 plan units of water round them (the camera and the water read the same box: arena.json)
X0, Y0 = float(np.floor(_pts[:, 0].min() - 4)), float(np.floor(_pts[:, 1].min() - 4))
X1, Y1 = float(np.ceil(_pts[:, 0].max() + 4)), float(np.ceil(_pts[:, 1].max() + 4))
json.dump(dict(X0=X0, X1=X1, Y0=Y0, Y1=Y1, S=S), open('art/bridge_islands/arena.json', 'w'))
MIN_HALF = 18
L = json.load(open('art/bridge_islands/layout.json'))
G = json.load(open('art/bridge_islands/ground.json'))['polygons']      # (ground.py: the banks)
STONES = json.load(open('art/bridge_islands/stones.json'))               # (stones.py: each block's footprint)
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
SLIDER_BLOCK = -1          # the NW slab: the lever-driven rock (the HQ, 10:37-10:48): a solid on rails, not a wall (sliders.ts)
bank, wall = raster(G), raster([b['top'] for b in STONES])
def _islet_e():
    e = json.load(open('art/bridge_islands/islet_e.json'))
    return [(e['centre'][0] + e['radius'] * math.cos(math.pi / 8 + i * math.pi / 4), e['centre'][1] + e['radius'] * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]


solid_wall = raster([b['top'] for i, b in enumerate(STONES) if i not in (SLIDER_BLOCK, 0, 2, 3, 5, 6, 7, 9, 11, 14)] + [c['top'] for c in json.load(open('art/bridge_islands/layout.json'))['cubes']] + [r['grass'] for r in json.load(open('art/bridge_islands/layout.json'))['raised']] + [json.load(open('art/bridge_islands/ne_wall.json'))['footprint'], _islet_e()])      # (3: the north-east wall, measured by ne_wall.py)                                      # (the stones' own footprints: slabs and boulders as the frame shows them)
# the ground: the banks and under the stones (solid all the same: no one falls at a stone's foot), reaching a unit out over the
# water: the rules drop a player whose middle leaves the ground, so with most of a body over the water, as the HQ's players
# stand at a bank's edge (and the CPUs' plan, which wants ground a body's radius all round, finds the narrow banks walkable).
# Outlines simplified to within 0.25 units: the data stays small.
reach = cv2.dilate(bank | wall, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
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
home = end = (0, 0)
slider = None

# spawns and Book spots: open bank, clear of every wall and the water by more than a player's radius, spread far apart
solid = wall.copy()                                   # (the wall boxes as the rules have them, a little widened; the sliding rock's whole run too)
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
# the bridge's walls (layout.py `bridge_walls`): their sliding parts are the rules' sliders (sliders.ts), worked by every lever on the map
# (the HQ: one pull and both walls slide in across the deck, meeting on its middle line in ~1.6 s); the runs on onto the east island are walls
sliders = []
for bw in L['bridge_walls']:
    cx_, cy_ = w(*bw['centre']); ang = math.atan2(-bw['u'][1], bw['u'][0])
    run = math.hypot(*bw['slide']) * S
    sliders.append(dict(wall=dict(shape='box', x=cx_, y=cy_, halfWidth=round(bw['length'] / 2 * S, 1), halfHeight=round(max(bw['width'] / 2 * S, 19), 1), angle=round(ang, 4)),
                        by=dict(x=round(bw['slide'][0] * S), y=round(-bw['slide'][1] * S)), speed=round(run / 1.6),
                        levers=[dict(x=w(*lv['knob'])[0], y=w(*lv['knob'])[1], radius=36) for lv in L['levers']]))
    e = bw['extension']; ex, ey = w((e['a'][0] + e['b'][0]) / 2, (e['a'][1] + e['b'][1]) / 2)
    walls.append(dict(id=f'WALL_{bw["tag"]}_RUN', kind='WALL', shape='box', x=ex, y=ey, halfWidth=round(math.hypot(e['b'][0] - e['a'][0], e['b'][1] - e['a'][1]) / 2 * S, 1),
                      halfHeight=round(max(bw['width'] / 2 * S, 19), 1), angle=round(ang, 4)))
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
 * THE LILY ISLAND (`bridge_islands`): the HQ's lime island in the water (foomerang-fu physics hq.mp4 10:37), measured from it
 * (art/bridge_islands). A grass island with stone slabs on it and boulders about it, four crates, bamboo, two trees, lily pads.
 * The island is the ground (the water is not: a player who steps into it falls); the slabs, the boulders and the crates are solid.
 *
 * GENERATED by art/bridge_islands/arena.py from art/bridge_islands/layout.json: do not edit by hand.
 */

export const BRIDGE_ISLANDS_WIDTH = {WIDTH};
export const BRIDGE_ISLANDS_HEIGHT = {HEIGHT};

export type BridgeIslandsWall = Solid & {{ readonly id: string; readonly kind: 'WALL' }};

export const BRIDGE_ISLANDS_GROUND: readonly (readonly Vec2[])[] = Object.freeze([
{''.join('  ' + pts(p) + ',\n' for p in ground)}]);

export const BRIDGE_ISLANDS_WALLS: readonly BridgeIslandsWall[] = Object.freeze([
{''.join('  Object.freeze(' + obj(o) + '),\n' for o in walls)}]);

export const BRIDGE_ISLANDS_SPAWNS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in spawns)}]);

export const BRIDGE_ISLANDS_BOOK_SPOTS: readonly Vec2[] = Object.freeze([
{''.join('  ' + obj(o) + ',\n' for o in books)}]);

/** The bridge's two walls (NW, SE): levers slide them in across the deck to meet on its middle line, and back (sliders.ts). */
export const BRIDGE_ISLANDS_SLIDERS: readonly SliderSpec[] = Object.freeze([
{''.join('  Object.freeze({ wall: ' + obj(sl['wall']).replace("'box'", "'box' as const") + ', by: ' + obj(sl['by']) + ', speed: ' + str(sl['speed']) + ', levers: [' + ', '.join(obj(l) for l in sl['levers']) + '] }),\n' for sl in sliders)}]);

export const BRIDGE_ISLANDS_ARENA: FuArena = Object.freeze({{
  width: BRIDGE_ISLANDS_WIDTH,
  height: BRIDGE_ISLANDS_HEIGHT,
  ground: BRIDGE_ISLANDS_GROUND,
  walls: BRIDGE_ISLANDS_WALLS,
  sliders: BRIDGE_ISLANDS_SLIDERS,
  spawns: BRIDGE_ISLANDS_SPAWNS,
}});
"""
open('games/foomerang-fu/src/rules/bridgeIslandsArena.ts', 'w').write(ts)
print('arena', WIDTH, 'x', HEIGHT, ';', len(ground), 'ground,', len(walls), 'walls')
