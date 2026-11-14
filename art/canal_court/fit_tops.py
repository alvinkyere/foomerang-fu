"""The lavender solids' own outlines (2026-11-13): each one's top face is the frame's lightest lavender (V >= TOP_V: the light falls
from above), so its outline traced in the frame and put back on the plane its height up (measure.plan_at) is the solid's footprint.
The heights (and how far the rounded edge eats into the light top, GROW) are moved until the solids' silhouettes, drawn through the
camera, overlap the frame's lavender most. The tower's top is a ring (its pool in the middle): its outer outline; the channel's top
holds the water run: closed over it. Writes tops.json ({name: {h, pts}}), output/tops_fit.png.

  python art/canal_court/fit_tops.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import minimize
sys.path.insert(0, 'art/canal_court')
from measure import pix, plan_at

f = cv2.imread('art/canal_court/output/clean_ref.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H_, S_, V_ = hsv[..., 0], hsv[..., 1], hsv[..., 2]
lav = (H_ >= 105) & (H_ <= 135) & (S_ >= 40) & (V_ >= 95)
TOP_V = 200
water = (H_ >= 80) & (H_ <= 112) & (S_ >= 50) & (V_ >= 150)
top = (lav & (V_ >= TOP_V)) | water
# name: frame box of the top, the solid's frame box, a first height
SOLIDS = {
    'tower': ((440, 140, 800, 392), (420, 140, 800, 560), 5.3),
    'channel': ((560, 394, 1290, 600), (500, 330, 1290, 720), 4.3),
    'stub': ((395, 480, 600, 545), (395, 480, 620, 600), 2.4),
    'rock_sw': ((270, 700, 490, 890), (270, 700, 490, 900), 2.5),
    'rock_n': ((1430, 140, 1545, 300), (1430, 140, 1545, 300), 2.5),
    'rock_e': ((1580, 270, 1750, 340), (1580, 270, 1750, 385), 2.4),
    'rock_se': ((1640, 630, 1790, 850), (1640, 630, 1790, 850), 3.0),
}


def outline(name):
    (x0, y0, x1, y1) = SOLIDS[name][0]
    t_ = top if name in ('tower', 'channel') else lav & (V_ >= TOP_V)     # (water at a rock's foot, where its side meets the grass, is not its top)
    m = np.zeros(top.shape, np.uint8); m[y0:y1, x0:x1] = t_[y0:y1, x0:x1]
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    k = 1 + int(np.argmax(st[1:, 4]))
    cs, _ = cv2.findContours((lab == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    return cv2.approxPolyDP(c, 2.0, True).reshape(-1, 2).astype(float)


def grow(poly, d):
    """The plan polygon moved d outwards (its vertices along their bisectors)."""
    P = np.array(poly); n = len(P); a2 = sum(P[i, 0] * P[(i + 1) % n, 1] - P[(i + 1) % n, 0] * P[i, 1] for i in range(n)); s = 1 if a2 > 0 else -1
    out = []
    for i in range(n):
        e0 = P[i] - P[i - 1]; e1 = P[(i + 1) % n] - P[i]
        n0 = s * np.array([e0[1], -e0[0]]) / (np.linalg.norm(e0) + 1e-9); n1 = s * np.array([e1[1], -e1[0]]) / (np.linalg.norm(e1) + 1e-9)
        b = n0 + n1; bl = np.linalg.norm(b)
        out.append(P[i] + (b / bl) * d / max(0.35, (b / bl) @ n0) if bl > 1e-6 else P[i] + n0 * d)
    return np.array(out)


def silhouette(poly, h):
    m = np.zeros(lav.shape, np.uint8)
    lo = np.int32([pix(x, y, 0) for x, y in poly]); hi = np.int32([pix(x, y, h) for x, y in poly])
    cv2.fillPoly(m, [lo], 1); cv2.fillPoly(m, [hi], 1)
    for i in range(len(poly)):
        j = (i + 1) % len(poly); cv2.fillConvexPoly(m, np.int32([lo[i], lo[j], hi[j], hi[i]]), 1)
    return m > 0


cross2 = lambda a, b: a[0] * b[1] - a[1] * b[0]


def simplify(poly, keep, eps=0.2):
    """As blender/build.py's: Douglas-Peucker to eps, then the corner whose removal moves the outline least taken out till `keep` are left."""
    def dp(pts):
        if len(pts) < 3: return pts
        a, b = np.array(pts[0]), np.array(pts[-1]); ab = b - a; L = np.linalg.norm(ab) or 1e-9
        d = [abs(cross2(np.array(p) - a, ab)) / L for p in pts[1:-1]]; i = int(np.argmax(d))
        return dp(pts[:i + 2])[:-1] + dp(pts[i + 1:]) if d[i] > eps else [pts[0], pts[-1]]
    P = [tuple(p) for p in poly]; k = max(range(len(P)), key=lambda i: np.linalg.norm(np.array(P[i]) - P[0]))
    P = dp(P[:k + 1])[:-1] + dp(P[k:] + [P[0]])[:-1]
    while len(P) > keep:
        n = len(P)
        def cost(i):
            a, b, c = np.array(P[i - 1]), np.array(P[i]), np.array(P[(i + 1) % n]); ac = c - a
            return abs(cross2(b - a, ac)) / (np.linalg.norm(ac) or 1e-9)
        P.pop(min(range(n), key=cost))
    return np.array(P)


