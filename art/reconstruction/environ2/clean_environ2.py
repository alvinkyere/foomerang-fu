"""Step 2 of the environ2 map: remove the characters and their effects from environ2.avif (a 1280x720 still), keeping every
other pixel EXACTLY as it is.

Method (no invented texture where real texture exists):
 * The plaza is mirror-symmetric about a vertical axis (measured: x0 = 651.25, the fountain's centre). For each character the
   pixels to replace are those that (a) differ from their mirror counterpart and (b) are connected to the character, inside the
   character's box (holes such as eyes are filled, plus a 2 px antialiasing margin). Dust specks are yellow specks on the plaza
   whose mirror pixel is plain floor.
 * Replacement = the mirror pixels + a membrane correction: the original-minus-mirror difference on the ring just outside the
   mask, interpolated smoothly inside by solving Laplace's equation (a Poisson blend), so lighting matches at every edge.
 * The glow over hex tree 28 has no mirror counterpart: it is handled separately (unglow step), not here.
python clean_environ2.py <environ2.png> <out_dir>"""
import sys, os, json, cv2, numpy as np

SRC, OUT = sys.argv[1:3]
os.makedirs(OUT, exist_ok=True)
I8 = cv2.imread(SRC)
H, W = I8.shape[:2]
I = I8.astype(np.float32)


def mirror_of(img, x0):
    xs = (2 * x0 - np.arange(W)).astype(np.float32)
    mx, my = np.meshgrid(xs, np.arange(H, dtype=np.float32))
    return cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


# ---- the mirror axis: the one that makes the plaza's symmetric structure agree best -----------------------------------
SYMMETRIC = [(535, 315, 770, 530), (505, 580, 805, 700), (325, 150, 980, 300), (180, 340, 1125, 480), (445, 0, 860, 145)]
CHARS = {  # box (with effects and shadow), core seed inside it
    'A coffee': ((530, 200, 605, 270), (555, 215, 590, 255)),
    'B donut': ((425, 295, 525, 380), (455, 315, 500, 355)),
    'C green + dust': ((282, 400, 410, 505), (355, 425, 390, 460)),
    'D eggplant': ((910, 340, 1000, 410), (945, 360, 980, 395)),
    'E orange + arc': ((640, 498, 752, 610), (690, 530, 720, 560)),
    'F ice + puffs': ((735, 490, 832, 610), (760, 545, 795, 580)),
}
roi = np.zeros((H, W), bool)
for x0_, y0, x1, y1 in SYMMETRIC:
    roi[y0:y1, x0_:x1] = True
for (bx0, by0, bx1, by1), _ in CHARS.values():
    roi[by0:by1, bx0:bx1] = False
    roi[by0:by1, int(1303 - bx1):int(1303 - bx0)] = False
x0 = min(np.arange(648.0, 656.01, 0.25), key=lambda a: np.abs(I - mirror_of(I, a).astype(np.float32)).sum(-1)[roi].mean())
M8 = mirror_of(I8, x0)
M = M8.astype(np.float32)
D = np.abs(I - M).sum(-1)

# ---- masks: hand-traced polygons around each character, its effects and its shadow (traced on 3x crops) --------------
# They stay off the rugs, the fountain rim and the archway posts; where an effect overlaps scenery that IS symmetric (the
# puffs over the right post's top, the arc over the yellow ring) the polygon takes it in and the mirror supplies it.
REMOVE = {
    'A coffee (+ yellow dot)': ([(533, 193), (556, 193), (556, 205), (602, 205), (602, 264), (533, 264)], 'mirror'),
    'B donut (+ dust)': ([(440, 300), (500, 298), (522, 320), (522, 380), (428, 380), (428, 330), (440, 322)], 'mirror'),
    'C green + leaf + trail + shadow': ([(338, 418), (352, 410), (397, 410), (401, 440), (399, 489), (370, 490), (350, 494),
                                        (330, 501), (318, 509), (291, 507), (291, 484), (300, 472), (304, 463),
                                        (327, 452), (336, 447)], 'search'),
    'D eggplant + arm + dot + shadow': ([(915, 370), (948, 372), (950, 350), (983, 350), (986, 343), (1002, 343), (1002, 365),
                                         (988, 367), (987, 388), (991, 388), (991, 400), (980, 400), (980, 406), (948, 406), (915, 393)], 'search'),
    # the hand lies on the rug's tasselled edge, which is not like its mirror there: copied from further along that edge
    'D hand over the rug edge': ([(979, 390), (992, 390), (992, 401), (979, 401)], 'edge'),
    'E orange + arc + bits': ([(652, 530), (668, 516), (700, 514), (722, 525), (741, 548), (741, 574), (712, 592),
                               (668, 594), (651, 577)], 'axis'),
    'F ice + puffs + cloud': ([(738, 500), (750, 493), (790, 493), (801, 518), (836, 538), (836, 566), (812, 581),
                              (805, 606), (780, 606), (746, 606), (735, 580)], 'axis'),
}
mask = np.zeros((H, W), np.uint8)
region_of = np.zeros((H, W), np.int32)
per_char, how = {}, {}
for i, (name, (poly, source)) in enumerate(REMOVE.items(), start=1):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.int32(poly)], 1)
    mask |= m
    region_of[m > 0] = i
    per_char[name] = int(m.sum())
    how[i] = source
