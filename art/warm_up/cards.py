"""What stands on the warm-up's ground, as traced cards (2026-11-12): the game's camera never turns (it crops and zooms its one view), so an
object drawn on an upright plane through its foot, facing the camera, shows exactly as the HQ's from every framing the game uses, and
hides a player behind it as the HQ's does. For each object (OBJECTS: its box in the round's mosaic, how far it must differ from our
ground-and-moat render to count): its pixels, grouped into a few tones (k-means), the label map smoothed, each tone's regions traced as
polygons (with their holes): our own flat shapes in measured colours, never the video's pixels. Each pixel of an outline is put on the
card: the camera ray through it meets the plane through the object's foot. Writes cards.json for blender/build.py.

  python art/warm_up/cards.py <wide render.png>      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up')
from measure import plan, pix, Yc, R as _R, F as _F, C as _C, Z as _Z, MOSAIC_ORIGIN

OX, OY = MOSAIC_ORIGIN
# name: (mosaic box x0, y0, x1, y1), difference threshold, tones, foot (mosaic px; None: the lowest pixel)
OBJECTS = {
    'tree_w': ((327, 187, 507, 440), 30, 7, (420, 380)),
    'tree_red': ((887, 400, 1080, 640), 30, 7, (1000, 570)),
    'tree_e': ((1700, 460, 1925, 680), 30, 7, (1770, 670)),
    'stump': ((933, 40, 1027, 110), 25, 4, None),
    'pot_ne': ((1733, 40, 1813, 110), 25, 4, None),
    'bunting': ((1867, 30, 2060, 135), 25, 4, None),
    'aloe_w': ((113, 610, 195, 695), 22, 4, None),
    'tuft_s': ((953, 790, 1040, 850), 20, 3, None),
    'tuft_e': ((1545, 850, 1602, 895), 20, 3, None),
    'bamboo_sw': ((373, 850, 475, 1045), 18, 4, None),
    'bamboo_e': ((1915, 500, 2050, 750), 18, 4, None),
    'bamboo_se': ((1870, 855, 1955, 990), 18, 4, None),
}
r = cv2.imread(sys.argv[1]); m = cv2.imread('art/warm_up/output/mosaic_chrome.png')
d = np.abs(r.astype(int) - m.astype(int)).max(2)
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
    mk = np.zeros(d.shape, np.uint8); mk[y0:y1, x0:x1] = ((d > thr) & ~teal & ~water)[y0:y1, x0:x1]
    mk = cv2.morphologyEx(cv2.morphologyEx(mk, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(mk)
    if n < 2: continue
    big = 1 + int(np.argmax(st[1:, 4])); keep = [i for i in range(1, n) if st[i, 4] >= max(40, 0.05 * st[big, 4])]
    mk = np.isin(lab, keep)
    if foot is None:
        ys, xs = np.nonzero(mk); j = int(np.argmax(ys)); foot = (int(xs[ys >= ys.max() - 3].mean()), int(ys.max()))
    fx, fy = plan([(foot[0] + OX, foot[1] + OY)])[0]
    A = np.array([fx, Yc + fy, 0.0])                       # (plan units, as the camera's centre x 100 is)
    def on_card(px, py):
        d_ = ray(px + OX, py + OY); t = ((A - cam) @ VIEW) / (d_ @ VIEW); p = cam + d_ * t
        return [round(float(p[0]), 3), round(float(p[1] - Yc), 3), round(float(p[2]), 3)]
    px_ = np.float32(m[mk]); kk = min(k, max(2, len(px_) // 300))
    _, lab_, cen = cv2.kmeans(px_, kk, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full(d.shape, 255, np.uint8); lm[mk] = lab_[:, 0]; lm = cv2.medianBlur(lm, 5); lm[~mk] = 255
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
json.dump(out, open('art/warm_up/cards.json', 'w'))
