"""Step 3 of the environ2 map: every object in the clean plate (step2_clean.png) as its own pixel-precise cut-out layer.
 * Mask: GrabCut on the clean plate inside the object's box (the box from inventory.png), steered by hand hints where needed
   ('fg'/'bg' polygons: always object / always ground). Ground shadows are ground, never part of an object.
 * Nothing is repainted: a layer's pixels ARE the clean plate's pixels, so ground + layers reproduces the plate exactly.
python layers_environ2.py <step2_clean.png> <out_dir>"""
import sys, os, json, cv2, numpy as np

SRC, OUT = sys.argv[1:3]
os.makedirs(OUT, exist_ok=True)
I = cv2.imread(SRC)
H, W = I.shape[:2]

# name: (box x0, y0, x1, y1), hints. Numbers are inventory.png's. Hints:
#   'poly': the mask IS these hand-traced polygons (objects coloured like the ground around them: cloth, white stone, poles)
#   'drop_ground': remove pixels whose colour belongs to the ground palette (shadows, floor, sand) after GrabCut
#   'fg' / 'bg': GrabCut seeds
SAND = [((18, 95, 0), (36, 255, 255))]                                          # yellow sand (cloth and stone: S < 95)
POT_GROUND = [((20, 0, 0), (60, 255, 255))]                                    # sand and olive shadow (terracotta: hue < 20)
POST = [((0, 0, 0), (40, 255, 205)), ((150, 0, 0), (180, 255, 205))]          # brown wood and its beige cut end (floor: V > 205)
FLAGS = [((0, 80, 60), (10, 255, 255)), ((160, 80, 60), (180, 255, 255)), ((0, 0, 0), (180, 255, 135))]   # red cloth, dark rope
OBJECTS = {
    '01_archway': ((440, 0, 871, 121), {'drop': SAND + [((0, 100, 0), (18, 255, 255))], 'poly': [
        [(445, 0), (858, 0), (858, 100), (720, 100), (716, 78), (585, 78), (580, 100), (445, 100)],   # the terrace, its pots and doors
        [(440, 58), (448, 58), (448, 121), (440, 121)],                                               # the archway's west leg
        [(856, 0), (871, 0), (871, 121), (856, 121)]]}),                                              # its east leg
    '02_banner_l': ((330, 0, 386, 73), {'drop': SAND, 'poly': [
        [(334, 0), (370, 0), (371, 23), (379, 24), (379, 28), (371, 29), (370, 41), (361, 40), (336, 34)],
        [(369, 3), (376, 3), (384, 72), (379, 72)]]}),
    '03_banner_r': ((880, 0, 936, 82), {'drop': SAND, 'poly': [
        [(884, 0), (926, 0), (926, 22), (929, 23), (929, 27), (916, 28), (915, 42), (912, 42), (890, 36), (884, 30)],
        [(927, 0), (932, 0), (921, 81), (915, 81)]]}),
    '04_sign': ((478, 75, 536, 140), {'drop': SAND, 'poly': [
        [(503, 76), (511, 76), (511, 87), (531, 87), (531, 125), (513, 125), (513, 139), (504, 139), (504, 125), (483, 125),
         (483, 87), (503, 87)]]}),
    '05_stall_far_l': ((95, 28, 219, 136), {}),
    '06_stall_far_r': ((1082, 28, 1206, 136), {}),
    '07_stall_l': ((325, 152, 471, 301), {}),
    '08_stall_r': ((830, 152, 981, 301), {}),
    '09_stall_sw': ((180, 340, 296, 483), {}),
    '10_stall_se': ((1012, 340, 1126, 483), {'minus': ['21_pot']}),                               # pot 21 is its own layer
    '14_crate': ((732, 88, 778, 137), {}),          # (11 = the six rugs: flat, they stay in the ground layer)
    '12_crate': ((204, 88, 251, 133), {'drop': POT_GROUND}),
    '13_crates': ((375, 40, 453, 123), {'drop': POT_GROUND}),
    '15_crate': ((852, 44, 893, 93), {}),
    '16_crates': ((150, 545, 281, 626), {'drop': POT_GROUND, 'minus': ['22_pots']}),
    '17_crate': ((796, 664, 846, 720), {'drop': POT_GROUND}),
    '18_pots_archway': ((536, 0, 766, 43), {'drop_ground': True, 'bg': [[(580, 0), (720, 0), (720, 43), (580, 43)]]}),
    '19_pot': ((462, 201, 499, 239), {'drop': POT_GROUND}),
    '20_pots': ((1012, 44, 1096, 119), {'drop': POT_GROUND}),
    '21_pot': ((1056, 461, 1094, 503), {'drop': POT_GROUND}),
    '22_pots': ((160, 604, 241, 661), {'drop': POT_GROUND}),
    '23_fountain': ((532, 313, 773, 533), {}),
    '24_bunting': ((505, 580, 801, 696), {'poly_select': [
        ([(507, 590), (516, 583), (526, 588), (527, 690), (518, 693), (508, 688)], POST),             # west post
        ([(776, 590), (786, 583), (798, 588), (799, 690), (788, 693), (776, 688)], POST),             # east post
        ([(522, 598), (590, 607), (650, 611), (720, 607), (785, 597), (785, 614), (720, 625), (650, 632), (590, 627),
          (522, 613)], FLAGS)]}),                                                                     # rope and flags
    '25_tree': ((325, 488, 451, 616), {'drop_ground': True}),
    '26_tree': ((805, 530, 966, 696), {'drop_ground': True}),
    '27_tree': ((1110, 482, 1216, 616), {'drop_ground': True}),
    '28_tree': ((745, 85, 886, 216), {'drop': [((27, 0, 225), (40, 124, 255))]}),     # sunlit floor: hue 29-30, S 110-118 (tree: 18-26, S 125+)
    '29_tree': ((1175, 590, 1280, 720), {}),
    '30_fence_w': ((24, 220, 61, 346), {'drop': [((25, 0, 0), (60, 255, 255))]}),    # (sand, olive shadow: yellow-green hues)
    '31_fence_sw': ((0, 465, 26, 576), {'drop': [((15, 0, 0), (60, 255, 255))]}),
    '32_fence_e': ((1235, 220, 1280, 346), {'drop': [((15, 0, 0), (60, 255, 255)), ((0, 0, 200), (180, 60, 255))]}),
}

