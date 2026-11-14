"""The gong court's lavender stone (2026-11-12): every wall, platform, block and boulder, each a prism standing on the ground, measured
on the round's mosaic (players and READY gone). The stone's tops are its lightest tone (#9aa5dd, the k-means of its pixels: tops, then
four darker steps down its sides); a body's top is that tone and the mint it rims, within the body's own area (BODIES: mosaic pixels,
read off the tone map). Its outline, simplified, is lifted to the height h whose prism (the outline at h and on the ground, joined)
best matches the body's stone in the mosaic (IoU, h searched every 0.05); the mint inside it, if any, is kept as its sunken top.
Writes stones.json: name -> {top: [[x, y]...] (plan units, y north), h, mint: [[x, y]...] or null, iou}.

  python art/gong_court/fit_stones.py      (after mosaic.py; the Python of art/audio/output/venv)
"""
import json, os, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import plan, pix, MOSAIC_ORIGIN

OX, OY = MOSAIC_ORIGIN
M = cv2.imread('art/gong_court/output/mosaic.png'); hsv = cv2.cvtColor(M, cv2.COLOR_BGR2HSV).astype(int)
STONE = (hsv[..., 0] >= 108) & (hsv[..., 0] <= 140) & (hsv[..., 1] > 40) & (hsv[..., 2] > 60)
TOP = STONE & (hsv[..., 2] >= 205)
MINT = (hsv[..., 0] >= 40) & (hsv[..., 0] <= 75) & (hsv[..., 1] >= 50) & (hsv[..., 2] >= 170)

# name: its area in the mosaic (a polygon, mosaic px), what it is (wall/block/platform/boulder), its outline's vertex budget
BODIES = {
    'plat_nw': ([(450, 70), (890, 70), (890, 175), (850, 240), (720, 395), (450, 395)], 'platform', 10),
    'wall_n': ([(840, 170), (1390, 170), (1390, 245), (840, 245)], 'wall', 4),
    'plat_ne': ([(1380, 85), (1735, 85), (1735, 340), (1620, 390), (1380, 390)], 'platform', 10),
    'step_ne': ([(1615, 325), (1735, 325), (1735, 440), (1615, 440)], 'platform', 8),
    'wall_e': ([(1600, 365), (1680, 365), (1680, 890), (1600, 890)], 'wall', 4),
    'wall_w': ([(490, 350), (590, 350), (590, 862), (490, 862)], 'wall', 4),
    'plat_sw': ([(375, 845), (545, 845), (720, 1060), (430, 1070), (410, 1100), (375, 1100)], 'platform', 10),
    'plat_sw_hi': ([(415, 935), (700, 935), (712, 1195), (415, 1195)], 'platform', 10),
    'block_sw': ([(560, 1125), (725, 1125), (725, 1235), (560, 1235)], 'block', 8),
    'end_sw': ([(700, 1060), (865, 1060), (865, 1165), (700, 1165)], 'block', 6),
    'wall_s': ([(850, 1075), (1320, 1075), (1320, 1145), (850, 1145)], 'wall', 4),
    'end_se': ([(1300, 1060), (1440, 1060), (1440, 1170), (1300, 1170)], 'block', 6),
    'plat_se': ([(1425, 1000), (1600, 1000), (1720, 1080), (1700, 1260), (1425, 1260), (1425, 1100)], 'platform', 10),
    'plat_se_hi': ([(1590, 875), (1825, 875), (1825, 1085), (1590, 1085)], 'platform', 10),
    'planter_c': ([(815, 575), (975, 575), (975, 750), (815, 750)], 'platform', 10),
    'block_n': ([(1100, 345), (1275, 345), (1275, 495), (1100, 495)], 'block', 8),
    'block_l_long': ([(1235, 655), (1425, 655), (1425, 760), (1300, 800), (1235, 800)], 'block', 8),
    'block_l_short': ([(1235, 780), (1365, 780), (1365, 890), (1235, 890)], 'block', 8),
    'boulder_w': ([(55, 775), (240, 775), (240, 1005), (55, 1005)], 'boulder', 8),
    'boulder_ne': ([(1730, 0), (2217, 0), (2217, 200), (1730, 200)], 'boulder', 10),
    'boulder_se': ([(1890, 905), (2217, 905), (2217, 1230), (1890, 1230)], 'boulder', 10),
}


def area_mask(poly):
    m = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(m, [np.int32(poly)], 1); return m > 0


