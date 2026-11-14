"""What stands on the gong court's ground, as traced cards (2026-11-12; after art/warm_up/cards.py): the game's camera never turns (it crops and zooms its one view), so an
object drawn on an upright plane through its foot, facing the camera, shows exactly as the HQ's from every framing the game uses, and
hides a player behind it as the HQ's does. For each object (OBJECTS: its box in the round's mosaic, how far it must differ from our
ground-and-moat render to count): its pixels, grouped into a few tones (k-means), the label map smoothed, each tone's regions traced as
polygons (with their holes): our own flat shapes in measured colours, never the video's pixels. Each pixel of an outline is put on the
card: the camera ray through it meets the plane through the object's foot. Writes cards.json for blender/build.py.

  python art/gong_court/cards.py <wide render.png>      (the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import plan, pix, Yc, R as _R, F as _F, C as _C, Z as _Z, MOSAIC_ORIGIN

OX, OY = MOSAIC_ORIGIN
# name: (mosaic box x0, y0, x1, y1), difference threshold, tones, foot (mosaic px; None: the lowest pixel)
OBJECTS = {
    'tree_nw': ((560, 0, 800, 245), 30, 7, (670, 205, 'plat_nw')),
    'tree_w': ((225, 255, 455, 535), 30, 7, (370, 500)),
    'tree_n': ((780, 0, 920, 75), 30, 6, (850, 60)),
    'tree_e': ((1785, 550, 1995, 805), 30, 7, (1890, 790)),
    'tree_se': ((1480, 1000, 1760, 1300), 30, 7, (1615, 1280)),
    'tree_sw': ((0, 1050, 165, 1240), 30, 6, (80, 1225)),
    'pot_nw': ((365, 0, 435, 75), 25, 4, None),
    'pot_e1': ((1760, 745, 1835, 845), 25, 4, None),
    'pot_e2': ((1785, 810, 1905, 895), 25, 4, None),
    'pot_n': ((1295, 425, 1350, 480), 25, 4, None),
    'gong': ((1420, 30, 1700, 310), 25, 6, (1560, 290, 'plat_ne')),
    'aloe_sw': ((520, 980, 645, 1070), 20, 4, (580, 1060, 'plat_sw_hi')),
    'aloe_se': ((1680, 905, 1785, 1025), 20, 4, (1730, 1020, 'plat_se_hi')),
    'bamboo_nw': ((585, 260, 680, 420), 18, 7, None),
    'bamboo_n': ((995, 0, 1175, 165), 18, 7, None),
    'bamboo_w': ((385, 730, 500, 890), 18, 7, None),
    'bamboo_c': ((740, 455, 980, 760), 18, 8, (860, 740)),
    'bamboo_ne': ((1675, 250, 1770, 380), 18, 7, None),
    'bamboo_s': ((760, 1110, 845, 1240), 18, 7, None),
    'bamboo_se': ((1335, 1060, 1470, 1245), 18, 7, None),
    'bush_ne': ((1475, 355, 1565, 470), 20, 3, None),
    'bush_w': ((545, 590, 610, 690), 20, 3, None),
    'flower_w1': ((405, 615, 465, 665), 20, 3, None),
    'flower_w2': ((355, 700, 415, 745), 20, 3, None),
}
r = cv2.imread(sys.argv[1]); m = cv2.imread('art/gong_court/output/mosaic_chrome.png')
d = np.abs(r.astype(int) - m.astype(int)).max(2)
h = cv2.cvtColor(m, cv2.COLOR_BGR2HSV).astype(int)
teal = np.zeros(h.shape[:2], bool)
water = np.zeros(h.shape[:2], bool)
# (the stone is drawn as stone, never on a card: lavender pixels inside its silhouettes stay out of every card)
from geom import prisms as _prisms
_sil = np.zeros(h.shape[:2], np.uint8)
for _p, _hh, _m, _k in _prisms().values():
    _up = np.float32([pix(x, y, _hh) for x, y in _p]) - [OX, OY]; _dn = np.float32([pix(x, y, 0) for x, y in _p]) - [OX, OY]
    cv2.fillPoly(_sil, [np.int32(_up)], 1); cv2.fillPoly(_sil, [np.int32(_dn)], 1)
    for _i in range(len(_p)): _j = (_i + 1) % len(_p); cv2.fillConvexPoly(_sil, np.int32([_up[_i], _up[_j], _dn[_j], _dn[_i]]), 1)
_stoneish = (h[..., 0] >= 105) & (h[..., 0] <= 140) & (h[..., 1] >= 30) & (h[..., 2] >= 150)
water = (_sil > 0) & _stoneish
from geom import pots_mask
_pots = pots_mask(d.shape, pix, np.float32([OX, OY])) > 0          # (the pots are 3D: no card takes their pixels)
cam = _C * 100
VIEW = _R.T @ np.array([0.0, 0.0, 1.0])


def ray(px, py):
    """The world direction (Blender units) through a frame pixel."""
    d_ = _R.T @ np.array([(px - 960) / (_F * _Z), (py - 540) / (_F * _Z), 1.0]); return d_ / np.linalg.norm(d_)


out = []
for name, ((x0, y0, x1, y1), thr, k, foot) in OBJECTS.items():
    if name.startswith(('bamboo', 'pot')) or name == 'gong': continue      # (the bamboo, the gong and the pots are 3D now: props.py)
    mk = np.zeros(d.shape, np.uint8); mk[y0:y1, x0:x1] = ((d > thr) & ~teal & ~water & ~_pots)[y0:y1, x0:x1]
    mk = cv2.morphologyEx(cv2.morphologyEx(mk, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(mk)
    if n < 2: continue
    big = 1 + int(np.argmax(st[1:, 4])); keep = [i for i in range(1, n) if st[i, 4] >= max(40, 0.05 * st[big, 4])]
    mk = np.isin(lab, keep)
    if name.startswith('tree'):    # (only the crown's own piece and what joins it: fallen leaves lying apart are tops.py's)
        mk = lab == big
    # (no holes inside an object: what the stone's exclusion took out of a crown's dark tones is filled back)
    if name.startswith('tree'):    # (crowns only: between bamboo stems the ground shows, as it should)
        # (thin channels open to the outside are not holes: a wider close seals them first, else the grass shows through as cracks)
        _sealed = cv2.morphologyEx(mk.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        mk = mk | (_sealed > 0)
        _cs, _ = cv2.findContours(mk.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        _f = np.zeros(mk.shape, np.uint8); cv2.drawContours(_f, _cs, -1, 1, -1); mk = _f > 0
    if foot is None:
        ys, xs = np.nonzero(mk); j = int(np.argmax(ys)); foot = (int(xs[ys >= ys.max() - 3].mean()), int(ys.max()))
    # (a prop on a platform: its foot on the platform's top, at the platform's height: stones.json)
    fz = json.load(open('art/gong_court/stones.json'))[foot[2]]['h'] if len(foot) > 2 else 0.0
    fx, fy = plan([(foot[0] + OX, foot[1] + OY)], z=fz)[0]
    A = np.array([fx, Yc + fy, fz])
    # the card stands in front of any stone it covers on screen (what the HQ shows in front of the stone, it draws over it): its plane
    # moved south of the southmost edge of every prism whose silhouette meets the object's (the camera's rays meet it at the same pixels)
    _obj = np.zeros(d.shape, np.uint8); _obj[mk] = 1
    for _p, _hh, _m, _k in _prisms().values():
        _up = np.float32([pix(x, y, _hh) for x, y in _p]) - [OX, OY]; _dn = np.float32([pix(x, y, 0) for x, y in _p]) - [OX, OY]
        _s = np.zeros(d.shape, np.uint8); cv2.fillPoly(_s, [np.int32(_up)], 1); cv2.fillPoly(_s, [np.int32(_dn)], 1)
        for _i in range(len(_p)): _j = (_i + 1) % len(_p); cv2.fillConvexPoly(_s, np.int32([_up[_i], _up[_j], _dn[_j], _dn[_i]]), 1)
        if (_s & _obj).sum() > 20: A[1] = min(A[1], Yc + min(y for x, y in _p) - 0.05)                       # (plan units, as the camera's centre x 100 is)
    def on_card(px, py):
        # (an upright plane through the foot, facing south: what stands above the foot stays above it, in front of what is north of it)
        d_ = ray(px + OX, py + OY); t = (A[1] - cam[1]) / d_[1]; p = cam + d_ * t
        if p[2] < fz + 0.01:      # (below the ground on the card: what lies on the ground in front of the foot, fallen leaves: flat on it)
            t = (fz + 0.01 - cam[2]) / d_[2]; p = cam + d_ * t
        return [round(float(p[0]), 3), round(float(p[1] - Yc), 3), round(float(p[2]), 3)]
    px_ = np.float32(m[mk]); kk = min(k, max(2, len(px_) // 300))
    _, lab_, cen = cv2.kmeans(px_, kk, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 4, cv2.KMEANS_PP_CENTERS)
    if name.startswith('tree'):
        # (a crown's soft red edge against the grass blends into pale green and tan tones: traced, they drew a halo round the crown;
        # such a tone's pixels go to the nearest of the crown's red or lavender tones)
        bgr_ = cen[:, :3]; green = ~((bgr_[:, 2] > bgr_[:, 1] + 40) | (bgr_[:, 0] > bgr_[:, 2]))   # (neither the crown's red nor the trunk's lavender: a blend)
        if green.any() and (~green).any():
            keep_ = np.flatnonzero(~green); dist = np.linalg.norm(px_[:, None, :] - cen[None, keep_, :], axis=2)
            relab = keep_[np.argmin(dist, 1)]; lab_ = np.where(green[lab_[:, 0]], relab, lab_[:, 0])[:, None].astype(np.int32)
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
    if name.startswith('tree') and layers:
        # a backing a hair behind the crown, in its first tone: its pixels (eroded 2 px, so the traced outline keeps the edge) as row
        # strips 2 px tall. Blender's polygon fill drops slivers where a traced outline nearly touches itself; the grass (or a mint)
        # behind showed through as cracks
        back = cv2.erode(mk.astype(np.uint8), np.ones((5, 5), np.uint8)); strips = []
        for yy in range(0, back.shape[0] - 1, 2):
            row = back[yy] & back[yy + 1]
            if not row.any(): continue
            e = np.flatnonzero(np.diff(np.concatenate([[0], row, [0]])))
            for a_, b_ in zip(e[::2], e[1::2]):
                if b_ - a_ < 2: continue
                strips.append([on_card(float(a_), float(yy)), on_card(float(b_), float(yy)), on_card(float(b_), float(yy + 2.6)),
                               on_card(float(a_), float(yy + 2.6))])
        if strips: layers.insert(0, dict(colour=layers[0]['colour'], layer=-1, loops=[], strips=strips))
    out.append(dict(name=name, anchor=[round(float(fx), 3), round(float(fy), 3)], shapes=layers))
    print(name, 'foot', [round(float(fx), 2), round(float(fy), 2)], int(mk.sum()), 'px,', len(layers), 'shapes')
json.dump(out, open('art/gong_court/cards.json', 'w'))
