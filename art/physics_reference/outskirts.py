"""The plaza's outskirts: the ground beyond environ2's frame, as the reference video shows it (2026-10-21).

The video's camera often shows more than environ2's 1280 x 720 (its view is 985-1502 map px wide, 1389 at the median), so the
floor needs what lies round the plaza: the paths running on, grass, the trees' shadows, the trees and red foliage, the sign.
Every plaza frame (1:56-2:28.5) is registered to our map (frames.pkl, track1.py); their per-pixel median (the players walk
away, the ground stays) is laid onto the floor plane through environ2's camera. Our camera only crops that one view (a 2D zoom
and pan, as the video's), so what stands up out there (trees, posts, the sign) is drawn on the ground exactly where the video
shows it; the 3D plaza is clipped to environ2's frame (ThreePlaza: `outskirtsClip`) so the two never overlap.

Inside environ2's frame the floor stays ours (floor_vector.py), with environ2's fall-off of light towards its edges taken
out (fitted against the video); outside, the video's median, its colours scaled to ours, cleaned of its compression
(edge-preserving smoothing), and grass where no frame ever looked.

  python art/physics_reference/outskirts.py      (from the repository root; needs output/frames.pkl and the video)
"""
import json, pickle
import numpy as np, cv2
from world import M as CAM, project

import os
FLOOR = 'apps/console/public/maps/market_plaza/'
OUT = os.environ.get('OUTSKIRTS_OUT', FLOOR)
VIDEO = 'foomerang - fu physics.mp4'
Y0, Y1 = 35.0, 105.0       # the new floor's north-south extent, Blender units (was 50-99): the video's widest views
MARGIN = 300               # map px round environ2 kept in the mosaic
FEATHER = 16               # floor texels (≈ 6 map px): ours fades into the video's this far inside environ2's frame

w = CAM['world']; u = w['unitsPerPlanUnit']; ox = w['planOriginX']; oy = w['planOriginY']
fl = json.load(open(FLOOR + 'floor.json')); K = fl['px_per_bu']; X0, X1 = fl['x0'], fl['x1']
old = cv2.imread(FLOOR + 'floor.webp')
oldY0, oldY1 = fl['y0'], fl['y1']

# 1. the median of the registered frames, over environ2's px plus a margin
CACHE = os.environ.get('OUTSKIRTS_CACHE')
def median_of_frames():
    frames = pickle.load(open('art/physics_reference/output/frames.pkl', 'rb'))
    cap = cv2.VideoCapture(VIDEO); fps = cap.get(cv2.CAP_PROP_FPS)
    T = np.array([[1, 0, MARGIN], [0, 1, MARGIN], [0, 0, 1]], float)
    MW, MH = 1280 + 2 * MARGIN, 720 + 2 * MARGIN
    stack, masks = [], []
    for k, (t, H, _) in enumerate(frames):
        if k % 4: continue
        cap.set(cv2.CAP_PROP_POS_FRAMES, round(t * fps)); ok, f = cap.read()
        f = cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC)
        f[0:150, 0:170] = 0  # the HUD's names
        stack.append(cv2.warpPerspective(f, T @ H, (MW, MH), flags=cv2.INTER_LINEAR))
        m = cv2.warpPerspective(np.full((720, 1280), 255, np.uint8), T @ H, (MW, MH), flags=cv2.INTER_NEAREST) > 250
        m &= stack[-1].sum(2) > 0
        masks.append(m)
    st = np.array(stack); mk = np.array(masks)
    mosaic = np.zeros((MH, MW, 3), np.uint8)
    for c in range(3):
        mosaic[..., c] = np.nan_to_num(np.nanmedian(np.where(mk, st[..., c].astype(np.float32), np.nan), axis=0))
    seen = (mk.sum(0) >= 3).astype(np.uint8) * 255
    return mosaic, seen


T = np.array([[1, 0, MARGIN], [0, 1, MARGIN], [0, 0, 1]], float)
if CACHE and os.path.exists(CACHE):
    z = np.load(CACHE); mosaic, seen = z['mosaic'], z['seen']
else:
    mosaic, seen = median_of_frames()
    if CACHE: np.savez(CACHE, mosaic=mosaic, seen=seen)

