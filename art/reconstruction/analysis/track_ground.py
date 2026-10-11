"""Track the dominant ground plane through a shot: adjacent-frame SIFT matches + RANSAC homography, polished with ECC on the
inlier mask, chained to the shot's first frame.  python track_ground.py <frames_dir> <first> <last> <out.npz>
Output: H[t] maps frame t pixels -> first-frame pixels (3x3), plus per-frame inlier counts. Moving characters/particles are
outliers; tall objects (roofs, trees) are not on the ground plane and are also rejected as outliers by RANSAC."""
import sys, cv2, numpy as np
d, a, b, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
sift = cv2.SIFT_create(nfeatures=4000, contrastThreshold=0.01)
bf = cv2.BFMatcher(cv2.NORM_L2)
def load(i): return cv2.imread(f'{d}/f{i:04d}.png')
def feat(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); g = cv2.createCLAHE(2.0, (4, 4)).apply(g)
    return g, sift.detectAndCompute(g, None)
prev_img = load(a); pg, (pk, pd) = feat(prev_img)
H = {a: np.eye(3)}; stats = {}
for i in range(a + 1, b + 1):
    img = load(i); g, (k, de) = feat(img)
    m = bf.knnMatch(de, pd, k=2); good = [x for x, y in m if x.distance < 0.8 * y.distance]
    src = np.float32([k[x.queryIdx].pt for x in good]); dst = np.float32([pk[x.trainIdx].pt for x in good])
    Hc, inl = cv2.findHomography(src, dst, cv2.RANSAC, 2.0, maxIters=5000, confidence=0.999)
    n_in = int(inl.sum()) if inl is not None else 0
    # polish with ECC (homography) on the gradient images, initialised from RANSAC
    try:
        gx = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
        warp = np.linalg.inv(Hc).astype(np.float32)          # ECC maps template (prev) -> input (cur): the inverse of Hc
        cc, warp = cv2.findTransformECC(gx(prev_img), gx(img), warp, cv2.MOTION_HOMOGRAPHY, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-6), None, 5)
        Hc2 = np.linalg.inv(warp.astype(np.float64)); Hc2 /= Hc2[2, 2]; ecc = float(cc)
    except cv2.error:
        Hc2 = Hc; ecc = -1.0
    H[i] = H[i - 1] @ Hc2; stats[i] = (len(good), n_in, ecc)
    prev_img, pk, pd = img, k, de
    if i % 10 == 0: print(i, len(good), n_in, round(ecc, 4), flush=True)
np.savez(out, frames=np.array(sorted(H)), H=np.array([H[i] for i in sorted(H)]), stats=np.array([stats.get(i, (0, 0, 1)) for i in sorted(H)]))
