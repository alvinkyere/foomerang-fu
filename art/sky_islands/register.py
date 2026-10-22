"""The sky islands (the HQ video, 9:03.07-9:47.1): every frame of the round registered to one reference view (2026-10-22).

The game's camera only zooms and pans over one fixed view (as on the plaza), so each frame maps onto the reference by a
homography of the ground (the island tops). The reference is the round's opening view (9:04.0), widened by a margin to hold
what the camera shows beyond it. Frames are matched at half size (ORB + RANSAC) against the reference and, when that is weak,
against the last good frame (chained). The HUD (the names top left) is masked out. Writes output/frames.pkl
[(t, H: frame px -> map px, inliers)] and output/median.png, the median of the registered frames (the ground without
the players), for measuring.

  python art/sky_islands/register.py        (from the repository root; needs the HQ video)
"""
import os, pickle
import numpy as np, cv2

VIDEO = 'foomerang-fu physics hq.mp4'
OUT = os.environ.get('SKY_OUT', 'art/sky_islands/output/')
T0, T1, REF = 543.6, 587.1, 544.0
MARGIN = 500                       # map px round the reference frame
os.makedirs(OUT, exist_ok=True)
cap = cv2.VideoCapture(VIDEO); fps = cap.get(cv2.CAP_PROP_FPS)


def frame(t):
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(t * fps)); ok, f = cap.read()
    return f


def features(f):
    g = cv2.cvtColor(cv2.resize(f, (960, 540), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    mask = np.full(g.shape, 255, np.uint8); mask[0:200, 0:120] = 0           # the names, top left
    return orb.detectAndCompute(g, mask)


orb = cv2.ORB_create(5000)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
half = np.diag([2.0, 2.0, 1.0])     # half-size px -> full px
kr, dr = features(frame(REF))
frames = []
prev = None
for k in range(round(T0 * fps), round(T1 * fps), 2):
    t = k / fps
    f = frame(t)
    kf, df = features(f)
    best = None
    for ka, da, H0 in [(kr, dr, np.eye(3))] + ([prev] if prev is not None else []):
        m = bf.match(df, da)
        if len(m) < 30: continue
        H, inl = cv2.findHomography(np.float32([kf[x.queryIdx].pt for x in m]), np.float32([ka[x.trainIdx].pt for x in m]),
                                    cv2.RANSAC, 2.0)
        if H is None: continue
        n = int(inl.sum())
        if best is None or n > best[1]:
            best = (H0 @ half @ H @ np.linalg.inv(half), n)
    if best is None:
        print('lost at %.3f' % t); continue
    frames.append((t, best[0], best[1]))
    prev = (kf, df, best[0])
pickle.dump(frames, open(OUT + 'frames.pkl', 'wb'))
ns = [n for _, _, n in frames]
print('frames', len(frames), 'inliers min/median', min(ns), int(np.median(ns)))

# the ground without the players: the median of registered frames over a map MARGIN wider than the reference
T = np.array([[1, 0, MARGIN], [0, 1, MARGIN], [0, 0, 1]], float)
W, H_ = 1920 + 2 * MARGIN, 1080 + 2 * MARGIN
stack, masks = [], []
for t, H, _ in frames[:: 6]:
    f = frame(t); f[0:400, 0:240] = 0
    A = T @ H
    stack.append(cv2.warpPerspective(f, A, (W, H_)))
    masks.append((cv2.warpPerspective(np.full(f.shape[:2], 255, np.uint8), A, (W, H_), flags=cv2.INTER_NEAREST) > 250)
                 & (stack[-1].sum(2) > 0))
st = np.array(stack); mk = np.array(masks); del stack, masks
med = np.zeros((H_, W, 3), np.uint8)
for y in range(0, H_, 64):
    m = mk[:, y:y + 64]
    for c in range(3):
        med[y:y + 64, :, c] = np.nan_to_num(np.nanmedian(np.where(m, st[:, y:y + 64, :, c].astype(np.float32), np.nan), axis=0))
cv2.imwrite(OUT + 'median.png', med)
print('median', W, 'x', H_, 'from', len(st), 'frames')
