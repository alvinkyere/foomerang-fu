"""Track characters through a shot by template matching in the camera-STABILISED ground-plan view (camera motion removed, so a mover's
 plan position is its ground position up to the small height offset of its centre).  Seeds are (frame, image x, image y).
 python track_chars.py <frames_dir> <camera.json> <out.json>"""
import sys, json, cv2, numpy as np
fd, camf, out = sys.argv[1:4]; cam = json.load(open(camf)); poses = {p['frame']: p for p in cam['poses']}; F0, F1 = min(poses), max(poses) - 3
S, X0, Y1 = 500.0, -0.6, 1.3; W, Hh = 950, 800
Tplan = np.array([[S, 0, -X0 * S], [0, -S, Y1 * S], [0, 0, 1.]])
def M(p):
    f = cam['f']; K = np.array([[f, 0, 320], [0, f, 180], [0, 0, 1.]]); th = np.radians(p['pitch_deg']); yaw = np.radians(p['yaw_deg']); roll = np.radians(p['roll_deg']); C = np.array(p['C'])
    c, s = np.cos(th), np.sin(th); R0 = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]]); cy_, sy_ = np.cos(yaw), np.sin(yaw); Rz = np.array([[cy_, sy_, 0], [-sy_, cy_, 0], [0, 0, 1]]); cr, sr = np.cos(roll), np.sin(roll); Rr = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    R = Rr @ R0 @ Rz; return K @ np.column_stack([R[:, 0], R[:, 1], -R @ C])
HP = {t: Tplan @ np.linalg.inv(M(poses[t])) for t in range(F0, F1 + 1)}            # image -> plan
def plan(t): return cv2.warpPerspective(cv2.imread(f'{fd}/f{t:04d}.png'), HP[t], (W, Hh), flags=cv2.INTER_CUBIC)
SEEDS = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}
res = {}
for name, (t0, x, y, half) in SEEDS.items():
    p = HP[t0] @ np.array([x, y, 1.0]); p /= p[2]; cx, cy = p[0], p[1]
    tmpl = None; track = {}; last = (cx, cy)
    for direction in (1, -1):
        cx, cy = last = (p[0], p[1]); tmpl = None
        for t in (range(t0, F1 + 1) if direction == 1 else range(t0 - 1, F0 - 1, -1)):
            pl = plan(t); 
            if tmpl is None:
                tmpl = pl[int(cy - half):int(cy + half), int(cx - half):int(cx + half)].copy(); track[t] = (cx, cy, 1.0); continue
            sw = 22; x0, y0 = int(cx - half - sw), int(cy - half - sw); win = pl[max(0, y0):int(cy + half + sw), max(0, x0):int(cx + half + sw)]
            r = cv2.matchTemplate(win, tmpl, cv2.TM_CCOEFF_NORMED); _, mx, _, loc = cv2.minMaxLoc(r)
            nx, ny = max(0, x0) + loc[0] + half, max(0, y0) + loc[1] + half
            if mx > 0.35: cx, cy = nx, ny; tmpl = cv2.addWeighted(tmpl, 0.6, pl[int(cy - half):int(cy + half), int(cx - half):int(cx + half)], 0.4, 0)
            track[t] = (cx, cy, float(mx))
    res[name] = {int(t): dict(plan=[v[0], v[1]], score=v[2], world=[v[0] / S + X0, Y1 - v[1] / S]) for t, v in sorted(track.items())}
    print(name, 'frames', len(track), 'mean score %.2f' % np.mean([v[2] for v in track.values()]))
json.dump(res, open(out, 'w'))
