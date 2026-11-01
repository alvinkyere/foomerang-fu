"""Refines the light beams (beams.json) in the game's own view, as fit_trees.py does the canopies: the shot's own beams are taken out (it was shot with
the beams.json it is given), then for each trial direction the profile across the bands is the median light that makes the game's pixels the HQ's
(band by band, with the fade), and the direction kept is the one that leaves the fewest pixels differing (>12 levels) beyond the wall.

  <bi_loop.sh> name; python art/bridge_islands/fit_beams_game.py art/bridge_islands/output/<name>.png
"""
import json, math, sys
import numpy as np, cv2

b = json.load(open('art/bridge_islands/beams.json'))
h = cv2.imread('art/bridge_islands/output/reference.png').astype(np.float32)[..., ::-1]
g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)).astype(np.float32)[..., ::-1]
Y, X = np.mgrid[0:1080, 0:1920].astype(np.float32)
ab = np.array(b['above'], float); beyond = Y <= np.interp(X, ab[:, 0], ab[:, 1])
ADD = np.array(b['add'], np.float32)


def field(ang, stops, fade):
    a = math.radians(ang); t = (X - 960) * math.sin(a) + (Y - 540) * -math.cos(a)
    st = np.array(stops, float); s = np.interp(t, st[:, 0], st[:, 1], left=0, right=0) if len(st) else np.zeros_like(X)
    u = np.clip((Y / 1080 - fade[0]) / (fade[1] - fade[0]), 0, 1)
    return s * (1 - u * u * (3 - 2 * u)) * beyond


base = g - field(b['angle'], b['stops'], b['fade'])[..., None] * ADD            # (the shot without its beams: additive, so this is exact where nothing clipped)
roi = beyond & (Y < 700) & (X > 950)
light = ((h - base) @ ADD) / float(ADD @ ADD)                                   # (how much light along the beams' colour each pixel wants)
best = None
for ang in np.arange(100, 140, 1.0):
    a = math.radians(ang); t = (X - 960) * math.sin(a) + (Y - 540) * -math.cos(a)
    for f0, f1 in ((0.15, 0.45), (0.2, 0.5), (0.22, 0.58), (0.25, 0.65), (0.3, 0.7)):
        u = np.clip((Y / 1080 - f0) / (f1 - f0), 0, 1); down = 1 - u * u * (3 - 2 * u)
        sel = roi & (down > 0.3)
        bins = np.arange(-1400, 1400, 6.0); idx = np.digitize(t[sel], bins)
        want = light[sel] / down[sel]
        prof = np.zeros(len(bins) + 1)
        order = np.argsort(idx); si, sw = idx[order], want[order]
        cuts = np.searchsorted(si, np.arange(len(bins) + 2))
        for k in range(len(bins) + 1):
            seg = sw[cuts[k]:cuts[k + 1]]
            if len(seg) > 40: prof[k] = max(float(np.median(seg)), 0.0)
        stops = [[float((bins[k - 1] + bins[k]) / 2), round(prof[k], 1)] for k in range(1, len(bins))]
        pred = base + field(ang, stops, (f0, f1))[..., None] * ADD
        err = (np.abs(np.clip(pred, 0, 255) - h).max(2) > 12)[roi].mean()
        if best is None or err < best[0]: best = (err, ang, f0, f1, stops)
err, ang, f0, f1, stops = best
keep = [k for k, (_, v) in enumerate(stops) if v > 1.0]
stops = stops[max(keep[0] - 1, 0):keep[-1] + 2] if keep else []
was = (np.abs(g - h).max(2) > 12)[roi].mean()
print('beyond the wall: %.1f%% differing as shot, %.1f%% with angle %.1f fade %.2f-%.2f (%d stops)' % (100 * was, 100 * err, ang, f0, f1, len(stops)))
b.update(angle=float(ang), fade=[f0, f1], stops=stops)
json.dump(b, open('art/bridge_islands/beams.json', 'w'))
