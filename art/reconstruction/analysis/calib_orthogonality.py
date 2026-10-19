"""Calibrate (focal, pitch) for a shot from ORTHOGONALITY: man-made maps are rectilinear, so in a correctly rectified ground plan the two
dominant line directions are 90 degrees apart and stay so across the shot. For each candidate (f, pitch) the per-frame poses are solved
(solve_pose_fixedK.py logic) and several frames are rectified; line segments (LSD) give a length-weighted orientation histogram whose two
peaks' separation is compared with 90 degrees.  python calib_orthogonality.py <frames> <track.npz> <out.json> [f_list] [pitch_list]"""
import sys, json, subprocess, os, cv2, numpy as np
FD, TR, OUT = sys.argv[1:4]
FS = [float(v) for v in (sys.argv[4] if len(sys.argv) > 4 else '600,750,900,1100,1400').split(',')]
PS = [float(v) for v in (sys.argv[5] if len(sys.argv) > 5 else '45,50,55,60,65').split(',')]
HERE = os.path.dirname(os.path.abspath(__file__)); PY = sys.executable
T = np.load(TR); fr = [int(x) for x in T['frames']]; sel = fr[::max(1, len(fr) // 6)][:6]
lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
def M_of(cam, p):
    f = cam['f']; K = np.array([[f, 0, 320], [0, f, 180], [0, 0, 1.]]); th = np.radians(p['pitch_deg']); yw = np.radians(p['yaw_deg']); rl = np.radians(p['roll_deg']); C = np.array(p['C'])
    c, s = np.cos(th), np.sin(th); R0 = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]]); Rz = np.array([[np.cos(yw), np.sin(yw), 0], [-np.sin(yw), np.cos(yw), 0], [0, 0, 1]]); Rr = np.array([[np.cos(rl), -np.sin(rl), 0], [np.sin(rl), np.cos(rl), 0], [0, 0, 1]])
    R = Rr @ R0 @ Rz; return K @ np.column_stack([R[:, 0], R[:, 1], -R @ C])
res = []
for f in FS:
    for pdeg in PS:
        tmp = f'/tmp/_calib_{os.getpid()}.json'
        subprocess.run([PY, os.path.join(HERE, 'solve_pose_fixedK.py'), TR, str(f), str(pdeg), tmp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        cam = json.load(open(tmp)); P = {p['frame']: p for p in cam['poses']}; errs = []; rms = float(np.mean(cam['reproj_rms']))
        for t in sel:
            Mt = M_of(cam, P[t]); S = 600.0
            # rectify around the frame's own ground footprint
            Hi = np.linalg.inv(Mt); cs = np.array([[0, 0, 1], [640, 0, 1], [0, 360, 1], [640, 360, 1]], float).T; g = Hi @ cs; g = g[:2] / g[2]
            x0, x1, y0, y1 = g[0].min(), g[0].max(), g[1].min(), g[1].max()
            if not np.isfinite([x0, x1, y0, y1]).all() or (x1 - x0) * (y1 - y0) * S * S > 4e6: continue
            A = np.array([[S, 0, -x0 * S], [0, -S, y1 * S], [0, 0, 1.]]); Wd, Hd = int((x1 - x0) * S), int((y1 - y0) * S)
            pl = cv2.warpPerspective(cv2.cvtColor(cv2.imread(f'{FD}/f{t:04d}.png'), cv2.COLOR_BGR2GRAY), A @ Hi, (Wd, Hd))
            L = lsd.detect(pl)[0]
            if L is None: continue
            L = L.reshape(-1, 4); ln = np.hypot(L[:, 2] - L[:, 0], L[:, 3] - L[:, 1]); keep = ln > 25; L, ln = L[keep], ln[keep]
            ang = np.degrees(np.arctan2(L[:, 3] - L[:, 1], L[:, 2] - L[:, 0])) % 180
            h, _ = np.histogram(ang, bins=180, range=(0, 180), weights=ln); h = np.convolve(np.r_[h[-3:], h, h[:3]], np.ones(5) / 5, 'same')[3:-3]
            a1 = int(h.argmax()); h2 = h.copy()
            for d in range(-20, 21): h2[(a1 + d) % 180] = 0
            a2 = int(h2.argmax()); sep = abs(a1 - a2) % 180; sep = min(sep, 180 - sep); errs.append(abs(90 - sep))
        res.append(dict(f=f, pitch=pdeg, ortho_err=float(np.mean(errs)) if errs else 99.0, reproj=rms)); print(res[-1], flush=True)
best = min(res, key=lambda r: (r['ortho_err'] + 0.5 * r['reproj']))
json.dump(dict(results=res, best=best), open(OUT, 'w'), indent=1); print('BEST', best)
