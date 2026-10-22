"""The plaza's outskirts: the ground beyond environ2's frame, drawn as our own vector floor (2026-10-21, owner: "everything
beyond the borders should be a rendered object we have ... do not blur anything out").

The video's camera usually shows more than environ2's 1280 x 720 (its view 985-1502 map px wide, 1389 at the median), so the
floor runs further: Y 35-105 (was 50-99). Inside environ2's frame the floor stays ours (floor_vector.py). Beyond it nothing
is taken from the video's pixels; it is drawn, crisp, as floor_vector.py draws the plaza:
  * the pavement's arms run on east, west and south, with their three edge stripes and the slab lines, and the dashed border
    lines run their full length;
  * the sand and the pavement are flat colour with the video's own gentle light across them: smooth fields (quadratic over
    the plan) fitted to the sunlit sand and the pavement the video shows round the plaza;
  * the trees standing out there are our own models (plants.py); their shadows and fallen leaves are drawn on it here.
environ2's light falls off towards its frame's edges (0.61-0.70 of the video's at its corners): fitted against the video and
taken out of our floor, so ours meets the drawn ground without a seam.

The video is only measured: its frames registered to our map (frames.pkl, track1.py), from the high-quality cut
(foomerang-fu physics hq.mp4, 1.267 s later than the old one); the fits read their per-pixel median.

  python art/physics_reference/outskirts.py      (from the repository root; needs output/frames.pkl and the HQ video)
"""
import json, os, pickle
import numpy as np, cv2
from world import M as CAM, project

FLOOR = 'apps/console/public/maps/market_plaza/'
OUT = os.environ.get('OUTSKIRTS_OUT', FLOOR)
CACHE = os.environ.get('OUTSKIRTS_CACHE')
VIDEO = 'foomerang-fu physics hq.mp4'
HQ_LATER = 1.2667          # s: the HQ cut runs this much later than the old one (frames.pkl's times)
PLAN = 'art/reconstruction/environ2/'
Y0, Y1 = 35.0, 105.0       # the floor's north-south extent, Blender units
FEATHER = 40               # floor texels (1 BU): ours meets the drawn ground over this

w = CAM['world']; u = w['unitsPerPlanUnit']; ox = w['planOriginX']; oy = w['planOriginY']
SRC = os.environ.get('OUTSKIRTS_FROM', FLOOR)   # the floor to extend (floor_vector.py's, or this script's own: inside the frame
                                                # it is the same)
fl = json.load(open(SRC + 'floor.json')); K = fl['px_per_bu']; X0, X1 = fl['x0'], fl['x1']
old = cv2.imread(SRC + 'floor.webp'); oldY1 = fl['y1']


# 1. the ground the video shows: the median of the registered HQ frames, in map px x 1.5 with a margin
def median_of_frames(scale=1.5, margin=300):
    frames = pickle.load(open('art/physics_reference/output/frames.pkl', 'rb'))
    cap = cv2.VideoCapture(VIDEO)
    T = np.array([[scale, 0, scale * margin], [0, scale, scale * margin], [0, 0, 1]])
    down = np.diag([1280 / 1920, 1280 / 1920, 1])
    MW, MH = int(scale * (1280 + 2 * margin)), int(scale * (720 + 2 * margin))
    stack, masks = [], []
    for k, (t, H, _) in enumerate(frames):
        if k % 6: continue
        cap.set(cv2.CAP_PROP_POS_MSEC, (t + HQ_LATER) * 1000); ok, f = cap.read()
        f[0:400, 0:330] = 0  # the HUD's names
        A = T @ H @ down
        stack.append(cv2.warpPerspective(f, A, (MW, MH)))
        masks.append((cv2.warpPerspective(np.full(f.shape[:2], 255, np.uint8), A, (MW, MH), flags=cv2.INTER_NEAREST) > 250)
                     & (stack[-1].sum(2) > 0))
    st = np.array(stack); mk = np.array(masks); del stack, masks
    med = np.zeros((MH, MW, 3), np.uint8)
    for y in range(0, MH, 64):                       # strip by strip: the whole stack in floats would not fit in memory
        m = mk[:, y:y + 64]
        for c in range(3):
            med[y:y + 64, :, c] = np.nan_to_num(np.nanmedian(np.where(m, st[:, y:y + 64, :, c].astype(np.float32), np.nan), axis=0))
    return med, (mk.sum(0) >= 3).astype(np.uint8) * 255, T


if CACHE and os.path.exists(CACHE):
    z = np.load(CACHE); mosaic, seen, T = z['mosaic'], z['seen'], z['T']
