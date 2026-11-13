"""The warm-up's water across its channel (2026-11-13): the HQ's water is lighter under the far banks (the ones whose kerb face the
camera sees) and darker along the near banks. For each water spot: how far across the channel it lies, 0 at a far bank, 1 at a near
bank (distance to the nearest far-bank edge over the sum of both). `across(S, X0, Y0, N)` rasterises it; run alone, it fits the frame's
colour (Chrome, frame 0.0 s) in bins of it and writes the stops to water_across.json (blender/build.py colours the water sheet by them).

  python art/warm_up/water_across.py <game shot or render.png>      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up')
M = json.load(open('art/warm_up/moat.json'))


def far_edges(poly, island):
    """Each edge of the outline and whether it is a far bank (the water south of it, as build.py decides)."""
    n = len(poly); a2 = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    out = []
    for i in range(n):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % n]; L = math.hypot(bx - ax, by - ay) or 1
        dx, dy = (bx - ax) / L, (by - ay) / L; lx, ly = -dy, dx
        s = (1 if a2 > 0 else -1) * (-1 if island else 1)
        out.append(((ax, ay), (bx, by), s * ly < -0.3))
    return out


def across(S, X0, Y1, N):
    """The across value over a grid (S cells a unit, x from X0, rows from Y1 southwards, N x N); NaN off the water."""
    to = lambda x, y: (int(round((x - X0) * S)), int(round((Y1 - y) * S)))
    wet = np.zeros((N, N), np.uint8)
    cv2.fillPoly(wet, [np.int32([to(*p) for p in M['outer']])], 1); cv2.fillPoly(wet, [np.int32([to(*p) for p in M['inner']])], 0)
    far = np.full((N, N), 255, np.uint8); near = np.full((N, N), 255, np.uint8)
    for key, island in (('outer', False), ('inner', True)):
        for a, b, is_far in far_edges(M[key], island):
            cv2.line(far if is_far else near, to(*a), to(*b), 0, 2)
    df = cv2.distanceTransform(far, cv2.DIST_L2, 5); dn = cv2.distanceTransform(near, cv2.DIST_L2, 5)
    t = df / np.maximum(df + dn, 1e-6)
    t[wet == 0] = np.nan
    return t


if __name__ == '__main__':
    from measure import plan_at
    f = cv2.imread('art/warm_up/output/chrome_0.png'); r = cv2.imread(sys.argv[1])
    def blue(im):
        h = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(int); return (h[..., 0] >= 98) & (h[..., 0] <= 112) & (h[..., 1] >= 90)
    m = blue(f) & blue(r); ys, xs = np.nonzero(m)
    P = plan_at(np.stack([xs, ys], 1), -0.8)
    S, X0, Y1, N = 20, -45.0, 45.0, 1800
    t = across(S, X0, Y1, N)
    gi = np.clip(((P[:, 0] - X0) * S).astype(int), 0, N - 1); gj = np.clip(((Y1 - P[:, 1]) * S).astype(int), 0, N - 1)
    tv = t[gj, gi]; ok = ~np.isnan(tv)
    cols = f[ys, xs].astype(float); ours = r[ys, xs].astype(float)
    stops = []
    for lo in np.arange(0, 1, 0.1):
        k = ok & (tv >= lo) & (tv < lo + 0.1)
        c = np.median(cols[k], 0)[::-1]; o = np.median(ours[k], 0)[::-1]
        stops.append([round(lo + 0.05, 2), '#%02x%02x%02x' % tuple(int(v) for v in c)])
        print('%.1f-%.1f %6d  hq %s  ours #%02x%02x%02x' % (lo, lo + 0.1, k.sum(), stops[-1][1], *[int(v) for v in o]))
    print(json.dumps(stops)); json.dump(stops, open('art/warm_up/water_across.json', 'w'))
