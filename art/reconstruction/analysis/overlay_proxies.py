"""Fit check of a proxy kit against the reference: every primitive's edges are drawn (with hidden-line removal off: all edges)
over chosen frames through the solved per-frame camera, so misplaced / mis-sized proxies show directly against the footage.
python overlay_proxies.py <frames_dir> <camera_key> <proxies.json> <out.png> <frame> [<frame> ...]"""
import sys, os, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proj import K, Rt
import proxies
FD, KEY, PJ, OUT = sys.argv[1:5]; FR = [int(f) for f in sys.argv[5:]]; kit = proxies.load(PJ)
rng = np.random.default_rng(3); COLS = {}
rows = []
for f in FR:
    im = cv2.resize(cv2.imread(f'{FD}/f{f:04d}.png'), (1280, 720)); R, t = Rt(KEY, f); Pm = K(KEY) @ np.column_stack([R, t])
    for p in kit['primitives']:
        col = COLS.setdefault(p['group'], tuple(int(v) for v in rng.integers(60, 255, 3)))
        V, F = proxies.mesh(p); q = (Pm @ np.c_[np.array(V), np.ones(len(V))].T).T
        if (q[:, 2] <= 0).any(): continue
        uv = (q[:, :2] / q[:, 2:3] * 2).astype(int)
        for face in F:
            pts = uv[list(face)]; cv2.polylines(im, [pts.reshape(-1, 1, 2)], True, col, 1, cv2.LINE_AA)
    cv2.putText(im, f'f{f}', (10, 30), 0, 1, (255, 255, 255), 2); rows.append(im)
cv2.imwrite(OUT, np.vstack(rows) if len(rows) < 3 else np.vstack([np.hstack(rows[i:i + 2]) if i + 1 < len(rows) else np.hstack([rows[i], np.zeros_like(rows[i])]) for i in range(0, len(rows), 2)]))
print('overlay', OUT)
