"""The gong court's platform outlines refined (2026-11-14): each hand-read top outline (stones_manual.json, mosaic px) nudged corner by
corner, a pixel step at a time, keeping a move when it brings the court closer to the HQ's still view: the mean of two overlaps, (1) all
the stone's silhouettes together (every prism as it now stands, stones.json) against the stone and the mints it rims, and (2) all the
tops (each outline at its height) against the HQ's lighter top tone and its mints. Heights are held. Writes the outlines back into
stones_manual.json (then re-run fit_stones.py: run.sh does).

  python art/gong_court/refine_outlines.py [passes] [step] [--heights] [--walls] [--only a,b]      (after fit_stones.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import plan, pix, MOSAIC_ORIGIN
import geom

OX, OY = MOSAIC_ORIGIN
from painter import Painter
PASSES = int(sys.argv[1]) if len(sys.argv) > 1 else 2
STEP = int(sys.argv[2]) if len(sys.argv) > 2 else 2
S = json.load(open('art/gong_court/stones.json')); MAN = json.load(open('art/gong_court/stones_manual.json'))
PT = Painter(0.5)


def plan_of(px_pts, h): return [tuple(p) for p in plan([(x + OX, y + OY) for x, y in px_pts], z=h)]


bodies = {n: (geom.ccw(geom.beam_corners(b)) if b['kind'] == 'wall' else geom.ccw([tuple(p) for p in b['top']]), b['h'], b.get('mint'))
          for n, b in S.items()}
# every body but the walls (their beams are fitted on their own): a traced one is seeded with its traced outline
for n, b in S.items():
    if b['kind'] == 'wall' or n in MAN or not b.get('top_px'): continue
    MAN[n] = {'kind': b['kind'], 'top': b['top_px']}
movable = [n for n in MAN if not n.startswith('_') and MAN[n].get('top') and S.get(n, {}).get('kind') not in (None, 'wall')]
DO_H = '--heights' in sys.argv
if '--only' in sys.argv: movable = [n for n in movable if n in sys.argv[sys.argv.index('--only') + 1].split(',')]   # (some bodies only)
sys.path.insert(0, 'art/gong_court'); from fit_stones_inset import inset
best = PT.score(bodies)[0]; print('start %.3f' % best)
for p_ in range(PASSES):
    for n in movable:
        pts = [list(v) for v in MAN[n]['top']]; h = S[n]['h']
        for i in range(len(pts)):
            for dx, dy in ((STEP, 0), (-STEP, 0), (0, STEP), (0, -STEP)):
                while True:
                    trial = [list(v) for v in pts]; trial[i] = [trial[i][0] + dx, trial[i][1] + dy]
                    poly = geom.ccw(plan_of(trial, h)); grown = inset(poly, -0.08)
                    cand = dict(bodies); cand[n] = (geom.ccw([tuple(p) for p in grown]), h, inset(grown, 0.55) if S[n]['kind'] == 'platform' else None)
                    sc_ = PT.score(cand)[0]
                    if sc_ < best - 1e-4: best, pts, bodies = sc_, trial, cand
                    else: break
        MAN[n]['top'] = pts
        if DO_H:                     # its height too, 0.05 at a time (the outline's pixels held: they are the top's, so they move with it)
            for dh in (0.05, -0.05):
                while True:
                    h2 = round(h + dh, 3)
                    if h2 < 0.2: break
                    poly = geom.ccw(plan_of(pts, h2)); grown = inset(poly, -0.08)
                    cand = dict(bodies); cand[n] = (geom.ccw([tuple(p) for p in grown]), h2, inset(grown, 0.55) if S[n]['kind'] == 'platform' else None)
                    sc_ = PT.score(cand)[0]
                    if sc_ < best - 1e-4: best, h, bodies = sc_, h2, cand
                    else: break
            MAN[n]['h'] = h; S[n]['h'] = h
    print('pass', p_, '%.3f' % best)
# the walls: each end moved 0.05 units at a time (along and across), its width and height 0.04 / 0.05 at a time
if '--walls' in sys.argv:
    W = MAN.setdefault('_walls', {})
    for p_ in range(2):
        for n, b in S.items():
            if b['kind'] != 'wall': continue
            st = W.get(n, {'ends': b['ends'], 'width': b['width'], 'h': b['h']})
            def body(v): return (geom.ccw(geom.beam_corners(dict(ends=v['ends'], width=v['width']))), v['h'], None)
            moves = [('e', 0, 0, 0.05), ('e', 0, 0, -0.05), ('e', 0, 1, 0.05), ('e', 0, 1, -0.05), ('e', 1, 0, 0.05), ('e', 1, 0, -0.05),
                     ('e', 1, 1, 0.05), ('e', 1, 1, -0.05), ('w', 0, 0, 0.04), ('w', 0, 0, -0.04), ('h', 0, 0, 0.05), ('h', 0, 0, -0.05)]
            for kind_, i, j, dv in moves:
                while True:
                    t = json.loads(json.dumps(st))
                    if kind_ == 'e': t['ends'][i][j] += dv
                    elif kind_ == 'w': t['width'] = max(0.3, t['width'] + dv)
                    else: t['h'] = max(0.3, t['h'] + dv)
                    cand = dict(bodies); cand[n] = body(t); sc_ = PT.score(cand)[0]
                    if sc_ < best - 1e-4: best, st, bodies = sc_, t, cand
                    else: break
            W[n] = st
        print('walls pass', p_, '%.3f' % best)
json.dump(MAN, open('art/gong_court/stones_manual.json', 'w'), indent=1)
