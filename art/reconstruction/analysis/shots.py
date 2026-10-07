"""Segment the master video into continuous shots (hard cuts) from frame differences. Usage: python shots.py <frames_dir> <out.json>"""
import sys, json, cv2, numpy as np
d = sys.argv[1]; prev = None; diffs = []
for i in range(1488):
    g = cv2.cvtColor(cv2.imread(f'{d}/f{i:04d}.png'), cv2.COLOR_BGR2GRAY).astype(np.float32)
    g = cv2.resize(g, (160, 90), interpolation=cv2.INTER_AREA)
    if prev is not None: diffs.append(float(np.abs(g - prev).mean()))
    prev = g
diffs = np.array([0] + diffs)
med = np.median(diffs)
cuts = [i for i in range(1, len(diffs)) if diffs[i] > max(12, 6 * med) and diffs[i] > 1.8 * max(diffs[i - 1], 0.5) and diffs[i] > 1.8 * (diffs[i + 1] if i + 1 < len(diffs) else 0)]
shots = []; s = 0
for c in cuts + [len(diffs)]:
    shots.append((s, c - 1)); s = c
json.dump(dict(median_diff=float(med), cuts=cuts, shots=shots, diffs=[round(float(x), 2) for x in diffs]), open(sys.argv[2], 'w'))
for a, b in shots: print(f'shot f{a:04d}-f{b:04d}  {a/30:.2f}s-{(b+1)/30:.2f}s  ({b-a+1} frames)')
