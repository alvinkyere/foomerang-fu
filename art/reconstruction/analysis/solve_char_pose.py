"""Joint (tilt, yaw) solve for a character: candidates rendered at several backward tilts (dirs <prefix><tilt>), each with N yaws.
Per-frame score = surface score (same as solve_char_yaw); Viterbi over (tilt, yaw) states with wrap-aware yaw-turn and tilt-change penalties.
python solve_char_pose.py <frames_dir> <cand_prefix> <tilt1,tilt2,...> [lam_yaw lam_tilt]
Writes <char>_pose_solved.json {frame: [tilt_deg, yaw_rad_unwrapped]}."""
import sys, os, json, cv2, numpy as np
FD, PRE, TL = sys.argv[1], sys.argv[2], [float(t) for t in sys.argv[3].split(',')]
LY = float(sys.argv[4]) if len(sys.argv) > 4 else 0.6; LT = float(sys.argv[5]) if len(sys.argv) > 5 else 0.4
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'solve_char_yaw.py')).read()
head = src.split('S = np.zeros')[0].replace("FD, CD = sys.argv[1:3]; LAM = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6", "FD, CD, LAM = %r, %r, 0.6" % (FD, PRE + str(int(TL[0]))))
exec(head)
body = src.split('S = np.zeros((len(F), N))')[1].split('# Viterbi')[0]
Ss = []
for t in TL:
    CD = PRE + str(int(t)); S = np.zeros((len(F), N)); exec(body); Ss.append(S.copy())
S3 = np.stack(Ss, 1)                       # frames x tilts x yaws
K, NT = len(F), len(TL); ang = np.arange(N) * 2 * np.pi / N
DY = np.abs((ang[:, None] - ang[None, :] + np.pi) % (2 * np.pi) - np.pi); PY = LY * (DY / (np.pi / 2)) ** 2
tl = np.array(TL); PT = LT * (np.abs(tl[:, None] - tl[None, :]) / 45.0) ** 2
P = PT[:, None, :, None] + PY[None, :, None, :]            # (t_prev, y_prev, t, y)
V = S3[0].copy(); B = np.zeros((K, NT, N, 2), int)
for i in range(1, K):
    M = V[:, :, None, None] - P; flat = M.reshape(NT * N, NT, N); arg = flat.argmax(0); B[i, ..., 0] = arg // N; B[i, ..., 1] = arg % N; V = flat.max(0) + S3[i]
t_, y_ = np.unravel_index(V.argmax(), V.shape); path = [(t_, y_)]
for i in range(K - 1, 0, -1): t_, y_ = B[i, t_, y_]; path.append((t_, y_))
path = path[::-1]; yaw = np.unwrap(ang[[p[1] for p in path]])
out = {str(f): [TL[p[0]], float(y)] for f, p, y in zip(F, path, yaw)}
json.dump(out, open(os.path.join(HERE, f'{CHAR}_pose_solved.json'), 'w'))
print(' '.join(f'{f}:{int(TL[p[0]])}/{int(np.degrees(ang[p[1]]))}' for f, p in list(zip(F, path))[::2]))
print('mean chosen %.2f ; fixed-tilt(-36) best path would score ~%.2f' % (np.mean([S3[i, p[0], p[1]] for i, p in enumerate(path)]), S3[:, TL.index(-36.0) if -36.0 in TL else 0, :].max(1).mean()))