else:
    mosaic, seen, T = median_of_frames()
    if CACHE: np.savez(CACHE, mosaic=mosaic, seen=seen, T=T)

# 2. the floor grid, and each texel's map px (floor texel -> map px is a homography: the ground is a plane)
FW, FH = int(round((X1 - X0) * K)), int(round((Y1 - Y0) * K))
grid = [(X, Y) for X in np.linspace(X0, X1, 9) for Y in np.linspace(Y0, Y1, 9)]
src = np.float32([[(X - X0) * K, (Y1 - Y) * K] for X, Y in grid])
dst = np.float32([project((X / 100 - ox) * u, (oy - Y / 100) * u) for X, Y in grid])
Hte = cv2.findHomography(src, dst)[0]
back = np.linalg.inv(T @ Hte)
video = cv2.warpPerspective(mosaic, back, (FW, FH), flags=cv2.INTER_AREA)
have = cv2.erode(cv2.warpPerspective(seen, back, (FW, FH), flags=cv2.INTER_NEAREST), np.ones((13, 13), np.uint8)) > 0
xs, ys = np.meshgrid(np.arange(FW, dtype=np.float32), np.arange(FH, dtype=np.float32))
env = cv2.perspectiveTransform(np.dstack([xs, ys]).reshape(-1, 1, 2), Hte).reshape(FH, FW, 2)
inside = (env[..., 0] >= 0) & (env[..., 0] <= 1280) & (env[..., 1] >= 0) & (env[..., 1] <= 720)
PX, PY = X0 + (xs + 0.5) / K, Y1 - (ys + 0.5) / K       # each texel's plan position, BU

ours = np.zeros((FH, FW, 3), np.float32); r0 = int(round((Y1 - oldY1) * K))
ours[r0:r0 + old.shape[0]] = old[: FH - r0]
inside &= (ys >= r0) & (ys < r0 + old.shape[0])