# slivers of real pixels squeezed between two traced regions (E and F) still hold effect colour: close them into the nearer one
closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
sliver = (closed > 0) & (mask == 0)
grown = cv2.dilate(region_of.astype(np.float32), np.ones((9, 9), np.uint8)).astype(np.int32)
region_of[sliver] = grown[sliver]
mask |= sliver.astype(np.uint8)
hsv, mhsv = cv2.cvtColor(I8, cv2.COLOR_BGR2HSV), cv2.cvtColor(M8, cv2.COLOR_BGR2HSV)
yellow = (hsv[..., 0] >= 12) & (hsv[..., 0] <= 32) & (hsv[..., 1] > 90) & (hsv[..., 2] > 150)
floor_in_mirror = (mhsv[..., 1] < 70) & (mhsv[..., 2] > 200)
plaza = np.zeros((H, W), np.uint8)
cv2.fillPoly(plaza, [np.int32([(260, 150), (1045, 150), (1045, 560), (840, 640), (470, 640), (260, 560)])], 1)
# a yellow pixel whose mirror lies under a character or effect is not evidence of dust (its mirror is not real floor)
mirrored_mask = mirror_of(mask * 255, x0) > 0
# (the mirror is NOT required to be floor: dust lies on both sides in places, e.g. at (477,418) and (825,418))
n, lab, st, _ = cv2.connectedComponentsWithStats((yellow & (plaza > 0)).astype(np.uint8))
dust = np.zeros((H, W), np.uint8)
specks = 0
floor_here = (hsv[..., 1] < 70) & (hsv[..., 2] > 200)
for k in range(1, n):
    area = st[k, cv2.CC_STAT_AREA]
    if area > 500:
        continue
    # a speck lies ON plain floor: nearly all of its surroundings are floor (this rejects highlights on the hex trees, the
    # stalls, the paths, and the parts of the sand ring that are wider than their mirror)
    comp = (lab == k).astype(np.uint8)
    around = (cv2.dilate(comp, np.ones((7, 7), np.uint8)) > 0) & (comp == 0)
    if floor_here[around].mean() >= (0.8 if area >= 6 else 0.95):    # (a 1-5 px speck must be wholly on floor)
        dust[comp > 0] = 1
        specks += 1
dust = cv2.dilate(dust, np.ones((5, 5), np.uint8)) & (mask == 0)
mask |= dust
region_of[(dust > 0)] = 99
how[99] = 'search'      # its mirror may be dusty too, so the best clean floor nearby


# ---- replacement: a real source for each region, then a Laplace (membrane) correction at its edge ---------------------
# 'mirror': the symmetric counterpart (with the small offset that matches the ring best). 'search': the best of every shift
# within +-160 px and the mirror +-24 px, scored on the ring of real pixels just outside the region; sources may not touch any
# region. The membrane then interpolates the remaining original-minus-source difference from the edge inward.
def membrane(diff, inside, iters=4000):
    f = diff.copy()
    f[inside] = 0.0
    for _ in range(iters):
        avg = 0.25 * (np.roll(f, 1, 0) + np.roll(f, -1, 0) + np.roll(f, 1, 1) + np.roll(f, -1, 1))
        f[inside] = avg[inside]
    return f


# ---- (before the fills) the sand ring under F's cloud: the ring is NOT mirror-symmetric (it is wider on the left), so the mirror puts its edge
# in the wrong place there. Its outer edge is measured around the fountain (radius by angle, in the ground-ellipse frame
# centred on the axis) just either side of the gap, joined linearly across it; ring pixels and floor pixels inside the region
# are then each filled harmonically from their own kind only, with a 1 px antialiased edge.
RING_CENTRE, RING_SQUASH = (x0, 425.0), 0.83
F_ID = list(REMOVE).index('F ice + puffs + cloud') + 1