AQ = json.load(open('art/canal_court/aqueduct.json'))['tower']
octagon = lambda cx, cy, r: np.array([(cx + r * math.cos(math.pi / 8 + k * math.pi / 4), cy + r * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)])
INSET = 0.25          # (the rounded edge round the flat top: build.py's bevel, half of it showing light)
CORNERS = dict(channel=12, stub=4, rock_sw=5, rock_n=6, rock_e=7, rock_se=4)
OUT = {}
vis = f.copy()
# the aqueduct's three together (where they meet, the frame cannot say whose lavender it is), each rock alone; each solid's footprint
# as build.py makes it (the tower an octagon, the rest the traced top simplified to its corners), grown by its own amount
GROUPS = [('tower', 'channel', 'stub')] + [(n,) for n in SOLIDS if n.startswith('rock_')]
AQ_BOX = (380, 130, 1255, 740)
for group in GROUPS:
    pxs = {n: outline(n) for n in group}
    want = np.zeros(lav.shape, bool); reg = np.zeros(lav.shape, bool)
    (x0, y0, x1, y1) = AQ_BOX if len(group) > 1 else SOLIDS[group[0]][1]
    want[y0:y1, x0:x1] = lav[y0:y1, x0:x1] | water[y0:y1, x0:x1]
    reg[max(0, y0 - 40):y1 + 40, max(0, x0 - 40):x1 + 40] = True
    if len(group) > 1: reg[:, AQ_BOX[2]:] = False
    k = len(group)
    def footprint(n, h, g):
        if n == 'tower': return octagon(AQ['cx'], AQ['cy'], AQ['r'] + g)
        return grow(simplify(plan_at(pxs[n], h), CORNERS[n]), g)
    def footprints(v): return [footprint(n, v[i], v[k + i]) for i, n in enumerate(group)]
    def sil(v):
        s_ = np.zeros(lav.shape, bool)
        for i, P in enumerate(footprints(v)): s_ |= silhouette(P, v[i])
        return s_ & reg
    # (three classes, not one: the light top, the darker sides, the ground; a footprint too far north and too tall can cover the same
    # silhouette as the right one, but not the same top)
    want_top = want & ((V_ >= TOP_V) | water)
    def tops(v):
        t_ = np.zeros(lav.shape, np.uint8)
        for i, P in enumerate(footprints(v)): cv2.fillPoly(t_, [np.int32([pix(x, y, v[i]) for x, y in grow(P, -INSET)])], 1)
        return (t_ > 0) & reg
    def cost(v):
        s_ = sil(v); t_ = tops(v) & s_; sd = s_ & ~t_
        wt, ws = want_top, want & ~want_top
        return 1 - ((t_ & wt).sum() + (sd & ws).sum()) / max((s_ | want).sum(), 1)
    v0 = [SOLIDS[n][2] for n in group] + [0.1] * k
    best = v0
    for _ in range(2 if len(group) > 1 else 1):
        step = np.array([0.4] * k + [0.2] * k)          # (the first simplex: steps that change the silhouette by pixels)
        simplex = np.vstack([best] + [np.array(best) + np.eye(2 * k)[j] * step[j] for j in range(2 * k)])
        best = minimize(cost, best, method='Nelder-Mead', options=dict(xatol=0.005, fatol=1e-6, maxiter=3000, adaptive=True,
                                                                       initial_simplex=simplex)).x
    iou = 1 - cost(best)
    for i, (n, P) in enumerate(zip(group, footprints(best))):
        OUT[n] = dict(h=round(float(best[i]), 3), grow=round(float(best[k + i]), 3), iou=round(iou, 3), pts=[[round(float(x), 3), round(float(y), 3)] for x, y in P])
        print(n, 'h %.2f grow %.2f IoU %.3f' % (best[i], best[k + i], iou), len(P), 'points')
        cv2.polylines(vis, [np.int32([pix(x, y, best[i]) for x, y in P])], True, (0, 255, 0), 1)
    s_ = sil(best); vis[s_ & ~want] = (0, 0, 255); vis[want & ~s_ & reg] = (255, 0, 0)
json.dump(OUT, open('art/canal_court/tops.json', 'w'), indent=1)
cv2.imwrite('art/canal_court/output/tops_fit.png', vis)

# the water's own outlines on those tops: the tower's pool (at its top), the channel's run (at the channel's), the spout between them
# (where the pool spills over the tower's south rim down onto the channel: the run's part above the channel's top's outline)
pool_dark = (H_ >= 105) & (H_ <= 125) & (S_ >= 120) & (V_ < 215)          # (the tower's pool: deep blue round its pale foam)


