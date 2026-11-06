"""The hex meadow's rocks where the frame shows them (2026-11-06): ff physics hq 2.mp4 1202.0 s, every rock pixel, and where a pad, a tree
or a player hides it the fitted block's own outline (fit_rocks.py), on a 2 px grid; each pixel's camera ray marched to where it first
enters the fitted block (a turned superellipsoid; failing that the block 12% larger, for the outline's last pixels): our own surface whose
outline is the frame's. Its shading is our own model fitted to the frame: per rock, the colour as a linear function of the surface's
normal (r, g, b = A [1, nx, ny, nz, nz^2], least squares over the rock's seen pixels), so the hidden parts are lit as the seen ones.
Writes rock_mass.json (per rock: vertices in plan units relative to the frame's centre ground point, faces, a colour per vertex).

  python art/hex_meadow/rock_mass.py       (after fit_rocks.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
HUD = np.load('art/hex_meadow/output/hud_hidden.npy')      # (the players' names' letters: hud_mask.py)
sys.path.insert(0, 'art/hex_meadow')
from measure import Yc, ref, R as _R, F as _F, C as _C, Z as _Z

STEP = 2
f = cv2.imread('art/hex_meadow/output/reference_fill.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
rock = (H >= 100) & (H <= 135) & (S >= 40) & (V >= 80); rock[HUD] = False
ground = (H >= 28) & (H <= 50) & (S >= 60)
ROCKS = json.load(open('art/hex_meadow/rocks.json'))


def local(P, rk):
    c, s = math.cos(math.radians(rk['yaw'])), math.sin(math.radians(rk['yaw']))
    dx, dy = P[:, 0] - rk['cx'], P[:, 1] - rk['cy']
    return c * dx + s * dy, -s * dx + c * dy


def inside(P, rk, grow=1.0):
    lx, ly = local(P, rk)
    x = np.abs(lx) / (rk['w'] * grow); y = np.abs(ly) / (rk['d'] * grow); z = P[:, 2] / (rk['h'] * grow)
    q = (x ** (2 / rk['e2']) + y ** (2 / rk['e2'])) ** (rk['e2'] / rk['e1']) + np.clip(z, 0, None) ** (2 / rk['e1'])
    return (q <= 1) & (P[:, 2] >= 0)


def normal(P, rk):
    """The superellipsoid's outward normal (the gradient of its inside-outside function, numerically)."""
    e = 1e-3; g = []
    def F_(Q):
        lx, ly = local(Q, rk)
        x = np.abs(lx) / rk['w'] + 1e-9; y = np.abs(ly) / rk['d'] + 1e-9; z = np.clip(Q[:, 2], 0, None) / rk['h'] + 1e-9
        return (x ** (2 / rk['e2']) + y ** (2 / rk['e2'])) ** (rk['e2'] / rk['e1']) + z ** (2 / rk['e1'])
    for k in range(3):
        d = np.zeros(3); d[k] = e; g.append((F_(P + d) - F_(P - d)) / (2 * e))
    n = np.stack(g, 1); return n / (np.linalg.norm(n, axis=1)[:, None] + 1e-12)


def project_mask(rk, grow=1.0):
    u = np.linspace(0, math.pi / 2, 30)[:, None]; v = np.linspace(0, 2 * math.pi, 80)[None, :]
    fx, fy = np.sign(np.cos(v)) * np.abs(np.cos(v)) ** rk['e2'], np.sign(np.sin(v)) * np.abs(np.sin(v)) ** rk['e2']
    k = np.abs(np.cos(u)) ** rk['e1']; lx, ly = rk['w'] * grow * fx * k, rk['d'] * grow * fy * k
    c, s = math.cos(math.radians(rk['yaw'])), math.sin(math.radians(rk['yaw']))
    X, Y, Zz = rk['cx'] + c * lx - s * ly, rk['cy'] + s * lx + c * ly, rk['h'] * grow * np.abs(np.sin(u)) ** rk['e1'] + 0 * v
    pts = np.array([ref(x, Yc + y, z) for x, y, z in zip(X.ravel(), Y.ravel(), Zz.ravel())], np.float32)
    m = np.zeros(H.shape, np.uint8); cv2.fillConvexPoly(m, cv2.convexHull(pts).astype(np.int32), 1)
    return m > 0


