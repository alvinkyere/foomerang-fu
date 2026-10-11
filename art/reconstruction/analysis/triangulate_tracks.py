"""Sparse 3D points of a shot: KLT corner tracks through the frames, TRIANGULATED with the solved per-frame cameras (proj.py key).
Corners carry parallax in every direction, so this measures heights where the plane sweep cannot (structures running along the
camera's motion). Tracks are kept when long enough and when the triangulated point reprojects within MAXERR px in every frame
(movers and drifting features fail that). Writes [{X, Y, Z, err, n, colour}] in plan units.
python triangulate_tracks.py <frames_dir> <camera_key> <first> <last> <out.json> [min_len] [max_err_px]"""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proj import cam, K, Rt
FD, KEY = sys.argv[1], sys.argv[2]; F0, F1 = int(sys.argv[3]), int(sys.argv[4]); OUT = sys.argv[5]
MINLEN = int(sys.argv[6]) if len(sys.argv) > 6 else 20; MAXERR = float(sys.argv[7]) if len(sys.argv) > 7 else 0.8
ZMIN = float(os.environ.get('FOO_ZMIN', '-0.03'))          # maps with cliffs and void below the ground need deeper points
fr = [f for f in range(F0, F1 + 1) if f in cam(KEY)[1]]
P = {f: K(KEY) @ np.column_stack(Rt(KEY, f)) for f in fr}
IM = {f: cv2.imread(f'{FD}/f{f:04d}.png') for f in fr}; G = {f: cv2.cvtColor(IM[f], cv2.COLOR_BGR2GRAY) for f in fr}
LK = dict(winSize=(15, 15), maxLevel=2, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
tracks = []; live = []          # live: list of (track index, current point)
for a, b in zip(fr[:-1], fr[1:]):
    if len(live) < 400:          # top up with new corners away from live ones
        mask = np.full(G[a].shape, 255, np.uint8)
        for _, p in live: cv2.circle(mask, (int(p[0]), int(p[1])), 8, 0, -1)
        new = cv2.goodFeaturesToTrack(G[a], 600 - len(live), 0.01, 8, mask=mask)
        for p in (new.reshape(-1, 2) if new is not None else []): tracks.append({a: p.copy()}); live.append((len(tracks) - 1, p.copy()))
    if not live: continue
    p0 = np.array([p for _, p in live], np.float32).reshape(-1, 1, 2)
    p1, st, _ = cv2.calcOpticalFlowPyrLK(G[a], G[b], p0, None, **LK); pb, st2, _ = cv2.calcOpticalFlowPyrLK(G[b], G[a], p1, None, **LK)
    good = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm(pb - p0, axis=2).ravel() < 0.5)          # forward-backward check
    nl = []
    for (ti, _), q, g in zip(live, p1.reshape(-1, 2), good):
        if g and 0 <= q[0] < 640 and 0 <= q[1] < 360: tracks[ti][b] = q.copy(); nl.append((ti, q.copy()))
    live = nl
pts = []
for t in tracks:
    if len(t) < MINLEN: continue
    fs = sorted(t); A = []
    for f in fs: Pm = P[f]; x, y = t[f]; A += [x * Pm[2] - Pm[0], y * Pm[2] - Pm[1]]
    X = np.linalg.svd(np.array(A))[2][-1]; X = X[:3] / X[3]
    e = [np.linalg.norm((lambda q: q[:2] / q[2])(P[f] @ np.r_[X, 1]) - t[f]) for f in fs]
    if max(e) > MAXERR or X[2] < ZMIN or X[2] > 0.6: continue
    f = fs[len(fs) // 2]; x, y = t[f].astype(int); c = IM[f][y, x][::-1]
    pts.append(dict(X=float(X[0]), Y=float(X[1]), Z=float(X[2]), err=float(np.mean(e)), n=len(fs), colour=[int(v) for v in c]))
json.dump(pts, open(OUT, 'w'))
z = np.array([p['Z'] for p in pts]); print('tracks', len(tracks), 'triangulated', len(pts), 'Z percentiles', np.round(np.percentile(z, [5, 25, 50, 75, 95]), 3) if len(z) else '-')