def water_outline(box, h, eps=1.5, mask=None):
    x0, y0, x1, y1 = box; mask = water if mask is None else mask
    m = np.zeros(water.shape, np.uint8); m[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); k = 1 + int(np.argmax(st[1:, 4]))
    c = max(cv2.findContours((lab == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
    P = plan_at(cv2.approxPolyDP(c, eps, True).reshape(-1, 2).astype(float), h)
    return [[round(float(x), 3), round(float(y), 3)] for x, y in P]


W = dict(pool=dict(h=OUT['tower']['h'], pts=water_outline((470, 160, 760, 332), OUT['tower']['h'], mask=water | pool_dark)),
         run=dict(h=OUT['channel']['h'], pts=water_outline((560, 394, 1255, 600), OUT['channel']['h'])))
json.dump(W, open('art/canal_court/water.json', 'w'), indent=1)
print('pool', len(W['pool']['pts']), 'run', len(W['run']['pts']))

# the channel as the HQ built it: a band of one width along a zigzag centreline (its corners mitred), not the traced top simplified
# (which cuts the zigzag's outer corners); centreline, width and height moved for the three classes against the frame, the tower and
# the stub as fitted above
def ribbon(line, w):
    L = np.array(line, float); left, right = [], []
    for i, p in enumerate(L):
        ds = []
        if i > 0: ds.append((p - L[i - 1]) / np.linalg.norm(p - L[i - 1]))
        if i < len(L) - 1: ds.append((L[i + 1] - p) / np.linalg.norm(L[i + 1] - p))
        nrm = [np.array([-d[1], d[0]]) for d in ds]; b = sum(nrm); b = b / np.linalg.norm(b)
        k = w / 2 / max(0.3, b @ nrm[0]); left.append(p + b * k); right.append(p - b * k)
    return np.array(left + right[::-1])


line0 = np.array(json.load(open('art/canal_court/aqueduct.json'))['channel']['line'])
want = np.zeros(lav.shape, bool); want[AQ_BOX[1]:AQ_BOX[3], AQ_BOX[0]:AQ_BOX[2]] = (lav | water)[AQ_BOX[1]:AQ_BOX[3], AQ_BOX[0]:AQ_BOX[2]]
reg = np.zeros(lav.shape, bool); reg[AQ_BOX[1] - 40:AQ_BOX[3] + 40, AQ_BOX[0] - 40:AQ_BOX[2]] = True
fixed = np.zeros(lav.shape, bool); fixed_top = np.zeros(lav.shape, np.uint8)
for n in ('tower', 'stub'):
    fixed |= silhouette(OUT[n]['pts'], OUT[n]['h'])
    cv2.fillPoly(fixed_top, [np.int32([pix(x, y, OUT[n]['h']) for x, y in grow(np.array(OUT[n]['pts']), -INSET)])], 1)
want_top = want & ((V_ >= TOP_V) | water)


def ch_line(v):
    line = line0.copy(); line[1:] += v[:2 * (len(line0) - 1)].reshape(-1, 2)        # (the first point: the tower's middle, fixed)
    return line


def ch_shape(v):
    return ribbon(ch_line(v), v[-2]), v[-1]


def ch_cost(v):
    P, h = ch_shape(v)
    s_ = (silhouette(P, h) | fixed) & reg
    t_ = np.zeros(lav.shape, np.uint8); cv2.fillPoly(t_, [np.int32([pix(x, y, h) for x, y in grow(P, -INSET)])], 1)
    t_ = ((t_ > 0) | (fixed_top > 0)) & s_
    return 1 - ((t_ & want_top).sum() + ((s_ & ~t_) & (want & ~want_top)).sum()) / max((s_ | want).sum(), 1)


v = np.concatenate([np.zeros(2 * (len(line0) - 1)), [AQ_W := json.load(open('art/canal_court/aqueduct.json'))['channel']['width'], OUT['channel']['h']]])
for _ in range(3):
    simplex = np.vstack([v] + [v + np.eye(len(v))[j] * (0.4 if j < len(v) - 2 else 0.3) for j in range(len(v))])
    v = minimize(ch_cost, v, method='Nelder-Mead', options=dict(xatol=0.005, fatol=1e-6, maxiter=6000, adaptive=True, initial_simplex=simplex)).x
P, h = ch_shape(v)
print('channel ribbon: width %.2f h %.2f score %.3f' % (v[-2], h, 1 - ch_cost(v)))
OUT['channel'] = dict(h=round(float(h), 3), grow=0.0, iou=round(1 - ch_cost(v), 3), width=round(float(v[-2]), 3),
                      line=[[round(float(x), 3), round(float(y), 3)] for x, y in ch_line(v)],
                      pts=[[round(float(x), 3), round(float(y), 3)] for x, y in P])
json.dump(OUT, open('art/canal_court/tops.json', 'w'), indent=1)
W['run']['h'] = OUT['channel']['h']
W['run']['pts'] = water_outline((560, 394, 1255, 600), OUT['channel']['h'])
json.dump(W, open('art/canal_court/water.json', 'w'), indent=1)
