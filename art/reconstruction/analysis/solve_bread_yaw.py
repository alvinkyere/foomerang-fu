"""Score Bread yaw candidates against the reference by VISIBLE SURFACE (crumb / crust / eyes), then solve a temporally coherent trajectory
(Viterbi over yaw states, wrap-aware turn penalty).  python solve_bread_yaw.py <frames_dir> <cand_dir> [turn_penalty]
Writes bread_yaw_solved.json {frame: yaw_rad (continuous, unwrapped)} and prints the per-frame choice."""
import sys, os, json, cv2, numpy as np
FD, CD = sys.argv[1:3]; LAM = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
HERE = os.path.dirname(os.path.abspath(__file__)); T = json.load(open(os.path.join(HERE, 'tracks_takeB.json')))['bread']
F = sorted(int(k) for k in T); N = len([n for n in os.listdir(CD) if n.startswith(f'f{F[0]:04d}_')]); WIN = 24
def classes(rgb, alpha=None):
    b, g, r = [rgb[..., i].astype(int) for i in range(3)]
    crumb = (r - b > 60) & (r > 205); crust = (r - b > 30) & (r < 205) & (g < 180) & (r > 70)
    eye = (rgb.max(2) < 75) if alpha is None else ((rgb.max(2) < 135) & (b >= r - 10))   # rendered eyes are dark blue-grey, reference eyes near black
    if alpha is not None: crumb &= alpha; crust &= alpha; eye &= alpha
    return crumb, crust, eye
def iou(a, b): u = (a | b).sum(); return (a & b).sum() / u if u else 1.0
S = np.zeros((len(F), N))
for i, f in enumerate(F):
    px, py = T[str(f)]; im = cv2.imread(f'{FD}/f{f:04d}.png'); x0, y0 = int(max(0, px - WIN)), int(max(0, py - WIN))
    for k in range(N):
        c = cv2.imread(f'{CD}/f{f:04d}_y{k:02d}.png', cv2.IMREAD_UNCHANGED)
        if c is None: S[i, k] = 0; continue
        h, w = c.shape[:2]; ref = im[y0:y0 + h, x0:x0 + w]; h, w = ref.shape[:2]; c = c[:h, :w]
        cand = cv2.GaussianBlur(c[..., :3], (0, 0), 0.7); al = c[..., 3] > 110
        rc, rr, re = classes(ref); cc, cr, ce = classes(cand, al)
        # restrict the reference to the neighbourhood of the candidate silhouette (other objects in the window are not Bread)
        near = cv2.dilate(al.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        ne_r, ne_c = int((re & near).sum()), int(ce.sum()); eye_s = 1 - abs(ne_r - ne_c) / max(ne_r, ne_c, 6)
        S[i, k] = iou(rc & near, cc) + iou(rr & near, cr) + 1.5 * eye_s
# Viterbi: maximise sum(score) - LAM * (turn / 90deg)^2 per step
ang = np.arange(N) * 2 * np.pi / N
D = np.abs((ang[:, None] - ang[None, :] + np.pi) % (2 * np.pi) - np.pi); P = LAM * (D / (np.pi / 2)) ** 2
V = S[0].copy(); B = np.zeros((len(F), N), int)
for i in range(1, len(F)):
    M = V[:, None] - P; B[i] = M.argmax(0); V = M.max(0) + S[i]
path = [int(V.argmax())]
for i in range(len(F) - 1, 0, -1): path.append(int(B[i, path[-1]]))
path = path[::-1]; yaw = np.unwrap(ang[path])
json.dump({str(f): float(y) for f, y in zip(F, yaw)}, open(os.path.join(HERE, 'bread_yaw_solved.json'), 'w'))
best = S.argmax(1)
print('per-frame (frame:solved deg | independent best deg):')
print(' '.join(f'{f}:{int(np.degrees(ang[p]))}|{int(np.degrees(ang[b]))}' for f, p, b in list(zip(F, path, best))[::2]))
print('mean chosen score %.2f vs independent best %.2f' % (np.mean([S[i, p] for i, p in enumerate(path)]), S.max(1).mean()))
