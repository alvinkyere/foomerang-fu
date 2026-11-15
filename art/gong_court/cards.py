"""What stands on the gong court's ground, as traced cards (2026-11-12; after art/warm_up/cards.py): the game's camera never turns (it crops and zooms its one view), so an
object drawn on an upright plane through its foot, facing the camera, shows exactly as the HQ's from every framing the game uses, and
hides a player behind it as the HQ's does. For each object (OBJECTS: its box in the round's mosaic, how far it must differ from our
ground-and-moat render to count): its pixels, grouped into a few tones (k-means), the label map smoothed, each tone's regions traced as
polygons (with their holes): our own flat shapes in measured colours, never the video's pixels. Each pixel of an outline is put on the
card: the camera ray through it meets the plane through the object's foot. Writes cards.json for blender/build.py.

  python art/gong_court/cards.py <wide render.png>      (the Python of art/audio/output/venv)
"""
import json, math, os, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import plan, pix, Yc, R as _R, F as _F, C as _C, Z as _Z, MOSAIC_ORIGIN

OX, OY = MOSAIC_ORIGIN
# name: (mosaic box x0, y0, x1, y1), difference threshold, tones, foot (mosaic px; None: the lowest pixel)
OBJECTS = {
    'tree_nw': ((560, 0, 800, 245), 30, 9, (670, 205, 'plat_nw')),
    'tree_w': ((225, 255, 455, 535), 30, 9, (370, 500)),
    'tree_n': ((780, 0, 920, 75), 30, 6, (850, 60)),
    'tree_e': ((1785, 550, 1995, 805), 30, 9, (1890, 790)),
    'tree_se': ((1480, 1000, 1760, 1300), 30, 9, (1615, 1280)),
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
    'bush_ne': ((1530, 330, 1625, 470), 20, 3, None),
    'tuft_ne': ((1712, 436, 1778, 480), 18, 2, None),
    'tuft_w1': ((340, 490, 402, 536), 18, 2, None),
    'tuft_w2': ((328, 790, 386, 828), 18, 2, None),
    'tuft_n': ((1238, 358, 1296, 414), 18, 2, None),
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


from geom import simple


out = []
for name, ((x0, y0, x1, y1), thr, k, foot) in OBJECTS.items():
    if name.startswith(('bamboo', 'pot', 'aloe')) or name == 'gong': continue      # (the bamboo, the gong, the pots and the aloes are 3D now: props.py)
    mk = np.zeros(d.shape, np.uint8); mk[y0:y1, x0:x1] = ((d > thr) & ~teal & ~water & ~_pots & (m.sum(2) > 40))[y0:y1, x0:x1]   # (not the mosaic's unseen black)
    if name.startswith('tree'):    # (the trunk's pale lavender lies close to the grass in value: it is the trunk by its hue)
        _lav = (h[..., 0] >= 105) & (h[..., 0] <= 150) & (h[..., 1] >= 30) & (d > 12) & ~water
        mk[y0:y1, x0:x1] |= _lav[y0:y1, x0:x1].astype(np.uint8)
    mk = mk if name.startswith('tuft') else \
        cv2.morphologyEx(cv2.morphologyEx(mk, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))   # (a tuft: its blades apart, their points kept)
    n, lab, st, _ = cv2.connectedComponentsWithStats(mk)
    if n < 2: continue
    big = 1 + int(np.argmax(st[1:, 4])); keep = [i for i in range(1, n) if st[i, 4] >= max(40, 0.05 * st[big, 4])]
    mk = np.isin(lab, keep)
    if name.startswith('tree'):    # (only the crown's own piece and what joins it: fallen leaves lying apart are tops.py's)
        mk = lab == big
    # (no holes inside an object: what the stone's exclusion took out of a crown's dark tones is filled back)
    if name.startswith('tree'):    # (crowns only: between bamboo stems the ground shows, as it should)
        # (only small holes filled: the grass seen between two lobes is a hole too, and the HQ shows it)
        _n, _l, _st, _ = cv2.connectedComponentsWithStats((~mk).astype(np.uint8), connectivity=4)
        for _i in range(1, _n):
            if _st[_i, 4] < 120 and _st[_i, 0] > 0 and _st[_i, 1] > 0: mk |= _l == _i
    if foot is None:
        ys, xs = np.nonzero(mk); j = int(np.argmax(ys)); foot = (int(xs[ys >= ys.max() - 3].mean()), int(ys.max()))
    elif name.startswith('tree'):
        # (a crown's card stands on its lowest pixel: nothing of it below the ground, where it would be laid flat on it, and the
        # triangles spanning the upright part and the flat part leaned out in front of the trunk, drawing the crown's red over it)
        foot = (foot[0], max(foot[1], int(np.nonzero(mk)[0].max()))) + tuple(foot[2:])
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
        if p[2] < fz + 0.15:      # (below the ground on the card: what lies on the ground in front of the foot, fallen leaves: flat on it, over the
            #   ground's shapes, which stack up to ~0.1)
            t = (fz + 0.15 - cam[2]) / d_[2]; p = cam + d_ * t
        return [round(float(p[0]), 3), round(float(p[1] - Yc), 3), round(float(p[2]), 3)]
    px_ = np.float32(m[mk]); kk = min(k, max(2, len(px_) // 300))
    _, lab_, cen = cv2.kmeans(px_, kk, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full(d.shape, 255, np.uint8); lm[mk] = lab_[:, 0]; lm = (lm if name.startswith('tuft') else cv2.medianBlur(lm, 3 if name.startswith(('bush', 'flower', 'tree')) else 5)); lm[~mk] = 255   # (the bushes' and tufts' points kept)
    if name.startswith('tree'):
        # (a crown's soft edge against the grass blends into pale green and tan tones: traced, they drew a dark or pale ring round
        # the crown; such pixels take the tone of the nearest crown pixel that is no blend, so each puff's own tone runs to its edge)
        bgr_ = cen[:, :3]; blend = ~((bgr_[:, 2] > bgr_[:, 1] + 40) | (bgr_[:, 0] > bgr_[:, 2]))
        # (and a tone that is a mix of two others, the trunk's lavender into the crown's red: traced, a dark line round the trunk)
        for qi in range(len(bgr_)):
            for a_ in range(len(bgr_)):
                for b_ in range(len(bgr_)):
                    if len({qi, a_, b_}) < 3: continue
                    if not (bgr_[a_][2] > bgr_[a_][1] + 40 and bgr_[b_][0] > bgr_[b_][2]): continue    # (red into lavender only)
                    ab = bgr_[b_] - bgr_[a_]; t_ = float(np.dot(bgr_[qi] - bgr_[a_], ab) / max(1e-6, np.dot(ab, ab)))
                    if 0.2 < t_ < 0.8 and np.linalg.norm(bgr_[a_] + ab * t_ - bgr_[qi]) < 10 and np.linalg.norm(ab) > 60: blend[qi] = True
        if blend.any() and (~blend).any():
            bad = mk & np.isin(lm, np.flatnonzero(blend))
            good = mk & ~bad & (lm != 255)
            _, near = cv2.distanceTransformWithLabels((~good).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
            gy, gx = np.nonzero(good); lut = np.full(near.max() + 1, 255, np.uint8); lut[near[gy, gx]] = lm[gy, gx]
            lm[bad] = lut[near[bad]]
    # each tone's regions; drawn largest tone first, the rest over it a hair nearer the camera
    order = sorted(range(kk), key=lambda q: -(lm == q).sum())
    if os.environ.get("DBG") == name: np.save(os.environ["TMPDIR"] + "/dbg.npy", np.stack([lm, mk.astype(np.uint8)])); print("CEN", cen.astype(int).tolist())
    layers = []
    for li, q in enumerate(order):
        tm = (lm == q).astype(np.uint8)
        if li == 0: tm = mk.astype(np.uint8)                   # (the first tone fills the whole object: no gaps between tones)
        cs, hier = cv2.findContours(tm, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hier is None: continue
        colour = '#%02x%02x%02x' % tuple(int(v) for v in cen[q][::-1])
        for ci, c in enumerate(cs):
            if hier[0][ci][3] >= 0 or cv2.contourArea(c) < (6 if name.startswith('tree') else 12): continue
            loops = [c] + [cs[hj] for hj in range(len(cs)) if hier[0][hj][3] == ci and cv2.contourArea(cs[hj]) >= 12]
            polys = []; pxs = []; ok_ = True
            for lp in loops:
                ap = cv2.approxPolyDP(lp, 0.45 if name.startswith(('tree', 'tuft')) else 0.7, True).reshape(-1, 2)   # (a crown's ragged fringe kept)
                ok_ &= simple(ap) and len({tuple(p) for p in ap.tolist()}) == len(ap)
                if len(ap) >= 3: polys.append([on_card(float(u), float(v)) for u, v in ap]); pxs.append(ap.tolist())
            if not ok_:
                # (an outline that crosses or touches itself: Blender's polygon fill covers only part of it (the trunk showed the crown's
                # red through, the shadows had gaps); the region drawn as row strips instead, 2 px tall, exactly its pixels)
                reg = np.zeros(tm.shape, np.uint8); cv2.drawContours(reg, loops[:1], -1, 1, -1)
                for hl in loops[1:]: cv2.drawContours(reg, [hl], -1, 0, -1)
                reg &= tm; strips = []
                for yy in range(0, reg.shape[0] - 1, 2):
                    row = reg[yy] | reg[yy + 1]
                    if not row.any(): continue
                    e = np.flatnonzero(np.diff(np.concatenate([[0], row, [0]])))
                    for a_, b_ in zip(e[::2], e[1::2]):
                        strips.append([on_card(float(a_), float(yy)), on_card(float(b_), float(yy)), on_card(float(b_), float(yy + 2.3)),
                                       on_card(float(a_), float(yy + 2.3))])
                if strips: layers.append(dict(colour=colour, layer=li, loops=[], strips=strips))
                continue
            # (the outlines in screen px too: build.py triangulates there, where a card bent onto the ground still lies flat)
            if polys: layers.append(dict(colour=colour, layer=li, loops=polys, px=pxs))
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
