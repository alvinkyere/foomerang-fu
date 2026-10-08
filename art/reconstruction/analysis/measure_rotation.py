"""MEASURE the rotation of a ground-plane prop about a pivot (sky_islands' croissant, twin_log_rink's logs): every frame of a tracked
window is rectified on the prop's plane around the pivot, the prop's colour mask is found, and the angle of its principal axis
(or of its centroid, for a crescent) about the pivot is unwrapped over time; a line fit gives deg/frame (+ = counter-clockwise seen
from above). python measure_rotation.py <frames_dir> <camera_key> <first> <last> <pivot_x> <pivot_y> <z> <radius> <hue_lo> <hue_hi> [axis|centroid]"""
import sys, os, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proj import rectify, cam
FD, KEY = sys.argv[1], sys.argv[2]; F0, F1 = int(sys.argv[3]), int(sys.argv[4]); cx, cy, z, r = map(float, sys.argv[5:9]); lo, hi = int(sys.argv[9]), int(sys.argv[10])
MODE = sys.argv[11] if len(sys.argv) > 11 else 'axis'; S = 2000.0; box = (cx - r, cx + r, cy - r, cy + r); fr, ang = [], []
for f in range(F0, F1 + 1):
    if f not in cam(KEY)[1]: continue
    im, m = rectify(cv2.imread(f'{FD}/f{f:04d}.png'), KEY, f, z, S, *box); h = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    b = ((h[..., 0] >= lo) & (h[..., 0] <= hi) & (h[..., 1] > 50) & (h[..., 2] > 110) & m).astype(np.uint8)
    k = cv2.connectedComponentsWithStats(b)
    if k[0] < 2: continue
    i = 1 + int(np.argmax(k[2][1:, cv2.CC_STAT_AREA])); ys, xs = np.nonzero(k[1] == i)
    if len(xs) < 150: continue
    X = xs / S + box[0] - cx; Y = box[3] - ys / S - cy
    if MODE == 'centroid': a = np.degrees(np.arctan2(Y.mean(), X.mean()))
    else:          # a log through the pivot: the direction from the pivot to the far end of its principal axis
        far = np.argmax(X * X + Y * Y); a = np.degrees(np.arctan2(Y[far], X[far]))
    fr.append(f); ang.append(a)
a = np.degrees(np.unwrap(np.radians(np.array(ang)))); fr = np.array(fr); p = np.polyfit(fr, a, 1)
print(f'frames {len(fr)}: {p[0]:+.3f} deg/frame = {p[0] * 30:+.1f} deg/s (period {360 / abs(p[0] * 30):.2f} s), residual {np.std(a - np.polyval(p, fr)):.1f} deg')
