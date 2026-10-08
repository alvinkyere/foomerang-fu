"""Per-frame camera pose from the tracked ground homographies with FIXED intrinsics (fixed lens hypothesis).
 f and the reference pitch come from analysis (plane self-calibration + fountain ellipse aspect + pavilion face visibility).
 Units: 1 = the reference frame's camera height above the ground. World: X right, Y away from the viewer, Z up (ground Z=0).
FOO_FIX_ROT=1: orientation locked (pitch = pitch0, yaw = roll = 0), only the camera position is solved — for translating (panning)
 cameras. Then a wrong (f, pitch) cannot be absorbed by rotation, so the residual becomes a calibration criterion.
python solve_pose_fixedK.py <track.npz> <f> <pitch0_deg> <out.json>"""
import sys, json, numpy as np
from scipy.optimize import least_squares
import os; FIX = os.environ.get('FOO_FIX_ROT') == '1'
T = np.load(sys.argv[1]); fr = [int(x) for x in T['frames']]; H = T['H']
f = float(sys.argv[2]); th0 = np.radians(float(sys.argv[3])); cx, cy = 320.0, 180.0
K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1.0]]); Ki = np.linalg.inv(K)
def Rt_from(th, C, yaw=0.0, roll=0.0):
    # world -> camera: pitch th below horizontal, optional yaw (about world Z) and roll (about the optical axis)
    c, s = np.cos(th), np.sin(th); R0 = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]])
    cy_, sy_ = np.cos(yaw), np.sin(yaw); Rz = np.array([[cy_, sy_, 0], [-sy_, cy_, 0], [0, 0, 1.0]])
    cr, sr = np.cos(roll), np.sin(roll); Rr = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1.0]])
    R = Rr @ R0 @ Rz; return R, -R @ np.asarray(C, float)
def M_of(p):
    th, yaw, roll, x, y, h = p; R, t = Rt_from(th, (x, y, h), yaw, roll); return K @ np.column_stack([R[:, 0], R[:, 1], t])
M0 = M_of([th0, 0, 0, 0, 0, 1.0])
grid = np.array([[x, y, 1.0] for x in np.linspace(20, 620, 7) for y in np.linspace(20, 340, 5)])
poses = []; prev = np.array([th0, 0, 0, 0, 0, 1.0]); errs = []
for t, Ht in zip(fr, H):
    target = (np.linalg.inv(Ht) @ M0)                 # ground (X,Y,1) -> image of frame t, up to scale
    pts = grid @ np.linalg.inv(M0).T; pts /= pts[:, 2:3]          # ground points seen by the reference camera on the grid
    img_t = (np.linalg.inv(Ht) @ grid.T).T; img_t /= img_t[:, 2:3]  # where those ground points are in frame t (via the tracked homography)
    def res(p):
        if FIX: p = np.r_[th0, 0.0, 0.0, p[-3:]]
        M = M_of(p); q = (M @ pts.T).T; q /= q[:, 2:3]; return (q[:, :2] - img_t[:, :2]).ravel()
    if FIX:
        r = least_squares(res, prev[3:], x_scale=[0.3, 0.3, 0.3], bounds=([-20, -20, 0.1], [20, 20, 20])); r.x = np.r_[th0, 0.0, 0.0, r.x]
    else:
        r = least_squares(res, prev, x_scale=[0.1, 0.1, 0.1, 0.3, 0.3, 0.3], bounds=([0.2, -0.6, -0.6, -20, -20, 0.1], [1.5, 0.6, 0.6, 20, 20, 20]))
    prev = r.x; errs.append(float(np.sqrt(np.mean(r.fun ** 2)))); th, yaw, roll, x, y, h = r.x
    poses.append(dict(frame=t, pitch_deg=float(np.degrees(th)), yaw_deg=float(np.degrees(yaw)), roll_deg=float(np.degrees(roll)), C=[float(x), float(y), float(h)]))
for i in range(0, len(fr), 12):
    q = poses[i]; print(fr[i], 'pitch %.1f yaw %.2f roll %.2f  C(%.3f, %.3f, h=%.3f)  reproj rms %.2f px' % (q['pitch_deg'], q['yaw_deg'], q['roll_deg'], *q['C'], errs[i]))
print('worst reprojection rms over the ground grid: %.2f px, mean %.2f px' % (max(errs), np.mean(errs)))
json.dump(dict(f=f, cx=cx, cy=cy, pitch0_deg=float(np.degrees(th0)), poses=poses, reproj_rms=errs), open(sys.argv[4], 'w'), indent=1)
