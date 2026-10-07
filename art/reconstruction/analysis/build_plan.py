"""Median ground-plan view of a shot in the shared WORLD frame (analysis aid only; never used at runtime).
 python build_plan.py <camera.json> <frames_dir> <first> <last> <step> <S> <X0> <X1> <Y0> <Y1> <out.png>"""
import sys, json, cv2, numpy as np
cam = json.load(open(sys.argv[1])); fd = sys.argv[2]; a, b, st = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]); S, X0, X1, Y0, Y1 = map(float, sys.argv[6:11]); out = sys.argv[11]
poses = {p['frame']: p for p in cam['poses']}; W, Hh = int((X1 - X0) * S), int((Y1 - Y0) * S); Tp = np.array([[S, 0, -X0 * S], [0, -S, Y1 * S], [0, 0, 1.]])
def M(p):
    f = cam['f']; K = np.array([[f, 0, 320], [0, f, 180], [0, 0, 1.]]); th = np.radians(p['pitch_deg']); yaw = np.radians(p['yaw_deg']); roll = np.radians(p['roll_deg']); C = np.array(p['C'])
    c, s = np.cos(th), np.sin(th); R0 = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]]); cy_, sy_ = np.cos(yaw), np.sin(yaw); Rz = np.array([[cy_, sy_, 0], [-sy_, cy_, 0], [0, 0, 1]]); cr, sr = np.cos(roll), np.sin(roll); Rr = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    R = Rr @ R0 @ Rz; return K @ np.column_stack([R[:, 0], R[:, 1], -R @ C])
stack = []; masks = []
for t in range(a, b + 1, st):
    Ht = Tp @ np.linalg.inv(M(poses[t])); stack.append(cv2.warpPerspective(cv2.imread(f'{fd}/f{t:04d}.png'), Ht, (W, Hh), flags=cv2.INTER_AREA)); masks.append(cv2.warpPerspective(np.full((360, 640), 255, np.uint8), Ht, (W, Hh), flags=cv2.INTER_NEAREST) > 0)
stack = np.array(stack).astype(np.float32); masks = np.array(masks); st_ = np.where(masks[..., None], stack, np.nan)
med = np.nan_to_num(np.nanmedian(st_, axis=0), nan=0).astype(np.uint8); cv2.imwrite(out, med); print('plan', W, Hh)
