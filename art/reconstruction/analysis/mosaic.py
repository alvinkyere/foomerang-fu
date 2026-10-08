"""Median ground mosaic of a shot through a solved camera (proj.py key): the sharpness of static ground detail is the visual check
of the camera track (misregistered frames smear it).  python mosaic.py <frames_dir> <camera_key> <first> <last> <step> <out.png> [width]"""
import sys, cv2, numpy as np
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__))); from proj import plane_H, rectify, cam
FD, KEY = sys.argv[1], sys.argv[2]; fr = [f for f in range(int(sys.argv[3]), int(sys.argv[4]) + 1, int(sys.argv[5])) if f in cam(KEY)[1]]
OUT = sys.argv[6]; WID = int(sys.argv[7]) if len(sys.argv) > 7 else 1100
pts = []
for f in fr:
    q = np.linalg.inv(plane_H(KEY, f, 0)) @ np.array([[0, 0, 1], [640, 0, 1], [0, 360, 1], [640, 360, 1]], float).T; pts.append((q[:2] / q[2]).T)
pts = np.vstack(pts); X0, Y0 = pts.min(0); X1, Y1 = pts.max(0); S = WID / (X1 - X0); st, ms = [], []
for f in fr:
    r, m = rectify(cv2.imread(f'{FD}/f{f:04d}.png'), KEY, f, 0, S, X0, X1, Y0, Y1); st.append(r.astype(np.float32)); ms.append(m)
with np.errstate(all='ignore'): med = np.nanmedian(np.where(np.array(ms)[..., None], np.array(st), np.nan), 0)
cv2.imwrite(OUT, np.nan_to_num(med).astype(np.uint8)); print('mosaic', OUT, 'plan box', [round(v, 3) for v in (X0, X1, Y0, Y1)], 'px/unit', round(S, 1))