# ---- the ground palette: colours of everything outside every object's box (floor, sand, paths, shadows, the walls), minus reds
# (the rugs are red like the canopies and flags), as 32 Lab clusters; a pixel is ground-coloured if it is close to one
LAB = cv2.cvtColor(I, cv2.COLOR_BGR2LAB).astype(np.float32)
outside = np.ones((H, W), np.uint8)
for (x0, y0, x1, y1), _ in OBJECTS.values():
    outside[max(0, y0 - 4):y1 + 4, max(0, x0 - 4):x1 + 4] = 0
HSV = cv2.cvtColor(I, cv2.COLOR_BGR2HSV)
reddish = ((HSV[..., 0] < 10) | (HSV[..., 0] > 165)) & (HSV[..., 1] > 90)
samples = LAB[(outside > 0) & ~reddish]
rng = np.random.default_rng(0)
samples = samples[rng.choice(len(samples), min(60000, len(samples)), replace=False)]
_, _, centres = cv2.kmeans(samples, 32, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2), 3, cv2.KMEANS_PP_CENTERS)
dist = np.min(np.linalg.norm(LAB[:, :, None, :] - centres[None, None], axis=-1), axis=-1)
GROUNDLIKE = dist < 9.0


def peel(m, ground):
    """Remove the ground-coloured pixels of a mask that are connected to its outside (shadows, floor at the edge); ground-coloured
    pixels enclosed by the object (highlights, rims) stay."""
    g = (m > 0) & ground
    n, lab = cv2.connectedComponents(g.astype(np.uint8))
    edge = (cv2.dilate((m == 0).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & g
    touching = set(np.unique(lab[edge])) - {0}
    return (m > 0) & ~np.isin(lab, list(touching))


def tidy(m, min_area=25):
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] >= min_area:
            keep[lab == k] = 1
    # fill holes (enclosed ground-coloured pixels inside an object are the object's own)
    ff = keep.copy() * 255
    pad = np.zeros((H + 2, W + 2), np.uint8)
    cv2.floodFill(ff, pad, (0, 0), 128)
    return ((ff == 255) | (ff == 0)).astype(np.uint8) if ff[0, 0] == 128 else keep


def grabcut(box, hints):
    x0, y0, x1, y1 = box
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    m[y0:y1, x0:x1] = cv2.GC_PR_FGD
    for kind, val in (('bg', cv2.GC_BGD), ('fg', cv2.GC_FGD), ('pr_bg', cv2.GC_PR_BGD)):
        for poly in hints.get(kind, []):
            cv2.fillPoly(m, [np.int32(poly)], int(val))
    pad = 30
    xa, ya, xb, yb = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    sub = m[ya:yb, xa:xb].copy()
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(I[ya:yb, xa:xb], sub, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    out = np.zeros((H, W), np.uint8)
    out[ya:yb, xa:xb] = np.isin(sub, (cv2.GC_FGD, cv2.GC_PR_FGD))
    # keep the components that matter (drop specks), fill holes
    n, lab, st, _ = cv2.connectedComponentsWithStats(out)
    keep = np.zeros_like(out)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] >= 25:
            keep[lab == k] = 1
    return keep


def polys(ps):
    m = np.zeros((H, W), np.uint8)
    for p in ps:
        cv2.fillPoly(m, [np.int32(p)], 1)
    return m


masks = {}
for name, (box, hints) in OBJECTS.items():
    if 'poly' in hints:
        m = polys(hints['poly'])
    elif 'poly_select' in hints:                 # the object's own colours (HSV ranges) inside hand-traced outlines
        m = np.zeros((H, W), np.uint8)
        for poly, ranges in hints['poly_select']:
            sel = np.zeros((H, W), bool)
            for lo, hi in ranges:
                sel |= cv2.inRange(HSV, np.array(lo, np.uint8), np.array(hi, np.uint8)) > 0
            m |= (polys([poly]) > 0) & sel
        m = tidy(m, 4)
    else:
        m = grabcut(box, hints)
        if hints.get('drop_ground'):
            m = tidy(peel(m, GROUNDLIKE))
    if 'drop' in hints:                         # an object-specific ground rule (HSV ranges that are ground here)
        g = np.zeros((H, W), bool)
        for lo, hi in hints['drop']:
            g |= cv2.inRange(HSV, np.array(lo, np.uint8), np.array(hi, np.uint8)) > 0
        m = tidy(peel(m, g), 4)
    masks[name] = m
for name, (box, hints) in OBJECTS.items():       # an object in front of another is not part of it
    for other in hints.get('minus', []):
        masks[name] = tidy((masks[name] > 0) & (masks[other] == 0))
for name, m in masks.items():
    np.save(os.path.join(OUT, f'mask_{name}.npy'), m)

# review sheet: each object with its outline (magenta) and the cut-out on a checkerboard
tiles = []
for name, m in masks.items():
    x0, y0, x1, y1 = OBJECTS[name][0]
    pad = 12
    xa, ya, xb, yb = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    crop = I[ya:yb, xa:xb].copy()
    cs, _ = cv2.findContours(m[ya:yb, xa:xb], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    ov = crop.copy()
    cv2.drawContours(ov, cs, -1, (255, 0, 255), 1)
    chk = ((np.indices(crop.shape[:2]).sum(0) // 6) % 2)[..., None] * 60 + 120
    cut = np.where(m[ya:yb, xa:xb, None] > 0, crop, chk).astype(np.uint8)
    f = max(1, min(3, 200 // max(xb - xa, yb - ya) + 1))
    t = np.hstack([cv2.resize(ov, None, fx=f, fy=f, interpolation=cv2.INTER_NEAREST), np.full(((yb - ya) * f, 4, 3), 255, np.uint8),
                   cv2.resize(cut, None, fx=f, fy=f, interpolation=cv2.INTER_NEAREST)])
    t = cv2.copyMakeBorder(t, 18, 4, 4, 4, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    cv2.putText(t, name, (4, 13), 0, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
    tiles.append(t)
for i in range(0, len(tiles), 8):
    group = tiles[i:i + 8]
    wmax = max(t.shape[1] for t in group)
    sheet = np.vstack([cv2.copyMakeBorder(t, 0, 0, 0, wmax - t.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for t in group])
    cv2.imwrite(os.path.join(OUT, f'review_{i // 8}.png'), sheet)
print('masks', len(masks))


# ---- depth: each layer's ground-contact line (canvas y as a function of x). A character whose feet are above (north of) the line
# at its x is drawn behind the layer. 'silhouette': the layer's own lowest pixel per column IS its ground contact (objects that
# stand on the ground along their whole base: fountain, stalls, crates, pots, fences, the terrace). 'contacts': the line through
# hand-checked contact points (trunk ends, post and pole feet), constant beyond the outermost ones (objects held up in the air:
# tree canopies, the bunting's rope, the banners, the sign's board).
CONTACTS = {
    '02_banner_l': [(382, 73)],
    '03_banner_r': [(918, 81)],
    '04_sign': [(508, 139)],
    '24_bunting': [(517, 693), (781, 689)],
    '25_tree': [(355, 589), (374, 596), (395, 610), (413, 613), (434, 601)],
    '26_tree': [(820, 671), (842, 679), (861, 674), (882, 687), (902, 676), (922, 665)],
    '27_tree': [(1121, 564), (1143, 602), (1165, 612), (1184, 602), (1205, 580)],
    '28_tree': [(761, 193), (780, 201), (798, 210), (817, 200), (836, 181), (852, 165), (869, 160)],
    '29_tree': [(1228, 720)],                    # its trunk is below the frame: nothing on screen stands in front of it
}
FADE = ('01_', '02_', '03_', '05_', '06_', '07_', '08_', '09_', '10_', '23_', '24_', '25_', '26_', '27_', '28_', '29_')  # tall


def profile(name, m):
    ys, xs = np.nonzero(m)
    x0, x1 = xs.min(), xs.max() + 1
    cols = np.arange(x0, x1)
    if name in CONTACTS:
        px, py = zip(*sorted(CONTACTS[name]))
        return x0, np.interp(cols, px, py)
    bottom = np.array([np.nonzero(m[:, x])[0].max() if m[:, x].any() else -1 for x in cols], np.float64)
    good = bottom >= 0
    return x0, np.interp(cols, cols[good], bottom[good])


def slices(x0, d, max_w=32, tol=4.0):
    out, start = [], 0
    for i in range(1, len(d) + 1):
        seg = d[start:i + 1] if i < len(d) else d[start:i]
        if i == len(d) or i - start >= max_w or seg.max() - seg.min() > tol:
            out.append(dict(x0=int(x0 + start), x1=int(x0 + i), depth=round(float(d[start:i].max()), 1)))
            start = i
    return out


PKG = os.path.join(OUT, 'package')
os.makedirs(PKG, exist_ok=True)
LOSSLESS = [cv2.IMWRITE_WEBP_QUALITY, 101]           # 101 = lossless: a layer's pixels are the plate's pixels, exactly
cv2.imwrite(os.path.join(PKG, 'ground.webp'), I, LOSSLESS)
occluders = []
for name, m in masks.items():
    alpha = (m > 0).astype(np.uint8) * 255
    ys, xs = np.nonzero(alpha)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([I[y0:y1, x0:x1], alpha[y0:y1, x0:x1]])
    cv2.imwrite(os.path.join(PKG, f'occ_{name}.webp'), rgba, LOSSLESS)
    px0, d = profile(name, m)
    sl = slices(px0, d)
    occluders.append(dict(key=name, file=f'occ_{name}.webp', x=int(x0), y=int(y0), depth=round(float(d.max()), 1),
                          fade=name.startswith(FADE), slices=sl))

# proof: the ground with every layer composited over it, in depth order, is the clean plate, pixel for pixel
comp = cv2.imread(os.path.join(PKG, 'ground.webp')).astype(np.float32)
for o in sorted(occluders, key=lambda o: o['depth']):
    im = cv2.imread(os.path.join(PKG, o['file']), cv2.IMREAD_UNCHANGED).astype(np.float32)
    a = im[..., 3:] / 255
    h, w = im.shape[:2]
    comp[o['y']:o['y'] + h, o['x']:o['x'] + w] = im[..., :3] * a + comp[o['y']:o['y'] + h, o['x']:o['x'] + w] * (1 - a)
diff = np.abs(np.rint(comp) - I.astype(np.float32)).max()
json.dump(dict(canvas=[W, H], ground='ground.webp', occluders=sorted(occluders, key=lambda o: o['depth']),
               flat_items={'11_rugs': 'six rugs, flat on the ground: part of the ground layer (no occlusion, no collision)'},
               composite_max_abs_diff=float(diff)),
          open(os.path.join(PKG, 'layers.json'), 'w'), indent=1)
print('layers', len(occluders), 'slices', sum(len(o['slices']) for o in occluders), 'composite max |diff| vs plate:', diff,
      'size MB', round(sum(os.path.getsize(os.path.join(PKG, f)) for f in os.listdir(PKG)) / 1e6, 2))
