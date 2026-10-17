"""Step 4 of the environ2 map: world scale, collision and spawns, from the image and its solved camera (camera.json).
 * World scale: a player's collision circle (radius 36 world units) is as large, against the characters in environ2, as it is
   against the characters in the current market plaza (its radius is 0.576 x the character's height; environ2's characters are
   ~45 px tall at the fountain, so 26 px there).
 * The arena is the world rectangle between the two side fences (both lie on one ground line each: X = const), from the base of
   the far wall (image y 62) to the bottom of the frame.
 * Solid: stalls from their four post tops (seen on the canopy, unprojected at the measured post height), the fountain from its
   base (the lowest outline of its layer, unprojected, fitted with a circle), crates and pots from their base line (square, one
   object deep), the poles (the bunting's two posts, the two banner poles) and the sign (its board's width, at its post's foot),
   the raised terrace with its stairs and archway legs. (The owner's decision, 2026-10-16: pots, poles and signs are solid too.)
   Trees, the bunting's rope and the rugs are not: players walk under the canopies and the rope, over the rugs.
python arena_environ2.py <layers_dir (step3_layers)> <out_dir>"""
import sys, os, json, math, cv2, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LAYERS, OUT = sys.argv[1:3]
os.makedirs(OUT, exist_ok=True)
cam = json.load(open(os.path.join(HERE, 'camera.json')))
F, PP, C = cam['f_1280'], np.array(cam['principal_1280']), np.array(cam['C'], float)
th = math.radians(cam['pitch_deg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
IMG = cv2.imread(os.path.join(LAYERS, 'ground.webp'))
H_IMG, W_IMG = IMG.shape[:2]


def project(P):
    v = R @ (np.asarray(P, float) - C)
    return np.array([F * v[0] / v[2] + PP[0], F * v[1] / v[2] + PP[1]])


def unproject(px, py, z=0.0):
    d = R.T @ np.array([(px - PP[0]) / F, (py - PP[1]) / F, 1.0])
    return C + (z - C[2]) / d[2] * d


# ---- world scale ---------------------------------------------------------------------------------------------------------
PLAYER_RADIUS = 36
CHAR_HEIGHT_PX = 45.0                                   # environ2's characters at the fountain (coffee 45, eggplant 47, ice 44)
RADIUS_PER_HEIGHT = 34.0 / 59.0                         # current plaza: radius 36 wu = 34.0 px; coffee cell 59 px tall
g = unproject(651.25, 425)
px_per_plan = np.linalg.norm(project(g + [1e-3, 0, 0]) - project(g)) / 1e-3
U = round(px_per_plan / (RADIUS_PER_HEIGHT * CHAR_HEIGHT_PX / PLAYER_RADIUS))      # world units per plan unit

# ---- the arena rectangle -------------------------------------------------------------------------------------------------
# the plaza runs fence to fence; beyond the fences (the dashed lines) lies OUTSIDE: open sand of our own, about three character
# widths deep each side, where a player may go but explodes if they stay (the rules' safe zone; owner, 2026-10-17)
OUTSIDE = 240                                                                     # world units each side
X_LEFT = float(np.mean([unproject(42, 343)[0], unproject(4, 576)[0]])) - OUTSIDE / U   # fence 30 and fence 31 feet
X_RIGHT = float(unproject(1260, 342)[0]) + OUTSIDE / U                                # fence 32 foot
Y_FAR = float(unproject(651.25, 62)[1])                                           # the far wall's base
Y_NEAR = float(unproject(651.25, H_IMG)[1])                                       # the frame's bottom edge
WIDTH, HEIGHT = round((X_RIGHT - X_LEFT) * U), round((Y_FAR - Y_NEAR) * U)
plan_of = lambda xw, yw: (xw / U + X_LEFT, Y_FAR - yw / U)                          # world (game) -> plan
world_of = lambda X, Y: ((X - X_LEFT) * U, (Y_FAR - Y) * U)                         # plan -> world

# ---- solid footprints (plan polygons) ------------------------------------------------------------------------------------
POST_H = float(np.mean([0.042, 0.044, 0.0495, 0.048]))   # post-top heights measured on stalls 9, 7, 5 (two posts): 0.042-0.0495
MIRROR = 1302.5                                           # x' = 1302.5 - x: the plaza's mirror axis (x = 651.25)
STALL_TOPS = {    # post tops (image px) read on 3x crops; the east stalls are the west ones mirrored (the plaza is symmetric)
    'STALL_FAR_W': [(113, 32), (203, 32), (204, 75), (105, 72)],
    'STALL_NW': [(402, 163), (444, 215), (389, 248), (345, 213)],
    'STALL_SW': [(205, 360), (278, 358), (266, 423), (192, 433)],
}
for k, pts in list(STALL_TOPS.items()):
    STALL_TOPS[k.replace('W', 'E', 1) if k.endswith('W') else k.replace('_W', '_E')] = [(MIRROR - x, y) for x, y in pts]
STALL_TOPS = {k.replace('STALL_FAR_E', 'STALL_FAR_E'): v for k, v in STALL_TOPS.items()}
footprints = {}
for k, pts in STALL_TOPS.items():
    footprints[k] = [unproject(x, y, POST_H)[:2] for x, y in pts]

layers = {o['key']: o for o in json.load(open(os.path.join(LAYERS, 'layers.json')))['occluders']}


def base_line(key):
    im = cv2.imread(os.path.join(LAYERS, layers[key]['file']), cv2.IMREAD_UNCHANGED)
    a = im[..., 3] > 0
    pts = []
    for c in range(a.shape[1]):
        ys = np.nonzero(a[:, c])[0]
        if len(ys):
            pts.append((layers[key]['x'] + c, layers[key]['y'] + ys.max()))
    return pts


# fountain: a circle through its base outline (the lowest pixel per column, ends trimmed where the rim curves away)
fb = base_line('23_fountain')
fb = fb[8:-8]
P = np.array([unproject(x, y)[:2] for x, y in fb])
A = np.c_[2 * P, np.ones(len(P))]
cx, cy, c0 = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)[0]
fr = math.sqrt(c0 + cx ** 2 + cy ** 2)
fountain_fit_px = float(np.median([abs(np.linalg.norm(p - [cx, cy]) - fr) for p in P]) * px_per_plan)
footprints['FOUNTAIN'] = [(cx + fr * math.cos(t), cy + fr * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 48, endpoint=False)]

# crates: their base line in front, one crate (its own width) deep
for key in ('12_crate', '13_crates', '14_crate', '15_crate', '16_crates', '17_crate'):
    pts = base_line(key)
    groups = [pts]
    if key == '16_crates':                                # two separate crates
        xs = [p[0] for p in pts]
        gap = max(range(1, len(xs)), key=lambda i: xs[i] - xs[i - 1])
        groups = [pts[:gap], pts[gap:]] if xs[gap] - xs[gap - 1] > 3 else [pts]
    for i, gp in enumerate(groups):
        Q = np.array([unproject(x, y)[:2] for x, y in gp])
        w = Q[:, 0].max() - Q[:, 0].min()
        front = Q[:, 1].min()
        footprints[f'CRATE_{key[:2]}{"ab"[i] if len(groups) > 1 else ""}'] = [
            (Q[:, 0].min(), front), (Q[:, 0].max(), front), (Q[:, 0].max(), front + w), (Q[:, 0].min(), front + w)]

# pots: each pot (a separate blob of its layer) from its own base line, one pot deep
for key in ('19_pot', '20_pots', '21_pot', '22_pots'):
    im = cv2.imread(os.path.join(LAYERS, layers[key]['file']), cv2.IMREAD_UNCHANGED)
    n, lab_, st_, _ = cv2.connectedComponentsWithStats((im[..., 3] > 0).astype(np.uint8))
    for i in range(1, n):
        if st_[i, cv2.CC_STAT_AREA] < 40:
            continue
        gp = []
        for c in range(im.shape[1]):
            ys = np.nonzero(lab_[:, c] == i)[0]
            if len(ys):
                gp.append((layers[key]['x'] + c, layers[key]['y'] + ys.max()))
        Q = np.array([unproject(x, y)[:2] for x, y in gp])
        w = Q[:, 0].max() - Q[:, 0].min()
        front = Q[:, 1].min()
        footprints[f'POT_{key[:2]}{chr(96 + i) if n > 2 else ""}'] = [
            (Q[:, 0].min(), front), (Q[:, 0].max(), front), (Q[:, 0].max(), front + w), (Q[:, 0].min(), front + w)]


def post(name, x0, x1, y):
    """A pole or post standing at image row y between columns x0..x1: as deep as it is wide."""
    a, b = unproject(x0, y)[:2], unproject(x1, y)[:2]
    w = b[0] - a[0]
    footprints[name] = [(a[0], a[1]), (b[0], a[1]), (b[0], a[1] + w), (a[0], a[1] + w)]


post('POLE_BUNTING_W', 508, 527, 693)
post('POLE_BUNTING_E', 776, 799, 689)
post('POLE_BANNER_W', 378, 386, 73)
post('POLE_BANNER_E', 914, 922, 81)
sa, sb = unproject(483, 139)[:2], unproject(531, 139)[:2]          # the sign: its board's width, a post deep, at the post's foot
footprints['SIGN'] = [(sa[0], sa[1]), (sb[0], sa[1]), (sb[0], sa[1] + 0.004), (sa[0], sa[1] + 0.004)]

# the raised terrace (out of play), its stairs and the archway legs: blocked, as an image region
TERRACE_PX = [(440, 0), (871, 0), (871, 121), (858, 121), (858, 101), (720, 101), (720, 145), (580, 145), (580, 101), (448, 101),
              (448, 121), (440, 121)]
terrace = np.zeros((H_IMG, W_IMG), np.uint8)
cv2.fillPoly(terrace, [np.int32(TERRACE_PX)], 1)

FOOT = {k: np.array(v, np.float32).reshape(-1, 1, 2) for k, v in footprints.items()}


KIND_OF = lambda name: name.split('_')[0]               # STALL, FOUNTAIN, CRATE, POT, POLE, SIGN


def blocker_at(xw, yw):
    """What blocks this world point (a wall kind), or None."""
    X, Y = plan_of(xw, yw)
    px, py = project([X, Y, 0])
    if not (0 <= py < H_IMG):
        return 'EDGE'                                     # beyond the far wall or the near edge: out of bounds
    if not (0 <= px < W_IMG):
        return None                                       # the outside sand beyond the fences: open
    if terrace[int(py), int(px)]:
        return 'TERRACE'
    for k, f in FOOT.items():
        if cv2.pointPolygonTest(f, (float(X), float(Y)), False) >= 0:
            return KIND_OF(k)
    return None


# ---- the grid, walls, spawns and Book spots (the same rules as gen_arena_frame.py, so every map plays alike) ---------------
GRID, MINT, Rp = 40, 40, PLAYER_RADIUS
nx, ny = math.ceil(WIDTH / GRID), math.ceil(HEIGHT / GRID)
SUB = [(a, b) for a in (0.17, 0.5, 0.83) for b in (0.17, 0.5, 0.83)]
KIND = np.full((ny, nx), None, object)                 # what blocks each cell (the most common blocker of its samples)
for r in range(ny):
    for c in range(nx):
        hits = [blocker_at((c + a) * GRID, (r + b) * GRID) for a, b in SUB]
        hits = [h for h in hits if h is not None]
        if len(hits) >= 3:
            KIND[r, c] = max(set(hits), key=hits.count)
for name, pts in footprints.items():     # a thin object (a pole, the sign) blocks the cells it stands in, however little it covers
    for X, Y in list(pts) + [tuple(np.mean(pts, axis=0))]:
        xw, yw = world_of(X, Y)
        r_, c_ = int(yw // GRID), int(xw // GRID)
        if 0 <= r_ < ny and 0 <= c_ < nx and KIND[r_, c_] is None:
            KIND[r_, c_] = KIND_OF(name)
B = KIND != None  # noqa: E711
# open floor needs room for a body: a free cell stays free only if it lies in some 2 x 2 block of free cells (the boundary counts as
# solid), so no gap narrower than a body (80 > 2 x 36 + 8) is left between two walls or a wall and the edge. (Done exactly here:
# OpenCV's morphology with an even kernel shifts its result by a cell.)
assert math.ceil((2 * Rp + 8) / GRID) == 2
free = np.pad(~B, 1, constant_values=False)
blocks = free[:-1, :-1] & free[1:, :-1] & free[:-1, 1:] & free[1:, 1:]          # 2 x 2 window with top-left at (r, c) in padded
keep = np.zeros_like(free)
keep[:-1, :-1] |= blocks
keep[1:, :-1] |= blocks
keep[:-1, 1:] |= blocks
keep[1:, 1:] |= blocks
B = ~(keep[1:-1, 1:-1])
# a cell closed only to leave no sub-body gap takes the kind of its nearest blocked neighbour (by object; the boundary: EDGE)
for r, c in np.argwhere(B & (KIND == None)):  # noqa: E711
    near = sorted(((abs(r - r2) + abs(c - c2), KIND[r2, c2]) for r2, c2 in np.argwhere(KIND != None)), key=lambda t: t[0])  # noqa: E711
    edge_d = min(r, c, ny - 1 - r, nx - 1 - c) + 1
    KIND[r, c] = 'EDGE' if not near or edge_d < near[0][0] else near[0][1]
walls, left = [], B.copy()
while left.any():          # merge cells of one kind into rectangles (row-major greedy)
    r, c = np.argwhere(left)[0]
    kind = KIND[r, c]
    w = 1
    while c + w < nx and left[r, c + w] and KIND[r, c + w] == kind:
        w += 1
    h = 1
    while r + h < ny and all(left[r + h, c + i] and KIND[r + h, c + i] == kind for i in range(w)):
        h += 1
    left[r:r + h, c:c + w] = False
    x0, x1, y0, y1 = c * GRID, min((c + w) * GRID, WIDTH), r * GRID, min((r + h) * GRID, HEIGHT)
    if x1 - x0 < MINT:          # a cut-off cell at the boundary: at least the rules' minimum thickness, still inside the arena
        x0 = max(0, x1 - MINT)
    if y1 - y0 < MINT:
        y0 = max(0, y1 - MINT)
    n_kind = sum(1 for w_ in walls if w_['kind'] == kind)
    walls.append(dict(id=f'{kind}{n_kind}', kind=kind, x=int(x0), y=int(y0), width=int(x1 - x0), height=int(y1 - y0)))


def d2rect(p, w):
    dx = max(w['x'] - p[0], 0, p[0] - (w['x'] + w['width']))
    dy = max(w['y'] - p[1], 0, p[1] - (w['y'] + w['height']))
    return math.hypot(dx, dy)


clear = lambda p, m: all(d2rect(p, w) >= m for w in walls) and Rp + 10 <= p[0] <= WIDTH - Rp - 10 and Rp + 10 <= p[1] <= HEIGHT - Rp - 10
cand = [(x, y) for x in range(48, WIDTH - 47, 32) for y in range(48, HEIGHT - 47, 32) if clear((x, y), Rp + 30)]
lab = cv2.connectedComponentsWithStats((~B).astype(np.uint8), connectivity=4)
big = 1 + int(np.argmax(lab[2][1:, cv2.CC_STAT_AREA]))
cand = [p for p in cand if lab[1][min(ny - 1, int(p[1] // GRID)), min(nx - 1, int(p[0] // GRID))] == big]
# the dashed lines: dash marks read in environ2 (image px) unprojected to the ground, then to world x (they stand at x = const)
DASHES = {'left': [(90, 166), (72, 280), (60, 366), (49, 436), (29, 553), (21, 613)],
          'right': [(1211, 167), (1230, 281), (1243, 368), (1252, 428), (1278, 557), (1276, 632)]}
SAFE = [round(float(np.median([world_of(*unproject(x + 0.5, y + 0.5)[:2])[0] for x, y in DASHES[k]]))) for k in ('left', 'right')]
cand = [p for p in cand if SAFE[0] + Rp + 30 <= p[0] <= SAFE[1] - Rp - 30]          # spawns and Books inside the dashed lines

dist = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])


def spread_from(first):
    out = [first]
    while len(out) < 6:
        out.append(max(cand, key=lambda p: min(dist(p, q) for q in out)))
    return out


min_gap = lambda ss: min(dist(a, b) for i, a in enumerate(ss) for b in ss[i + 1:])


def improve(sp):
    sp = list(sp)
    for _ in range(20):
        better = False
        for i in range(6):
            rest = sp[:i] + sp[i + 1:]
            best = max(cand, key=lambda p: min(dist(p, q) for q in rest))
            if min_gap(rest + [best]) > min_gap(sp) + 1e-9:
                sp[i], better = best, True
        if not better:
            break
    return sp


starts = sorted((spread_from(c) for c in cand[::max(1, len(cand) // 300)]), key=min_gap, reverse=True)[:10]
spawns = max((improve(s) for s in starts), key=min_gap)
order = [spawns[0]]
while len(order) < 6:
    order.append(max((p for p in spawns if p not in order), key=lambda p: min(dist(p, q) for q in order)))
spawns = order
books = []
for _ in range(8):
    books.append(max(cand, key=lambda p: min(dist(p, q) for q in spawns + books)))

camera = dict(canvas=dict(width=W_IMG, height=H_IMG), focalPx=F, principal=dict(x=float(PP[0]), y=float(PP[1])),
              pitchDeg=cam['pitch_deg'], yawDeg=0.0, rollDeg=0.0, centre=[float(v) for v in C],
              world=dict(unitsPerPlanUnit=U, planOriginX=X_LEFT, planOriginY=Y_FAR))
result = dict(width=WIDTH, height=HEIGHT, player_radius=PLAYER_RADIUS, camera=camera,
              scale=dict(px_per_plan_unit_at_fountain=round(px_per_plan, 1), units_per_plan_unit=U,
                         player_radius_px_at_fountain=round(PLAYER_RADIUS / U * px_per_plan, 1), char_height_px=CHAR_HEIGHT_PX),
              fountain=dict(centre_world=[round(v, 1) for v in world_of(cx, cy)], radius_world=round(fr * U, 1),
                            base_fit_median_px=round(fountain_fit_px, 2)),
              footprints_world={k: [[round(v, 1) for v in world_of(*p)] for p in pts] for k, pts in footprints.items()},
              walls=walls, spawns=[dict(x=p[0], y=p[1]) for p in spawns], books=[dict(x=p[0], y=p[1]) for p in books],
              open_cells=len(cand), min_spawn_gap=round(min_gap(spawns), 1), safe_zone=[SAFE[0], SAFE[1]])
json.dump(result, open(os.path.join(OUT, 'arena.json'), 'w'), indent=1)

# ---- proof image: walls (red), footprints (yellow), spawns (green, numbered), Book spots (blue) over the map ----------------
vis = IMG.copy()
over = vis.copy()
for w in walls:
    q = [project([*plan_of(x, y), 0]) for x, y in ((w['x'], w['y']), (w['x'] + w['width'], w['y']),
                                                   (w['x'] + w['width'], w['y'] + w['height']), (w['x'], w['y'] + w['height']))]
    cv2.fillPoly(over, [np.int32(np.round(q))], (40, 40, 230))
vis = cv2.addWeighted(over, 0.38, vis, 0.62, 0)
for k, pts in footprints.items():
    q = [project([X, Y, 0]) for X, Y in pts]
    cv2.polylines(vis, [np.int32(np.round(q))], True, (0, 230, 255), 1, cv2.LINE_AA)
edge = [project([*plan_of(x, y), 0]) for x, y in ((0, 0), (WIDTH, 0), (WIDTH, HEIGHT), (0, HEIGHT))]
cv2.polylines(vis, [np.int32(np.round(edge))], True, (255, 255, 255), 2, cv2.LINE_AA)
for i, p in enumerate(spawns):
    q = project([*plan_of(*p), 0])
    s = PLAYER_RADIUS / U * px_per_plan
    cv2.ellipse(vis, (int(q[0]), int(q[1])), (int(s), int(s * 0.83)), 0, 0, 360, (40, 200, 40), 2, cv2.LINE_AA)
    cv2.putText(vis, str(i + 1), (int(q[0]) - 5, int(q[1]) + 5), 0, 0.5, (0, 90, 0), 2, cv2.LINE_AA)
for p in books:
    q = project([*plan_of(*p), 0])
    cv2.circle(vis, (int(q[0]), int(q[1])), 6, (230, 120, 20), 2, cv2.LINE_AA)
cv2.imwrite(os.path.join(OUT, 'arena_overlay.png'), vis)
print(json.dumps({k: result[k] for k in ('width', 'height', 'scale', 'fountain', 'open_cells', 'min_spawn_gap')}, indent=1),
      'walls', len(walls))

# ---- the rules module (games/foomerang-fu/src/rules/marketPlazaArena.ts) ---------------------------------------------------
KINDS = ['STALL', 'FOUNTAIN', 'CRATE', 'POT', 'POLE', 'SIGN', 'TERRACE', 'EDGE']
assert {w['kind'] for w in walls} <= set(KINDS)
pt = lambda p: f'  Object.freeze({{ x: {p[0]}, y: {p[1]} }}),'
ts = [f"""import type {{ Vec2 }} from '@foomerang/game-core';
import type {{ FuArena, Rect }} from './arena';

/**
 * MARKET PLAZA (`market_plaza`) — the plaza of environ2.avif, the owner's reference still (art/reconstruction/environ2), as DATA
 * owned by the rules. Presentation draws it; it never decides what blocks anything.
 *
 * GENERATED by art/reconstruction/environ2/arena_environ2.py from the image and its solved camera (camera.json: vanishing-point
 * calibration, f = {F:.1f} px at 1280 wide, pitch {cam['pitch_deg']:.2f} deg) — do not edit by hand. The world scale makes a player's
 * circle as large against environ2's characters as it is against the characters of the other reconstructed maps
 * ({U} world units per plan unit: a {PLAYER_RADIUS}-unit radius is {PLAYER_RADIUS / U * px_per_plan:.0f} px at the fountain). The arena runs between
 * the two side fences (each stands on one ground line), from the far wall's base to the bottom of the frame.
 *
 * Solid (40-unit cells, merged by kind): STALL (from the four post tops seen on each canopy, at the measured post height),
 * FOUNTAIN (a circle fitted to its base outline), CRATE and POT (one object deep behind their base line), POLE (the bunting's two
 * posts, the two banner poles), SIGN, TERRACE (the raised terrace, its stairs and the archway legs) and EDGE (ground outside the
 * frame, and gaps narrower than a body). Pots, poles and signs are solid by the owner's decision (2026-10-16). Trees, the
 * bunting's rope and the rugs are not. No gates, platforms or hazards: no new mechanic.
 */

export const MARKET_PLAZA_WIDTH = {WIDTH};
export const MARKET_PLAZA_HEIGHT = {HEIGHT};

export interface MarketPlazaWall extends Rect {{
  readonly id: string;
  readonly kind: {' | '.join(f"'{k}'" for k in KINDS)};
}}

export const MARKET_PLAZA_WALLS: readonly MarketPlazaWall[] = Object.freeze(["""]
for w in walls:
    ts.append(f"  Object.freeze({{ id: '{w['id']}', kind: '{w['kind']}', x: {w['x']}, y: {w['y']}, width: {w['width']}, height: {w['height']} }}),")
ts.append("""] as const);

/** One spawn per slot; greedy farthest-point order so every prefix (2 to 6 players) is spread. */
export const MARKET_PLAZA_SPAWNS: readonly Vec2[] = Object.freeze([""")
ts += [pt(p) for p in spawns]
ts.append("""]);

/** Where Books may appear: open floor away from every spawn. */
export const MARKET_PLAZA_BOOK_SPOTS: readonly Vec2[] = Object.freeze([""")
ts += [pt(p) for p in books]
ts.append("""]);
""")
ts.append(f"""
/**
 * The border: the two dashed lines on the sand (left and right, measured in environ2 at world x {SAFE[0]} and {SAFE[1]}). Players
 * may cross them; one who stays outside for the config's outsideLimitSeconds explodes (owner, 2026-10-17).
 */
export const MARKET_PLAZA_SAFE_ZONE: Rect = Object.freeze({{ x: {SAFE[0]}, y: 0, width: {SAFE[1] - SAFE[0]}, height: MARKET_PLAZA_HEIGHT }});
""")
ts.append("""
export const MARKET_PLAZA_ARENA: FuArena = Object.freeze({
  width: MARKET_PLAZA_WIDTH,
  height: MARKET_PLAZA_HEIGHT,
  walls: Object.freeze(
    MARKET_PLAZA_WALLS.map(({ x, y, width, height }) => Object.freeze({ x, y, width, height })),
  ),
  spawns: MARKET_PLAZA_SPAWNS,
  safeZone: MARKET_PLAZA_SAFE_ZONE,
});
""")
open(os.path.join(OUT, 'marketPlazaArena.ts'), 'w').write('\n'.join(ts))