def ring_repair(img):
    hsv_ = cv2.cvtColor(np.clip(np.rint(img), 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
    is_ring = (hsv_[..., 0] >= 15) & (hsv_[..., 0] <= 35) & (hsv_[..., 1] > 80) & (hsv_[..., 2] > 200)
    is_floor = (hsv_[..., 1] < 70) & (hsv_[..., 2] > 200)
    yy, xx = np.mgrid[0:H, 0:W]
    th = np.degrees(np.arctan2((yy - RING_CENTRE[1]) / RING_SQUASH, xx - RING_CENTRE[0]))
    r = np.hypot(xx - RING_CENTRE[0], (yy - RING_CENTRE[1]) / RING_SQUASH)
    region = region_of == F_ID
    edge = is_ring & ~(cv2.dilate(region.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & (
        np.roll(is_floor, -1, 1) | np.roll(is_floor, 1, 0) | np.roll(is_floor, -1, 0) | np.roll(is_floor, 1, 1))
    gap = th[region & (r < 200)]
    lo, hi = float(gap.min()), float(gap.max())
    a = edge & (r > 110) & (r < 200) & (th >= lo - 12) & (th < lo)
    b = edge & (r > 110) & (r < 200) & (th > hi) & (th <= hi + 12)
    ra, rb = float(np.median(r[a])), float(np.median(r[b]))
    r_edge = ra + (np.clip(th, lo, hi) - lo) / (hi - lo) * (rb - ra)
    coverage = np.clip(r_edge - r + 0.5, 0, 1)            # 1 = ring, 0 = floor
    ya, yb_, xa, xb_ = yy[region].min() - 6, yy[region].max() + 7, xx[region].min() - 6, xx[region].max() + 7
    win = (slice(ya, yb_), slice(xa, xb_))
    reg = region[win]
    fixed = img[win].copy()
    for kind, want in (('ring', coverage[win] > 0), ('floor', coverage[win] < 1)):
        known = (is_ring if kind == 'ring' else is_floor)[win] & ~reg
        solve = reg & want
        f = fixed.copy()
        w_known = known | solve
        f[~known] = 0
        f[solve] = f[known].mean(0)     # start from the kind's mean colour (starting from black converges far too slowly)
        for _ in range(3000):           # harmonic fill using only neighbours of the same kind
            num = sum(np.roll(f * w_known[..., None], sh, ax) for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)))
            den = sum(np.roll(w_known.astype(np.float32), sh, ax) for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)))
            upd = num / np.maximum(den, 1e-6)[..., None]
            f[solve] = upd[solve]
        if kind == 'ring':
            ring_fill = f
        else:
            floor_fill = f
    cov = coverage[win][..., None]
    blend = cov * ring_fill + (1 - cov) * floor_fill
    # only where the region's ring/floor layout is wrong is anything overwritten: the band around the fitted edge, plus any
    # pixel whose label disagrees with the fit
    # the zone this rebuilds: the region's pixels from the fountain out to just past the ring's edge (beyond it the mirror,
    # which carries the post and the floor's tile lines, fills the rest of F with this zone as its boundary)
    zone_w = reg & (r[win] < r_edge[win] + 14)
    out_ = img.copy()
    out_[win][zone_w] = blend[zone_w]
    zone = np.zeros((H, W), bool)
    zone[win] = zone_w
    return out_, zone, dict(angles=[round(lo, 1), round(hi, 1)], radius_either_side=[round(ra, 1), round(rb, 1)],
                            px=int(zone_w.sum()))


I, ring_zone, ring_info = ring_repair(I)
mask[ring_zone] = 0
region_of[ring_zone] = 0




forbidden = cv2.dilate(mask, np.ones((9, 9), np.uint8)) > 0
exact = mask > 0          # a mirror source may touch its own region where it straddles the axis (those few pixels are interpolated)
AXIS = [('mirror', dx, dy) for dx in range(-4, 5, 2) for dy in range(-4, 5, 2)]
# 'edge': along a horizontal, repeating edge (the rug's tassels), so only horizontal shifts, and close ones
EDGE = [('edge', dx, dy) for dx in list(range(-30, -7)) + list(range(8, 31)) for dy in (-1, 0, 1)]
MIRROR = [('mirror', dx, dy) for dx in range(-24, 25, 2) for dy in range(-24, 25, 2)]
SHIFT = [('shift', dx, dy) for dx in range(-160, 161, 4) for dy in range(-160, 161, 4) if max(abs(dx), abs(dy)) >= 8]


def source_coords(kind, dx, dy, ys, xs):
    return (ys + dy, xs + dx) if kind in ('shift', 'edge') else (ys + dy, np.rint(2 * x0 - xs).astype(int) + dx)


out = I.copy()
done = np.zeros((H, W), bool)
choices = {}
# one fill per traced region (E and F overlap, and must still each get their own source), one per dust speck
_, blob = cv2.connectedComponents(mask)
lab = np.zeros((H, W), np.int32)
for rid in sorted(set(np.unique(region_of)) - {0, 99}):
    lab[region_of == rid] = rid
