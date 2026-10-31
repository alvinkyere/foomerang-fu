"""Fits the light shafts to the HQ frame (2026-10-31): water.shafts in package.py (angle, stops, fade) from the HQ's own water.

  python art/bridge_islands/fit_shafts.py       (from the repository root; prints a `stops` list for package.py and the water error before/after)

The shader mixes the water colour towards a tint by strength(t) * down(y), t the position across the screen along the bands' normal. This
solves, bin by bin along t, for the strength that best explains the HQ's water (green channel: it moves most), for each trial of the
vertical fade, and keeps the best.
"""
import json, math
import numpy as np, cv2

h = cv2.imread('art/bridge_islands/output/reference.png').astype(np.float32)
x = cv2.cvtColor(h.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(int)
water = (x[..., 0] >= 84) & (x[..., 0] <= 108) & (x[..., 1] > 40) & (x[..., 2] > 140)
water[:, :215] = False
water = cv2.erode(water.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
ys, xs = np.nonzero(water)
G = h[ys, xs, 1]; Y = ys / 1080.0
base = np.median(h[1000:, :][water[1000:, :]], 0)[1]          # plain water's green, low in the frame (no shafts there)
TINT_G = 255.0
ang = math.radians(136.5)
t = ((xs - 960) * math.sin(ang) + (ys - 540) * -math.cos(ang)) / (1920 * abs(math.sin(ang)) + 1080 * abs(math.cos(ang))) + 0.5
best = None
for f0 in (0.1, 0.2, 0.28, 0.35, 0.45):
    for f1 in (0.5, 0.6, 0.72, 0.85, 1.0):
        if f1 <= f0 + 0.1: continue
        down = 1.0 - np.clip((Y - f0) / (f1 - f0), 0, 1) ** 2 * (3 - 2 * np.clip((Y - f0) / (f1 - f0), 0, 1))
        bins = np.linspace(0.0, 1.0, 41)
        idx = np.digitize(t, bins) - 1
        s = np.zeros(40)
        for k in range(40):
            m = (idx == k) & (down > 0.05)
            if m.sum() < 300: continue
            r = (G[m] - base) / (TINT_G - base)
            s[k] = max(0.0, float((down[m] * r).sum() / (down[m] ** 2).sum()))
        pred = base + (TINT_G - base) * np.clip(s[np.clip(idx, 0, 39)], 0, 1) * down
        err = float(np.mean(np.abs(pred - G)))
        if best is None or err < best[0]: best = (err, f0, f1, s.copy())
err, f0, f1, s = best
flat = float(np.mean(np.abs(base - G)))
print('water green error: %.2f levels without shafts, %.2f with the fit (fade %.2f-%.2f)' % (flat, err, f0, f1))
ss = cv2.GaussianBlur(s.reshape(-1, 1).astype(np.float32), (1, 5), 1.0).ravel()
stops = [[round(float((i + 0.5) / 40), 3), round(float(min(v, 1.0)), 3)] for i, v in enumerate(ss)]
# keep only the span with light in it, padded with zeros
live = [i for i, v in enumerate(ss) if v > 0.03]
lo, hi = max(live[0] - 1, 0), min(live[-1] + 1, 39)
stops = [[round(i / 40, 3), 0.0] if i in (lo, hi) else [round((i + 0.5) / 40, 3), round(float(min(ss[i], 1.0)), 3)] for i in range(lo, hi + 1)]
print('fade', [round(f0, 2), round(f1, 2)])
print('stops', stops)
json.dump(dict(fade=[round(f0, 2), round(f1, 2)], stops=stops), open('art/bridge_islands/shafts.json', 'w'))