# 3. environ2's fall-off of light, fitted against the video (log ratio, quartic over the frame, robust), taken out of ours
both = inside & have
both &= cv2.erode(both.astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
idx = np.flatnonzero(both)[:: 23]
terms = lambda x, y, n: np.stack([x ** i * y ** j for i in range(n + 1) for j in range(n + 1 - i)], -1)
pairs = lambda n: [(i, j) for i in range(n + 1) for j in range(n + 1 - i)]
ex, ey = env[..., 0].ravel()[idx] / 640 - 1, env[..., 1].ravel()[idx] / 360 - 1
A = terms(ex, ey, 4)
ratio = np.log((ours.reshape(-1, 3)[idx] + 1.0) / (video.reshape(-1, 3)[idx] + 1.0))
gx, gy = env[..., 0] / 640 - 1, env[..., 1] / 360 - 1
for c in range(3):
    keep = np.ones(len(idx), bool)
    for _ in range(4):
        k = np.linalg.lstsq(A[keep], ratio[keep, c], rcond=None)[0]
        keep = np.abs(A @ k - ratio[:, c]) < 0.08
    field = sum(t * gx ** i * gy ** j for t, (i, j) in zip(k, pairs(4)))
    ours[..., c] = np.where(inside, ours[..., c] * np.exp(k[0] - field), ours[..., c])

# 4. the video's light over the open ground: smooth fields (quadratic over the plan) fitted to its sunlit sand and its
#    pavement, scaled to our colours where they meet: on a band just inside environ2's frame
hsv = cv2.cvtColor(video, cv2.COLOR_BGR2HSV)
sunlit = have & (hsv[..., 0] >= 14) & (hsv[..., 0] <= 28) & (hsv[..., 1] > 95) & (hsv[..., 2] > 200)
paved = have & (hsv[..., 1] < 70) & (hsv[..., 2] > 215)
NX, NY = PX / 60, (PY - 70) / 35
band = inside & ~(cv2.erode(inside.astype(np.uint8), np.ones((121, 121), np.uint8)) > 0)
band &= cv2.erode(inside.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0


def smooth_field(mask):
    i = np.flatnonzero(mask)[:: 7]
    B = terms(NX.ravel()[i], NY.ravel()[i], 2)
    col = video.reshape(-1, 3)[i].astype(float)
    lo, hi = np.percentile(col, 2, axis=0), np.percentile(col, 98, axis=0)
    out = np.zeros((FH, FW, 3), np.float32)
    for c in range(3):
        k = np.linalg.lstsq(B, col[:, c], rcond=None)[0]
        out[..., c] = np.clip(terms(NX, NY, 2) @ k, lo[c], hi[c])
    meet = mask & band
    return out * (np.median(ours[meet], axis=0) / np.median(out[meet], axis=0))


sand, pave_col = smooth_field(sunlit), smooth_field(paved)

# 5. drawn as floor_vector.py draws: the pavement (its arms run on past the floor's edges), its three edge stripes, the slab
#    lines, the dashed border lines (their colours ours, where environ2 shows them)
FP = json.load(open(PLAN + 'blender/floor_plan.json'))
AR = json.load(open(PLAN + 'step4_arena.json'))
SS = 16
to_px = lambda X, Y: ((X - X0) * K, (Y1 - Y) * K)
poly_px = lambda poly: [np.round(np.array([to_px(X, Y) for X, Y in poly]) * SS).astype(np.int32)]


def mask_of(poly):
    m = np.zeros((FH, FW), np.uint8)
    cv2.fillPoly(m, poly_px(poly), 255, lineType=cv2.LINE_AA, shift=4)
    return m.astype(np.float32) / 255


pave = [((X0 - 5 if X < -36.0 else (X1 + 5 if X > 37.0 else X)), (Y0 - 5 if Y < 53.5 else Y)) for X, Y in FP['pavement']]
pm = mask_of(pave)
drawn = pave_col * pm[..., None] + sand * (1 - pm[..., None])
inner = cv2.erode((pm > 0.5).astype(np.uint8), np.ones((11, 11), np.uint8))
SLAB = 5.5
grout = np.zeros((FH, FW), np.float32)
for k in range(-12, 13):
    gxk = int(round((FP['axis_x'] + (k + 0.5) * SLAB - X0) * K))
    if 0 <= gxk < FW: cv2.line(grout, (gxk, 0), (gxk, FH - 1), 1.0, 2, cv2.LINE_AA)
for k in range(-6, 12):
    gyk = int(round((Y1 - (53.0 + k * SLAB)) * K))
    if 0 <= gyk < FH: cv2.line(grout, (0, gyk), (FW - 1, gyk), 1.0, 2, cv2.LINE_AA)
drawn *= 1 - (grout * (inner > 0) * 0.07)[..., None]


def offset(poly, d):
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) / 2
    s = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = np.array(poly[i - 1]), np.array(poly[i]), np.array(poly[(i + 1) % n])
        e0, e1 = (p1 - p0) / np.linalg.norm(p1 - p0), (p2 - p1) / np.linalg.norm(p2 - p1)
        n0, n1 = np.array([e0[1], -e0[0]]) * s, np.array([e1[1], -e1[0]]) * s
        m = n0 + n1
        m = m / np.linalg.norm(m) / max(0.35, (m / np.linalg.norm(m)) @ n0) if np.linalg.norm(m) > 1e-6 else n0
        out.append(tuple(p1 + m * d))
    return out


core = inside & (cv2.erode(inside.astype(np.uint8), np.ones((31, 31), np.uint8)) > 0)
stripes = np.zeros((FH, FW), np.float32)
for d in (0.25, 0.6, 0.95):
    stripes = np.maximum(stripes, mask_of(offset(pave, -d + 0.1)) * (1 - mask_of(offset(pave, -d - 0.1))))
stripe_col = np.median(ours[(stripes > 0.9) & core], axis=0)
drawn = drawn * (1 - stripes[..., None]) + stripe_col * stripes[..., None]
# the border: the rules' dashed rectangle (games/foomerang-fu/src/rules/marketPlazaArena.ts, MARKET_PLAZA_SAFE_ZONE): its sides
# measured in environ2, its top and bottom in the HQ footage. environ2 shows its sides and, faintly, its top; the rest is drawn
SAFE = (271, 15, 1939, 1148)                                  # world x0, y0, x1, y1
to_plan = lambda xw, yw: ((xw / u + w['planOriginX']) * 100, (w['planOriginY'] - yw / u) * 100)
(SX0, SY1), (SX1, SY0) = to_plan(SAFE[0], SAFE[1]), to_plan(SAFE[2], SAFE[3])   # plan: Y runs north
dashes = np.zeros((FH, FW), np.float32)
top_line = np.zeros((FH, FW), np.float32)
for X in (SX0, SX1):
    for kk in range(-8, 22):
        y = 53 + 2.4 * kk
        if SY0 <= y and y + 1.2 <= SY1: dashes = np.maximum(dashes, mask_of([(X - 0.12, y), (X + 0.12, y), (X + 0.12, y + 1.2), (X - 0.12, y + 1.2)]))
for Y, layer in ((SY0, 'bottom'), (SY1, 'top')):
    x = SX0
    while x + 1.2 <= SX1:
        m = mask_of([(x, Y - 0.12), (x + 1.2, Y - 0.12), (x + 1.2, Y + 0.12), (x, Y + 0.12)])
        if layer == 'top': top_line = np.maximum(top_line, m)
        else: dashes = np.maximum(dashes, m)
        x += 2.4
dash_col = np.median(ours[(dashes > 0.9) & core], axis=0)
drawn = drawn * (1 - dashes[..., None]) + dash_col * dashes[..., None]

# 6. ours inside environ2's frame, the drawn ground beyond it
d = cv2.distanceTransform(inside.astype(np.uint8), cv2.DIST_L2, 5)
alpha = np.clip(d / FEATHER, 0, 1)[..., None]
out = ours * alpha + drawn * (1 - alpha)

# 7. the trees standing out there (plants.py, our own models) cast their shadows on it, by our sun; the video's shadowed grass
#    is its sunlit grass x (0.76, 0.83, 0.935) (measured side by side, 2:38.5 and the median); round the yellow ones lie their
#    fallen leaves (#ccb366, ≈ 0.45 units across, a couple of dozen within ≈ 2.5 units of the trunk). environ2 has its own
#    shadows inside its frame: these fall only beyond it.
TREES = json.load(open(PLAN + 'blender/plants_outside.json'))
sun = np.array(TREES['sun'])
along = sun[:2] / np.linalg.norm(sun[:2])
cot = np.linalg.norm(sun[:2]) / sun[2]
SH = 4                                                    # supersampled, for clean edges
shade = np.zeros((FH * SH, FW * SH), np.uint8)
ground = lambda x, y, z: ((x - z * sun[0] / sun[2] - X0) * K * SH, (Y1 - (y - z * sun[1] / sun[2])) * K * SH)
for part in TREES['parts']:
    if part['kind'] == 'puff':
        x, y, z = part['at']; rxy, rz = part['r']
        cx_, cy_ = ground(x, y, z)
        long_ = np.hypot(rxy, rz * cot) * K * SH
        ang = float(np.degrees(np.arctan2(-along[1], along[0])))
        cv2.ellipse(shade, ((float(cx_), float(cy_)), (float(2 * long_), float(2 * rxy * K * SH)), ang), 255, -1, cv2.LINE_AA)
    else:
        a = ground(*part['from']); b = ground(*part['to'])
        cv2.line(shade, tuple(int(v) for v in a), tuple(int(v) for v in b), 255, int(2 * part['r'] * K * SH), cv2.LINE_AA)
shade = cv2.resize(shade, (FW, FH), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
shade = cv2.GaussianBlur(shade, (0, 0), 1.5)[..., None] * (1 - alpha)
out = out * (1 - shade * (1 - np.array([0.935, 0.83, 0.76])))     # (BGR)
rng = np.random.default_rng(29)
LEAF = np.array([0x66, 0xb3, 0xcc], np.float32)                      # BGR
for X, Y in TREES['leaves_at']:
    for _ in range(22):
        r_ = 2.5 * np.sqrt(rng.random()); t_ = rng.random() * 2 * np.pi
        lx, ly = X + r_ * np.cos(t_), Y + r_ * np.sin(t_)
        size = rng.uniform(0.18, 0.26)
        x0_, y0_ = int((lx - X0) * K) - 20, int((Y1 - ly) * K) - 20
        if not (0 <= x0_ < FW - 40 and 0 <= y0_ < FH - 40): continue
        m = np.zeros((40, 40), np.uint8)
        cv2.ellipse(m, ((20.0, 20.0), (2 * size * K * 1.25, 2 * size * K), float(rng.uniform(0, 180))), 255, -1, cv2.LINE_AA)
        a_ = (m.astype(np.float32) / 255)[..., None] * (1 - alpha[y0_:y0_ + 40, x0_:x0_ + 40]) * 0.92
        tile = out[y0_:y0_ + 40, x0_:x0_ + 40]
        out[y0_:y0_ + 40, x0_:x0_ + 40] = tile * (1 - a_) + LEAF * rng.uniform(0.95, 1.08) * a_
out = out * (1 - top_line[..., None]) + dash_col * top_line[..., None]   # the top line over environ2's faint one
out = np.clip(out, 0, 255).astype(np.uint8)
cv2.imwrite(OUT + 'floor.webp', out, [cv2.IMWRITE_WEBP_QUALITY, 92])
fl.update(y0=Y0, y1=Y1, size=[FW, FH])
open(OUT + 'floor.json', 'w').write('{ ' + ', '.join(f'"{k}": {json.dumps(v)}' for k, v in fl.items()) + ' }\n')  # (as prettier writes it)
print('floor', FW, 'x', FH, 'Y', Y0, '-', Y1, '; stripes', stripe_col.round(), 'dashes', dash_col.round())
