"""The warm-up's moat outline refined against the READY frame (2026-11-13): moat.py's runs come from the round's mosaic, whose banks
smear (parallax), so they sit a few pixels off the frame's. For each straight run of the outline: at points along it (clear of its
ends), the grass's edge across it (G - B along the run's normal, -1.2..1.2 units at z 0) in a game shot and in the frame; the shift
that best lays the shot's profile on the frame's, its median over the points that agree (a pen, a plant or a player in the way
does not). Adds the shifts to moat_shift.json (then moat.py, arena.py, blender/build.py, package.py; shoot again; repeat).

  python art/warm_up/moat_refine.py <game shot.png>      (READY view, ?frame=hq&bare=on; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up')
from measure import pix

R2 = math.sqrt(2)
xy = lambda u, v: ((u - v) / R2, (u + v) / R2)
M = json.load(open('art/warm_up/moat.json'))
try: SHIFT = json.load(open('art/warm_up/moat_shift.json'))
except FileNotFoundError: SHIFT = {}
f = cv2.imread('art/warm_up/output/chrome_0.png').astype(float); r = cv2.imread(sys.argv[1]).astype(float)
gb = lambda im: im[..., 1] - im[..., 0]
F, G = gb(f), gb(r)
OFF = np.arange(-1.2, 1.201, 0.04)
LAG = 20                                                   # (shifts tried: up to 0.8 units either way)


def profile(im, u_run, level, along):
    vals = []
    for o in OFF:
        u, v = (along, level + o) if u_run else (level + o, along)
        x, y = pix(*xy(u, v)); x, y = int(round(x)), int(round(y))
        if not (0 <= x < 1920 and 0 <= y < 1080): return None
        if 60 <= y < 300 and x < 210: return None              # (the names)
        vals.append(im[y, x])
    return np.array(vals)


out, report = {}, []
for name in ('outer', 'inner'):
    runs = M['runs'][name]; shifts = list(SHIFT.get(name, [0.0] * len(runs)))
    if len(shifts) != len(runs): shifts = [0.0] * len(runs)
    for k, run in enumerate(runs):
        (ax, ay), (bx, by) = run['a'], run['b']
        ua, va = (ax + ay) / R2, (ay - ax) / R2; ub, vb = (bx + by) / R2, (by - bx) / R2
        lo, hi = (min(ua, ub), max(ua, ub)) if run['u'] else (min(va, vb), max(va, vb))
        if hi - lo < 1.6: continue
        found = []
        for along in np.arange(lo + 0.6, hi - 0.6, 0.4):
            pf, pg = profile(F, run['u'], run['level'], along), profile(G, run['u'], run['level'], along)
            if pf is None or pg is None or np.ptp(pf) < 25 or np.ptp(pg) < 25: continue
            best = None
            for lag in range(-LAG, LAG + 1):
                a, b = (pf[LAG:-LAG], pg[LAG + lag:len(pg) - LAG + lag])
                e = np.abs(a - b).mean()
                if best is None or e < best[0]: best = (e, lag)
            if best[0] < 12: found.append(best[1] * 0.04)
        if len(found) >= 3:
            d = float(np.median(found))
            # (the shot's edge lies `d` further along the normal than the frame's: the run moves back by it)
            shifts[k] = round(shifts[k] - d, 3)
            report.append((name, k, round(hi - lo, 1), len(found), round(-d, 2)))
    out[name] = shifts
json.dump(out, open('art/warm_up/moat_shift.json', 'w'))
for q in report: print('%s run %2d  %5.1f units  %2d points  shift %+.2f' % q)
moved = [abs(q[4]) for q in report]
print('runs measured', len(report), ' mean |shift| %.3f' % (np.mean(moved) if moved else 0))
