"""The plaza floor as our own clean vector artwork, top-down (plan space, 60 px per BU), for the 3D floor:
 * traced from environ2 (visible floor only; under objects the neighbouring region continues): the sand tones, and the soft
   shadow and light shapes on sand and pavement, as smooth vector shapes
 * drawn exactly (symmetric, straight): the pavement, its three edge stripes, the sand ring round the fountain, the six rugs with
   their border and fringes, the dashed border lines
Everything is drawn anti-aliased at high resolution, so the floor stays crisp on any screen.
python floor_vector.py <step2_clean.png> <step-3 masks dir> <out.png> <out.json>"""
import sys, json, math
import cv2, numpy as np
import fit_stall as fs

GROUND_TEX, MASKS, OUT_PNG, OUT_JSON = sys.argv[1:5]
import os
FP = json.load(open('floor_plan.json'))
A = json.load(open('../step4_arena.json'))
w = A['camera']['world']
X0, X1, Y0, Y1 = -58.0, 59.5, 50.0, 99.0           # plan extent (BU): the plaza and the outside sand beyond the fences
K = 60.0                                          # px per BU
W, H = int((X1 - X0) * K), int((Y1 - Y0) * K)
to_px = lambda X, Y: ((X - X0) * K, (Y1 - Y) * K)
img = np.zeros((H, W, 3), np.uint8)
img[:] = (116, 186, 214)                          # a sand base under everything (BGR), so no region edge meets black
S = 16                                            # fixed-point subpixel shift for fillPoly


def fill(poly_plan, bgr, target=None):
    pts = np.array([to_px(X, Y) for X, Y in poly_plan]) * S
    cv2.fillPoly(img if target is None else target, [np.round(pts).astype(np.int32)], tuple(int(c) for c in bgr),
                 lineType=cv2.LINE_AA, shift=4)


# 1. environ2's floor colour as a clean field, from the floor environ2 SHOWS: each plan texel samples the clean plate where the
#    camera sees it; texels under an object or beyond the frame are filled from the surrounding sand or pavement. Brush grain is
#    removed (mean-shift: flat regions with crisp edges, then a gentle edge-preserving smooth); sand and pavement are smoothed
#    separately so the pavement's edge stays crisp. The pavement's side arms run on to the floor's edge (off environ2's frame).
import glob
PLATE = cv2.imread(GROUND_TEX)
objects = np.zeros(PLATE.shape[:2], np.uint8)
for f in glob.glob(os.path.join(MASKS, 'mask_*.npy')):
    objects |= (np.load(f) > 0).astype(np.uint8)
hsv_ = cv2.cvtColor(PLATE, cv2.COLOR_BGR2HSV)
objects |= (((hsv_[..., 0] < 8) | (hsv_[..., 0] > 160)) & (hsv_[..., 1] > 80)).astype(np.uint8)   # the painted rugs: ours are drawn
objects = cv2.dilate(objects, np.ones((7, 7), np.uint8))
K2 = 30.0
W2, H2 = int((X1 - X0) * K2), int((Y1 - Y0) * K2)
gx, gy = np.meshgrid(X0 + (np.arange(W2) + 0.5) / K2, Y1 - (np.arange(H2) + 0.5) / K2)
uv = fs.proj(np.stack([gx.ravel() * 1.0, gy.ravel() * 1.0, np.zeros(gx.size)], 1))   # plan BU -> image px
ux = uv[:, 0].reshape(H2, W2).astype(np.float32) - 0.5
uy = uv[:, 1].reshape(H2, W2).astype(np.float32) - 0.5
field2 = cv2.remap(PLATE, ux, uy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
inframe = (ux >= 0) & (ux < PLATE.shape[1] - 1) & (uy >= 0) & (uy < PLATE.shape[0] - 1)
under = cv2.remap(objects, ux, uy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=1) > 0
valid = inframe & ~under
pave = [((X0 if X < -36.0 else (X1 if X > 37.0 else X)), Y) for X, Y in FP['pavement']]
to_px2 = lambda X, Y: ((X - X0) * K2, (Y1 - Y) * K2)
pm2 = np.zeros((H2, W2), np.uint8)
cv2.fillPoly(pm2, [np.round(np.array([to_px2(X, Y) for X, Y in pave]) * S).astype(np.int32)], 1, shift=4)


def fill_from(img_, mask):
    """Each texel the mean of the valid texels of its kind nearby (wider and wider until it finds some)."""
    out = np.zeros(img_.shape, np.float32)
    have = np.zeros(mask.shape, np.float32)
    for sigma in (2, 6, 18, 54, 160, 480, 1400):
        m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)
        v = cv2.GaussianBlur(img_.astype(np.float32) * mask[..., None], (0, 0), sigma)
        est = v / np.maximum(m[..., None], 1e-6)
        take = ((m > 0.02) & (have == 0))[..., None]
        out = np.where(take, est, out)
        have = np.maximum(have, (m > 0.02).astype(np.float32))
    mean = img_[mask].mean(0)
    return np.where((have == 0)[..., None], mean, out)


