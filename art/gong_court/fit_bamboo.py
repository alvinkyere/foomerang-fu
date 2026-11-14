"""The gong court's bamboo stalks fitted to the still view (2026-11-14): each stalk as props.py reads it by hand (foot px, top px, width
px) moved a pixel at a time, keeping a move when the stalk painted over the court without bamboo (a render: blender/build.py
`nobamboo`) comes closer to the HQ (mean Lab difference over the stalk's neighbourhood). The painter draws what build.py builds,
flat: the stalk's silhouette shaded across from the west's colour to the east's, its dark sleeve a unit up, its cut top; a stalk standing behind a
stone body (the ray south from its foot meets the body) is hidden where that body stands on screen. The sprays are not painted (they
are the same for every move), so each move is held within 6 px of the reading and the width within a quarter of it. Writes bamboo_fit.json (name -> foot px, top px, width px), which props.py takes over its hand readings.

  python art/gong_court/fit_bamboo.py <render without bamboo.png> [passes]      (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
from scipy.optimize import least_squares
sys.path.insert(0, 'art/gong_court')
from measure import plan, pix, MOSAIC_ORIGIN
from geom import prisms
import props as P

OX, OY = MOSAIC_ORIGIN
base = cv2.imread(sys.argv[1]).astype(np.float32); PASSES = int(sys.argv[2]) if len(sys.argv) > 2 else 3
hq = cv2.imread('art/gong_court/output/mosaic_chrome.png')[-OY:-OY + 1080, -OX:-OX + 1920]
lab = lambda im: cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_BGR2Lab).astype(np.float32) * [100 / 255, 1, 1]
HQL = lab(hq.astype(np.float32))
hexbgr = lambda h: np.float32([int(h[5:7], 16), int(h[3:5], 16), int(h[1:3], 16)])
WEST, EAST, SLEEVE = hexbgr('#8fc56a'), hexbgr('#b0dd80'), hexbgr('#62a462')
PR = prisms()


def silhouette(name):
    poly, h, _, _ = PR[name]; m = np.zeros((1080, 1920), np.uint8)
    up = np.int32([pix(x, y, h) for x, y in poly]); dn = np.int32([pix(x, y, 0) for x, y in poly])
    cv2.fillPoly(m, [up], 1); cv2.fillPoly(m, [dn], 1)
    for i in range(len(poly)): j = (i + 1) % len(poly); cv2.fillConvexPoly(m, np.int32([up[i], up[j], dn[j], dn[i]]), 1)
    return m > 0


def behind(fx, fy):
    """The stone bodies a stalk at (fx, fy) stands behind: the ray south from its foot crosses their outline."""
    out = []
    for n, (poly, h, _, _) in PR.items():
        for i in range(len(poly)):
            (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
            if (x0 - fx) * (x1 - fx) <= 0 and x0 != x1:
                yy = y0 + (y1 - y0) * (fx - x0) / (x1 - x0)
                if yy < fy - 0.05: out.append(n); break
    return out


SIL = {}


def stalk3d(foot_px, fz, top_px, width):
    fx, fy = [float(v) for v in plan([foot_px], z=fz)[0]]
    res = least_squares(lambda v: np.array(pix(fx + v[0], fy, v[1])) - np.array(top_px), [0.0, fz + 4.0])
    dx, z = [float(v) for v in res.x]
    mid = pix(fx + dx / 2, fy, (fz + z) / 2); unit = pix(fx + dx / 2 + 1, fy, (fz + z) / 2)[0] - mid[0]
    return fx, fy, fz, fx + dx, z, width / unit / 2


def paint(img, foot_px, fz, top_px, width):
    fx, fy, fz, tx, tz, r = stalk3d(foot_px, fz, top_px, width)
    q = np.float32([pix(fx - r, fy, fz), pix(fx + r, fy, fz), pix(tx + r, fy, tz), pix(tx - r, fy, tz)])
    x0, y0 = np.floor(q.min(0)).astype(int) - 1; x1, y1 = np.ceil(q.max(0)).astype(int) + 2
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, 1920), min(y1, 1080)
    if x1 <= x0 or y1 <= y0: return img
    m = np.zeros((y1 - y0, x1 - x0), np.uint8); cv2.fillConvexPoly(m, np.int32(np.round((q - [x0, y0]) * 4)), 1, shift=2)
    # across: 0 at the west edge, 1 at the east (the stalk's axis on screen); up: the height above the foot
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    a, b = np.float32(pix(fx, fy, fz)), np.float32(pix(tx, fy, tz)); ax = (b - a) / np.linalg.norm(b - a); nrm = np.float32([-ax[1], ax[0]])
    half = abs((q[1] - q[0]) @ nrm) / 2
    across = np.clip(((xx - a[0]) * nrm[0] + (yy - a[1]) * nrm[1]) / max(half, 0.5) * 0.5 + 0.5, 0, 1)
    if nrm[0] < 0: across = 1 - across
    along = ((xx - a[0]) * ax[0] + (yy - a[1]) * ax[1]) / np.linalg.norm(b - a) * np.hypot(tx - fx, tz - fz)
    col = WEST[None, None] * (1 - across[..., None]) + EAST[None, None] * across[..., None]
    col = np.where((along < 1.1)[..., None], SLEEVE[None, None], col)
    keep = m > 0
    for n in behind(fx, fy):
        if n not in SIL: SIL[n] = silhouette(n)
        keep &= ~SIL[n][y0:y1, x0:x1]
    img[y0:y1, x0:x1][keep] = col[keep]
    # the cut top: its six-sided rim and the hollow in it (as build.py: corners at 0, 60 .. deg from east)
    ang = np.radians(np.arange(6) * 60)
    rim = np.float32([pix(tx + r * np.cos(t), fy - r * np.sin(t), tz) for t in ang]); hol = np.float32([pix(tx + 0.55 * r * np.cos(t), fy - 0.55 * r * np.sin(t), tz - 0.12) for t in ang])
    cm = np.zeros((1080, 1920), np.uint8); cv2.fillConvexPoly(cm, np.int32(np.round(rim * 4)), 1, shift=2)
    hm = np.zeros((1080, 1920), np.uint8); cv2.fillConvexPoly(hm, np.int32(np.round(hol * 4)), 1, shift=2)
    img[cm > 0] = hexbgr('#8cc874'); img[hm > 0] = hexbgr('#519855')
    return img


def score(params, name, box):
    foot, fz, top, w = params
    img = base.copy(); paint(img, foot, fz, top, w)
    x0, y0, x1, y1 = box
    return float(np.linalg.norm(lab(img[y0:y1, x0:x1]) - HQL[y0:y1, x0:x1], axis=2).mean())


H = {s: v[1] for s, v in PR.items()}
out = {}
for name, (foot, on, top, width, _) in P.STALKS.items():
    if top[0] is None or name.startswith('se'): continue      # (the south-east's lean towards the camera: the sideways-only model fits it badly)
    fz = 0.0 if on == 0 else PR[on][1]
    xs = [foot[0], top[0]]; ys = [foot[1], top[1]]
    box = (max(0, min(xs) - 25), max(0, min(ys) - 20), min(1920, max(xs) + 25), min(1080, max(ys) + 20))
    if box[2] - box[0] < 10 or box[3] - box[1] < 10: continue
    cur = [list(foot), fz, list(top), width]; best = score(cur, name, box); start = best
    for _ in range(PASSES):
        moved = False
        for k, j, d in [(0, 0, 1), (0, 0, -1), (0, 1, 1), (0, 1, -1), (2, 0, 1), (2, 0, -1), (2, 1, 1), (2, 1, -1), (3, None, 1), (3, None, -1)]:
            while True:
                t = [list(cur[0]), cur[1], list(cur[2]), cur[3]]
                if j is None: t[3] = max(6, t[3] + d)
                else: t[k][j] += d
                # (within 6 px of the reading and its width within a quarter: unpainted leaves must not pull a stalk over them)
                if abs(t[0][0] - foot[0]) > 6 or abs(t[0][1] - foot[1]) > 6 or abs(t[2][0] - top[0]) > 6 or abs(t[2][1] - top[1]) > 6: break
                if abs(t[3] - width) > 0.25 * width: break
                s = score(t, name, box)
                if s < best - 1e-3: best, cur, moved = s, t, True
                else: break
        if not moved: break
    out[name] = dict(foot=cur[0], top=cur[2], width=cur[3])
    print('%-4s %.2f -> %.2f  foot %s top %s width %d (was %s %s %d)' % (name, start, best, cur[0], cur[2], cur[3], list(foot), list(top), width))
json.dump(out, open('art/gong_court/bamboo_fit.json', 'w'), indent=1)