nd, dlab = cv2.connectedComponents((region_of == 99).astype(np.uint8))
lab[dlab > 0] = 1000 + dlab[dlab > 0]
for k in sorted(set(np.unique(lab)) - {0}):
    ys_, xs_ = np.nonzero(lab == k)
    x, y, w, h = xs_.min(), ys_.min(), xs_.max() - xs_.min() + 1, ys_.max() - ys_.min() + 1
    # the window holds every masked blob this region touches (E and F overlap), so the membrane never meets a masked pixel at
    # the window's edge (np.roll would wrap it to the opposite edge)
    touching = set(np.unique(blob[lab == k])) - {0}
    bys, bxs = np.nonzero(np.isin(blob, list(touching)))
    pad = 10
    xa, ya, xb, yb = max(0, bxs.min() - pad), max(0, bys.min() - pad), min(W, bxs.max() + 1 + pad), min(H, bys.max() + 1 + pad)
    inside = lab[ya:yb, xa:xb] == k
    rid = int(np.bincount(region_of[ya:yb, xa:xb][inside]).argmax())
    ring = (cv2.dilate(inside.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & (mask[ya:yb, xa:xb] == 0)
    ys, xs = np.mgrid[ya:yb, xa:xb]
    best = None
    for kind, dx, dy in {'axis': AXIS, 'mirror': MIRROR, 'search': MIRROR + SHIFT, 'edge': EDGE}[how[rid]]:
        sy, sx = source_coords(kind, dx, dy, ys, xs)
        if sy.min() < 0 or sx.min() < 0 or sy.max() >= H or sx.max() >= W:
            continue
        if kind == 'shift' and forbidden[sy[inside], sx[inside]].any():
            continue
        if kind == 'edge' and exact[sy[inside], sx[inside]].any():
            continue
        if kind == 'mirror' and exact[sy[inside], sx[inside]].mean() > (0.15 if how[rid] == 'axis' else 0.03):
            continue
        err = np.abs(I[ys[ring], xs[ring]] - I[sy[ring], sx[ring]]).sum(-1).mean()
        if best is None or err < best[0]:
            best = (err, kind, dx, dy)
    if best is None:
        raise SystemExit(f'no clean source for the region at {x},{y} ({w}x{h})')
    err, kind, dx, dy = best
    sy, sx = source_coords(kind, dx, dy, ys, xs)
    S = I[sy, sx]
    # the correction is pinned only by REAL pixels: every masked pixel in the window (this region and any neighbouring one
    # that still holds a character) is solved for, never used as a boundary value
    # a region filled earlier counts as real here (so E and F, which touch, meet without a seam)
    free = (mask[ya:yb, xa:xb] > 0) & ~done[ya:yb, xa:xb]
    corr = np.dstack([membrane((out[ya:yb, xa:xb] - S)[..., c], free | inside) for c in range(3)])
    patch = out[ya:yb, xa:xb]
    patch[inside] = (S + corr)[inside]
    # pixels whose source is itself masked (on the axis): harmonic fill from the freshly filled neighbours
    self_src = inside & exact[sy, sx]
    if self_src.any():
        for c in range(3):
            patch[..., c] = membrane(patch[..., c], self_src, iters=600)
    done[ya:yb, xa:xb] |= inside
    if rid != 99:
        name = list(REMOVE)[rid - 1]
        choices[name] = dict(source=kind, dx=int(dx), dy=int(dy), ring_error=round(float(err), 1), px=int(inside.sum()))

choices['F ice + puffs + cloud']['ring_repair'] = ring_info
out8 = np.clip(np.rint(out), 0, 255).astype(np.uint8)

cv2.imwrite(os.path.join(OUT, 'clean.png'), out8)
cv2.imwrite(os.path.join(OUT, 'mask.png'), mask * 255)
changed = np.abs(out8.astype(int) - I8.astype(int)).sum(-1) > 0
vis = I8.copy()
vis[changed] = (0.35 * vis[changed] + 0.65 * np.array([255, 0, 255])).astype(np.uint8)
cv2.imwrite(os.path.join(OUT, 'changed.png'), vis)
report = dict(mirror_axis_x=float(x0), pixels_changed=int(changed.sum()), percent_changed=round(float(changed.mean()) * 100, 3),
              unchanged_pixels_identical=bool((out8[~changed] == I8[~changed]).all()), dust_specks=specks, per_character=per_char,
              sources=choices)
json.dump(report, open(os.path.join(OUT, 'report.json'), 'w'), indent=1)
print(json.dumps(report, indent=1))