def silhouette(plan_poly, h, shape):
    m = np.zeros(shape, np.uint8)
    up = np.float32([pix(x, y, h) for x, y in plan_poly]) - [OX, OY]
    dn = np.float32([pix(x, y, 0) for x, y in plan_poly]) - [OX, OY]
    n = len(plan_poly)
    cv2.fillPoly(m, [np.int32(up)], 1); cv2.fillPoly(m, [np.int32(dn)], 1)
    for i in range(n):
        j = (i + 1) % n; cv2.fillConvexPoly(m, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
    return m > 0


out = {}
for name, (poly, kind, budget) in BODIES.items():
    area = area_mask(poly)
    top = TOP & area
    top = cv2.morphologyEx(top.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # the top with what it rims (the mint, a tree's foot, the gong's): filled
    cs, _ = cv2.findContours(top, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs: print(name, 'no top'); continue
    c = np.concatenate([q for q in cs if cv2.contourArea(q) > 30]) if any(cv2.contourArea(q) > 30 for q in cs) else max(cs, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    filled = np.zeros_like(top); cv2.fillConvexPoly(filled, hull, 1)
    eps = 1.0
    while True:
        ap = cv2.approxPolyDP(hull, eps, True).reshape(-1, 2)
        if len(ap) <= budget: break
        eps += 0.5
    # its height from its face: in each column under the top's lower edge, the stone down to the grass (the median over the middle of the
    # outline's span, where nothing stands in front of it); each column's run converted at that spot (a unit tall there in px)
    poly_px = np.int32(ap); tm = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(tm, [poly_px], 1)
    xs = np.nonzero(tm.any(0))[0]; lo, hi_ = xs.min(), xs.max(); span = hi_ - lo
    runs = []
    for x in range(int(lo + 0.2 * span), int(hi_ - 0.2 * span) + 1, 2):
        col = np.nonzero(tm[:, x])[0]
        if len(col) == 0: continue
        y = col.max() + 1; y0_ = y
        while y < STONE.shape[0] and (STONE[y, x] or (y - y0_ < 3)): y += 1
        px_run = y - y0_
        g0 = plan([(x + OX, y + OY)])[0]; unit = pix(g0[0], g0[1], 0)[1] - pix(g0[0], g0[1], 1)[1]
        runs.append(px_run / unit)
    target = (STONE | (MINT & (filled > 0))) & area
    best = (0, 1.0, None)
    for hh in np.arange(0.2, 6.0, 0.05):
        pp_ = plan([(x + OX, y + OY) for x, y in ap], z=hh)
        sil = silhouette(pp_, hh, STONE.shape) & area
        iou_ = (sil & target).sum() / max(1, (sil | target).sum())
        if iou_ > best[0]: best = (iou_, float(hh), pp_)
    iou, h, pp = best
    # the sunken mint top: the mint inside the outline
    mint = None; mint_px = None
    inner = MINT & (filled > 0)
    inner = cv2.morphologyEx(inner.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    ms, _ = cv2.findContours(inner, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if ms and kind == 'platform':
        mc = max(ms, key=cv2.contourArea)
        if cv2.contourArea(mc) > 400:
            mh = cv2.convexHull(mc); e2 = 1.0
            while True:
                ap2 = cv2.approxPolyDP(mh, e2, True).reshape(-1, 2)
                if len(ap2) <= 14: break
                e2 += 0.5
            mint = [[round(float(x), 3), round(float(y), 3)] for x, y in plan([(x + OX, y + OY) for x, y in ap2], z=h)]
            mint_px = [[int(x), int(y)] for x, y in ap2]
    out[name] = dict(kind=kind, h=round(float(h), 3), iou=round(float(iou), 3), top_px=[[int(x), int(y)] for x, y in ap], mint_px=mint_px,
                     top=[[round(float(x), 3), round(float(y), 3)] for x, y in pp], mint=mint)
    print('%-14s %-8s h %.2f  IoU %.3f  %d corners%s' % (name, kind, h, iou, len(pp), '  mint' if mint else ''))

# ---- the hand-read bodies (stones_manual.json) replace the fitted ones: their height from their face, their outline at that height
MAN = json.load(open('art/gong_court/stones_manual.json'))
for name, b in MAN.items():
    if name.startswith('_'): continue
    keep = out.get(name, {})
    tpx = b.get('top') or keep['top_px']
    # its height: the prism over the hand-read outline whose silhouette best matches its stone (and the mint it rims) in its area
    area = area_mask(BODIES[name][0]) if name in BODIES else np.ones(STONE.shape, bool)
    filled = np.zeros(STONE.shape, np.uint8); cv2.fillPoly(filled, [np.int32(tpx)], 1)
    target = (STONE | (MINT & (filled > 0))) & area
    best = (0, 1.0)
    for hh in np.arange(0.2, 6.0, 0.05):
        pp_ = plan([(x + OX, y + OY) for x, y in tpx], z=hh)
        sil = silhouette(pp_, hh, STONE.shape) & area
        iou_ = (sil & target).sum() / max(1, (sil | target).sum())
        if iou_ > best[0]: best = (iou_, float(hh))
    h = best[1]
    pp = plan([(x + OX, y + OY) for x, y in tpx], z=h)
    # (its mint, re-laid at this height)
    if keep.get('mint_px'): keep['mint'] = [[round(float(x), 3), round(float(y), 3)] for x, y in plan([(x + OX, y + OY) for x, y in keep['mint_px']], z=h)]
    out[name] = dict(kind=b.get('kind', keep.get('kind')), h=round(h, 3), iou=None, manual=True, top_px=tpx, mint_px=keep.get('mint_px'),
                     top=[[round(float(x), 3), round(float(y), 3)] for x, y in pp], mint=keep.get('mint'))
    out[name]['iou'] = round(best[0], 3)
    print('%-14s manual   h %.2f  IoU %.3f' % (name, h, best[0]))

import geom
# ---- the walls: beams. Each a straight centre line (the top strip's middle, column by column or row by row, a line fitted through it),
# its top's width (the strip's median thickness) and its height (the north and south walls' faces under their tops; the east and west
# walls, whose faces turn from the camera, take theirs)
WALLS = {'wall_n': ((870, 165, 1375, 240), 'x'), 'wall_s': ((870, 1070, 1300, 1150), 'x'), 'wall_w': ((485, 380, 595, 840), 'y'),
         'wall_e': ((1595, 390, 1685, 870), 'y')}
beam = {}
for name, ((x0, y0, x1, y1), ax) in WALLS.items():
    T = TOP[y0:y1, x0:x1]; S_ = STONE[y0:y1, x0:x1]; pts, thick, face = [], [], []
    rng_ = range(T.shape[1]) if ax == 'x' else range(T.shape[0])
    for i in rng_:
        line = T[:, i] if ax == 'x' else T[i, :]
        idx = np.nonzero(line)[0]
        if len(idx) < 3 or idx.max() - idx.min() > 40: continue
        c = (idx.min() + idx.max()) / 2
        pts.append((i + x0, c + y0) if ax == 'x' else (c + x0, i + y0)); thick.append(idx.max() - idx.min() + 1)
        if ax == 'x':
            j = idx.max() + 1
            while j < S_.shape[0] and S_[j, i]: j += 1
            face.append((i + x0, idx.max() + y0, j + y0))
    pts = np.float32(pts)
    if ax == 'x': k_, b_ = np.polyfit(pts[:, 0], pts[:, 1], 1); ends = [(x0, k_ * x0 + b_), (x1, k_ * x1 + b_)]
    else: k_, b_ = np.polyfit(pts[:, 1], pts[:, 0], 1); ends = [(k_ * y0 + b_, y0), (k_ * y1 + b_, y1)]
    beam[name] = dict(ends=ends, thick=float(np.median(thick)), face=face)
hs = []
for name in ('wall_n', 'wall_s'):
    for x, ty, by in beam[name]['face'][len(beam[name]['face']) // 5: -len(beam[name]['face']) // 5]:
        g0 = plan([(x + OX, by + OY)])[0]; h = 0.0
        while pix(g0[0], g0[1], h)[1] > ty + OY and h < 5: h += 0.01
        hs.append(h)
WALL_H = 1.34      # (the south wall's face, column.py at x 950-1250: 25-26 px straight under its 22 px top, the same at every column; the
#                   automatic median above (1.06) stops short where the face's lit upper part has the top's tone)
for name, b in beam.items():
    e = plan([(x + OX, y + OY) for x, y in b['ends']], z=WALL_H)
    mid = np.mean(b['ends'], 0); u = plan([(mid[0] + OX, mid[1] + OY)], z=WALL_H)[0]
    if name in ('wall_n', 'wall_s'): v = plan([(mid[0] + OX, mid[1] + b['thick'] + OY)], z=WALL_H)[0]
    else: v = plan([(mid[0] + b['thick'] + OX, mid[1] + OY)], z=WALL_H)[0]
    width = float(np.hypot(*(v - u)))
    # its sideways place and width: the beam whose silhouette best matches the stone in its box (shifted across its line, widened)
    (x0_, y0_, x1_, y1_), _ax = WALLS[name]
    box = np.zeros(STONE.shape, bool); box[y0_:y1_, x0_:x1_] = True
    e = np.array(e, float); d_ = e[1] - e[0]; n_ = np.array([-d_[1], d_[0]]) / np.linalg.norm(d_)
    best_ = (-1, 0.0, width)
    for off in np.arange(-0.6, 0.61, 0.04):
        for wd in np.arange(0.4, 1.21, 0.04):
            c_ = geom.beam_corners(dict(ends=(e + n_ * off).tolist(), width=wd))
            sil = silhouette(c_, WALL_H, STONE.shape) & box
            iou_ = (sil & STONE & box).sum() / max(1, (sil | (STONE & box)).sum())
            if iou_ > best_[0]: best_ = (iou_, off, wd)
    e = e + n_ * best_[1]; width = best_[2]
    out[name] = dict(kind='wall', h=round(WALL_H, 3), width=round(float(width), 3), ends=[[round(float(x), 3), round(float(y), 3)] for x, y in e],
                     iou=round(float(best_[0]), 3), top=None, mint=None)
    print('%-14s beam     h %.2f  width %.2f  shift %.2f  IoU %.3f' % (name, WALL_H, width, best_[1], best_[0]))

# ---- every height at once: the union of every prism's silhouette against all the stone (and the mint the tops rim), at half size;
# one body's height at a time (the others held), three passes, so bodies standing in front of one another share their stone
SC_ = 0.5
tops_px = {}
for name, b in out.items():
    if b['kind'] == 'wall': continue
    tops_px[name] = b.get('top_px') or (MAN.get(name, {}).get('top'))
alltop = np.zeros(STONE.shape, np.uint8)
for name, t in tops_px.items(): cv2.fillPoly(alltop, [np.int32(t)], 1)
TARGET = cv2.resize(((STONE | (MINT & (alltop > 0)))).astype(np.uint8), None, fx=SC_, fy=SC_, interpolation=cv2.INTER_NEAREST) > 0


def sil_small(poly_plan, h):
    m = np.zeros(TARGET.shape, np.uint8)
    up = (np.float32([pix(x, y, h) for x, y in poly_plan]) - [OX, OY]) * SC_; dn = (np.float32([pix(x, y, 0) for x, y in poly_plan]) - [OX, OY]) * SC_
    cv2.fillPoly(m, [np.int32(up)], 1); cv2.fillPoly(m, [np.int32(dn)], 1)
    for i in range(len(poly_plan)):
        j = (i + 1) % len(poly_plan); cv2.fillConvexPoly(m, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
    return m > 0


import geom
RIM = float(os.environ.get("RIM", "0.55"))


def inset(poly, d):
    """Any polygon moved in by d: drawn at 40 px a unit, eroded by d, traced back (the largest piece)."""
    P = np.float32(poly); x0, y0 = P.min(0) - 1 - max(0, -d); PXU = 40
    img = np.zeros((int((P[:, 1].max() - y0 + 1 + max(0, -d)) * PXU), int((P[:, 0].max() - x0 + 1 + max(0, -d)) * PXU)), np.uint8)
    cv2.fillPoly(img, [np.int32((P - [x0, y0]) * PXU)], 1)
    k = int(round(2 * abs(d) * PXU)) | 1; se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    img = cv2.erode(img, se) if d > 0 else cv2.dilate(img, se)
    cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs: return None
    ap = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 0.03 * PXU, True).reshape(-1, 2)
    return [[round(float(u / PXU + x0), 3), round(float(v / PXU + y0), 3)] for u, v in ap]


def _inset_convex(poly, d):
    P = geom.ccw([tuple(p) for p in poly]); n = len(P); out_ = []
    for i in range(n):
        (ax, ay), (bx, by), (cx, cy) = P[i - 1], P[i], P[(i + 1) % n]
        e0 = np.array([bx - ax, by - ay]); e0 /= np.linalg.norm(e0); e1 = np.array([cx - bx, cy - by]); e1 /= np.linalg.norm(e1)
        n0 = np.array([-e0[1], e0[0]]); n1 = np.array([-e1[1], e1[0]]); bis = n0 + n1; bis /= max(1e-6, np.linalg.norm(bis))
        out_.append([round(float(bx + bis[0] * d / max(0.3, bis @ n0)), 3), round(float(by + bis[1] * d / max(0.3, bis @ n0)), 3)])
    return out_
walls_sil = np.zeros(TARGET.shape, bool)
for name, b in out.items():
    if b['kind'] == 'wall': walls_sil |= sil_small(geom.beam_corners(b), b['h'])
# heights read on the faces (column.py: the face's run straight down from the top's front edge to the grass, at that spot's scale);
# the south-east diagonal under its octagon (the octagon's whole rim shows over the diagonal's mint in the HQ, and its east face is
# 2.2-2.3 units: the diagonal's 3.2 reading took in something else; 2.0 and 3.3/3.6 score the same, 5.36)
FIXED = {'plat_sw': 1.7, 'plat_sw_hi': 4.17, 'block_sw': 2.24, 'plat_nw': 2.6, 'plat_ne': 2.85, 'plat_se': 2.0, 'plat_se_hi': 2.33,
         'boulder_ne': 1.86, 'boulder_ne2': 4.6, 'step_sw': 1.55}
# (heights the painter refined: refine_outlines.py --heights, stored with the outline in stones_manual.json)
FIXED.update({n: b['h'] for n, b in MAN.items() if not n.startswith('_') and isinstance(b, dict) and 'h' in b})
H_ = {n: FIXED.get(n, out[n]['h']) for n in tops_px}
cache = {n: sil_small(plan([(x + OX, y + OY) for x, y in tops_px[n]], z=H_[n]), H_[n]) for n in tops_px}
for p_ in range(3):
    for n in tops_px:
        if n in FIXED: continue
        others = walls_sil.copy()
        for o, sm in cache.items():
            if o != n: others |= sm
        best = (-1, H_[n], cache[n])
        for hh in np.arange(0.2, 5.0, 0.05):
            sm = sil_small(plan([(x + OX, y + OY) for x, y in tops_px[n]], z=hh), hh)
            u = others | sm; iou_ = (u & TARGET).sum() / max(1, (u | TARGET).sum())
            if iou_ > best[0]: best = (iou_, float(hh), sm)
        H_[n], cache[n] = best[1], best[2]
    print('pass', p_, 'global IoU %.4f' % best[0])
GROW = float(sys.argv[1]) if len(sys.argv) > 1 else 0.08    # (the HQ's soft bevelled edges: the top tone stops short of the body's edge)
for n, hh in H_.items():
    b = out[n]; b['h'] = round(hh, 3)
    b['top'] = [[round(float(x), 3), round(float(y), 3)] for x, y in plan([(x + OX, y + OY) for x, y in tops_px[n]], z=hh)]
    if GROW > 0: b['top'] = inset(b['top'], -GROW)
    # a platform's mint: its top inset by the rim (the light lavender band measures 16-17 px at the far edges, 0.55 units)
    b['mint'] = inset(b['top'], MAN.get(n, {}).get('rim', RIM)) if b['kind'] == 'platform' else None
    print('%-14s h %.2f%s' % (n, hh, '  fixed' if n in FIXED else ''))
# the walls as the painter refined them (refine_outlines.py --walls)
for n, v in MAN.get('_walls', {}).items():
    if n in out: out[n].update(ends=v['ends'], width=round(v['width'], 3), h=round(v['h'], 3))
json.dump(out, open('art/gong_court/stones.json', 'w'), indent=1)

# the check: each body's prism outline over the mosaic
v = M.copy()
for name, b in out.items():
    if b['top'] is None: continue
    up = np.int32([pix(x, y, b['h']) for x, y in b['top']]) - [OX, OY]; dn = np.int32([pix(x, y, 0) for x, y in b['top']]) - [OX, OY]
    cv2.polylines(v, [up], True, (0, 0, 255), 2); cv2.polylines(v, [dn], True, (255, 0, 0), 1)
    if b['mint']: cv2.polylines(v, [np.int32([pix(x, y, b['h']) for x, y in b['mint']]) - [OX, OY]], True, (0, 255, 255), 1)
cv2.imwrite('art/gong_court/output/stones_check.jpg', v)