pave_ok = valid & (cv2.erode(pm2, np.ones((5, 5), np.uint8)) > 0)
sand_ok = valid & (cv2.dilate(pm2, np.ones((5, 5), np.uint8)) == 0)
pf = np.where(pave_ok[..., None], field2.astype(np.float32), fill_from(field2, pave_ok))
sf = np.where(sand_ok[..., None], field2.astype(np.float32), fill_from(field2, sand_ok))
# beyond environ2's frame the ground settles to plain sand / plain pavement over 3 BU: clean open ground, no echoes of the frame
dist = cv2.distanceTransform((~inframe).astype(np.uint8), cv2.DIST_L2, 5) / K2
t = np.clip(dist / 3.0, 0, 1)[..., None]
edge = (cv2.dilate(inframe.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & ~cv2.erode(inframe.astype(np.uint8), np.ones((61, 61), np.uint8)).astype(bool)
sand_plain = np.median(field2[sand_ok & edge], axis=0)
pave_plain = np.median(field2[pave_ok & edge], axis=0)
sf = sf * (1 - t) + sand_plain * t
pf = pf * (1 - t) + pave_plain * t
pf = cv2.bilateralFilter(cv2.pyrMeanShiftFiltering(np.clip(pf, 0, 255).astype(np.uint8), 8, 10), 9, 16, 6)
sf = cv2.bilateralFilter(cv2.pyrMeanShiftFiltering(np.clip(sf, 0, 255).astype(np.uint8), 8, 10), 9, 16, 6)
pf = cv2.resize(pf, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
sf = cv2.resize(sf, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
pm = np.zeros((H, W), np.uint8)
cv2.fillPoly(pm, [np.round(np.array([to_px(X, Y) for X, Y in pave]) * S).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
a = (pm.astype(np.float32) / 255)[..., None]
img = np.clip(pf * a + sf * (1 - a), 0, 255).astype(np.uint8)
inner = cv2.erode((pm > 128).astype(np.uint8), np.ones((15, 15), np.uint8))


# the pavement's slabs: faint grout lines on a 5.5 BU grid centred on the plaza's axis (environ2's slabs are barely visible)
SLAB = 5.5
ax0 = FP['axis_x']
grout = np.zeros((H, W), np.float32)
for k in range(-12, 13):
    gx = int(round((ax0 + (k + 0.5) * SLAB - X0) * K))
    if 0 <= gx < W:
        cv2.line(grout, (gx, 0), (gx, H - 1), 1.0, 3, cv2.LINE_AA)
for k in range(0, 12):
    gy = int(round((Y1 - (53.0 + k * SLAB)) * K))
    if 0 <= gy < H:
        cv2.line(grout, (0, gy), (W - 1, gy), 1.0, 3, cv2.LINE_AA)
g = (grout * (inner > 0) * 0.07)[..., None]
img = np.clip(img * (1 - g), 0, 255).astype(np.uint8)


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


def ring_band(poly, d_out, d_in, bgr):
    """A band between two offsets of the pavement outline (a stripe)."""
    outer, inner = offset(poly, d_out), offset(poly, d_in)
    tmp = np.zeros((H, W), np.uint8)
    cv2.fillPoly(tmp, [np.round(np.array([to_px(*p) for p in outer]) * S).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
    hole = np.zeros((H, W), np.uint8)
    cv2.fillPoly(hole, [np.round(np.array([to_px(*p) for p in inner]) * S).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
    band = (tmp.astype(np.float32) * (1 - hole.astype(np.float32) / 255) / 255)[..., None]
    global img
    img = (img * (1 - band) + np.array(bgr, np.float32) * band).astype(np.uint8)


STRIPE = (196, 212, 214)                          # BGR pale grey
for d in (0.25, 0.6, 0.95):                       # three stripes just inside the pavement's edge
    ring_band(pave, -d + 0.1, -d - 0.1, STRIPE)
# the sand ring round the fountain
F = json.load(open('fountain_meas.json'))
cx, cy, R0 = F['cx'] * 100, F['cy'] * 100, F['R0'] * 100
ring = [(cx + (R0 + 0.9) * math.cos(t), cy + (R0 + 0.9) * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 180, endpoint=False)]
fill(ring, (140, 226, 246))
# dashed border lines (world x 31 and 1699)
for xw in A['safe_zone']:                          # the dashed lines are the rules' border (the safe zone's edges)
    X = (xw / w['unitsPerPlanUnit'] + w['planOriginX']) * 100
    for k in range(20):
        y = 53 + 2.4 * k
        fill([(X - 0.12, y), (X + 0.12, y), (X + 0.12, y + 1.2), (X - 0.12, y + 1.2)], (98, 140, 180))
# rugs: red with a darker border band and a lattice, pale fringes
ax = FP['axis_x']


def rug(c, length, width, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    P = lambda a, b: (c[0] + ca * a - sa * b, c[1] + sa * a + ca * b)
    rect = lambda l, wd: [P(-l / 2, -wd / 2), P(l / 2, -wd / 2), P(l / 2, wd / 2), P(-l / 2, wd / 2)]
    for e in (-1, 1):                              # fringes: short pale tassels
        for t in np.linspace(-width / 2 + 0.15, width / 2 - 0.15, 7):
            fill([P(e * length / 2, t - 0.06), P(e * (length / 2 + 0.35), t - 0.06), P(e * (length / 2 + 0.35), t + 0.06),
                  P(e * length / 2, t + 0.06)], (190, 175, 215))
    fill(rect(length, width), (110, 92, 190))     # outer border (rosy red)
    fill(rect(length - 0.35, width - 0.35), (92, 80, 206))
    for t in np.linspace(-length / 2 + 0.6, length / 2 - 0.6, 6):   # the lattice
        fill([P(t - 0.3, -width / 2 + 0.3), P(t - 0.2, -width / 2 + 0.3), P(t + 0.3, width / 2 - 0.3), P(t + 0.2, width / 2 - 0.3)], (86, 70, 160))
        fill([P(t + 0.3, -width / 2 + 0.3), P(t + 0.2, -width / 2 + 0.3), P(t - 0.3, width / 2 - 0.3), P(t - 0.2, width / 2 - 0.3)], (86, 70, 160))


for a_, b_ in FP['rugs']:
    c = ((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2)
    L_, W_ = abs(b_[0] - a_[0]), abs(b_[1] - a_[1])
    ang = 0.0 if L_ >= W_ else math.pi / 2
    rug(c, max(L_, W_), min(L_, W_), ang)
    rug((2 * ax - c[0], c[1]), max(L_, W_), min(L_, W_), ang)
a_, b_ = FP['rug_diag']
c = ((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2)
rug(c, 5.2, 1.6, math.radians(45))
rug((2 * ax - c[0], c[1]), 5.2, 1.6, math.radians(-45))
cv2.imwrite(OUT_PNG, img)
json.dump(dict(x0=X0, x1=X1, y0=Y0, y1=Y1, px_per_bu=K, size=[W, H]), open(OUT_JSON, 'w'))
print('floor', W, 'x', H)
