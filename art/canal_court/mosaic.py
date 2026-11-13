"""The canal court's mosaic (2026-11-12): the round of foomerang-fu physics hq.mp4 at 10:55 (653.3-675.0 s) has a following camera, so no
one frame shows the whole court. Every 10th frame is laid onto the READY frame (654.5 s; output/reference.png) by a SIFT homography (to
its neighbour, chained, or straight to the READY frame where they share 150+ matches), and the mosaic is each pixel's median over the
frames that see it (the players, their trails, READY gone). Local only (output/, git-ignored): it is for measuring and comparing, never
shipped. Writes output/frames/, output/H.json, output/reference.png, output/mosaic.png (its (0, 0) is the READY frame's MOSAIC_ORIGIN).
(After art/gong_court/mosaic.py.)

  python art/canal_court/mosaic.py      (from the repository root; the Python of art/audio/output/venv)
"""
import glob, json, os, warnings
import numpy as np, cv2
warnings.filterwarnings('ignore')
O = 'art/canal_court/output/'; os.makedirs(O + 'frames', exist_ok=True)
FPS = 59.999381405241095
T0, T1, REF = 653.3, 675.0, 654.5
c = cv2.VideoCapture('foomerang-fu physics hq.mp4'); i = round(T0 * FPS); c.set(cv2.CAP_PROP_POS_FRAMES, i)
ref_i = round(REF * FPS); ref_i -= ref_i % 10
while i < round(T1 * FPS):
    ok, f = c.read()
    if not ok: break
    if i % 10 == 0: cv2.imwrite(O + 'frames/%05d.png' % i, f)
    i += 1
fs = sorted(glob.glob(O + 'frames/*.png'))
cv2.imwrite(O + 'reference.png', cv2.imread(O + 'frames/%05d.png' % ref_i))
sift = cv2.SIFT_create(4000); mask = np.full((1080, 1920), 255, np.uint8); mask[80:400, 0:260] = 0       # (not the players' names)
F = [sift.detectAndCompute(cv2.imread(f, 0), mask) for f in fs]
bf = cv2.BFMatcher()


def homography(a, b):
    m = bf.knnMatch(a[1], b[1], k=2); good = [x for x, y in m if x.distance < 0.7 * y.distance]
    if len(good) < 30: return None, 0
    p = np.float32([a[0][x.queryIdx].pt for x in good]); q = np.float32([b[0][x.trainIdx].pt for x in good])
    h, inl = cv2.findHomography(p, q, cv2.RANSAC, 3.0); return h, int(inl.sum())


ref = next(k for k, f in enumerate(fs) if f.endswith('%05d.png' % ref_i)); Hs = {ref: np.eye(3)}
for k in list(range(ref + 1, len(fs))) + list(range(ref - 1, -1, -1)):
    nb = k - 1 if k > ref else k + 1
    if nb not in Hs: continue
    h, n = homography(F[k], F[nb])
    if h is None: continue
    Hs[k] = Hs[nb] @ h
    h2, n2 = homography(F[k], F[ref])
    if h2 is not None and n2 > 150: Hs[k] = h2
json.dump({os.path.basename(fs[k]): Hs[k].tolist() for k in Hs}, open(O + 'H.json', 'w'))
corners = np.float32([[0, 0], [1920, 0], [1920, 1080], [0, 1080]]).reshape(-1, 1, 2)
pts = np.concatenate([cv2.perspectiveTransform(corners, h) for h in Hs.values()]).reshape(-1, 2)
x0, y0 = [int(np.floor(v)) for v in pts.min(0)]; x1, y1 = [int(np.ceil(v)) for v in pts.max(0)]
x0, y0, x1, y1 = max(x0, -600), max(y0, -400), min(x1, 2520), min(y1, 1480)
W, Hh = x1 - x0, y1 - y0
ims = {k: cv2.imread(fs[k]) for k in Hs}
out = np.zeros((Hh, W, 3), np.uint8); STR = 64
for ys in range(0, Hh, STR):
    T = np.array([[1, 0, -x0], [0, 1, -y0 - ys], [0, 0, 1]], float); st = []
    for k, h in Hs.items():
        v = cv2.warpPerspective(np.full((1080, 1920), 255, np.uint8), T @ h, (W, STR), flags=cv2.INTER_NEAREST) > 0
        if not v.any(): continue
        w = cv2.warpPerspective(ims[k], T @ h, (W, STR)).astype(np.float32); w[~v] = np.nan; st.append(w)
    out[ys:ys + STR] = np.nan_to_num(np.nanmedian(np.stack(st), 0))[:Hh - ys]
cv2.imwrite(O + 'mosaic.png', out)
json.dump({'origin': [x0, y0], 'frames': len(Hs), 'of': len(fs)}, open(O + 'mosaic.json', 'w'))
print('mosaic of', len(Hs), 'of', len(fs), 'frames; origin', x0, y0, 'size', W, Hh)
