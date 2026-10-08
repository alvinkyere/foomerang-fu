"""Camera track for a TRANSLATING camera (fixed orientation, calibrated K) — the harbour_fort shot pans without rotating.
Each frame is rectified onto the ground plane with the nominal camera (C = (0, 0, 1), pitch, yaw = roll = 0); a camera at
C_t = (x, y, h) then sees the plan shifted by (x, y) and scaled by h, so consecutive rectified frames differ by a similarity
transform without rotation. Registration is ECC (affine, then projected onto scale + shift) against KEYFRAMES rather than the
previous frame, so drift accumulates per keyframe hop, not per frame. Water (animated) and saturated character colours are
masked out. Output uses the analysis/camera_take?.json pose format, so proj.py serves it as camera '<key>'.
FOO_FIXED_HEIGHT=1: the camera keeps its height (no zoom) — use when object sizes are constant across the shot (measured, e.g.
 harbour_fort crates 43 vs 42 px at f655 / f815); the registration is then translation-only, which removes the scale / y-shift
 ambiguity over large uniform floors.
python track_pan.py <frames_dir> <first> <last> <f> <pitch_deg> <out.json>"""
import sys, os, json, cv2, numpy as np
FIXED_H = os.environ.get('FOO_FIXED_HEIGHT') == '1'
RELIABLE = float(os.environ.get('FOO_RELIABLE_ECC', '0.5'))
MASK_HUE = tuple(int(v) for v in os.environ['FOO_TRACK_HUE'].split(',')) if os.environ.get('FOO_TRACK_HUE') else None          # OpenCV hue range
FD = sys.argv[1]; F0, F1 = int(sys.argv[2]), int(sys.argv[3]); f = float(sys.argv[4]); th = np.radians(float(sys.argv[5])); OUT = sys.argv[6]
K = np.array([[f, 0, 320], [0, f, 180], [0, 0, 1.0]]); s, c = np.sin(th), np.cos(th); R = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]])
Hn = K @ np.column_stack([R[:, 0], R[:, 1], -R @ np.array([0, 0, 1.0])])          # ground (X, Y, 1) -> image, nominal camera
cs = np.linalg.inv(Hn) @ np.array([[0, 0, 1], [640, 0, 1], [0, 360, 1], [640, 360, 1]], float).T; cs = cs[:2] / cs[2]
X0, X1, Y0, Y1 = cs[0].min(), cs[0].max(), cs[1].min(), cs[1].max(); S = 640.0 / (X1 - X0)          # plan px per unit of camera height
A = np.array([[S, 0, -X0 * S], [0, -S, Y1 * S], [0, 0, 1.0]]); W, Hh = int((X1 - X0) * S), int((Y1 - Y0) * S); M = A @ np.linalg.inv(Hn)
def rect(fr):
    im = cv2.imread(f'{FD}/f{fr:04d}.png'); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    bad = ((hsv[..., 0] > 85) & (hsv[..., 0] < 115) & (hsv[..., 1] > 60)) | (hsv[..., 1] > 170)        # water / saturated movers
    if MASK_HUE is not None:          # register only on one surface class (e.g. sky_islands' grass tops: the cliffs and void below
        lo_, hi_ = MASK_HUE           # them carry strong parallax against the ground plane)
        bad |= ~((hsv[..., 0] >= lo_) & (hsv[..., 0] <= hi_) & (hsv[..., 1] > 60))
    ok = cv2.erode((~bad).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    g = cv2.warpPerspective(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), M, (W, Hh), flags=cv2.INTER_LINEAR).astype(np.float32)
    m = cv2.warpPerspective(ok, M, (W, Hh), flags=cv2.INTER_NEAREST); return cv2.GaussianBlur(g, (0, 0), 1.0), m
def reg(a, b, guess):
    """similarity (scale k, shift) mapping plan coords of frame b into keyframe a: a(k*u + t) = b(u); returns 2x3.
    a, b = (image, mask); ECC with template b and input a finds exactly that warp (a's mask marks a's valid pixels)."""
    warp = guess.astype(np.float32).copy()
    try: _, warp = cv2.findTransformECC(b[0], a[0], warp, cv2.MOTION_TRANSLATION if FIXED_H else cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), a[1], 5)
    except cv2.error: return guess, 0.0
    k = 0.5 * (warp[0, 0] + warp[1, 1]); warp[:, :2] = [[k, 0], [0, k]]
    ww = cv2.warpAffine(a[0], warp, (W, Hh), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP); v = (b[1] > 0) & (ww > 0)
    cc = float(np.corrcoef(ww[v], b[0][v])[0, 1]) if v.sum() > 1000 else 0.0; return warp, cc
G = {}          # frame -> 2x3 similarity mapping its plan coords (px) into the first frame's plan coords
kf = F0; kimg = rect(F0); G[F0] = np.array([[1, 0, 0], [0, 1, 0]], np.float32); last = G[F0].copy(); ccs = {F0: 1.0}
def compose(Ga, Gb): return (np.vstack([Ga, [0, 0, 1]]) @ np.vstack([Gb, [0, 0, 1]]))[:2].astype(np.float32)
for fr in range(F0 + 1, F1 + 1):
    b = rect(fr); rel_guess = compose(np.linalg.inv(np.vstack([G[kf], [0, 0, 1]]))[:2], last)
    rel, cc = reg(kimg, b, rel_guess); shift = np.hypot(rel[0, 2], rel[1, 2])
    G[fr] = compose(G[kf], rel); last = G[fr]; ccs[fr] = cc
    if cc < RELIABLE: continue          # a weak match (effects, a rotating hazard) never becomes a keyframe; interpolated below
    if shift > 0.35 * W or cc < 0.6: kf, kimg = fr, b          # new keyframe once the overlap shrinks (or matching weakens)
# frames whose match was weak take their transform interpolated between the nearest reliable frames
good = [k for k in range(F0, F1 + 1) if ccs[k] >= RELIABLE]
for k in range(F0, F1 + 1):          # (not `f`: that is the focal length)
    if ccs[k] >= RELIABLE: continue
    lo = max([g for g in good if g < k], default=None); hi = min([g for g in good if g > k], default=None)
    if lo is None or hi is None: G[k] = G[lo if hi is None else hi]; continue
    t = (k - lo) / (hi - lo); G[k] = ((1 - t) * G[lo] + t * G[hi]).astype(np.float32)
print('weak matches interpolated:', F1 - F0 + 1 - len(good))
poses = []
for fr in range(F0, F1 + 1):
    g = G[fr]; k = 0.5 * (g[0, 0] + g[1, 1]); t = g[:, 2]
    # plan px u of frame fr sits at k*u + t in frame F0's plan px; px -> world: X = X0 + u/S, Y = Y1 - v/S
    x = t[0] / S + X0 * (1 - k); y = -(t[1] / S) + Y1 * (1 - k)
    poses.append(dict(frame=fr, pitch_deg=float(np.degrees(th)), yaw_deg=0.0, roll_deg=0.0, C=[float(x), float(y), float(k)], ecc=round(ccs[fr], 4)))
json.dump(dict(f=f, cx=320.0, cy=180.0, model='translating camera, orientation fixed (track_pan.py)', poses=poses), open(OUT, 'w'), indent=1)
e = np.array([p['ecc'] for p in poses]); print('frames', len(poses), 'ecc median %.3f min %.3f' % (np.median(e), e.min()),
      'C first', poses[0]['C'], 'last', [round(v, 3) for v in poses[-1]['C']], 'h range %.3f-%.3f' % (min(p['C'][2] for p in poses), max(p['C'][2] for p in poses)))
