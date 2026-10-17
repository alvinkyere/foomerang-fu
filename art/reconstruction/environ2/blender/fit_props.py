"""Fit environ2's crates (boxes) and pots (turned profiles) to their outlines in the image: every separate blob of a crate or pot
layer (step 3 masks) is one object; its 3D shape and placement maximise silhouette IoU through environ2's camera.
python fit_props.py <masks_dir> <out.json>"""
import sys, json, math, os
import cv2, numpy as np
import fit_stall as fs

MASKS, OUT = sys.argv[1:3]
CRATES = ['12_crate', '13_crates', '14_crate', '15_crate', '16_crates', '17_crate']
POTS = ['18_pots_archway', '19_pot', '20_pots', '21_pot', '22_pots']


def blobs(key):
    m = np.load(f'{MASKS}/mask_{key}.npy').astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    return [lab == k for k in range(1, n) if st[k, cv2.CC_STAT_AREA] >= 60]


def crate_sil(p):
    m = np.zeros((fs.H, fs.W), np.uint8)
    cv2.fillConvexPoly(m, cv2.convexHull(np.round(fs.box(p['cx'], p['cy'], p['yaw'], p['s'], p['s'], p['z0'], p['z0'] + p['h']))
                                         .astype(np.int32)), 1)
    return m > 0


def pot_sil(p):
    m = np.zeros((fs.H, fs.W), np.uint8)
    zs = np.linspace(0, p['h'], 9)
    prof = np.interp(zs, np.linspace(0, p['h'], len(p['r'])), p['r'])
    pts = []
    for z, r in zip(zs, prof):
        a = np.linspace(0, 2 * math.pi, 24, endpoint=False)
        pts.append(fs.proj(np.c_[p['cx'] + r * np.cos(a), p['cy'] + r * np.sin(a), np.full(24, z)]))
    for a_, b_ in zip(pts, pts[1:]):
        cv2.fillConvexPoly(m, cv2.convexHull(np.round(np.vstack([a_, b_])).astype(np.int32)), 1)
    return m > 0


def iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def descend(p, steps, sil, target, valid, rounds=10):
    best = iou(sil(p), target)
    for _ in range(rounds):
        for k in steps:
            idx = range(len(p[k])) if isinstance(p[k], list) else [None]
            for i in idx:
                for sgn in (1, -1):
                    while True:
                        q = json.loads(json.dumps(p))
                        if i is None:
                            q[k] += sgn * steps[k]
                        else:
                            q[k][i] += sgn * steps[k]
                        if not valid(q):
                            break
                        v = iou(sil(q), target)
                        if v <= best:
                            break
                        best, p = v, q
        steps = {k: v * 0.6 for k, v in steps.items()}
    return p, best


# blobs that hold several touching objects: how many, each seeded where its outline is seen (image px of its base centre)
MULTI = {('13_crates', 0): [(392, 102), (421, 116), (444, 104), (411, 72)],   # three on the ground, one stacked on top
         ('20_pots', 0): [(1028, 82), (1061, 96)]}
POT_EXCLUDE = {'18_pots_archway'}                 # they stand on the raised terrace: built with the archway


def union(sil, ps):
    m = np.zeros((fs.H, fs.W), bool)
    for p in ps:
        m |= sil(p)
    return m


def descend_many(ps, steps, sil, target, valid, rounds=8):
    best = iou(union(sil, ps), target)
    for _ in range(rounds):
        for j in range(len(ps)):
            for k in steps:
                idx = range(len(ps[j][k])) if isinstance(ps[j][k], list) else [None]
                for i in idx:
                    for sgn in (1, -1):
                        while True:
                            q = json.loads(json.dumps(ps[j]))
                            if i is None:
                                q[k] += sgn * steps[k]
                            else:
                                q[k][i] += sgn * steps[k]
                            if not valid(q):
                                break
                            trial = ps[:j] + [q] + ps[j + 1:]
                            v = iou(union(sil, trial), target)
                            if v <= best:
                                break
                            best, ps = v, trial
        steps = {k: v * 0.6 for k, v in steps.items()}
    return ps, best


