"""The gong court's bamboo as real 3D (2026-11-14; the traced cards smeared it: the owner, "some of the objects are not clear, they are
still blurry"). Each stalk read by hand off the still view (output/mosaic_chrome.png, frame px; beyond the frame the round's mosaic):
its foot (the bottom of its dark sleeve, on the ground or on the planter's mint) and the centre of its cut top. The top is put back in 3D
leaning across the screen only (its height and sideways lean the two unknowns its pixel fixes; a lean towards the camera cannot be told
from one view). Feet the planter hides are read where the stalk's line meets the ground behind it. Each leaf spray is read on screen
(its base as a share of the stalk, its direction on screen, its length in px); blender/build.py lays it on an upright plane through the
stalk, facing the camera, so it shows on screen exactly as read. fit_bamboo.py then fits each stalk's foot, top and width to the
still view (bamboo_fit.json, taken over the readings here). Writes props.json for blender/build.py.

  python art/gong_court/props.py       (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, 'art/gong_court')
from measure import plan, pix

H = {s: v['h'] for s, v in json.load(open('art/gong_court/stones.json')).items()}
# name: foot px, the foot's height (0 the ground, or the body it stands on), top px or (None, height, lean), width px (measured across
# the HQ's rows at four heights: the run of the stalk's colour, x1.27 for its shaded west edge the run leaves out), sprays
# (sprays: (share of the way from the foot to the top, screen angle deg: 0 right, 90 down, length px))
STALKS = {
    'c1': ((615, 523), 0, (601, 428), 14, [(0.85, 20, 15), (0.7, -25, 22), (0.48, 195, 28)]),
    'c2': ((652, 522), 0, (659, 416), 17, [(0.83, 200, 22), (0.33, 160, 28), (0.55, 40, 20)]),
    'c3': ((684, 545), 'planter_c', (689, 428), 18, [(0.6, 0, 28), (0.15, 20, 15), (0.12, 160, 12)]),
    'c4': ((732, 505), 0, (708, 361), 17, [(0.72, 75, 18), (0.4, -15, 30)]),
    'c5': ((752, 639), 0, (761, 525), 14, [(0.2, -10, 18), (0.08, 0, 18), (0.04, 140, 14)]),
    'nw1': ((431, 310), 0, (425, 191), 12, [(0.8, 0, 12), (0.2, -10, 18), (0.07, 150, 18), (0.05, 10, 16)]),
    'nw2': ((459, 289), 0, (457, 169), 15, [(0.7, 190, 18), (0.55, 15, 25), (0.1, 30, 10)]),
    'w1': ((265, 749), 0, (257, 635), 20, [(0.7, 195, 24), (0.53, -10, 32), (0.1, 160, 12)]),
    'w2': ((241, 777), 0, (227, 701), 19, [(0.8, 60, 18), (0.35, 185, 25)]),
    'ne1': ((1560, 261), 0, (1581, 160), 15, [(0.85, 40, 12), (0.7, -20, 20), (0.45, 170, 20)]),
    's1': ((620, 1113), 0, (609, 1024), 15, [(0.7, -15, 25), (0.65, 30, 18), (0.5, 195, 25)]),
    'se1': ((1193, 1077), 0, (1223, 970), 20, [(0.67, 195, 28), (0.1, 20, 22), (0.12, 160, 15)]),
    'se2': ((1213, 1070), 0, (1248, 975), 20, [(0.5, 150, 18), (0.3, 100, 14), (0.12, 200, 25)]),
    'se3': ((1248, 1113), 0, (1265, 1026), 17, [(0.52, 195, 25), (0.75, 15, 18), (0.2, 20, 18)]),
    'n1': ((881, -28), 0, (None, 5.0, -0.1), 17, [(0.8, -20, 15), (0.65, 200, 20), (0.45, 0, 12)]),
    'n2': ((900, 46), 0, (913, -59), 17, [(0.25, 195, 20), (0.4, 10, 25)]),
    'n3': ((952, 17), 0, (965, -74), 17, [(0.85, 200, 15), (0.25, 10, 20)]),
}

# the gong on the north-east platform (frame px, the round's mosaic above the frame): two dark posts standing on the platform's top, a
# thick beam across their tops, the gold disc hung on two ropes between them, square to the beam
GONG = dict(on='plat_ne', post_l=((1313, 80), (1325, -27)), post_r=((1427, 157), (1437, 47)), post_w=24,
            beam=((1318, -50), (1458, 28)), beam_w=40, disc=(1371, 60), disc_w=98)


def gong():
    g = GONG; fz = H[g['on']]
    posts = []
    for foot_px, top_px in (g['post_l'], g['post_r']):
        fx, fy = [float(v) for v in plan([foot_px], z=fz)[0]]
        z = float(least_squares(lambda v: [pix(fx, fy, v[0])[1] - top_px[1]], [fz + 4.0]).x[0])
        posts.append(dict(foot=[round(fx, 3), round(fy, 3), round(fz, 3)], top=round(z, 3)))
    unit = pix(posts[0]['foot'][0] + 1, posts[0]['foot'][1], fz)[0] - pix(posts[0]['foot'][0], posts[0]['foot'][1], fz)[0]
    rb = g['beam_w'] / unit / 2
    # the beam rests on the posts: its axis through their tops raised by its radius, run past them to its ends as read
    A = np.array(posts[0]['foot'][:2] + [posts[0]['top'] + rb]); B = np.array(posts[1]['foot'][:2] + [posts[1]['top'] + rb])
    at = lambda s_: A + (B - A) * s_
    s0 = float(least_squares(lambda v: np.array(pix(*at(v[0]))) - np.array(g['beam'][0]), [-0.2]).x[0])
    s1 = float(least_squares(lambda v: np.array(pix(*at(v[0]))) - np.array(g['beam'][1]), [1.2]).x[0])
    ends = [[round(float(c), 3) for c in at(s0)], [round(float(c), 3) for c in at(s1)]]
    # the disc hangs in the beam's upright plane
    res = least_squares(lambda v: np.array(pix(*(at(v[0])[:2]), v[1])) - np.array(g['disc']), [0.5, A[2] - 3])
    t, dz = [float(v) for v in res.x]
    centre = [round(float(c), 3) for c in at(t)[:2]] + [round(dz, 3)]
    return dict(posts=posts, post_r=round(float(g['post_w'] / unit / 2), 3), beam=ends, beam_r=round(float(rb), 3), disc=centre,
                disc_r=round(float(g['disc_w'] / unit / 2), 3))


if __name__ == '__main__':
    import os
    FIT = json.load(open('art/gong_court/bamboo_fit.json')) if os.path.exists('art/gong_court/bamboo_fit.json') else {}
    out = []
    for name, (foot_px, on, top_px, width, sprays) in STALKS.items():
        if name in FIT: foot_px, top_px, width = FIT[name]['foot'], FIT[name]['top'], FIT[name]['width']    # (fit_bamboo.py)
        fz = 0.0 if on == 0 else H[on]
        fx, fy = [float(v) for v in plan([foot_px], z=fz)[0]]
        if top_px[0] is None:
            dx, z = top_px[2], fz + top_px[1]
        else:
            res = least_squares(lambda v: np.array(pix(fx + v[0], fy, v[1])) - np.array(top_px), [0.0, fz + 4.0])
            dx, z = [float(v) for v in res.x]
        # (the width across the screen: px at the stalk's middle, a unit there)
        mid = pix(fx + dx / 2, fy, (fz + z) / 2); unit = pix(fx + dx / 2 + 1, fy, (fz + z) / 2)[0] - mid[0]
        r = width / unit / 2
        out.append(dict(name=name, foot=[round(fx, 3), round(fy, 3), round(fz, 3)], top=[round(fx + dx, 3), round(fy, 3), round(z, 3)],
                        r=round(r, 3), sprays=[dict(t=t, angle=a, length=round(l / unit, 3)) for t, a, l in sprays]))
        print(name, 'foot', out[-1]['foot'], 'top', out[-1]['top'], 'r', out[-1]['r'])
    G = gong(); print('gong', G)
    json.dump(dict(bamboo=out, gong=G), open('art/gong_court/props.json', 'w'), indent=1)
