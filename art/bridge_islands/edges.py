"""Measures an island's edges in the HQ frame, side by side (the south-west island first): along each side of a rough outline, many short probes
across the edge; on each, where the grass ends (its pale rim counted as grass) and where the lavender flank ends in the water. A side's grass
line and water line are the best straight lines through those points (probes broken by something standing on the edge are dropped); the
corners are where neighbouring lines meet. Writes edges.json: per island, the grass outline and the water outline in frame pixels.

  python art/bridge_islands/edges.py
"""
import json
import numpy as np, cv2

import sys
f = cv2.imread(sys.argv[1] if len(sys.argv) > 1 else 'art/bridge_islands/output/reference.png').astype(int)[..., ::-1]      # (a game shot: the same probes, to compare)
R, G, B = f[..., 0], f[..., 1], f[..., 2]
GRASS = (G > 215) & (R > 150) & (B < 200)
LAV = (B - G > 36) & (B > 170) & (R < 200)
WATER = (B - G <= 36) & (B > 160) & (G > 140) & ~GRASS


def probe(p, n):
    """Along p + s n (s -60 .. 80 px): the grass end and the flank end, or None when the probe does not read grass, flank, water in that order."""
    s = np.arange(-60, 81)
    pts = (np.array(p)[None, :] + s[:, None] * np.array(n)[None, :]).round().astype(int)
    if pts[:, 0].min() < 0 or pts[:, 1].min() < 0 or pts[:, 0].max() > 1919 or pts[:, 1].max() > 1079: return None
    g = GRASS[pts[:, 1], pts[:, 0]]; l = LAV[pts[:, 1], pts[:, 0]]; w = WATER[pts[:, 1], pts[:, 0]]
    if g[:15].mean() < 0.9 or w[-15:].mean() < 0.8: return None
    ge = int(np.argmin(g)); 
    if ge == 0: return None
    lav = np.nonzero(l[ge:])[0]
    if len(lav) < 4: return None
    le = ge + int(lav[-1]) + 1
    if le >= len(s) - 10: return None
    if lav[0] > 8 or g[le:].any() or w[le:le + 30].mean() < 0.8: return None      # (the flank starts within a blend of the grass; water after it)
    return s[ge], s[le]


def probe_back(p, n):
    """A back side (it faces away from the camera: next to no flank shows): where the grass ends, the water begins within a few pixels."""
    s = np.arange(-60, 81)
    pts = (np.array(p)[None, :] + s[:, None] * np.array(n)[None, :]).round().astype(int)
    if pts[:, 0].min() < 0 or pts[:, 1].min() < 0 or pts[:, 0].max() > 1919 or pts[:, 1].max() > 1079: return None
    g = GRASS[pts[:, 1], pts[:, 0]]; w = WATER[pts[:, 1], pts[:, 0]] | LAV[pts[:, 1], pts[:, 0]]
    if g[:15].mean() < 0.9 or w[-15:].mean() < 0.8: return None
    ge = int(np.argmin(g))
    if ge == 0 or g[ge:].any(): return None
    if w[ge:ge + 8].mean() < 0.5 or w[ge + 8:].mean() < 0.85: return None
    return s[ge], s[ge]


def measure(poly, back=()):
    P = np.array(poly, float); n = len(P)
    area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))
    out = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]; d = (b - a) / np.linalg.norm(b - a)
        nrm = np.array([d[1], -d[0]]) * (1 if area > 0 else -1)          # (outward: y is down in the frame)
        gs, ws = [], []
        for t in np.linspace(0.12, 0.88, 60):
            p = a + (b - a) * t; r = (probe_back if i in back else probe)(p, nrm)
            if r is None: continue
            gs.append(p + nrm * r[0]); ws.append(p + nrm * r[1])
        out.append(dict(n=len(gs), grass=np.array(gs), water=np.array(ws), normal=nrm))
    return out