out = {'crates': [], 'pots': []}
for key in CRATES:
    for i, t in enumerate(blobs(key)):
        ys, xs = np.nonzero(t)
        if (key, i) in MULTI:
            seeds = MULTI[(key, i)]
            # every crate is one size (the single crates measure s 1.53-1.71, h 1.60-1.77): only placement and turn are fitted
            ps = [dict(cx=float(fs.unproj(x, y, 0)[0]), cy=float(fs.unproj(x, y, 0)[1]), yaw=0.0, s=1.64, h=1.68,
                       z0=1.68 if j == 3 else 0.0) for j, (x, y) in enumerate(seeds)]
            ps, v = descend_many(ps, dict(cx=0.2, cy=0.2, yaw=0.1), crate_sil, t, lambda q: True)
            for j, p in enumerate(ps):
                out['crates'].append(dict(name=f'{key}_{i}{"abcd"[j]}', iou=round(float(v), 4), **{k: round(float(x), 4) for k, x in p.items()}))
            print('crates', key, i, round(v, 3), len(ps))
            continue
        foot = fs.unproj(xs.mean(), ys.max() - (ys.max() - ys.min()) * 0.25, 0)
        best = None
        for yaw in np.radians(np.arange(0, 90, 7.5)):            # a crate is square: its turn repeats every 90 degrees
            p = dict(cx=foot[0], cy=foot[1], yaw=float(yaw), s=2.0, h=2.0, z0=0.0)
            p, v = descend(p, dict(cx=0.3, cy=0.3, s=0.3, h=0.3), crate_sil, t, lambda q: q['s'] > 0.3 and q['h'] > 0.3, rounds=4)
            if best is None or v > best[1]:
                best = (p, v)
        p, v = descend(best[0], dict(cx=0.1, cy=0.1, yaw=0.05, s=0.1, h=0.1, z0=0.2), crate_sil, t,
                       lambda q: q['s'] > 0.3 and q['h'] > 0.3 and q['z0'] >= 0, rounds=8)
        out['crates'].append(dict(name=f'{key}_{i}', iou=round(float(v), 4), **{k: round(float(x), 4) for k, x in p.items()}))
        print('crate', key, i, round(v, 3), {k: round(float(x), 2) for k, x in p.items()})
for key in POTS:
    if key in POT_EXCLUDE:
        continue
    for i, t in enumerate(blobs(key)):
        ys, xs = np.nonzero(t)
        if (key, i) in MULTI:
            ps = [dict(cx=float(fs.unproj(x, y, 0)[0]), cy=float(fs.unproj(x, y, 0)[1]), h=1.5, r=[0.45, 0.7, 0.75, 0.6, 0.45, 0.55])
                  for x, y in MULTI[(key, i)]]
            ps, v = descend_many(ps, dict(cx=0.15, cy=0.15, h=0.15, r=0.08), pot_sil, t, lambda q: q['h'] > 0.3 and min(q['r']) > 0.05)
            for j, p in enumerate(ps):
                out['pots'].append(dict(name=f'{key}_{i}{"ab"[j]}', iou=round(float(v), 4), cx=round(p['cx'], 4), cy=round(p['cy'], 4),
                                        h=round(p['h'], 4), r=[round(x, 4) for x in p['r']]))
            print('pots', key, i, round(v, 3))
            continue
        foot = fs.unproj(xs.mean(), ys.max() - 3, 0)
        p = dict(cx=float(foot[0]), cy=float(foot[1]), h=1.6, r=[0.45, 0.75, 0.8, 0.6, 0.45, 0.55])
        p, v = descend(p, dict(cx=0.2, cy=0.2, h=0.2, r=0.1), pot_sil, t,
                       lambda q: q['h'] > 0.3 and min(q['r']) > 0.05, rounds=8)
        out['pots'].append(dict(name=f'{key}_{i}', iou=round(float(v), 4), cx=round(p['cx'], 4), cy=round(p['cy'], 4),
                                h=round(p['h'], 4), r=[round(x, 4) for x in p['r']]))
        print('pot', key, i, round(v, 3), round(p['h'], 2), [round(x, 2) for x in p['r']])
json.dump(out, open(OUT, 'w'), indent=1)
