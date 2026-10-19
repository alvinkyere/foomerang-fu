"""Pass 1: register every frame (video -> environ2 1280x720 px), build a median background, extract foreground blobs."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import cv2, numpy as np, json, pickle
S = OUT
ref = cv2.imread('art/reconstruction/environ2/step2_clean.png')
g_ref = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
orb = cv2.ORB_create(4000)
kr, dr = orb.detectAndCompute(g_ref, None)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
c = cv2.VideoCapture('foomerang - fu physics.mp4')
fps = c.get(cv2.CAP_PROP_FPS)
T0, T1 = 116.0, 148.5
I0 = int(round(T0 * fps)); c.set(cv2.CAP_PROP_POS_FRAMES, I0)
hud = np.full((720, 1280), 255, np.uint8); hud[0:150, 0:170] = 0   # the player-name HUD, top left of the video
frames = []
idx = I0
while True:
    t = idx / fps; idx += 1
    ok, f = c.read()
    if not ok or t > T1: break
    f2 = cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC)
    k, d = orb.detectAndCompute(cv2.cvtColor(f2, cv2.COLOR_BGR2GRAY), None)
    m = bf.match(d, dr)
    H, inl = cv2.findHomography(np.float32([k[x.queryIdx].pt for x in m]), np.float32([kr[x.trainIdx].pt for x in m]), cv2.RANSAC, 3.0)
    frames.append((t, H, int(inl.sum())))
pickle.dump(frames, open(S + 'frames.pkl', 'wb'))
print('frames', len(frames), 'fps', fps, 'min inliers', min(n for _, _, n in frames))
# background: median of 80 registered frames spread over the run
c = cv2.VideoCapture('foomerang - fu physics.mp4')
stack, vstack = [], []
for i in np.linspace(0, len(frames) - 1, 80).astype(int):
    t, H, _ = frames[i]
    c.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, f = c.read()
    f2 = cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC)
    stack.append(cv2.warpPerspective(f2, H, (1280, 720)))
    vstack.append(cv2.warpPerspective(hud, H, (1280, 720)) > 0)
stack = np.array(stack); vstack = np.array(vstack)
bg = np.zeros((720, 1280, 3), np.uint8)
for ch in range(3):
    a = np.where(vstack, stack[..., ch], np.nan).astype(np.float32)
    bg[..., ch] = np.nan_to_num(np.nanmedian(a, axis=0)).astype(np.uint8)
cv2.imwrite(S + 'bg.png', bg)
