"""Measure environ2's hex trees: each canopy is a flat cluster of hexagonal tiles on thin legs. The canopy height comes from the
legs (a leg is vertical: its foot on the ground and its top under the canopy, seen in the same image column); the canopy's plan
outline is its cut-out unprojected at that height. python fit_trees.py <masks_dir> <out.json>"""
import sys, json, math
import cv2, numpy as np
import fit_stall as fs

MASKS, OUT = sys.argv[1:3]
HEX_R = 0.80           # tile circumradius (BU): environ2's tiles are ~30 px across at the trees
LEGS = {   # leg feet (image px), as in the step 3 depth contacts
    '25_tree': [(355, 589), (374, 596), (395, 610), (413, 613), (434, 601)],
    '26_tree': [(820, 671), (842, 679), (861, 674), (882, 687), (902, 676), (922, 665)],
    '27_tree': [(1121, 564), (1143, 602), (1165, 612), (1184, 602), (1205, 580)],
    '28_tree': [(761, 193), (780, 201), (798, 210), (817, 200), (836, 181), (852, 165), (869, 160)],
}


def height_of(foot, top):
    """The height at which a vertical line standing at the foot's ground point projects to image row top[1]."""
    g = fs.unproj(foot[0], foot[1], 0)
    zs = np.linspace(0, 15, 3001)
    rows = fs.proj(np.c_[np.full_like(zs, g[0]), np.full_like(zs, g[1]), zs])[:, 1]
    return float(zs[np.argmin(np.abs(rows - top))]), g


out = {}
for key, feet in LEGS.items():
    m = np.load(f'{MASKS}/mask_{key}.npy') > 0
    hs, legs = [], []
    for fx, fy in feet:
        y = fy
        while y > 0:                                           # walk up the leg while the mask is a thin run at this column
            row = m[y, max(0, fx - 8):fx + 9]
            if not row.any():
                y -= 1
                continue
            run = int(row.sum())
            if run > 6:
                break
            y -= 1
        h, g = height_of((fx, fy), y)
        hs.append(h)
        legs.append([round(float(g[0]), 3), round(float(g[1]), 3)])
    hc = float(np.median(hs))
    # the canopy: mask rows above the leg tops; unprojected at the canopy height
    canopy = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)) > 0     # without the thin legs
    ys, xs = np.nonzero(canopy)
    pts = np.array([fs.unproj(x, y, hc)[:2] for x, y in zip(xs[::3], ys[::3])])
    hull = cv2.convexHull(pts.astype(np.float32))[:, 0]
    hc = max(hs)                       # legs under the canopy are partly hidden: the tallest visible leg is the true height
    pts = np.array([fs.unproj(x, y, hc)[:2] for x, y in zip(xs[::3], ys[::3])])
    # tile the canopy's plan outline with hexagons (pointy-top, circumradius HEX_R): a tile is kept where its centre is inside
    lo = pts.min(0) - 2
    k = 20.0
    size = ((pts.max(0) - lo + 2) * k).astype(int) + 1
    plan = np.zeros((size[1], size[0]), np.uint8)
    for p in pts:
        cv2.circle(plan, tuple(((p - lo) * k).astype(int)), 6, 1, -1)
    plan = cv2.morphologyEx(plan, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    plan = cv2.erode(plan, np.ones((int(HEX_R * k * 0.7), int(HEX_R * k * 0.7)), np.uint8))   # the tiles fill the outline, not past it
    dx, dy = HEX_R * math.sqrt(3), HEX_R * 1.5
    tiles = []
    for r in range(int(size[1] / k / dy) + 2):
        for c in range(int(size[0] / k / dx) + 2):
            x, y = lo[0] + c * dx + (dx / 2 if r % 2 else 0), lo[1] + r * dy
            u, v = int((x - lo[0]) * k), int((y - lo[1]) * k)
            if 0 <= v < plan.shape[0] and 0 <= u < plan.shape[1] and plan[v, u]:
                tiles.append([round(float(x), 3), round(float(y), 3)])
    out[key] = dict(canopy_height=round(hc, 3), leg_heights=[round(h, 2) for h in hs], legs=legs, hex_radius=HEX_R, tiles=tiles)
    print(key, 'canopy height', round(hc, 2), 'from legs', [round(h, 2) for h in hs], 'tiles', len(tiles))
json.dump(out, open(OUT, 'w'))
