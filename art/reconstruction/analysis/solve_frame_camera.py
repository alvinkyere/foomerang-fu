"""Solve a map's camera from its shot, independently of every other map (frame mode):
 1. LENS + PITCH from vanishing points: in each of three segments of the shot, length-weighted support of near-vertical LSD
    segments is scanned for the nadir distance d_n (verticals) and the horizon distance d_h (ground lines running away);
    f = sqrt(d_h * d_n), pitch = atan(d_h / f). Validated on a render with a known camera (nadir 650 vs 630, horizon 1300 vs 1285).
 2. TRACK of a short window around the reference frame (translation + height; track_pan.py) -> analysis/camera_<map>.json.
Prints the per-segment estimates and their spread (the evidence to record in the map config).
python solve_frame_camera.py <frames_dir> <map> <shot_first> <shot_last> <ref_frame> <window_half> [f pitch]   (f/pitch override step 1)"""
import sys, os, json, math, subprocess, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
FD, MAP = sys.argv[1], sys.argv[2]; A, B, REF, HALF = (int(v) for v in sys.argv[3:7])
lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
def support(frames, sign, grid):
    """max over nadir/horizon x of the length-weighted support of off-centre segments pointing at (x, 180 + sign*d)."""
    NX = np.arange(200, 450, 25); S = np.zeros((len(grid), len(NX)))
    for f in frames:
        g = cv2.cvtColor(cv2.imread(f'{FD}/f{f:04d}.png'), cv2.COLOR_BGR2GRAY); L = lsd.detect(g)[0]
        if L is None: continue
        L = L.reshape(-1, 4); ln = np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1]); k = ln > 18; L, ln = L[k], ln[k]
        m = (L[:, :2] + L[:, 2:]) / 2; d = L[:, 2:] - L[:, :2]; off = np.abs(m[:, 0] - 320) > 120
        for i, dd in enumerate(grid):
            for j, nx in enumerate(NX):
                v = np.array([nx, 180 + sign * dd])[None] - m; c = np.abs((d * v).sum(1)) / (np.linalg.norm(d, axis=1) * np.linalg.norm(v, axis=1) + 1e-9)
                S[i, j] += ln[(c > np.cos(np.radians(1.0))) & off].sum()
    i, j = np.unravel_index(S.argmax(), S.shape); return float(grid[i]), float(S.max())
if len(sys.argv) > 8: f, pitch = float(sys.argv[7]), float(sys.argv[8]); est = []
else:
    est = []
    for seg in np.array_split(np.arange(A, B + 1), 3):
        s0, s1 = seg[0], seg[-1]
        fr = list(range(int(s0), int(s1) + 1, 4)); dn, sn = support(fr, +1, np.arange(400, 2600, 50)); dh, sh = support(fr, -1, np.arange(500, 4000, 100))
        ff = math.sqrt(dh * dn); est.append(dict(frames=[int(s0), int(s1)], d_h=dh, d_n=dn, nadir_support=round(sn), f=round(ff), pitch=round(math.degrees(math.atan2(dh, ff)), 1)))
        print('segment', est[-1], flush=True)
    f = float(np.median([e['f'] for e in est])); pitch = float(np.median([e['pitch'] for e in est]))
print(f'lens f {f:.0f} px @640 (segments {[e["f"] for e in est]}), pitch {pitch:.1f} deg (segments {[e["pitch"] for e in est]})')
out = os.path.join(HERE, f'camera_{MAP}.json'); env = dict(os.environ, FOO_RELIABLE_ECC=os.environ.get('FOO_RELIABLE_ECC', '0.4'))
r = subprocess.run([sys.executable, os.path.join(HERE, 'track_pan.py'), FD, str(max(A, REF - HALF)), str(min(B, REF + HALF)), str(f), str(pitch), out], env=env, capture_output=True, text=True)
print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-400:])
c = json.load(open(out)); c['evidence'] = dict(vanishing_points=est, f=f, pitch=pitch); json.dump(c, open(out, 'w'), indent=1)
