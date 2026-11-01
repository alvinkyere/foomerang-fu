"""Fits each log (a cylinder lying on the sand: two end points, a radius; its axis at the radius' height) to the frame (ff physics hq 2.mp4
626.0 s). The silhouette is the hull of the projected end circles; the target is the log's body (dark red-brown) plus its paler cut end,
in a window round the log. The third log (top right) lies in the light shafts and is paler: it gets a looser colour window.
Writes logs.json (plan units, relative to the frame's centre ground point).

  python art/autumn_glade/fit_logs.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/autumn_glade')
from measure import R, F, C, Z, Yc

f = cv2.imread('art/autumn_glade/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
hud = np.arange(1920)[None, :] > 215
body = hud & ((H >= 166) | (H <= 6)) & (S >= 55) & (S <= 150) & (V >= 70) & (V < 190)
cap = hud & ((H >= 166) | (H <= 14)) & (S >= 30) & (S <= 110) & (V >= 150) & (V < 225)
L = json.load(open('art/autumn_glade/layout.json'))


def project(P):
    v = (R @ ((np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100 - C).T)).T
    x, y = F * v[:, 0] / v[:, 2] + 960, F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * Z, 540 + (y - 540) * Z]


def cylinder(p):
    x0, y0, x1, y1, r = p
    a = np.array([x1 - x0, y1 - y0]); n = a / np.hypot(*a); nx, ny = -n[1], n[0]
    pts = []
    for (x, y) in ((x0, y0), (x1, y1)):
        for t in np.linspace(0, 2 * math.pi, 16, endpoint=False):
            pts.append((x + nx * math.cos(t) * r, y + ny * math.cos(t) * r, r + math.sin(t) * r))
    return np.array(pts)


def target(win):
    x, y, w, h_ = win
    reg = np.zeros(H.shape, bool); reg[max(y, 0):y + h_, max(x, 0):x + w] = True
    t = (body & reg).astype(np.uint8)
    t = cv2.morphologyEx(t, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    c = cv2.dilate(t, np.ones((17, 17), np.uint8)) > 0
    return ((t > 0) | (cap & reg & c)), reg


def score(p, t, reg):
    m = np.zeros(t.shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(project(cylinder(p)).astype(np.float32)).astype(np.int32), 1)
    m = (m > 0) & reg
    return -((m & t).sum() / max((m | t).sum(), 1))


logs = []
starts = [(it['box'], it['px']) for it in L['log']]
ends = [[(0, 0), (0, 0)]]
items = []
def ends_of(b):
    d = [math.hypot(b[(i + 1) % 4][0] - b[i][0], b[(i + 1) % 4][1] - b[i][1]) for i in range(2)]
    i = 0 if d[0] >= d[1] else 1
    p, q, r, s = b[i], b[(i + 1) % 4], b[(i + 2) % 4], b[(i + 3) % 4]
    return [((p[0] + s[0]) / 2, (p[1] + s[1]) / 2), ((q[0] + r[0]) / 2, (q[1] + r[1]) / 2)]
for it in L['log']:
    (ax, ay), (bx, by) = ends_of(it['box']); x, y = it['px']
    items.append(((ax, ay, bx, by), (x - 130, y - 150, 260, 300)))
(ax, ay), (bx, by) = L['log3']['ends']
items.append(((ax, ay, bx, by), (1500, 60, 260, 240)))
for k, (e, win) in enumerate(items):
    t, reg = target(win)
    b = [(e[0] - 2, e[0] + 2), (e[1] - 2, e[1] + 2), (e[2] - 2, e[2] + 2), (e[3] - 2, e[3] + 2), (0.45, 0.9)]
    res = differential_evolution(score, b, args=(t, reg), seed=3, maxiter=80, popsize=14, tol=1e-4, polish=False)
    logs.append(dict(ends=[[round(float(res.x[0]), 2), round(float(res.x[1]), 2)], [round(float(res.x[2]), 2), round(float(res.x[3]), 2)]], r=round(float(res.x[4]), 2), iou=round(float(-res.fun), 3)))
    print(k, logs[-1])
json.dump(logs, open('art/autumn_glade/logs.json', 'w'), indent=1)
