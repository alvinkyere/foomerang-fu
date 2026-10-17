"""The plaza floor as our own clean vector artwork, top-down (plan space, 60 px per BU), for the 3D floor:
 * traced from environ2 (visible floor only; under objects the neighbouring region continues): the sand tones, and the soft
   shadow and light shapes on sand and pavement, as smooth vector shapes
 * drawn exactly (symmetric, straight): the pavement, its three edge stripes, the sand ring round the fountain, the six rugs with
   their border and fringes, the dashed border lines
Everything is drawn anti-aliased at high resolution, so the floor stays crisp on any screen.
python floor_vector.py <labels.npy> <palette.npy> <out.png> <out.json>"""
import sys, json, math
import cv2, numpy as np
import fit_stall as fs

LAB_PATH, PAL_PATH, OUT_PNG, OUT_JSON = sys.argv[1:5]
L = np.load(LAB_PATH)
pal = np.load(PAL_PATH)
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


lab_pal = cv2.cvtColor(pal.reshape(1, -1, 3), cv2.COLOR_BGR2LAB)[0].astype(int)
pavement_family = [k for k, (l, a, b) in enumerate(lab_pal) if l > 195 and b < 152]
order = np.argsort(-np.bincount(L.ravel(), minlength=len(pal)))


def traced(labels, mask_fn=None):
    """Each traced region's outer contours (camera px), unprojected to the plan, filled with its colour."""
    for k in order:
        if k not in labels:
            continue
        m = (L == k).astype(np.uint8)
        cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        for c, h in zip(cs, hier[0]):
            if cv2.contourArea(c) < 25 or h[3] != -1:
                continue
            c = cv2.approxPolyDP(c, 0.8, True)[:, 0].astype(float) + 0.5
            plan = [tuple(fs.unproj(x, y, 0)[:2]) for x, y in c]
            fill(plan, pal[k])


# 1. the sand tones (everything) 2. the pavement, exact 3. shade and light shapes on the pavement, clipped to it
traced([k for k in range(len(pal)) if k not in pavement_family])
pave = FP['pavement']
PAVE = (212, 244, 247)                            # BGR cream
fill(pave, PAVE)
pave_mask = np.zeros((H, W), np.uint8)
fill(pave, (255, 255, 255), target=pave_mask) if False else None
pm = np.zeros((H, W), np.uint8)
cv2.fillPoly(pm, [np.round(np.array([to_px(X, Y) for X, Y in pave]) * S).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
shade = img.copy()
for k in order:
    if k not in pavement_family or tuple(pal[k]) == tuple(pal[order[0]]):
        continue
    m = (L == k).astype(np.uint8)
    cs, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    for c, h in zip(cs, hier[0]):
        if cv2.contourArea(c) < 40 or h[3] != -1:
            continue
        c = cv2.approxPolyDP(c, 0.8, True)[:, 0].astype(float) + 0.5
        fill([tuple(fs.unproj(x, y, 0)[:2]) for x, y in c], pal[k], target=shade)
a = (pm.astype(np.float32) / 255)[..., None]
inside = cv2.erode(pm, np.ones((9, 9), np.uint8)).astype(np.float32)[..., None] / 255
img = (img * (1 - inside) + shade * inside).astype(np.uint8)


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
