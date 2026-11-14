"""The court's stepped kerb (2026-11-13): round the paved court the frame has, outwards, a tan band, a light one, tan, light, tan, then an
orange skirt on the sand (on every side alike, ~0.3 units each; the corners cut at 45 degrees). Each pixel of the READY frame classed by
its nearest measured tone (REF), laid flat on the ground (z 0: the game's camera never turns, so the steps drawn flat where the frame has
them look as the HQ's from every framing it uses), and each boundary outwards (court | tan | light | tan | light | tan | orange | sand) the
outline of all that lies inside it: sides as straight lines (a robust fit to the outline's points away from the corners), the corners as
45-degree cuts (their offset the median of the corner's points). Writes kerb.json ({bands: [{colour, pts}], outermost first}),
output/kerb_check.png.

  python art/canal_court/kerb.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import pix

f = cv2.imread('art/canal_court/output/clean_ref.png')
REF = dict(court='#f7f5e3', light='#f4edd0', tan='#e0d3b2', orange='#f3d081', sand='#f9e88a')
ORDER = ['court', 'tan', 'light', 'tan', 'light', 'tan', 'orange', 'sand']           # (inside out)
rgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (5, 3, 1)], float)    # (BGR)
names = list(REF); REFS = np.stack([rgb(REF[k]) for k in names])


def profile(p0, d, reach=4.0, step=0.01):
    """Where, along the plan ray p0 + t d (outwards), the frame's tones go through ORDER: the t of each boundary (None if not found)."""
    seq = []
    for t in np.arange(0, reach, step):
        u, v = pix(p0[0] + d[0] * t, p0[1] + d[1] * t)
        if not (0 <= u < 1919 and 0 <= v < 1079): return None
        c = f[int(round(v)), int(round(u))].astype(float); dist = np.linalg.norm(REFS - c, axis=1)
        seq.append((t, names[int(np.argmin(dist))] if dist.min() < 30 else None))
    # walk ORDER: each boundary where the next band's tone first holds 3 samples running
    out, k, run = [], 0, 0
    for i, (t, c) in enumerate(seq):
        if k + 1 < len(ORDER) and c == ORDER[k + 1]:
            run += 1
            if run == 3: out.append(seq[i - 2][0]); k += 1; run = 0
        else: run = 0
    return out if len(out) == len(ORDER) - 1 else None


# each side: profiles every 0.5 units along its middle, from a point inside the court outwards
SIDES = dict(S=((-20, 22), (0, -13.0), (0, -1)), N=((-20, 22), (0, 15.0), (0, 1)), W=((-11, 13), (-23.0, 0), (-1, 0)), E=((-11, 13), (25.2, 0), (1, 0)))
fits = {}
for side, ((a0, a1), base, d) in SIDES.items():
    rows = []
    for s_ in np.arange(a0, a1, 0.5):
        p0 = (s_, base[1]) if side in 'SN' else (base[0], s_)
        r = profile(p0, d)
        if r is not None: rows.append([s_] + [(p0[1] if side in 'SN' else p0[0]) + (d[1] if side in 'SN' else d[0]) * t for t in r])
    R = np.array(rows); fits[side] = []
    for j in range(1, R.shape[1]):
        b, a = np.polyfit(R[:, 0], R[:, j], 1); res = np.abs(R[:, j] - (a + b * R[:, 0])); k = res < max(0.04, np.percentile(res, 75))
        b, a = np.polyfit(R[k, 0], R[k, j], 1); fits[side].append((float(a), float(b)))
    print(side, len(rows), 'profiles;', ['%.2f%+.4f' % ab for ab in fits[side]])

# the corners: profiles along each corner's diagonal; the cut sx x + sy y = c for each boundary
cuts = {}
for k_, (sx, sy) in dict(sw=(-1, -1), se=(1, -1), ne=(1, 1), nw=(-1, 1)).items():
    W_, E_, S_, N_ = fits['W'][0], fits['E'][0], fits['S'][0], fits['N'][0]
    vals = []
    for off in np.arange(-0.6, 0.61, 0.2):
        # (from a point 2.5 units in from the court's corner, along the diagonal outwards, shifted along the cut)
        cx = (W_[0] + W_[1] * 0) if sx < 0 else (E_[0] + E_[1] * 0); cy = S_[0] if sy < 0 else N_[0]
        p0 = (cx - sx * 2.5 + sy * off / math.sqrt(2), cy - sy * 2.5 - sx * off / math.sqrt(2))
        r = profile(p0, (sx / math.sqrt(2), sy / math.sqrt(2)), reach=8)
        if r is not None: vals.append([sx * p0[0] + sy * p0[1] + t * math.sqrt(2) for t in r])
    cuts[k_] = list(np.median(np.array(vals), 0)) if vals else None
    print(k_, len(vals), None if not vals else ['%.2f' % v for v in cuts[k_]])


def meet(L, along, sx, sy, c):
    a, b = L
    if along == 'y': y = (c - sx * a) / (sx * b + sy); return (a + b * y, y)
    x = (c - sy * a) / (sy * b + sx); return (x, a + b * x)


LEG = [1.0, 0.98, 0.85, 0.72, 0.6, 0.55, 0.5]
bands = []
for j in range(len(ORDER) - 1):
    S, N, W, E = fits['S'][j], fits['N'][j], fits['W'][j], fits['E'][j]
    # (the corners: their cuts' legs as the clean north-west corner's (the others hide under trees and the grass), the same at all four)
    cut = {}
    for k, (sx, sy) in dict(sw=(-1, -1), se=(1, -1), ne=(1, 1), nw=(-1, 1)).items():
        cy = (S if sy < 0 else N)[0]; cx = (W if sx < 0 else E)[0] + (W if sx < 0 else E)[1] * cy
        cut[k] = sx * cx + sy * cy - LEG[j]
    pts = [meet(S, 'x', -1, -1, cut['sw']), meet(S, 'x', 1, -1, cut['se']), meet(E, 'y', 1, -1, cut['se']), meet(E, 'y', 1, 1, cut['ne']),
           meet(N, 'x', 1, 1, cut['ne']), meet(N, 'x', -1, 1, cut['nw']), meet(W, 'y', -1, 1, cut['nw']), meet(W, 'y', -1, -1, cut['sw'])]
    bands.append(dict(colour=REF[ORDER[j]], pts=[[round(float(x), 3), round(float(y), 3)] for x, y in pts]))
# (outermost first: each band drawn over the one outside it; the last band's outer boundary is the orange skirt's: the sand beyond)
json.dump(dict(bands=bands[::-1], skirt=REF['orange']), open('art/canal_court/kerb.json', 'w'), indent=1)
vis = f.copy()
for b in bands: cv2.polylines(vis, [np.int32([pix(x, y) for x, y in b['pts']])], True, (0, 0, 255), 1)
cv2.imwrite('art/canal_court/output/kerb_check.png', vis)