def line(pts):
    c = pts.mean(0); u, s, vt = np.linalg.svd(pts - c); return c, vt[0]


def meet(l0, l1):
    (c0, d0), (c1, d1) = l0, l1
    A = np.array([d0, -d1]).T; t = np.linalg.solve(A, c1 - c0); return c0 + d0 * t[0]


def outline(sides, key, fallback):
    ls = []
    for i, sd in enumerate(sides):
        pts = sd[key]
        if sd['n'] >= 8:
            c, d = line(pts)
            res = np.abs((pts - c) @ np.array([d[1], -d[0]]))           # (drop the probes a standing thing broke, then fit again)
            keep = res < max(3.0, np.percentile(res, 70) * 1.5)
            ls.append(line(pts[keep]) + (int(keep.sum()),))
        else:
            ls.append(None)
    corners = []
    for i in range(len(ls)):
        l0, l1 = ls[i - 1], ls[i]
        corners.append(meet(l0[:2], l1[:2]).round(1).tolist() if l0 is not None and l1 is not None else list(fallback[i]))
    return corners, [None if l is None else l[2] for l in ls]


import importlib.util, sys
spec = importlib.util.spec_from_file_location('lay', 'art/bridge_islands/layout.py')
src = open('art/bridge_islands/layout.py').read()
SW_PX = eval(src.split('SW_PX = ')[1].split('#')[0]); EAST_PX = eval(src.split('EAST_PX = ')[1].split('\n')[0])
res = {}
# the game's grass edge lands this many pixels further out than the line it was built from (probes of a game shot against the HQ, 2026-11-01: the
# flank started 6 px late on the east island's south-east side, 3 px on the south-west island's): the front sides' grass lines are pulled in by it
INSET = {'sw': 3.0, 'east': 6.0}
# the south-west island: its south-east and south-west sides face the camera and are measured; its north-west side is under the tree and the
# bamboo and its north-east side along the bridge and the blocks, so those two keep the outline's own lines (the back sides show next to no flank:
# grass and water lines the same there)
sides = measure(SW_PX, back=(0, 1))
print('sw probes per side', [sd['n'] for sd in sides])
lines = {}
for key in ('grass', 'water'):
    L_ = []
    for i, sd in enumerate(sides):
        a_, b_ = np.array(SW_PX[i], float), np.array(SW_PX[(i + 1) % 4], float)
        if i in (2, 3) and sd['n'] >= 8:
            pts = sd[key]; c, d = line(pts); r_ = np.abs((pts - c) @ np.array([d[1], -d[0]]))
            keep = r_ < max(3.0, np.percentile(r_, 70) * 1.5); c_, d_ = line(pts[keep])
            if key == 'grass': c_ = c_ - sd['normal'] * INSET['sw']      # (the game draws the grass's edge a little further out than the line: see INSET)
            L_.append((c_, d_))
            print(' ', key, 'side', i, 'kept', int(keep.sum()), 'of', sd['n'], 'rms %.1f px' % float(np.sqrt((r_[keep] ** 2).mean())))
        elif i == 1:
            # the north-east side runs under the bridge's south-west end: the grass meets the deck there (no water between, as the HQ shows):
            # the deck's D-A edge (layout.py BRIDGE_PX), 12 px in under the deck
            d0, a0 = np.array([880.0, 739.0]), np.array([650.0, 539.0]); dd = (a0 - d0) / np.linalg.norm(a0 - d0)
            L_.append((d0 - np.array([dd[1], -dd[0]]) * 12.0, dd))
        else:
            L_.append((a_, (b_ - a_) / np.linalg.norm(b_ - a_)))
    lines[key] = [meet(L_[i - 1], L_[i]).round(1).tolist() for i in range(4)]
    # the island's north corner stays where the HQ shows it (500, 452), and the north-east side bends there to run under the deck from its A
    # corner: five corners (the HQ: water beyond the north corner, grass to the deck)
    a_under = (np.array([650.0, 539.0]) - np.array([dd[1], -dd[0]]) * 12.0).round(1).tolist()
    d_under = (np.array([880.0, 739.0]) - np.array([dd[1], -dd[0]]) * 12.0).round(1).tolist()
    # the east corner: where the measured south-east side meets the outline's own north-east line (the HQ's corner, not the deck's line run on)
    a1, b1 = np.array(SW_PX[1], float), np.array(SW_PX[2], float)
    east = meet((a1, (b1 - a1) / np.linalg.norm(b1 - a1)), L_[2]).round(1).tolist()
    lines[key] = [lines[key][0], [500.0, 452.0], a_under, d_under, east, lines[key][3]]
    print('  %s corners' % key, lines[key])