out = []
for rk in ROCKS:
    model = project_mask(rk)
    near = cv2.dilate(model.astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
    seen = rock & near
    seen = cv2.morphologyEx(cv2.morphologyEx(seen.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(seen.astype(np.uint8))
    if n > 1: seen = lab == 1 + int(np.argmax(st[1:, 4]))
    # what hides the rock (neither rock nor ground: pads, a canopy, a player): the model's outline there
    hidden = model & ~seen & ~ground
    m = seen | hidden
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = m[gy, gx]
    px, py = gx[ins].astype(float), gy[ins].astype(float)
    xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
    dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T; dirw /= np.linalg.norm(dirw, axis=1)[:, None]
    cam = _C * 100
    found = np.full(len(px), np.nan); pts = np.zeros((len(px), 3))
    for grow in (1.0, 1.12):
        todo = np.isnan(found)
        for tt in np.arange(60, 260, 0.05):
            P = cam[None, :] + dirw[todo] * tt
            Pp = np.c_[P[:, 0], P[:, 1] - Yc, P[:, 2]]
            hit = inside(Pp, rk, grow)
            if hit.any():
                ii = np.nonzero(todo)[0][hit]; found[ii] = tt; pts[ii] = Pp[hit]; todo[ii] = False
            if not todo.any(): break
    ok = ~np.isnan(found)
    # the shading model: colour from the normal, fitted on the seen pixels (each pixel's normal on the block)
    nr = normal(pts[ok], rk); feat = np.c_[np.ones(len(nr)), nr, nr[:, 2] ** 2]
    sv = seen[py[ok].astype(int), px[ok].astype(int)]
    col = f[py[ok].astype(int), px[ok].astype(int)].astype(float)
    A, *_ = np.linalg.lstsq(feat[sv], col[sv], rcond=None)
    pred = np.clip(feat @ A, 0, 255)
    err = np.abs(pred[sv] - col[sv]).mean()
    # crisp, as the frame's faces are: its rock pixels in five tones (k-means), the label map smoothed (5 px); a seen vertex takes its
    # region's tone, a hidden one the tone nearest the model's colour for it
    win = seen & near
    px_ = np.float32(f[win]); _, lab_, cen = cv2.kmeans(px_, 5, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full(H.shape, 255, np.uint8); lm[win] = lab_[:, 0]; lm = cv2.medianBlur(lm, 5)
    vl = lm[py[ok].astype(int), px[ok].astype(int)]
    nearest = np.argmin(((pred[:, None, :] - cen[None, :, :]) ** 2).sum(2), 1)
    vl = np.where(sv & (vl != 255), vl, nearest)
    pred = cen[vl]
    idx = -np.ones(gx.shape, int); sel = np.argwhere(ins)
    keep_i = np.nonzero(ok)[0]; idx[sel[keep_i, 0], sel[keep_i, 1]] = np.arange(len(keep_i))
    faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; k = [v for v in q if v >= 0]
            if len(k) == 4: faces.append([int(v) for v in q])
            elif len(k) == 3: faces.append([int(v) for v in k])
    out.append(dict(px=rk['px'], verts=[[round(float(a), 3) for a in p] for p in pts[ok]], faces=faces,
                    bgr=[[int(round(v)) for v in c] for c in pred]))
    print(rk['px'], int(seen.sum()), 'seen px,', int(hidden.sum()), 'hidden,', int(ok.sum()), 'verts,', len(faces), 'faces; shading error %.1f levels' % err)
json.dump(out, open('art/hex_meadow/rock_mass.json', 'w'))
