"""The autumn glade, slice 3 (2026-11-01): the trees (trunk bases read by hand off output/reference.png, ff physics hq 2.mp4 626.0 s,
because the canopies merge in colour masks), the log outside the border, and the green shadow patches on the sand (colour mask),
unprojected like layout.py. Adds 'trees', 'log3', 'shadows' to layout.json and writes output/props_overlay.jpg.

  python art/autumn_glade/props.py       (after layout.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import plan, plan_at, ref, Yc, LOG_R

# (kind, trunk-base pixel x, y) in the 1920x1080 frame; kind r = red canopy, g = gold canopy
TREES = [('g', 270, 240), ('r', 578, 285), ('r', 705, 150), ('r', 968, 232), ('r', 1230, 90), ('g', 1440, 315), ('r', 1822, 195),
         ('r', 180, 450), ('g', 982, 480), ('r', 1103, 592), ('r', 1575, 592), ('r', 548, 705), ('r', 90, 885), ('r', 465, 975),
         ('r', 832, 960), ('r', 915, 1035), ('g', 1200, 870), ('r', 1508, 1035), ('r', 1880, 960)]
LOG3 = [(1590, 108), (1692, 222)]    # the end points of the log at top right, outside the dashed border

f = cv2.imread('art/autumn_glade/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
m = ((H >= 28) & (H <= 42) & (S >= 55) & (S <= 120) & (V >= 165) & (V <= 215)).astype(np.uint8) * 255
m[:, :215] = 0
k = lambda n: np.ones((n, n), np.uint8)
m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k(7)), cv2.MORPH_CLOSE, k(15))
cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
shadows = []
for c in cs:
    if cv2.contourArea(c) < 3000: continue
    c = cv2.approxPolyDP(c, 3, True)[:, 0, :]
    shadows.append([[round(float(v), 2) for v in p] for p in plan(c)])

L = json.load(open('art/autumn_glade/layout.json'))
L['trees'] = [dict(kind=k_, px=[x, y], plan=[round(float(v), 2) for v in plan([(x, y)])[0]]) for k_, x, y in TREES]
a, b = plan(LOG3)
L['log3'] = dict(ends=[[round(float(v), 2) for v in a], [round(float(v), 2) for v in b]], length=round(float(np.hypot(*(b - a))), 2))
L['shadows'] = shadows
L['Yc'] = round(float(Yc), 3)      # (the ground point under the frame's centre: Blender's y = Yc + plan y)

# canopies: each red/gold mask pixel goes to the nearest tree (measured from a point 120 px above its trunk base); the cell's centroid
# and extent are the canopy's, and its height is the z at which a point above the trunk base lands on the centroid's pixel row
red = (((H <= 8) | (H >= 172)) & (S > 120) & (V > 150)); gold = (H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232)
red[:, :215] = False; gold[:, :215] = False
anchors = np.array([(x, y - 120) for _, x, y in TREES], float)
for kind, mask in (('r', red), ('g', gold)):
    ys_, xs_ = np.nonzero(cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, k(5)))
    d = (xs_[:, None] - anchors[None, :, 0]) ** 2 + (ys_[:, None] - anchors[None, :, 1]) ** 2
    own = d.argmin(1)
    for i, (k_, x, y) in enumerate(TREES):
        if k_ != kind: continue
        sel = own == i
        if sel.sum() < 400: L['trees'][i]['canopy'] = None; continue
        cx, cy = float(xs_[sel].mean()), float(ys_[sel].mean())
        rx, ry = float(np.percentile(xs_[sel], 95) - np.percentile(xs_[sel], 5)) / 2, float(np.percentile(ys_[sel], 95) - np.percentile(ys_[sel], 5)) / 2
        bx, by = L['trees'][i]['plan']
        z = next(z for z in np.arange(0, 30, 0.05) if ref(bx, Yc + by, z)[1] <= cy)
        ppu = ref(bx + 1, Yc + by)[0] - ref(bx, Yc + by)[0]
        # lumps: k-means of the cell's pixels, about one per 4500 px; a lump's plan x is its pixel's offset over the pixel scale, its
        # height the tree's plus the pixel rise over the vertical scale (cos of the pitch): the frame's canopies are tiers of discs
        pts = np.float32(np.c_[xs_[sel], ys_[sel]])
        K = int(max(1, min(7, round(sel.sum() / 4500))))
        _, lab_, cen_ = cv2.kmeans(pts, K, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
        ppu0 = ref(bx + 1, Yc + by)[0] - ref(bx, Yc + by)[0]
        lumps = []
        for j in range(K):
            q = pts[lab_[:, 0] == j]
            if len(q) < 300: continue
            lw = float(np.percentile(q[:, 0], 95) - np.percentile(q[:, 0], 5)) / 2 / ppu0
            lh = float(np.percentile(q[:, 1], 95) - np.percentile(q[:, 1], 5)) / 2 / ppu0 / 0.83
            lumps.append(dict(x=round((float(cen_[j][0]) - cx) / ppu0, 2), z=round(float(z + (cy - cen_[j][1]) / (ppu0 * 0.56)), 2), r=round(max(0.9, float(np.sqrt(len(q) / np.pi)) / ppu0 * 1.08), 2)))
        L['trees'][i]['lumps'] = lumps
        L['trees'][i]['canopy'] = dict(px=[round(cx), round(cy)], z=round(float(z), 2), rx=round(rx / ppu, 2), ry=round(ry / ppu / 0.83, 2), area=int(sel.sum()))
med = lambda m: '#%02x%02x%02x' % tuple(int(v) for v in np.median(f[m], 0)[::-1])
L['colours'] = dict(ground='#f9e589', red=med(red), gold=med(gold), shadow=med(cv2.drawContours(np.zeros(m.shape, np.uint8), cs, -1, 1, -1) > 0),
                    rock=med((H >= 108) & (H <= 130) & (S >= 55) & (S < 150) & (V >= 150)), log=med((H >= 168) & (S >= 60) & (S <= 125) & (V >= 70) & (V < 150)))
print(L['colours'])
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
ov = f.copy()
cv2.drawContours(ov, cs, -1, (0, 160, 0), 2)
for k_, x, y in TREES: cv2.circle(ov, (x, y), 9, (0, 0, 255) if k_ == 'r' else (0, 215, 255), -1); cv2.circle(ov, (x, y), 9, (0, 0, 0), 2)
cv2.line(ov, LOG3[0], LOG3[1], (255, 0, 255), 3)
cv2.imwrite('art/autumn_glade/output/props_overlay.jpg', cv2.resize(ov, (1280, 720)))
print(len(TREES), 'trees;', len(shadows), 'shadow patches; log3', L['log3'])

# ---- slice 6: the fallen leaves, exactly where the frame has them (small red / gold blobs clear of every canopy), unprojected
leaf_r = (((H <= 8) | (H >= 172)) & (S > 120) & (V > 150)); leaf_g = (H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232)
leaf_r[:, :215] = False; leaf_g[:, :215] = False
leaves = []
for kind, m_ in (('r', leaf_r), ('g', leaf_g)):
    big = cv2.dilate(cv2.morphologyEx(m_.astype(np.uint8), cv2.MORPH_OPEN, k(11)), k(9))
    small = (m_ & (big == 0)).astype(np.uint8)
    small = cv2.morphologyEx(small, cv2.MORPH_OPEN, k(3))
    n_, lab_, st_, cen_ = cv2.connectedComponentsWithStats(small)
    for i in range(1, n_):
        a_ = st_[i, 4]
        if a_ < 25 or a_ > 420: continue
        cs_, _ = cv2.findContours((lab_ == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        (rx_, ry_), (rw_, rh_), ang_ = cv2.minAreaRect(max(cs_, key=cv2.contourArea))
        if min(rw_, rh_) < 3: continue
        corners = plan(cv2.boxPoints(((rx_, ry_), (rw_, rh_), ang_)))
        p_ = plan([(rx_, ry_)])[0]
        d_ = corners[1] - corners[0] if np.hypot(*(corners[1] - corners[0])) >= np.hypot(*(corners[2] - corners[1])) else corners[2] - corners[1]
        leaves.append(dict(kind=kind, plan=[round(float(v), 2) for v in p_], a=round(float(np.hypot(*(corners[1] - corners[0]))), 2), b=round(float(np.hypot(*(corners[2] - corners[1]))), 2),
                           ang=round(float(np.degrees(np.arctan2(d_[1], d_[0]))), 1)))
L['leaves'] = leaves
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
print(len(leaves), 'leaves', sum(1 for l in leaves if l['kind'] == 'g'), 'gold')

# ---- the portals: a vertical sheet standing on the rock's field side. Foot = the bottom of the cyan mask put on the ground; height = the
# z at which a point over the foot lands on the mask's top row; the glow's centre 30 px out from it, towards the field
pm = (((H >= 85) & (H <= 100) & (S > 120) & (V > 200)) & (np.arange(1920)[None, :] > 215)).astype(np.uint8)
pm = cv2.morphologyEx(pm, cv2.MORPH_CLOSE, k(5))
n_, lab_, st_, cen_ = cv2.connectedComponentsWithStats(pm)
portals = []
for i in range(1, n_):
    x_, y_, w_, h_, a_ = st_[i]
    if a_ < 150: continue
    foot = plan([(x_ + w_ / 2, y_ + h_)])[0]
    ppu_ = ref(foot[0] + 1, Yc + foot[1])[0] - ref(foot[0], Yc + foot[1])[0]
    top = next(z for z in np.arange(0, 20, 0.05) if ref(foot[0], Yc + foot[1], z)[1] <= y_)
    left = x_ + w_ / 2 < 960
    gx = x_ + w_ + 8 if left else x_ - 8
    glow = plan([(gx, y_ + h_ / 2)])[0]
    portals.append(dict(side='W' if left else 'E', foot=[round(float(v), 2) for v in foot], halfWidth=round(w_ / 2 / ppu_, 2), height=round(float(top), 2),
                        glow=[round(float(v), 2) for v in glow], px=[int(x_), int(y_), int(w_), int(h_)]))
L['portals'] = portals
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
print('portals', portals)

# ---- the logs again, at their axis' height: a cylinder's silhouette is its axis lifted by its radius, so the mask's pixels are put back
# on the plan at z = LOG_R (read at z 0 they land 0.5 units too far north). Each log's box (layout.py) goes pixel -> plan_at.
def lift(p_):
    px_ = ref(p_[0], Yc + p_[1], 0.0)
    return [round(float(v), 2) for v in plan_at([px_], LOG_R)[0]]
for it in L['log']:
    it['box'] = [lift(p_) for p_ in it['box']]
    it['plan'] = lift(it['plan'])
a_, b_ = LOG3
L['log3']['ends'] = [[round(float(v), 2) for v in plan_at([a_], LOG_R)[0]], [round(float(v), 2) for v in plan_at([b_], LOG_R)[0]]]
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
print('logs lifted to z', LOG_R)

# ---- beyond the frame: the frame's footprint on the sand (the outskirts' trees keep out of it) and the big foreground foliage at its corners
# (centre pixel, height of the foliage over the sand, radius in pixels, colour read at the centre), put on the plan at that height
L['frame'] = [[round(float(v), 2) for v in p_] for p_ in plan([(0, 0), (1920, 0), (1920, 1080), (0, 1080)])]
FG = [((10, 1055), 12.0, 55), ((4, 6), 12.0, 40)]
fg = []
for (px_, py_), z_, r_ in FG:
    p_ = plan_at([(px_, py_)], z_)[0]
    ppu_ = ref(p_[0] + 1, Yc + p_[1], z_)[0] - ref(p_[0], Yc + p_[1], z_)[0]
    col_ = '#%02x%02x%02x' % tuple(int(v) for v in np.median(f[max(py_, 11) - 10:max(py_, 11) + 11, max(px_, 11) - 10:max(px_, 11) + 11].reshape(-1, 3), 0)[::-1])
    fg.append(dict(plan=[round(float(v), 2) for v in p_], z=z_, r=round(r_ / ppu_, 2), colour=col_))
L['foreground'] = fg
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
print('foreground', fg)

# ---- the pale stones at the frame's top-right edge (paving, outside the border): their pixel centres and widths, put on the plan at their top
STONES_PX = [((1772, 12), 46), ((1902, 22), 40)]
pale = []
for (px_, py_), w_ in STONES_PX:
    p_ = plan_at([(px_, py_)], 0.6)[0]
    ppu_ = ref(p_[0] + 1, Yc + p_[1], 0.6)[0] - ref(p_[0], Yc + p_[1], 0.6)[0]
    col_ = '#ddddb3'          # (the median of the pale low-saturation pixels there: 2577 px, x 1722-1899, y 0-49)
    pale.append(dict(plan=[round(float(v), 2) for v in p_], half=round(w_ / 2 / ppu_, 2), colour=col_))
L['pale_stones'] = pale
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
print('pale stones', pale)
