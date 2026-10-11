"""Coffee-death burst, reconstructed from TEMPORAL DIFFERENCING in world coordinates (not colour thresholds alone):
 rectify take B to the ground plane around the burst; background = per-pixel median of pre-burst frames (camera motion cancels in the plan);
 effect = |frame - background| above threshold, minus teal-character pixels; effect pixels are clustered into flat colour classes (k-means over all frames);
 per-frame polygons per class are stored in WORLD plan coordinates.   python measure_burst.py <frames_dir> <out.json>"""
import sys, json, cv2, numpy as np
from proj import *
fd, out = sys.argv[1:3]
w = np.linalg.inv(plane_H('B', 336, 0.0)) @ np.array([283, 252, 1.0]); w /= w[2]; cx, cy = w[0], w[1]
S = 900; X0, X1, Y0, Y1 = cx - 0.09, cx + 0.09, cy - 0.09, cy + 0.09; W, H = int((X1 - X0) * S), int((Y1 - Y0) * S)
bgs = []
for f in range(300, 326, 2):
    r, m = rectify(cv2.imread(f'{fd}/f{f:04d}.png'), 'B', f, 0.0, S, X0, X1, Y0, Y1); bgs.append(np.where(m[..., None], r, np.nan).astype(np.float32))
bg = np.nan_to_num(np.nanmedian(np.array(bgs), axis=0))
yy, xx = np.mgrid[0:H, 0:W]; RR = np.hypot(xx - W / 2, yy - H / 2); R_ = RR < 0.092 * S
frames = list(range(326, 369)); eff = {}; px_all = []
for f in frames:
    r, m = rectify(cv2.imread(f'{fd}/f{f:04d}.png'), 'B', f, 0.0, S, X0, X1, Y0, Y1); rf = r.astype(np.float32)
    d = np.abs(rf - bg).max(2)
    b_, g_, r_ = [r[..., i].astype(int) for i in range(3)]
    teal = cv2.dilate(((g_ > r_ + 28) & (b_ > r_ + 6) & (g_ > 140)).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    msk = (d > 26) & R_ & ~teal & m; msk = cv2.morphologyEx(msk.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0
    dark = (r.max(2) < 80) & (RR < 0.092 * S) & ~teal & m; dark = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0
    msk = (msk | dark) & ~(cv2.dilate(dark.astype(np.uint8), np.ones((1, 1), np.uint8)) > 0) | dark
    eff[f] = (msk, r, dark); px_all.append(r[msk & ~dark].astype(np.float32))
P = np.concatenate(px_all); print('effect pixels total', len(P))
K = 5; _, lab, cen = cv2.kmeans(P, K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.5), 3, cv2.KMEANS_PP_CENTERS)
order = np.argsort(cen.sum(1)); cen = cen[order]; print('class colours (RGB):', [tuple(int(v) for v in c[::-1]) for c in cen])
res = dict(colors=[[int(v) for v in c[::-1]] for c in cen] + [[252, 251, 244]], S=S, X0=float(X0), Y1=float(Y1), centre=[float(cx), float(cy)], frames={})
def to_w(p): return [round(X0 + p[0] / S, 5), round(Y1 - p[1] / S, 5)]
for f, (msk, r, dark) in eff.items():
    msk = msk & ~dark; ys, xs = np.nonzero(msk); cls = np.argmin(np.linalg.norm(r[ys, xs].astype(np.float32)[:, None, :] - cen[None], axis=2), axis=1); lbl = np.full(msk.shape, -1, np.int32); lbl[ys, xs] = cls
    polys = {}
    lbl[dark] = 0
    for k in range(K):
        lim = 0.092 if k <= 1 else 0.062            # dark droplets fly out to the ring; light classes stay near the disc (farther light pixels are registration lines)
        mk = ((lbl == k) & (RR < lim * S)).astype(np.uint8) * 255
        if k >= 2: mk = cv2.morphologyEx(mk, cv2.MORPH_OPEN, np.ones((4, 4), np.uint8))      # thin light structures are registration lines, not effect
        if k > 0: mk = cv2.morphologyEx(mk, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))      # dark class: no closing (it filled the splash's light specks)
        cs, hier = cv2.findContours(mk, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        # keep HOLES (lighter patches / specks inside the splash): each entry is [outer, hole1, hole2...]
        out_k = []
        if hier is not None:
            for ci, c in enumerate(cs):
                if hier[0][ci][3] >= 0 or cv2.contourArea(c) < (3 if k == 0 else 6): continue
                loops = [[to_w(p) for p in cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2)]]
                ch = hier[0][ci][2]
                while ch >= 0:
                    if cv2.contourArea(cs[ch]) >= 2: loops.append([to_w(p) for p in cv2.approxPolyDP(cs[ch], 0.8, True).reshape(-1, 2)])
                    ch = hier[0][ch][0]
                out_k.append(loops)
        polys[str(k)] = out_k
        rr_, cc_ = np.nonzero(((lbl == k) & (RR < lim * S)) if k > 0 else ((lbl == k) & (RR < lim * S)))
        runs = []
        if len(rr_):
            order = np.lexsort((cc_, rr_)); rr_, cc_ = rr_[order], cc_[order]; start = 0
            for j in range(1, len(rr_) + 1):
                if j == len(rr_) or rr_[j] != rr_[start] or cc_[j] != cc_[j - 1] + 1: runs.append([int(rr_[start]), int(cc_[start]), int(cc_[j - 1])]); start = j
        polys['runs' + str(k)] = runs
    # white halo: bright pixels hugging the dark droplets
    hal = (cv2.dilate(dark.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0) & ~dark & (r.min(2) > 226)
    cs, _ = cv2.findContours(hal.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); polys['5'] = [[[to_w(p) for p in cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2)]] for c in cs if cv2.contourArea(c) >= 4]
    res['frames'][str(f)] = polys
json.dump(res, open(out, 'w'))
# visual check: segmentation in the plan
tiles = []
for f in (330, 336, 344, 356, 366):
    msk, r, _d = eff[f]; lab_ = np.zeros_like(r)
    for k, c in enumerate(cen):
        pass
    ys, xs = np.nonzero(msk); cls = np.argmin(np.linalg.norm(r[ys, xs].astype(np.float32)[:, None, :] - cen[None], axis=2), axis=1); seg = np.full_like(r, 255)
    seg[ys, xs] = cen[cls].astype(np.uint8); tiles.append(np.hstack([r, seg]))
cv2.imwrite('burst_seg3.png', np.vstack(tiles[:5]))
