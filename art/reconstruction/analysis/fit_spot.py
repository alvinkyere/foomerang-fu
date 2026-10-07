"""Fit a warm spot light (+ small screen vignette) to the measured lit-ground luminance field (take A camera, frame 233).
 Model: ratio(P) = (a + b * S(P)) * vignette(u, v),  S = Lambert spot: h0/d^3 * cone(angle to the axis).   python fit_spot.py <lf prefix> <out.json>"""
import sys, json, numpy as np, cv2
from scipy.optimize import least_squares
from proj import *
pre, out = sys.argv[1:3]
pav = np.load(pre + '_pav.npy'); sand = np.load(pre + '_sand.npy')
def lum(f): return f[..., 0] * 0.114 + f[..., 1] * 0.587 + f[..., 2] * 0.299
uu, vv = np.meshgrid(np.arange(0, 640, 8), np.arange(0, 360, 8)); samples = []
for f, w in ((pav[..., :3], pav[..., 3]), (sand[..., :3], sand[..., 3])):
    L = lum(f); ref = np.median(L[w > 0.3]) ; ok = w[vv, uu] > 0.3
    r = (L[vv, uu] / ref)[ok]; samples.append(np.column_stack([uu[ok], vv[ok], r]))
D = np.vstack(samples); print('samples', len(D), 'ratio range', D[:, 2].min().round(2), D[:, 2].max().round(2), 'baseline rms about mean', D[:, 2].std().round(3))
H = np.linalg.inv(plane_H('A', 233, 0)); P = (H @ np.column_stack([D[:, 0], D[:, 1], np.ones(len(D))]).T).T; P = P[:, :2] / np.linalg.inv(plane_H('A', 233, 0))[2, :][None, :].dot(np.array([0, 0, 1.0])) if False else None
Hn = H; q = (Hn @ np.column_stack([D[:, 0], D[:, 1], np.ones(len(D))]).T); X = q[0] / q[2]; Y = q[1] / q[2]
nx = (D[:, 0] - 320) / 320; ny = (D[:, 1] - 180) / 180
def model(p, X=X, Y=Y, nx=nx, ny=ny):
    x0, y0, h0, xt, yt, ca, bl, b, vs, vb = p
    d = np.stack([X - x0, Y - y0, -h0 * np.ones_like(X)], 1); dist = np.linalg.norm(d, axis=1); ax = np.array([xt - x0, yt - y0, -h0]); ax /= np.linalg.norm(ax)
    cosang = (d @ ax) / dist; cone = np.clip((cosang - np.cos(ca)) / max(np.cos(ca * (1 - bl)) - np.cos(ca), 1e-3), 0, 1); cone = cone * cone * (3 - 2 * cone)
    S = h0 / dist ** 3 * cone; S = S / S.max() if S.max() > 0 else S
    vig = 1 - vs * nx ** 2 - vb * np.clip(ny, 0, 1) ** 2
    return (1 - b + b * S) * vig
def res(p): return model(p) - D[:, 2]
best = None
for x0 in (-0.07, 0.1): 
    for y0 in (0.9, 1.2, 1.6):
        for h0 in (0.4, 0.8):
            p0 = [x0, y0, h0, -0.07, 0.6, 0.6, 0.7, 0.25, 0.08, 0.05]
            try: r = least_squares(res, p0, bounds=([-1, 0.5, 0.1, -0.5, 0.2, 0.15, 0.1, 0.0, 0.0, 0.0], [1, 3.0, 3.0, 0.5, 1.2, 1.5, 1.0, 0.9, 0.3, 0.3]))
            except Exception as e: continue
            if best is None or r.cost < best.cost: best = r
p = best.x; print('fit rms %.4f (baseline %.4f)' % (np.sqrt(np.mean(best.fun ** 2)), D[:, 2].std()), dict(zip('x0 y0 h0 xt yt cone blend b vig_side vig_bottom'.split(), p.round(3))))
json.dump(dict(spot=dict(x0=p[0], y0=p[1], h0=p[2], xt=p[3], yt=p[4], cone=p[5], blend=p[6], b=p[7]), vignette=dict(side=p[8], bottom=p[9]), rms=float(np.sqrt(np.mean(best.fun ** 2)))), open(out, 'w'), indent=1)
