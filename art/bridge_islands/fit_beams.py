"""The HQ's light beams (1:12, top right): sharp slanting bands of cyan light ADDED over everything there (water, the wall, the islets), not a haze on
the water only. Measures their direction, their profile across (fine bins: their edges are crisp) and their fade down the screen, from the water's
green excess over the plain water low in the frame. Writes beams.json for package.py (manifest `beams`, drawn by render/three/beams.ts).

  python art/bridge_islands/fit_beams.py
"""
import json, math
import numpy as np, cv2

h = cv2.imread('art/bridge_islands/output/reference.png').astype(np.float32)
x = cv2.cvtColor(h.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(int)
# each pixel's material (its colour without the light) is the one of these it is nearest to once the light's own colour (B:G:R 0.75:1:0.08,
# measured on the water) is taken out; the light there is how far along that colour the pixel lies from it
MAT = np.array([[186.0, 166.0, 120.0], [234.0, 181.0, 167.0], [194.0, 139.0, 126.0], [205.0, 180.0, 124.0]])     # (BGR: water, wall top, wall front, the islet stone in shade)
LIGHT = np.array([0.75, 1.0, 0.08]); LIGHT = LIGHT / np.linalg.norm(LIGHT)
# the beams fall beyond the long wall: its front foot, read off the frame (the grass's top edge where nothing stands on it, x 950-1250 and
# 1400-1450, and the foot of the wall's front face at x 1350); the grass in front of it is unlit (its colour is the grass's own)
ABOVE = [(1000, 70), (1100, 110), (1250, 240), (1420, 345), (1480, 380), (1560, 520), (1920, 620)]
roi = np.zeros(h.shape[:2], bool); roi[:420, 1000:] = True
_yy, _xx = np.mgrid[0:1080, 0:1920]; roi &= _yy <= np.interp(_xx, [p[0] for p in ABOVE], [p[1] for p in ABOVE])
ys, xs = np.nonzero(roi)
P = h[ys, xs]
best_m = None
for m in MAT:
    d = P - m; s_ = d @ LIGHT; res = np.linalg.norm(d - s_[:, None] * LIGHT[None, :], axis=1)
    best_m = (res, s_) if best_m is None else (np.where(res < best_m[0], res, best_m[0]), np.where(res < best_m[0], s_, best_m[1]))
ok = (best_m[0] < 14) & (best_m[1] > -10)
ys, xs = ys[ok], xs[ok]; G = np.clip(best_m[1][ok], 0, None) / np.linalg.norm([0.75, 1.0, 0.08])      # (the light, as its green)
ex = np.stack([0.75 * G, G, 0.08 * G], 1)
print('pixels used', ok.sum(), 'of', ok.size)


def coord(ang, X, Y):
    a = math.radians(ang)
    return (X - 960) * math.sin(a) + (Y - 540) * -math.cos(a)


best = None
for ang in np.arange(105, 135, 0.5):
    t = coord(ang, xs, ys); sel = ys < 300
    bins = np.arange(t.min(), t.max() + 6, 6)
    idx = np.digitize(t[sel], bins)
    prof = np.zeros(len(bins) + 1); np.add.at(prof, idx, G[sel]); n = np.bincount(idx, minlength=len(bins) + 1)
    m = prof / np.maximum(n, 1)
    explained = float((m[idx] ** 2).sum())
    if best is None or explained > best[0]: best = (explained, ang)
ang = float(best[1]); print('beam angle', ang)
t = coord(ang, xs, ys)
# fade: the excess within the brightest bands, row by row
bins = np.arange(-2000, 2000, 6.0)
idx = np.digitize(t, bins)
rows = np.arange(0, 700, 25)
top = ys < 120
prof = np.zeros(len(bins) + 1); np.add.at(prof, idx[top], G[top]); n = np.bincount(idx[top], minlength=len(bins) + 1)
p0 = np.where(n > 20, prof / np.maximum(n, 1), 0.0)
strong = p0 > 0.5 * p0.max()
fade = []
for r in rows:
    s = (ys >= r) & (ys < r + 25) & strong[idx]
    fade.append(float(np.median(G[s])) / max(p0[strong].mean(), 1) if s.sum() > 30 else None)
print('fade by row', [(int(r), None if f is None else round(f, 2)) for r, f in zip(rows, fade)])
# the profile, with the fade taken out (smoothstep from f0 to f1, fitted)
bestf = None
for f0 in np.arange(0.0, 0.4, 0.02):
    for f1 in np.arange(0.2, 0.9, 0.02):
        if f1 <= f0 + 0.05: continue
        u = np.clip((ys / 1080 - f0) / (f1 - f0), 0, 1); down = 1 - u * u * (3 - 2 * u)
        num = np.zeros(len(bins) + 1); den = np.zeros(len(bins) + 1)
        np.add.at(num, idx, G * down); np.add.at(den, idx, down * down)
        s = num / np.maximum(den, 1e-3)
        err = float(((G - s[idx] * down) ** 2).sum())
        if bestf is None or err < bestf[0]: bestf = (err, f0, f1, s, den)
_, f0, f1, s, den = bestf
s = np.where(den > 5, np.clip(s, 0, None), 0.0)
ratio = (0.75, 0.08)     # (B/G and R/G of the light)
print('fade', round(f0, 2), round(f1, 2), 'B/G R/G', np.round(ratio, 2), 'rms before', round(float(np.sqrt((G ** 2).mean())), 1),
      'after', round(math.sqrt(bestf[0] / len(G)), 1))
stops = [[round(float((bins[i - 1] + bins[i]) / 2), 1), round(float(s[i]), 1)] for i in range(1, len(bins)) if den[i] > 5 or (i > 1 and den[i - 1] > 5)]
# keep only where there is light (and a zero either side)
keep = [k for k, (_, v) in enumerate(stops) if v > 2.0]
stops = stops[max(keep[0] - 1, 0):keep[-1] + 2] if keep else []
json.dump(dict(above=ABOVE, angle=ang, fade=[round(f0, 2), round(f1, 2)], add=[round(ratio[1], 3), 1.0, round(ratio[0], 3)], stops=stops), open('art/bridge_islands/beams.json', 'w'))
print(len(stops), 'stops', stops[:5], '...')
