"""Hex trees, outline-exact: each canopy is a plate whose top is its painted outline at the canopy height (measured from its legs)
and whose underside is the same outline traced 0.25 BU further along the camera rays (so the plate's outline from the camera is
the painted outline); each leg is a cylinder fitted to its painted leg (foot, top and width read row by row).
python fit_trees2.py <masks_dir> <out.json>"""
import sys, json, math
import cv2, numpy as np
import fit_stall as fs
import outlines as ol

MASKS, OUT = sys.argv[1:3]
prev = json.load(open('trees_fit.json'))
out = {}
for key, t in prev.items():
    m = np.load(f'{MASKS}/mask_{key}.npy') > 0
    hc = t['canopy_height']
    opened = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0
    # the legs: thin blobs hanging BELOW the opened canopy; everything else (corners included) is canopy
    thin = m & ~cv2.dilate(opened.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(thin.astype(np.uint8))
    legs_m = np.zeros_like(m)
    for k in range(1, n_):
        x, y, w, h, a = st_[k]
        if h >= 2.5 * w and h >= 8:                    # tall and thin: a leg
            legs_m |= lab_ == k
    canopy = m & ~legs_m
    plates = []
    for P in ol.outline(canopy):
        top = [[float(a), float(b), hc] for a, b in ol.lift_h(P, hc)]
        front, back = ol.ray_slab(P, top, 0.3)
        plates.append(dict(top=front, bottom=back))
    # legs: each painted leg as a thin solid standing in the vertical plane through it, facing the camera
    n, lab, st, _ = cv2.connectedComponentsWithStats(legs_m.astype(np.uint8))
    legs = []
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] < 6:
            continue
        leg = lab == k
        ys, xs = np.nonzero(leg)
        foot = fs.unproj(xs[ys == ys.max()].mean(), ys.max() + 0.5, 0)
        a, b = foot[:2] - [1, 0], foot[:2] + [1, 0]       # an east-west plane through the foot (the camera looks due north)
        for P in ol.outline(leg, min_area=4):
            front, back = ol.ray_slab(P, ol.lift_v(P, a, b), 0.15)
            legs.append(dict(front=front, back=back))
    canopy_cov = ol.coverage(ol.outline(canopy), canopy)
    out[key] = dict(canopy_height=hc, plates=plates, legs=legs)
    print(key, 'plates', len(plates), 'legs', len(legs), 'outline coverage', round(canopy_cov, 4))
json.dump(out, open(OUT, 'w'))
