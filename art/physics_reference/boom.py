"""Small fast blobs: boomerangs. Link with large jumps, keep tracks that move fast and fairly straight."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import pickle, numpy as np, collections
S = OUT
dets = pickle.load(open(S + 'dets.pkl', 'rb'))
FPS = 29.99878851512337
by = collections.defaultdict(list)
for d in dets:
    if 10 <= d['area'] <= 260 and d['h'] <= 30: by[d['i']].append(d)
tracks, live = [], []
for i in sorted(by):
    cand = by[i]; used = set(); nxt = []
    for tr in live:
        last = tr[-1]; gap = i - last['i']
        if gap > 2: tracks.append(tr); continue
        # predict from the last step; boomerangs move 10-40 px per frame
        if len(tr) >= 2:
            p = tr[-2]; vx = (last['px'] - p['px']) / (last['i'] - p['i']); vy = (last['py'] - p['py']) / (last['i'] - p['i'])
        else: vx = vy = 0
        ex, ey = last['px'] + vx * gap, last['py'] + vy * gap
        best, bd = None, (14 if len(tr) >= 2 else 45) * gap
        for k, d in enumerate(cand):
            if k in used: continue
            dd = np.hypot(d['px'] - ex, d['py'] - ey)
            if dd < bd: best, bd = k, dd
        if best is None: nxt.append(tr); continue
        used.add(best); tr.append(cand[best]); nxt.append(tr)
    for k, d in enumerate(cand):
        if k not in used: nxt.append([d])
    live = nxt
tracks += live
res = []
for t in tracks:
    if len(t) < 6: continue
    v = [np.hypot(t[k + 1]['cx'] - t[k]['cx'], t[k + 1]['cy'] - t[k]['cy']) * FPS / (t[k + 1]['i'] - t[k]['i']) for k in range(len(t) - 1)]
    chord = np.hypot(t[-1]['cx'] - t[0]['cx'], t[-1]['cy'] - t[0]['cy'])
    if np.median(v) > 500 and chord > 150: res.append((t, float(np.median(v)), chord))
pickle.dump([r[0] for r in res], open(S + 'booms.pkl', 'wb'))
print('fast tracks', len(res))
for t, v, ch in sorted(res, key=lambda r: r[0][0]['i']):
    print(f"frame {t[0]['i']:4d}-{t[-1]['i']:4d}  n={len(t):3d}  median speed {v:6.0f}  chord {ch:5.0f}  from px ({t[0]['px']:.0f},{t[0]['py']:.0f}) to ({t[-1]['px']:.0f},{t[-1]['py']:.0f})")
