"""The rocks where the frame shows them (2026-11-03): ff physics hq 2.mp4 626.0 s, every rock pixel (lit faces, shaded faces, the navy
socket; beams taken out) on a 2 px grid; each pixel's camera ray marched to where it first enters the fitted blocks (fit_rocks.py's
superellipsoids; failing that, the same blocks 15% larger, for the outline's last pixels): our own surface, on the blocks' tops and sides,
whose outline is the frame's. Writes rock_mass.json (per rock: vertices in plan units relative to the frame's centre ground point, faces).

  python art/autumn_glade/rock_mass.py       (after fit_rocks.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z
from beams_emu import remove

STEP = 2
f = remove(cv2.imread('art/autumn_glade/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
rock = (H >= 100) & (H <= 135) & (S >= 40) & (V >= 80)
rock[95:375, :215] = False
ROCKS = json.load(open('art/autumn_glade/rocks.json'))


def inside(P, rk, grow=1.0):
    e1, e2 = rk['e1'], rk['e2']; hit = np.zeros(len(P), bool)
    for b in rk['blocks']:
        x = np.abs(P[:, 0] - b['cx']) / (b['w'] * grow); y = np.abs(P[:, 1] - b['cy']) / (b['d'] * grow); z = P[:, 2] / (b['h'] * grow)
        q = (x ** (2 / e2) + y ** (2 / e2)) ** (e2 / e1) + np.clip(z, 0, None) ** (2 / e1)
        hit |= (q <= 1) & (P[:, 2] >= 0)
    return hit


out = []
for rk in ROCKS:
    # the rock's window: its blocks' box on the screen, widened
    xs = [b['cx'] + s_ * b['w'] for b in rk['blocks'] for s_ in (-1.3, 1.3)]; ys = [b['cy'] + s_ * b['d'] for b in rk['blocks'] for s_ in (-1.3, 1.3)]
    zs = [b['h'] for b in rk['blocks']]
    from measure import ref
    pix = np.array([ref(x, Yc + y, z) for x in (min(xs), max(xs)) for y in (min(ys), max(ys)) for z in (0, max(zs) * 1.2)])
    x0, x1 = int(max(pix[:, 0].min() - 20, 0)), int(min(pix[:, 0].max() + 20, 1919)); y0, y1 = int(max(pix[:, 1].min() - 20, 0)), int(min(pix[:, 1].max() + 20, 1079))
    m = np.zeros(H.shape, np.uint8); m[y0:y1, x0:x1] = rock[y0:y1, x0:x1]
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1: m = (lab == 1 + int(np.argmax(st[1:, 4]))).astype(np.uint8)      # (the rock itself, not a speck)
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = m[gy, gx] > 0
    px, py = gx[ins].astype(float), gy[ins].astype(float)
    xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
    dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T; dirw /= np.linalg.norm(dirw, axis=1)[:, None]
    cam = _C * 100
    found = np.full(len(px), np.nan); pts = np.zeros((len(px), 3))
    for grow in (1.0, 1.15):
        todo = np.isnan(found)
        for tt in np.arange(60, 200, 0.05):                                # (march from 60 units out along each ray)
            P = cam[None, :] + dirw[todo] * tt
            Pp = np.c_[P[:, 0], P[:, 1] - Yc, P[:, 2]]
            hit = inside(Pp, rk, grow)
            if hit.any():
                ii = np.nonzero(todo)[0][hit]; found[ii] = tt; pts[ii] = Pp[hit]
                todo[ii] = False
            if not todo.any(): break
    ok = ~np.isnan(found)
    # its tones: the frame's rock pixels in four clusters (lit top, two sides, the navy socket), the label map smoothed (5 px), each
    # vertex the tone of the region it sits in: flat regions traced as sand.py's levels are, never the frame's pixels
    win = m > 0
    px_ = np.float32(f[win]); _, lab_, cen = cv2.kmeans(px_, 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full(H.shape, 255, np.uint8); lm[win] = lab_[:, 0]; lm = cv2.medianBlur(lm, 5)
    tone = ['#%02x%02x%02x' % tuple(int(v) for v in c[::-1]) for c in cen]
    vlab = lm[py.astype(int), px.astype(int)]
    vlab = np.where(vlab == 255, int(np.argmax([c.sum() for c in cen])), vlab)
    idx = -np.ones(gx.shape, int); sel = np.argwhere(ins)
    keep_i = np.nonzero(ok)[0]; idx[sel[keep_i, 0], sel[keep_i, 1]] = np.arange(len(keep_i))
    faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; k = [v for v in q if v >= 0]
            if len(k) == 4: faces.append([int(v) for v in q])
            elif len(k) == 3: faces.append([int(v) for v in k])
    out.append(dict(side=rk['side'], verts=[[round(float(a), 3) for a in p] for p in pts[ok]], faces=faces, tones=tone, tone=[int(v) for v in vlab[ok]]))
    print(rk['side'], int(ins.sum()), 'pixels,', int(ok.sum()), 'on the blocks,', len(faces), 'faces; tones', tone)
json.dump(out, open('art/autumn_glade/rock_mass.json', 'w'))
