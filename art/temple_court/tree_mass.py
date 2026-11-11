"""The temple court's three trees as the frame shows them (2026-11-11; owner: the HQ's cartoon look, "the trees"): ff physics hq 2.mp4
121.5 s (output/reference.png). Each crown's outline is the frame's leaf green (hue 34-52: not the planters' yellower soil) in its box,
on a 2 px grid; each pixel's camera ray meets the crown's fitted ellipsoid (fit_crowns.py) where it first enters it, or, past its
silhouette, the upright plane through its middle facing the camera: our own surface whose outline is the frame's (its leafy, jagged
edge). Its tones: the crown's pixels in four tones (k-means of its inside), the label map smoothed (7 px), each region one flat tone: the frame's
lit and shaded leaf masses traced, never its pixels. The trunks: their middle lines read by hand off the frame (each forks into two or
three arms), put back on the upright plane through the tree's foot. Writes tree_mass.json for blender/build.py.

  python art/temple_court/tree_mass.py       (after fit_crowns.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import least_squares
sys.path.insert(0, 'art/temple_court')
from measure import ref, Yc, R as _R, F as _F, C as _C, Z as _Z

STEP = 2
f = cv2.imread('art/temple_court/output/reference.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
leaf = (hsv[..., 0] >= 34) & (hsv[..., 0] <= 52) & (hsv[..., 1] >= 60)
L = json.load(open('art/temple_court/layout.json'))
BOXES = [(380, 40, 560, 240), (380, 235, 580, 440), (330, 560, 520, 720)]       # (fit_crowns.py's: each crown's own box)
# the trunks' middles (pixels), from the foot up; then each arm from where it leaves (frame 121.5 s, 2x crops)
TRUNKS = [[[(474, 305), (473, 270), (472, 235)], [(472, 238), (458, 210), (446, 185), (440, 170)], [(474, 240), (486, 222), (494, 200)]],
          [[(472, 505), (470, 470), (468, 440), (466, 410)]],
          [[(432, 775), (430, 740), (427, 705)], [(426, 708), (414, 698), (402, 690)], [(428, 706), (446, 700), (454, 690)]]]
FOOT_Z = 0.9                                                       # (the soil in the big planters)
cam = _C * 100


def ray(px, py):
    d = _R.T @ np.array([(px - 960) / (_F * _Z), (py - 540) / (_F * _Z), 1.0])
    return d / np.linalg.norm(d)


out = []
for k, (t, (x0, y0, x1, y1)) in enumerate(zip(L['trees'], BOXES)):
    cx, cy, cz = t['crown']; r, rz = t['r'], t['rz']
    m = np.zeros(leaf.shape, np.uint8); m[y0:y1, x0:x1] = leaf[y0:y1, x0:x1]
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    m = (lab == 1 + int(np.argmax(st[1:, 4]))) if n > 1 else m > 0
    inv = (~m).astype(np.uint8); nh, lh, sth, _ = cv2.connectedComponentsWithStats(inv)
    small = np.zeros(nh, bool); small[1:] = sth[1:, 4] < 300; m = m | small[lh]            # (the crown's small holes are crown)
    # tones
    # (clustered on the crown's inside only: its edge pixels are blended with the paving behind; each takes its nearest leaf tone)
    core = cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    _, _, cen = cv2.kmeans(np.float32(f[core]), 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 4, cv2.KMEANS_PP_CENTERS)
    allpx = np.float32(f[m]); lab_ = np.argmin(((allpx[:, None, :] - cen[None, :, :]) ** 2).sum(2), 1)
    lm = np.full(m.shape, 255, np.uint8); lm[m] = lab_; lm = cv2.medianBlur(lm, 7)
    # (a tone far paler than leaves is paving showing through the crown's thin edge in the frame: it takes the lightest leaf tone)
    leafy = [i for i in range(len(cen)) if cen[i].max() < 235]; light = max(leafy, key=lambda i: cen[i].sum())
    cen = np.array([c if i in leafy else cen[light] for i, c in enumerate(cen)])
    tones = ['#%02x%02x%02x' % tuple(int(v) for v in c[::-1]) for c in cen]
    # the surface: each grid pixel's ray into the ellipsoid (centre (cx, Yc + cy, cz), radii r, r, rz), else the plane through its middle
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = m[gy, gx]
    centre = np.array([cx, Yc + cy, cz]); view = ray(960, 540)
    verts, vt = [], []
    idx = -np.ones(gx.shape, int)
    for j, i in np.argwhere(ins):
        d = ray(gx[j, i], gy[j, i]); o = cam - centre
        s = np.array([1 / r, 1 / r, 1 / rz]); a = (d * s) @ (d * s); b = 2 * (o * s) @ (d * s); c = (o * s) @ (o * s) - 1
        disc = b * b - 4 * a * c
        if disc >= 0: tt = (-b - math.sqrt(disc)) / (2 * a)
        else: tt = ((centre - cam) @ view) / (d @ view)
        p = cam + d * tt
        idx[j, i] = len(verts); verts.append([round(float(p[0]), 3), round(float(p[1] - Yc), 3), round(float(p[2]), 3)])
        q = lm[gy[j, i], gx[j, i]]; vt.append(int(q if q != 255 else 0))
    faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; kk = [v for v in q if v >= 0]
            if len(kk) == 4: faces.append([int(v) for v in q])
            elif len(kk) == 3: faces.append([int(v) for v in kk])
    # the trunks: each pixel on the upright plane through the foot facing the camera (a hair behind the crown's plane)
    # (rising, the trunk leans back to the crown's middle: on the screen the same, in depth behind the crown's front, so the crown hides
    # it where the frame does)
    fx, fy = t['foot']; arms = []
    for arm in TRUNKS[k]:
        pts = []
        for u, v in arm:
            back = lambda z: fy + (cy - fy) * min(1.0, max(0.0, (z - FOOT_Z) / (cz - FOOT_Z)))
            q = np.array([fx, 3.0])
            for _ in range(3):      # (the plane depends on the height found: a few rounds settle it)
                yy = back(q[1]); q = least_squares(lambda p_: np.array(ref(p_[0], Yc + yy, p_[1])) - np.array((u, v)), q, diff_step=1e-3).x
            pts.append([round(float(q[0]), 3), round(float(back(q[1])), 3), round(max(FOOT_Z, float(q[1])), 3)])
        arms.append(pts)
    out.append(dict(verts=verts, faces=faces, tones=tones, tone=vt, arms=arms))
    print('tree', k, len(verts), 'verts,', len(faces), 'faces; tones', tones, '; arms', [len(a) for a in arms])
json.dump(out, open('art/temple_court/tree_mass.json', 'w'))
ov = f.copy()
for k, (x0, y0, x1, y1) in enumerate(BOXES): cv2.rectangle(ov, (x0, y0), (x1, y1), (0, 0, 255), 1)
cv2.imwrite('art/temple_court/output/tree_overlay.jpg', ov[0:860, 250:700])
