"""Measure the height of raised flat tops from PARALLAX between take A (static camera) and take B (dollied camera).
 A texture captured from A at assumed height z and re-projected into B only lines up with B when z is the true height.
 python height_fit.py <frames_dir>"""
import sys, json, cv2, numpy as np
from proj import *
fd = sys.argv[1]
def lab_mask(img, rgb, tol):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32); c = cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32); return np.linalg.norm(lab - c, axis=2) < tol
def fit(name, box, rgb, tol, zs, bframes):
    S = 500; X0, X1, Y0, Y1 = box; A = list(range(203, 264, 4)); res = {}
    for z in zs:
        tex, _ = median_texture(fd, 'A', A, z, S, box); err = []
        for f in bframes:
            Hb = canvas(S, X0, Y1) @ np.linalg.inv(plane_H('B', f, z))       # image(B) -> plane canvas ... we want plane canvas -> image(B): invert
            im = cv2.imread(f'{fd}/f{f:04d}.png'); back = cv2.warpPerspective(tex, np.linalg.inv(Hb), (640, 360), flags=cv2.INTER_LINEAR)
            vis = cv2.warpPerspective(np.full(tex.shape[:2], 255, np.uint8), np.linalg.inv(Hb), (640, 360)) > 0
            m = lab_mask(back, rgb, tol) & vis & lab_mask(im, rgb, tol * 1.4)
            sel = (lab_mask(back, rgb, tol) & vis) | (lab_mask(im, rgb, tol) & vis & cv2.dilate(lab_mask(back, rgb, tol).astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool))
            inter = (lab_mask(back, rgb, tol) & lab_mask(im, rgb, tol) & vis).sum(); uni = (lab_mask(back, rgb, tol) & vis | lab_mask(im, rgb, tol) & vis & sel).sum()
            err.append(1 - inter / max(uni, 1))
        res[z] = float(np.mean(err))
    best = min(res, key=res.get); print(name, {round(k, 3): round(v, 3) for k, v in res.items()}, '-> best z (units) %.3f = %.1f BU' % (best, best * 100)); return best
out = {}
# left axis-aligned stall roof (visible in A and in the first B frames): world box around it
roofbox = (-0.50, -0.26, 0.52, 0.76)
out['roof'] = fit('roof', roofbox, (217, 96, 77), 22, [z / 100 for z in range(2, 15)], [264, 270, 276, 282, 288])
canbox = (-0.12, 0.30, 0.38, 0.60)
out['canopy'] = fit('canopy', canbox, (243, 151, 93), 24, [z / 1000 for z in range(-5, 40, 5)], [264, 270, 276, 282, 288])
json.dump(out, open('heights.json', 'w')); print(out)