# 2. onto the floor plane: floor texel -> map px is a homography (the ground is a plane)
FW, FH = int(round((X1 - X0) * K)), int(round((Y1 - Y0) * K))
grid = [(X, Y) for X in np.linspace(X0, X1, 9) for Y in np.linspace(Y0, Y1, 9)]
src = np.float32([[(X - X0) * K, (Y1 - Y) * K] for X, Y in grid])
dst = np.float32([project((X / 100 - ox) * u, (oy - Y / 100) * u) for X, Y in grid])
Hte = cv2.findHomography(src, dst)[0]
back = np.linalg.inv(T @ Hte)
video = cv2.warpPerspective(mosaic, back, (FW, FH), flags=cv2.INTER_LINEAR)
have = cv2.warpPerspective(seen, back, (FW, FH), flags=cv2.INTER_NEAREST) > 0
xs, ys = np.meshgrid(np.arange(FW, dtype=np.float32), np.arange(FH, dtype=np.float32))
env = cv2.perspectiveTransform(np.dstack([xs, ys]).reshape(-1, 1, 2), Hte).reshape(FH, FW, 2)
inside = (env[..., 0] >= 0) & (env[..., 0] <= 1280) & (env[..., 1] >= 0) & (env[..., 1] <= 720)

# ours, on the new grid (its rows are Y oldY1 .. oldY0; the new grid's Y1 .. Y0)
ours = np.zeros((FH, FW, 3), np.uint8); r0 = int(round((Y1 - oldY1) * K))
ours[r0:r0 + old.shape[0]] = old[: FH - r0]
inside &= (ys >= r0) & (ys < r0 + old.shape[0])

# 3. environ2's own light falls off towards its frame's edges (≈ 0.7 of the video's at its corners): a smooth field fitted on
# the ground both show (log ratio, a quartic over the frame, robust to what stands on it) is taken out of ours, and the
# video's colours scaled to ours at the middle of the frame, so the two meet without a seam
both = inside & have
both &= cv2.erode(both.astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
idx = np.flatnonzero(both)[:: 23]
ex, ey = env[..., 0].ravel()[idx] / 640 - 1, env[..., 1].ravel()[idx] / 360 - 1
terms = lambda x, y: np.stack([x ** i * y ** j for i in range(5) for j in range(5 - i)], -1)
A = terms(ex, ey)
ratio = np.log((ours.reshape(-1, 3)[idx] + 1.0) / (video.reshape(-1, 3)[idx] + 1.0))
coef = []
for c in range(3):
    keep = np.ones(len(idx), bool)
    for _ in range(4):
        k = np.linalg.lstsq(A[keep], ratio[keep, c], rcond=None)[0]
        keep = np.abs(A @ k - ratio[:, c]) < 0.08
    coef.append(k)
gx, gy = env[..., 0] / 640 - 1, env[..., 1] / 360 - 1
middle = terms(np.zeros(1), np.zeros(1))[0]
for c in range(3):
    field = np.zeros((FH, FW), np.float32)
    for t, (i, j) in zip(coef[c], [(i, j) for i in range(5) for j in range(5 - i)]):
        field += t * gx ** i * gy ** j
    at_middle = float(middle @ coef[c])
    ours[..., c] = np.where(inside, np.clip(ours[..., c] * np.exp(at_middle - field), 0, 255), ours[..., c])
    video[..., c] = np.clip(video[..., c] * np.exp(at_middle), 0, 255)
print('environ2 light at its corners vs the middle:',
      [round(float(np.exp((terms(np.float32([x]), np.float32([y]))[0] - middle) @ coef[1])), 2) for x, y in
       [(-1, -1), (1, -1), (-1, 1), (1, 1)]])

# 4. the video's ground cleaned of its compression; where no frame ever looked (corners the camera never reached), grass
have = cv2.erode(have.astype(np.uint8), np.ones((13, 13), np.uint8)) > 0
outside = have & ~inside
hsv = cv2.cvtColor(video, cv2.COLOR_BGR2HSV)
grassy = outside & (hsv[..., 0] > 15) & (hsv[..., 0] < 30) & (hsv[..., 1] > 90)
grass = np.median(video[grassy], axis=0)
video[~have] = grass
video = cv2.bilateralFilter(cv2.medianBlur(video, 5), 9, 30, 9)
reach = np.clip(cv2.distanceTransform((~have).astype(np.uint8), cv2.DIST_L2, 5) / 40.0, 0, 1)[..., None]
video = (video * (1 - reach) + grass * reach).astype(np.uint8)

# 5. ours inside environ2's frame, the video's outside, feathered across the seam
d = cv2.distanceTransform(inside.astype(np.uint8), cv2.DIST_L2, 5)
alpha = np.clip(d / FEATHER, 0, 1)[..., None]
out = (ours * alpha + video * (1 - alpha)).astype(np.uint8)

cv2.imwrite(OUT + 'floor.webp', out, [cv2.IMWRITE_WEBP_QUALITY, 90])
fl.update(y0=Y0, y1=Y1, size=[FW, FH])
open(OUT + 'floor.json', 'w').write('{ ' + ', '.join(f'"{k}": {json.dumps(v).replace(",", ", ")}' for k, v in fl.items()) + ' }\n')
print('floor', FW, 'x', FH, 'Y', Y0, '-', Y1, '; video seen on', round(float(have.mean()) * 100), '% of it')
