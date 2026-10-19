"""Stabilise a stretch of the video to its first frame (chained frame-to-frame alignment) and save the frames, 2x."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import cv2, numpy as np, sys, pickle
S = OUT
t0, t1, name = float(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
c = cv2.VideoCapture('foomerang - fu physics.mp4'); fps = c.get(cv2.CAP_PROP_FPS)
i0 = int(round(t0 * fps)); c.set(cv2.CAP_PROP_POS_FRAMES, i0)
orb = cv2.ORB_create(3000); bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
mask = np.full((360, 640), 255, np.uint8); mask[0:75, 0:85] = 0   # not the HUD names
Hacc = np.eye(3); prev = None; out = []
i = i0
while i <= int(round(t1 * fps)):
    ok, f = c.read()
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY); k, d = orb.detectAndCompute(g, mask)
    if prev is not None:
        m = bf.match(d, prev[1])
        H, _ = cv2.findHomography(np.float32([k[x.queryIdx].pt for x in m]), np.float32([prev[0][x.trainIdx].pt for x in m]), cv2.RANSAC, 2.0)
        Hacc = Hacc @ H
    prev = (k, d)
    big = cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC)
    S2 = np.diag([2, 2, 1.0]); Hb = S2 @ Hacc @ np.linalg.inv(S2)
    out.append((i, i / fps, cv2.warpPerspective(big, Hb, (1280, 720))))
    i += 1
pickle.dump([(i, t) for i, t, _ in out], open(S + name + '_idx.pkl', 'wb'))
np.save(S + name + '.npy', np.array([w for _, _, w in out]))
print(name, len(out), 'frames')
