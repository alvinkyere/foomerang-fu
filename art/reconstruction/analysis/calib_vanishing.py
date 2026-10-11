"""Single-frame calibration from vanishing points (focal length + pitch), the evidence-based camera solve for a new map.
For a camera pitched down by theta (roll ~ 0), ground lines running away from the viewer meet at the horizon VP, d_h = f*tan(theta)... above the
principal point, and vertical edges meet at the nadir VP, d_n = f/tan(theta) below it; so f = sqrt(d_h * d_n) and theta = atan(d_h / f).
Line families come from LSD segments: 'forward' = near-vertical image segments that are long on the GROUND colour mask boundary or on walls;
'vertical' = near-vertical segments on tall objects. Because both families are near-vertical in the image, they are separated by RANSAC:
the VP whose inliers lie above the centre is the horizon, below is the nadir.
Per-frame estimates are noisy (validated on renders with a known camera), so many frames are pooled: frames are kept only with
>= MIN_SEGS inliers in both families and |roll| < 3 deg, and the median + IQR are reported.
python calib_vanishing.py <frames_dir> <frame> [<frame> ...]   (FOO_VP_MIN_SEGS, default 15)"""
import sys, cv2, numpy as np, random
FD = sys.argv[1]; FR = [int(x) for x in sys.argv[2:]]; CX, CY = 320.0, 180.0
lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD); random.seed(3)
def segs(f):
    g = cv2.cvtColor(cv2.imread(f'{FD}/f{f:04d}.png'), cv2.COLOR_BGR2GRAY); L = lsd.detect(g)[0]
    if L is None: return np.zeros((0, 4))
    L = L.reshape(-1, 4); ln = np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1]); L = L[ln > 18]
    ang = np.degrees(np.arctan2(np.abs(L[:, 2] - L[:, 0]), np.abs(L[:, 3] - L[:, 1]))); return L[ang < 40]     # near-vertical in the image
def line(s): return np.cross([s[0], s[1], 1.0], [s[2], s[3], 1.0])
def inliers(S, p, tol=1.5):
    m = (S[:, :2] + S[:, 2:]) / 2; d1 = S[:, 2:] - S[:, :2]; d2 = p[None] - m
    c = np.abs((d1 * d2).sum(1)) / (np.linalg.norm(d1, axis=1) * np.linalg.norm(d2, axis=1) + 1e-9); return c > np.cos(np.radians(tol))
def ransac_vp(S, side, it=6000):
    best = (0, None); Ls = [line(s) for s in S]; w = np.hypot(S[:, 2] - S[:, 0], S[:, 3] - S[:, 1])
    for _ in range(it):
        i, j = random.sample(range(len(S)), 2); p = np.cross(Ls[i], Ls[j])
        if abs(p[2]) < 1e-9: continue
        p = p[:2] / p[2]
        if side == 'up' and not (p[1] < CY - 150): continue
        if side == 'down' and not (p[1] > CY + 150): continue
        if abs(p[0] - CX) > 3000: continue
        sc = w[inliers(S, p)].sum()
        if sc > best[0]: best = (sc, p)
    if best[1] is None: return None, 0
    # refine: least-squares intersection of the inliers
    I = inliers(S, best[1]); A = np.array([line(s) for s in S[I]]); A = A / np.linalg.norm(A[:, :2], axis=1, keepdims=True)
    p = np.linalg.lstsq(A[:, :2], -A[:, 2], rcond=None)[0]; return p, int(I.sum())
import os, statistics; MIN = int(os.environ.get('FOO_VP_MIN_SEGS', '15')); keep = []
for f in FR:
    S = segs(f); h, nh = ransac_vp(S, 'up'); n, nn = ransac_vp(S, 'down')
    if h is None or n is None: print(f, 'insufficient lines', len(S)); continue
    dh, dn = CY - h[1], n[1] - CY; fl = np.sqrt(max(dh * dn, 0)); th = np.degrees(np.arctan2(dh, fl)); roll = np.degrees(np.arctan2(n[0] - h[0], n[1] - h[1]))
    print(f'f{f}: horizon VP {h.round(0)} ({nh} segs), nadir VP {n.round(0)} ({nn} segs) -> focal {fl:.0f} px, pitch {th:.1f} deg, roll {roll:.1f} deg')
    if nh >= MIN and nn >= MIN and abs(roll) < 3: keep.append((fl, th))
if len(keep) >= 3:
    F_ = sorted(k[0] for k in keep); P_ = sorted(k[1] for k in keep); q = len(F_) // 4
    print(f'POOLED n={len(keep)}/{len(FR)}: focal median {statistics.median(F_):.0f} px (IQR {F_[q]:.0f}-{F_[-1 - q]:.0f}), pitch median {statistics.median(P_):.1f} deg (IQR {P_[q]:.1f}-{P_[-1 - q]:.1f})')