res['sw'] = lines
# the east island: its north-west side (a back side), its east, south-east and south-west sides measured; its north-east side runs under the
# long wall (ne_wall.py), so it keeps the outline's own line; the east side's grass and water lines disagree a little (few probes between the
# islet and the raised block): both use their mean direction
sides = measure(EAST_PX, back=(0, 1))
print('east probes per side', [sd['n'] for sd in sides])
fits = {}
for i, sd in enumerate(sides):
    if i == 1:
        # the north-east side: the wall stands in the water beyond it (a channel lit by the beams between); the grass's top edge read column by
        # column where nothing stands on it (x 1150 and 1400-1450): a back side, grass and water lines the same
        c_ = np.array([1150.0, 141.0]); d_ = np.array([450.0, 363.0]); d_ /= np.linalg.norm(d_)
        fits[1] = {'grass': (c_, d_), 'water': (c_, d_)}; continue
    if i == 0:
        # the north-west side: a back side, its grass's top edge read column by column (x 640-840: y 212 171 141 111 83 51; the probes along the
        # first outline caught the bunting and the leaves there)
        c_ = np.array([740.0, 128.0]); d_ = np.array([200.0, -161.0]); d_ /= np.linalg.norm(d_)
        fits[0] = {'grass': (c_, d_), 'water': (c_, d_)}; continue
    if sd['n'] < 8: continue
    fits[i] = {}
    for key in ('grass', 'water'):
        pts = sd[key]; c, d = line(pts); r_ = np.abs((pts - c) @ np.array([d[1], -d[0]]))
        keep = r_ < max(3.0, np.percentile(r_, 70) * 1.5); c_, d_ = line(pts[keep])
        if key == 'grass': c_ = c_ - sd['normal'] * INSET['east']
        fits[i][key] = (c_, d_)
    dg, dw = fits[i]['grass'][1], fits[i]['water'][1]
    if dg @ dw < 0: dw = -dw
    dm = (dg + dw) / np.linalg.norm(dg + dw); fits[i] = {k: (v[0], dm) for k, v in fits[i].items()}
lines = {}
for key in ('grass', 'water'):
    L_ = []
    for i in range(5):
        a_, b_ = np.array(EAST_PX[i], float), np.array(EAST_PX[(i + 1) % 5], float)
        L_.append(fits[i][key] if i in fits else (a_, (b_ - a_) / np.linalg.norm(b_ - a_)))
    lines[key] = [meet(L_[i - 1], L_[i]).round(1).tolist() for i in range(5)]
    # the north corner, read column by column (the grass's top edge: x 960 y 78, 1050 y 80, 1100 y 118): the corner pokes out of the frame's
    # top at x ~912, the edge drops to y ~74 and runs nearly flat past the bunting's lantern before it turns to follow the wall
    lines[key] = [lines[key][0], [912.0, -5.0], [952.0, 74.0], [1060.0, 80.0], [1105.0, 114.0]] + lines[key][2:]
    print('  east %s corners' % key, lines[key])
res['east'] = lines
if len(sys.argv) == 1: json.dump(res, open('art/bridge_islands/edges.json', 'w'))
