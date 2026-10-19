import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import pickle, numpy as np, cv2, collections
S = OUT
dets = pickle.load(open(S + 'dets.pkl', 'rb'))
by = collections.defaultdict(list)
for d in dets:
    if d['area'] >= 150 and d['h'] >= 18: by[d['i']].append(d)
tracks, live = [], []
for i in sorted(by):
    cand = by[i]; used = set(); nxt = []
    for tr in live:
        last = tr[-1]
        if i - last['i'] > 3: tracks.append(tr); continue
        best, bd = None, 30.0 * (i - last['i'])
        for k, d in enumerate(cand):
            if k in used: continue
            dd = np.hypot(d['px'] - last['px'], d['py'] - last['py'])
            if dd < bd: best, bd = k, dd
        if best is None: nxt.append(tr) if i - last['i'] < 3 else tracks.append(tr); continue
        used.add(best); tr.append(cand[best]); nxt.append(tr)
    for k, d in enumerate(cand):
        if k not in used: nxt.append([d])
    live = nxt
tracks += live
long = [t for t in tracks if len(t) >= 45 and np.hypot(t[-1]['fx'] - t[0]['fx'], t[-1]['fy'] - t[0]['fy']) > 60]
pickle.dump(long, open(S + 'tracks.pkl', 'wb'))
print('tracks', len(tracks), 'long+moving', len(long), [len(t) for t in long][:30])
bg = cv2.imread(S + 'bg.png')
rng = np.random.default_rng(1)
for n, t in enumerate(long):
    col = tuple(int(v) for v in rng.integers(40, 255, 3))
    pts = np.int32([[d['px'], d['py']] for d in t])
    cv2.polylines(bg, [pts], False, col, 2)
    cv2.putText(bg, str(n), tuple(int(v) for v in pts[0]), 0, 0.6, col, 2)
cv2.imwrite(S + 'tracks.png', cv2.resize(bg, (960, 540)))
