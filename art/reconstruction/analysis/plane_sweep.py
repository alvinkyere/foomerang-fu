"""Height map (2.5D surface) of a shot by PLANE-SWEEP over a moving camera: for every plan cell (X, Y) and candidate height z, all
frames are sampled at the 3D point (X, Y, z); where z is the true surface height the frames agree (low robust spread), elsewhere
parallax makes them disagree. The winning z per cell, its colour (median over the agreeing frames) and a confidence (how much
better the best z is than z = 0, and how many frames saw it) are written out. Movers are rejected by the robust spread (median
absolute deviation) and the saturated / water mask. Uniform regions carry no parallax: there the result falls back to z = 0 (low
confidence), and the classes / priors in the map's build decide. The whole cost volume (and per-plane colour) is saved for
that decision (heights_from_volume.py).
python plane_sweep.py <frames_dir> <camera_key> <first> <last> <step> <px_per_unit> <X0> <X1> <Y0> <Y1> <zmax> <dz> <out.npz>"""
import sys, cv2, numpy as np
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from proj import plane_H, cam
FD, KEY = sys.argv[1], sys.argv[2]; F0, F1, ST = map(int, sys.argv[3:6]); S, X0, X1, Y0, Y1, ZMAX, DZ = map(float, sys.argv[6:13]); OUT = sys.argv[13]
fr = [f for f in range(F0, F1 + 1, ST) if f in cam(KEY)[1]]; W, H = int((X1 - X0) * S), int((Y1 - Y0) * S)
A = np.array([[S, 0, -X0 * S], [0, -S, Y1 * S], [0, 0, 1.0]])
IM = [cv2.GaussianBlur(cv2.imread(f'{FD}/f{f:04d}.png'), (0, 0), 0.8).astype(np.float32) for f in fr]
def okmask(im):
    hsv = cv2.cvtColor(im.astype(np.uint8), cv2.COLOR_BGR2HSV); return ((hsv[..., 1] < 170)).astype(np.uint8) * 255
OK = [okmask(im) for im in IM]
zs = np.arange(0.0, ZMAX + 1e-9, DZ); best = np.full((H, W), np.inf, np.float32); bz = np.zeros((H, W), np.float32)
col = np.zeros((H, W, 3), np.float32); cnt = np.zeros((H, W), np.int16); cost0 = None
VOL = np.zeros((len(zs), H, W), np.float16); VCOL = np.zeros((len(zs), H, W, 3), np.uint8)
for z in zs:
    st = np.full((len(fr), H, W, 3), np.nan, np.float32)
    for i, f in enumerate(fr):
        M = A @ np.linalg.inv(plane_H(KEY, f, z))
        r = cv2.warpPerspective(IM[i], M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
        m = cv2.warpPerspective(OK[i], M, (W, H), flags=cv2.INTER_NEAREST) > 0
        st[i][m] = r[m]
    with np.errstate(all='ignore'):
        med = np.nanmedian(st, 0); mad = np.nanmedian(np.abs(st - med[None]).sum(-1), 0); n = np.sum(~np.isnan(st[..., 0]), 0)
    # spread with a small preference for lower surfaces (ties -> the ground), cells seen by too few frames are unscored
    cost = np.where(n >= 4, mad + 0.5 * z / DZ * 0.05, np.inf).astype(np.float32)
    zi = int(round(z / DZ)); VOL[zi] = np.minimum(cost, 6e4); VCOL[zi] = np.nan_to_num(med).astype(np.uint8)
    if cost0 is None: cost0 = cost.copy()
    better = cost < best; best[better] = cost[better]; bz[better] = z; col[better] = med[better]; cnt[better] = n[better]
    print(f'z {z:.3f}: cells won {int(better.sum())}', flush=True)
conf = np.where(np.isfinite(best) & np.isfinite(cost0), (cost0 - best) / (cost0 + 1.0), 0).astype(np.float32)
np.savez_compressed(OUT, z=bz, colour=np.nan_to_num(col).astype(np.uint8), confidence=conf, count=cnt, cost=np.where(np.isfinite(best), best, -1),
                    box=np.array([X0, X1, Y0, Y1]), px_per_unit=S, frames=np.array(fr), zs=zs, volume=VOL, volume_colour=VCOL)
print('height map', OUT, W, 'x', H, 'cells; elevated (z > 0.01):', round(float((bz > 0.01).mean()) * 100, 1), '%')
