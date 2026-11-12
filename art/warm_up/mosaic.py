"""The warm-up's mosaic (2026-11-12): the warm-up round of foomerang-fu physics hq.mp4 (0-28 s) has a following camera, so no
in), so no one frame shows the whole court. Every 10th frame (159) is laid onto the READY frame (121.5 s; output/reference.png) by a
SIFT homography (to its neighbour, chained, or straight to the READY frame where they share 150+ matches), and the mosaic is each
pixel's median over the frames that see it (the players, their trails, READY gone). Local only (output/, git-ignored): it is for
measuring and comparing, never shipped. Writes output/frames/, output/H.json, output/reference.png, output/mosaic.png (its (0, 0) is
the READY frame's (-163, -81): measure.MOSAIC_ORIGIN). ~10 minutes; mind the memory (8 GB: the median is done in strips).

  python art/temple_court/mosaic.py      (from the repository root; the Python of art/audio/output/venv)
"""
import glob, json, os, warnings
import numpy as np, cv2
warnings.filterwarnings('ignore')
O = 'art/warm_up/output/'; os.makedirs(O + 'frames', exist_ok=True)
c = cv2.VideoCapture('foomerang-fu physics hq.mp4'); c.set(cv2.CAP_PROP_POS_FRAMES, 0); i = 0
while i < int(28.0 * 60):
    ok, f = c.read()
    if i % 10 == 0: cv2.imwrite(O + 'frames/%05d.png' % i, f)
    i += 1
fs = sorted(glob.glob(O + 'frames/*.png'))
cv2.imwrite(O + 'reference.png', cv2.imread(O + 'frames/00000.png'))
sift = cv2.SIFT_create(4000); mask = np.full((1080, 1920), 255, np.uint8); mask[80:400, 0:230] = 0       # (not the players' names)
F = [sift.detectAndCompute(cv2.imread(f, 0), mask) for f in fs]
bf = cv2.BFMatcher()


def homography(a, b):
    m = bf.knnMatch(a[1], b[1], k=2); good = [x for x, y in m if x.distance < 0.7 * y.distance]
    if len(good) < 30: return None, 0
    p = np.float32([a[0][x.queryIdx].pt for x in good]); q = np.float32([b[0][x.trainIdx].pt for x in good])
    h, inl = cv2.findHomography(p, q, cv2.RANSAC, 3.0); return h, int(inl.sum())


ref = next(k for k, f in enumerate(fs) if f.endswith('00000.png')); Hs = {ref: np.eye(3)}
for k in list(range(ref + 1, len(fs))) + list(range(ref - 1, -1, -1)):
    nb = k - 1 if k > ref else k + 1
    h, n = homography(F[k], F[nb])
    if h is None: continue
    Hs[k] = Hs[nb] @ h
    h2, n2 = homography(F[k], F[ref])
    if h2 is not None and n2 > 150: Hs[k] = h2
json.dump({os.path.basename(fs[k]): Hs[k].tolist() for k in Hs}, open(O + 'H.json', 'w'))
x0, y0, x1, y1 = -120, -80, 2040, 1160; W, Hh = x1 - x0, y1 - y0
ims = {k: cv2.imread(fs[k]) for k in Hs}
out = np.zeros((Hh, W, 3), np.uint8); STR = 96
for ys in range(0, Hh, STR):
    T = np.array([[1, 0, -x0], [0, 1, -y0 - ys], [0, 0, 1]], float); st = []
    for k, h in Hs.items():
        v = cv2.warpPerspective(np.full((1080, 1920), 255, np.uint8), T @ h, (W, STR), flags=cv2.INTER_NEAREST) > 0
        if not v.any(): continue
        w = cv2.warpPerspective(ims[k], T @ h, (W, STR)).astype(np.float32); w[~v] = np.nan; st.append(w)
    out[ys:ys + STR] = np.nan_to_num(np.nanmedian(np.stack(st), 0))[:Hh - ys]
cv2.imwrite(O + 'mosaic.png', out); print('mosaic of', len(Hs), 'frames')
