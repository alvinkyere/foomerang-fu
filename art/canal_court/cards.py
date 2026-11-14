"""What stands on the canal court (2026-11-13; after art/warm_up/cards.py), as traced cards: the game's camera never turns (it crops and zooms its one view), so an
object drawn on an upright plane through its foot, facing the camera, shows exactly as the HQ's from every framing the game uses, and
hides a player behind it as the HQ's does. For each object (OBJECTS: its box in the round's mosaic, how far it must differ from our
ground-and-moat render to count): its pixels, grouped into a few tones (k-means), the label map smoothed, each tone's regions traced as
polygons (with their holes): our own flat shapes in measured colours, never the video's pixels. Each pixel of an outline is put on the
card: the camera ray through it meets the plane through the object's foot. Writes cards.json for blender/build.py.

  python art/canal_court/cards.py <wide render.png>      (blender/build.py <dir> render wide)      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from measure import plan, plan_at, pix, Yc, R as _R, F as _F, C as _C, Z as _Z, MOSAIC_ORIGIN

OX, OY = MOSAIC_ORIGIN
# name: (mosaic box x0, y0, x1, y1), difference threshold, tones, foot (mosaic px; None: the lowest pixel)
# name: (frame box x0, y0, x1, y1), difference threshold, tones, foot (frame px and its height; None: the lowest pixel, on the ground)
HB = json.load(open('art/canal_court/basin.json'))['hb']
OBJECTS = {
    'barrel_nw': ((352, 138, 428, 222), 25, 5, None),
    'barrel_n': ((1158, 133, 1228, 207), 25, 5, None),
    'barrel_s': ((610, 728, 692, 814), 25, 5, None),
    'bucket': ((1016, 206, 1064, 260), 25, 4, None),
    'bench': ((1066, 203, 1172, 274), 25, 4, None),
    'rack': ((158, 336, 338, 438), 22, 10, (245, 430, 0.0)),
    'plank': ((1013, 793, 1100, 892), 25, 4, None),
    'urn_n': ((1398, 422, 1468, 478), 25, 5, (1432, 470, HB)),
    'urn_s': ((1283, 612, 1338, 672), 25, 5, (1305, 665, HB)),
    'leaf_c': ((838, 458, 874, 492), 18, 3, None),
    'tree_w': ((0, 0, 140, 330), 25, 7, (30, 300, 0.0)),
    'tree_ne': ((1760, 0, 1920, 150), 25, 6, (1790, 140, 0.0)),
    'tree_se': ((1860, 860, 1920, 1080), 25, 6, (1905, 1060, 0.0)),
    'tree_e': ((1870, 360, 1920, 460), 25, 4, (1900, 455, 0.0)),
    'post_n': ((436, 0, 480, 14), 25, 3, (458, 14, 0.0)),
}
r = cv2.imread(sys.argv[1]); mosaic = cv2.imread('art/canal_court/output/mosaic_chrome.png')
# (what stands tall smears in the mosaic, made while the camera moves: the READY frame's view (clean_ref: the mosaic's own pixels there,
# no player in them), laid into the mosaic's pixels, is traced instead)
m = mosaic.copy(); m[-OY:-OY + 1080, -OX:-OX + 1920] = cv2.imread('art/canal_court/output/clean_ref.png')
pens = np.zeros(m.shape[:2], bool)
FROM_MOSAIC = set()
m_frame = m
h = cv2.cvtColor(m, cv2.COLOR_BGR2HSV).astype(int)
teal = (h[..., 0] >= 68) & (h[..., 0] <= 92) & (h[..., 1] >= 60) & (h[..., 2] >= 140)
water = (h[..., 0] >= 96) & (h[..., 0] <= 112) & (h[..., 1] >= 90)            # (the moat's water: never part of an object)
cam = _C * 100
VIEW = _R.T @ np.array([0.0, 0.0, 1.0])


def ray(px, py):
    """The world direction (Blender units) through a frame pixel."""
    d_ = _R.T @ np.array([(px - 960) / (_F * _Z), (py - 540) / (_F * _Z), 1.0]); return d_ / np.linalg.norm(d_)


out = []
for name, ((x0, y0, x1, y1), thr, k, foot) in OBJECTS.items():
    x0, y0, x1, y1 = x0 - OX, y0 - OY, x1 - OX, y1 - OY
    foot = None if foot is None else (foot[0] - OX, foot[1] - OY, foot[2])
    m = mosaic if name in FROM_MOSAIC else m_frame
    d = np.abs(r.astype(int) - m.astype(int)).max(2); hh = cv2.cvtColor(m, cv2.COLOR_BGR2HSV).astype(int)
    teal = (hh[..., 0] >= 68) & (hh[..., 0] <= 92) & (hh[..., 1] >= 60) & (hh[..., 2] >= 140)
    water = (hh[..., 0] >= 96) & (hh[..., 0] <= 112) & (hh[..., 1] >= 90)
    mk = np.zeros(d.shape, np.uint8); mk[y0:y1, x0:x1] = (d > thr)[y0:y1, x0:x1]       # (the barrels' water is theirs: nothing here is left out by colour)
    if name == 'rack':        # (it stands on the kerb's pale bands: only its wood, tools and ropes, not the bands round them)
        bg = np.array([[0x8a, 0xe8, 0xf9], [0x81, 0xd0, 0xf3], [0xd0, 0xed, 0xf4], [0xb2, 0xd3, 0xe0], [0xe3, 0xf5, 0xf7], [0xd9, 0xe3, 0xda],
                       [0x93, 0xe9, 0xff], [0xc8, 0xe0, 0xe8]], float)       # (BGR: sand, skirt, light, tan, court, shadow, sand, shade)
        dist = np.min(np.linalg.norm(m.astype(float)[y0:y1, x0:x1, None, :] - bg[None, None], axis=3), axis=2)
        mk[y0:y1, x0:x1] = (dist > 34).astype(np.uint8)
    mk = cv2.morphologyEx(cv2.morphologyEx(mk, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(mk)
    if n < 2: continue
    big = 1 + int(np.argmax(st[1:, 4])); keep = [i for i in range(1, n) if st[i, 4] >= max(40, 0.05 * st[big, 4])]
    mk = np.isin(lab, keep)
    if foot is None:
        ys, xs = np.nonzero(mk); j = int(np.argmax(ys)); foot = (int(xs[ys >= ys.max() - 3].mean()), int(ys.max()), 0.0)
    fx, fy = plan_at([(foot[0] + OX, foot[1] + OY)], foot[2])[0]
    A = np.array([fx, Yc + fy, foot[2]])                       # (plan units, as the camera's centre x 100 is)
    def on_card(px, py):
        d_ = ray(px + OX, py + OY); t = ((A - cam) @ VIEW) / (d_ @ VIEW); p = cam + d_ * t
        if p[2] < 0.01:      # (below the ground on the card: what lies on the ground in front of the foot, fallen leaves: flat on it)
            t = (0.01 - cam[2]) / d_[2]; p = cam + d_ * t
        return [round(float(p[0]), 3), round(float(p[1] - Yc), 3), round(float(p[2]), 3)]
    px_ = np.float32(m[mk]); kk = min(k, max(2, len(px_) // 300))
    if len(px_) < kk: continue
    _, lab_, cen = cv2.kmeans(px_, kk, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full(d.shape, 255, np.uint8); lm[mk] = lab_[:, 0]; lm = cv2.medianBlur(lm, 3 if name == 'rack' else 5); lm[~mk] = 255
    # each tone's regions; drawn largest tone first, the rest over it a hair nearer the camera
    order = sorted(range(kk), key=lambda q: -(lm == q).sum())
    layers = []
    for li, q in enumerate(order):
        tm = (lm == q).astype(np.uint8)
        if li == 0: tm = mk.astype(np.uint8)                   # (the first tone fills the whole object: no gaps between tones)
        cs, hier = cv2.findContours(tm, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hier is None: continue
        colour = '#%02x%02x%02x' % tuple(int(v) for v in cen[q][::-1])
        for ci, c in enumerate(cs):
            if hier[0][ci][3] >= 0 or cv2.contourArea(c) < 12: continue
            loops = [c] + [cs[hj] for hj in range(len(cs)) if hier[0][hj][3] == ci and cv2.contourArea(cs[hj]) >= 12]
            polys = []
            for lp in loops:
                ap = cv2.approxPolyDP(lp, 0.7, True).reshape(-1, 2)
                if len(ap) >= 3: polys.append([on_card(float(u), float(v)) for u, v in ap])
            if polys: layers.append(dict(colour=colour, layer=li, loops=polys))
    out.append(dict(name=name, anchor=[round(float(fx), 3), round(float(fy), 3)], shapes=layers))
    print(name, 'foot', [round(float(fx), 2), round(float(fy), 2)], int(mk.sum()), 'px,', len(layers), 'shapes')
json.dump(out, open('art/canal_court/cards.json', 'w'))
