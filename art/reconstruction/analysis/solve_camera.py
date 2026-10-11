"""Plane-based self-calibration from the tracked ground homographies.
 Unknowns: focal f_t per frame (pixels; square pixels, principal point at the image centre), and the pose of the reference frame
 (pitch, roll=0, yaw=0, height=1: the ground-plane unit is the reference camera height).
 M_t = H_t^-1 M_ref ; K_t^-1 M_t = [r1 r2 t]-ish: r1 . r2 = 0 and |r1| = |r2| must hold for every frame.
python solve_camera.py <track.npz> <out.json> [last_frame]"""
import sys, json, numpy as np
from scipy.optimize import least_squares
T = np.load(sys.argv[1]); fr = list(T['frames']); H = T['H']
last = int(sys.argv[3]) if len(sys.argv) > 3 else fr[-1]
keep = [i for i, f in enumerate(fr) if f <= last]; fr = [fr[i] for i in keep]; H = H[keep]
cx, cy = 320.0, 180.0
def K(f): return np.array([[f, 0, cx], [0, f, cy], [0, 0, 1.0]])
def ref_M(f0, th):
    # camera at (0, -d*cos th, d*sin th)... use world: ground X right, Y away; camera height 1, pitch th below horizontal, at Y=0.
    c, s = np.cos(th), np.sin(th)
    R = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]])          # world -> camera (x right, y down, z forward), for a camera looking forward-down
    t = -R @ np.array([0, 0, 1.0])
    return K(f0) @ np.column_stack([R[:, 0], R[:, 1], t])
Hinv = [np.linalg.inv(h) for h in H]
def resid(p):
    f0, th = p[0], p[1]; fs = p[2:]
    M0 = ref_M(f0, th); out = []
    for G, f in zip(Hinv, fs):
        A = np.linalg.inv(K(f)) @ (G @ M0); a1, a2 = A[:, 0], A[:, 1]
        out += [np.dot(a1, a2) / (np.linalg.norm(a1) * np.linalg.norm(a2)), (np.linalg.norm(a1) - np.linalg.norm(a2)) / (np.linalg.norm(a1) + np.linalg.norm(a2))]
    return np.array(out)
best = None
for f_init in (1500, 3000, 6000, 12000):
    for th_init in (0.5, 0.7, 0.9, 1.1):
        p0 = np.array([f_init, th_init] + [f_init] * len(fr))
        r = least_squares(resid, p0, x_scale=np.array([f_init, 0.1] + [f_init] * len(fr)), bounds=([200, 0.2] + [200] * len(fr), [60000, 1.5] + [60000] * len(fr)))
        if best is None or r.cost < best.cost: best = r
p = best.x; f0, th = p[0], p[1]; fs = p[2:]
print('cost', best.cost, 'f0 %.0f px  pitch0 %.1f deg' % (f0, np.degrees(th)))
# poses: M_t = K_t [r1 r2 t] * lambda -> R, camera centre in ground units (reference camera height = 1)
poses = []
for G, f in zip(Hinv, fs):
    A = np.linalg.inv(K(f)) @ (G @ ref_M(f0, th)); lam = 2 / (np.linalg.norm(A[:, 0]) + np.linalg.norm(A[:, 1])); A = A * lam
    r1, r2, t = A[:, 0], A[:, 1], A[:, 2]; r3 = np.cross(r1, r2); R = np.column_stack([r1, r2, r3]); U, _, Vt = np.linalg.svd(R); R = U @ Vt
    C = -R.T @ t; pitch = np.degrees(np.arcsin(-R[2, 1] if False else R[2, 2] * 0 + (-R[1, 2]) * 0 + 0)) if False else np.degrees(np.arctan2(R[2, 1] * -1, R[1, 1] * 1))
    fwd = R[2, :]                                  # camera z axis in world coordinates
    poses.append(dict(f=float(f), C=C.tolist(), pitch_deg=float(np.degrees(np.arcsin(-fwd[2]))), yaw_deg=float(np.degrees(np.arctan2(fwd[0], fwd[1]))), height=float(C[2]),
                      roll_deg=float(np.degrees(np.arctan2(R[0, 2] * 0 + R[0, 0] * 0 + (R[0, 1]), 1)))))
for i in range(0, len(fr), max(1, len(fr) // 12)):
    q = poses[i]; print(fr[i], 'f %.0f  pitch %.1f  yaw %.1f  height %.3f  C(%.2f, %.2f)' % (q['f'], q['pitch_deg'], q['yaw_deg'], q['height'], q['C'][0], q['C'][1]))
json.dump(dict(frames=[int(x) for x in fr], f0=float(f0), pitch0=float(np.degrees(th)), poses=poses, residual=float(np.sqrt(2 * best.cost / len(best.fun)))), open(sys.argv[2], 'w'), indent=1)
print('rms residual', np.sqrt(2 * best.cost / len(best.fun)))
