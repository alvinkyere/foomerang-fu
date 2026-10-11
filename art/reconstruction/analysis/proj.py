"""Shared projection helpers for solved cameras (analysis/camera_take{A,B}.json for market_plaza, camera_<map>.json for other maps). World: X right, Y away, Z up; units = reference camera height.
 plane_H(take, frame, z) -> 3x3 matrix mapping world (X, Y, 1) on the plane Z=z to image pixels (640x360)."""
import json, os, numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__))
_CAM = {}
def cam(take):
    if take not in _CAM:
        fn = os.path.join(HERE, f'camera_take{take}.json')          # plaza takes 'A' / 'B'; other maps: camera_<map>.json
        if not os.path.exists(fn): fn = os.path.join(HERE, f'camera_{take}.json')
        c = json.load(open(fn)); _CAM[take] = (c, {p['frame']: p for p in c['poses']})
    return _CAM[take]
def Rt(take, frame):
    c, P = cam(take); p = P[frame]; th = np.radians(p['pitch_deg']); yaw = np.radians(p['yaw_deg']); roll = np.radians(p['roll_deg']); C = np.array(p['C'])
    s, co = np.sin(th), np.cos(th); R0 = np.array([[1, 0, 0], [0, -s, -co], [0, co, -s]]); cy, sy = np.cos(yaw), np.sin(yaw)
    Rz = np.array([[cy, sy, 0], [-sy, cy, 0], [0, 0, 1]]); cr, sr = np.cos(roll), np.sin(roll); Rr = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    R = Rr @ R0 @ Rz; return R, -R @ C
def K(take):
    c = cam(take)[0]; f = c['f']; return np.array([[f, 0, c.get('cx', 320.0)], [0, f, c.get('cy', 180.0)], [0, 0, 1.]])
def plane_H(take, frame, z=0.0):
    R, t = Rt(take, frame); return K(take) @ np.column_stack([R[:, 0], R[:, 1], R[:, 2] * z + t])
def canvas(S, X0, Y1): return np.array([[S, 0, -X0 * S], [0, -S, Y1 * S], [0, 0, 1.]])
def rectify(img, take, frame, z, S, X0, X1, Y0, Y1, interp=cv2.INTER_CUBIC):
    W, H = int((X1 - X0) * S), int((Y1 - Y0) * S); M = canvas(S, X0, Y1) @ np.linalg.inv(plane_H(take, frame, z))
    return cv2.warpPerspective(img, M, (W, H), flags=interp), cv2.warpPerspective(np.full(img.shape[:2], 255, np.uint8), M, (W, H), flags=cv2.INTER_NEAREST) > 0
def median_texture(frames_dir, take, frames, z, S, box):
    X0, X1, Y0, Y1 = box; st = []; ms = []
    for f in frames:
        im = cv2.imread(f'{frames_dir}/f{f:04d}.png'); r, m = rectify(im, take, f, z, S, X0, X1, Y0, Y1); st.append(r.astype(np.float32)); ms.append(m)
    st = np.array(st); ms = np.array(ms); a = np.where(ms[..., None], st, np.nan)
    with np.errstate(all='ignore'): med = np.nanmedian(a, axis=0)
    return np.nan_to_num(med, nan=0).astype(np.uint8), ms.sum(0)
