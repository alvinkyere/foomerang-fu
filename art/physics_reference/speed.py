import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import pickle, numpy as np
S = OUT
tracks = pickle.load(open(S + 'tracks.pkl', 'rb'))
FPS = 29.99878851512337
def bad(t):  # the fountain's water and the HUD corner
    mx = np.median([d['fx'] for d in t]); my = np.median([d['fy'] for d in t])
    return np.hypot(mx - 1104.5, my - 663.5) < 150 or (np.median([d['px'] for d in t]) < 140 and np.median([d['py'] for d in t]) < 300)
good = [t for t in tracks if not bad(t)]
speeds = []
for t in good:
    idx = {d['i']: d for d in t}
    for d in t:
        e = idx.get(d['i'] + 10)
        if e is None: continue
        speeds.append(np.hypot(e['fx'] - d['fx'], e['fy'] - d['fy']) * FPS / 10)
s = np.array(speeds)
print('tracks used', len(good), 'samples', len(s))
h, edges = np.histogram(s, bins=np.arange(0, 1500, 50))
for a, n in zip(edges, h): print(f'{int(a):5d} {"#" * int(n // 6)} {n}')

print('--- per track: 90th percentile of 1/3 s speed, and straight runs (>= 0.5 s at near-constant heading)')
tops, runs = [], []
for n, t in enumerate(good):
    idx = {d['i']: d for d in t}
    v = []
    for d in t:
        e = idx.get(d['i'] + 10)
        if e is not None: v.append(np.hypot(e['fx'] - d['fx'], e['fy'] - d['fy']) * FPS / 10)
    if len(v) > 20: tops.append(np.percentile(v, 90))
    # straight runs: over 15 frames, path length vs chord nearly equal
    for d in t[::5]:
        seq = [idx.get(d['i'] + k) for k in range(0, 16)]
        if any(s is None for s in seq): continue
        chord = np.hypot(seq[-1]['fx'] - seq[0]['fx'], seq[-1]['fy'] - seq[0]['fy'])
        path = sum(np.hypot(seq[k + 1]['fx'] - seq[k]['fx'], seq[k + 1]['fy'] - seq[k]['fy']) for k in range(15))
        if chord > 100 and chord / path > 0.93: runs.append(chord * FPS / 15)
print('track top speeds', np.round(sorted(tops)))
r = np.array(runs)
print('straight half-second runs', len(r), 'median', round(float(np.median(r))), 'p25-p75', np.percentile(r, [25, 75]).round(), 'max', round(float(r.max())))
