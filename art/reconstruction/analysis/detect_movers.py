"""Detect moving things (characters, boomerangs, VFX) in a shot: compensate camera motion with the tracked ground homographies and
 threshold the residual against the previous and next frame (a mover must differ from BOTH); raised objects shift only slightly.
 python detect_movers.py <frames_dir> <track.npz> <out.json>"""
import sys, json, cv2, numpy as np
fd = sys.argv[1]; T = np.load(sys.argv[2]); fr = [int(x) for x in T['frames']]; H = {f: h for f, h in zip(fr, T['H'])}
def img(i): return cv2.GaussianBlur(cv2.imread(f'{fd}/f{i:04d}.png'), (0, 0), 0.8)
def warp_to(i, j):   # frame j -> frame i coordinates
    return cv2.warpPerspective(img(j), np.linalg.inv(H[i]) @ H[j], (640, 360), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
out = {}
for t in fr[2:-2]:
    cur = img(t); a = cv2.absdiff(cur, warp_to(t, t - 2)).max(2); b = cv2.absdiff(cur, warp_to(t, t + 2)).max(2)
    m = (np.minimum(a, b) > 38).astype(np.uint8) * 255; m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m); blobs = []
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if 14 <= area <= 1500:
            col = cur[lab == k].mean(0)[::-1]; blobs.append(dict(x=float(cen[k][0]), y=float(cen[k][1]), w=int(w), h=int(h), area=int(area), rgb=[int(c) for c in col]))
    out[t] = blobs
json.dump(out, open(sys.argv[3], 'w')); print('frames', len(out), 'mean blobs/frame', np.mean([len(v) for v in out.values()]))
