"""The glade's canopies as measured masses (2026-11-03): their outlines are the frame's canopy masks (ff physics hq 2.mp4 1202.0 s), their
surface is the fitted clumps' (fit_trees.py): over each canopy pixel the clumps that the camera sees there are domes, the highest wins,
and the pixel is put back in 3D at that height (measure.plan_at). Where the frame is hidden (the players' names, READY) the model's own
clumps stand in. The mesh is our own geometry: a 4 px grid over each mask, its shading done in blender/build.py from its normals.
Writes canopy_mass.json: per kind (r, g) vertices (plan x, plan y relative to the frame's centre ground point, height) and faces.

  python art/hex_meadow/canopy_mass.py       (after props.py and fit_trees.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
HUD = np.load('art/hex_meadow/output/hud_hidden.npy')      # (the players' names' letters: hud_mask.py)
sys.path.insert(0, 'art/hex_meadow')
from measure import ref, Yc, R as _R, F as _F, C as _C, Z as _Z

STEP = 3
remove = lambda im: im
import os
_FILL = 'art/hex_meadow/output/reference_fill.png'      # (fill_ready.py: the READY box mostly seen at 626.6 s)
f = remove(cv2.imread(_FILL if os.path.exists(_FILL) else 'art/hex_meadow/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)      # (the beams out: their crisp edges would cut the masks)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
red = np.zeros(H.shape, bool)
gold = (H >= 14) & (H <= 28) & (S > 90) & (V > 120) & (V < 240)
import os
hidden = np.zeros(H.shape, bool)      # (the names' letters: the canopy carried across them from round them, below)
for x0, y0, x1, y1 in ((425, 80, 600, 135), (1355, 110, 1480, 160), (380, 725, 570, 780), (1335, 740, 1575, 795)): hidden[y0:y1, x0:x1] = True      # (the players' power badges)
if os.path.exists('art/hex_meadow/output/ready_hidden.npy'): hidden |= np.load('art/hex_meadow/output/ready_hidden.npy')
else: hidden[470:620, 740:1190] = True
L = json.load(open('art/hex_meadow/layout.json')); FIT = json.load(open('art/hex_meadow/lumps.json'))
trees = [dict(t, lumps=[l for l in FIT[k] if l['z'] > 1.0], k=k) for k, t in enumerate(L['trees'])]      # (a lump fitted under the ground is no clump)


def project(P):
    v = (_R @ ((np.c_[P[:, 0], P[:, 1] + Yc, P[:, 2]] / 100 - _C).T)).T
    x, y = _F * v[:, 0] / v[:, 2] + 960, _F * v[:, 1] / v[:, 2] + 540
    return np.c_[960 + (x - 960) * _Z, 540 + (y - 540) * _Z]


# each clump's screen ellipse (as fit_trees.py's: centred at z - 0.11 r, 1.07 r wide, (1.07 x 0.83 + 0.41 x 0.56) r tall)
clumps = {'r': [], 'g': []}
for t in trees:
    bx, by = t['plan']
    for l in t['lumps']:
        x, r, z = bx + l['x'], l['r'], l['z']
        cx, cy = ref(x, Yc + by, z - 0.11 * r)
        ppu = ref(x + 1, Yc + by, z)[0] - ref(x, Yc + by, z)[0]
        clumps[t['kind']].append((cx, cy, 1.07 * r * ppu, (1.07 * 0.83 + 0.41 * 0.56) * r * ppu, z, r, x, by, t['k']))
out = {}
for kind, mask in (('g', gold),):
    m = mask.astype(np.uint8)
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 400                  # (the fallen leaves are props.py's, not canopy)
    m = keep[lab].astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    # holes inside a canopy under 1500 px (its brightest tops, its darkest folds, a glimpse of trunk) are canopy too
    inv = (1 - m).astype(np.uint8); nh, labh, sth, _ = cv2.connectedComponentsWithStats(inv)
    small = np.zeros(nh, bool); small[1:] = sth[1:, 4] < 1500
    m = (m > 0) | small[labh]
    # across the names' letters (thin strokes: the frame seen between them): the mask carried in from round each stroke
    m = np.where(HUD, cv2.inpaint((m * 255).astype(np.uint8), HUD.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA) > 127, m)
    # where the frame is hidden: the model's clumps' ellipses
    model = np.zeros(H.shape, np.uint8)
    for cx, cy, ax, ay, *_ in clumps[kind]: cv2.ellipse(model, (int(cx), int(cy)), (max(1, int(ax)), max(1, int(ay))), 0, 0, 360, 1, -1)
    # where the frame is hidden: its mask carried in from round the box (inpainted), with the model's clumps
    # (READY's box: the mask carried in only near the model's clumps; the names' box: the model alone, its edge borders other red)
    # inside a hidden box the model's clumps; in a 25 px band round it the frame's mask only near them (no straight seam at the box)
    band = (cv2.dilate(hidden.astype(np.uint8), np.ones((51, 51), np.uint8)) > 0) & ~hidden
    near = cv2.dilate(model, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) > 0
    m = np.where(hidden, model > 0, np.where(band, m & near, m))
    # the surface: per grid point, the highest clump dome over it (a clump's dome: height r * 0.6 * sqrt(1 - d^2), d its ellipse distance)
    # beyond the frame's edges (the game's camera sees past them; owner, 2026-11-05: crowns cut flat at the top): the model's clumps, and
    # the frame's outline carried a little way out only near them (no straight seam at the edge)
    PAD = 240
    mp = np.zeros((1080 + 2 * PAD, 1920 + 2 * PAD), bool); mp[PAD:-PAD, PAD:-PAD] = m
    modelp = np.zeros(mp.shape, np.uint8)
    for cx, cy, ax, ay, *_ in clumps[kind]: cv2.ellipse(modelp, (int(cx) + PAD, int(cy) + PAD), (max(1, int(ax)), max(1, int(ay))), 0, 0, 360, 1, -1)
    outside = np.ones(mp.shape, bool); outside[PAD:-PAD, PAD:-PAD] = False
    carried = cv2.inpaint((mp * 255).astype(np.uint8), outside.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA) > 127
    nearp = cv2.dilate(modelp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) > 0
    mp = np.where(outside, (carried & nearp) | (modelp > 0), mp)
    gy, gx = np.mgrid[-PAD:1080 + PAD:STEP, -PAD:1920 + PAD:STEP]
    inside = mp[gy + PAD, gx + PAD]      # (every canopy pixel belongs to a tree: away from its clumps, the nearest clump's height and tree)
    best = np.full(gx.shape, -1e9); bz = np.zeros(gx.shape); bdist = np.full(gx.shape, 1e9); nz = np.zeros(gx.shape); bd = np.full(gx.shape, 1.2)
    bk = -np.ones(gx.shape, int); nk = -np.ones(gx.shape, int); bc = -np.ones(gx.shape, int); ba = np.zeros(gx.shape)
    for ci, (cx, cy, ax, ay, z, r, _x, _y, tk) in enumerate(clumps[kind]):
        d = np.sqrt(((gx - cx) / ax) ** 2 + ((gy - cy) / ay) ** 2)
        top = z + 0.6 * r * np.sqrt(np.clip(1 - d ** 2, 0, 1))
        on = (d < 1) & (top > best)
        best = np.where(on, top, best); bz = np.where(on, top, bz); bd = np.where(on, d, bd); bk = np.where(on, tk, bk); bc = np.where(on, ci, bc); ba = np.where(on, np.arctan2(gy - cy, gx - cx), ba)
        near = (d < bdist); bdist = np.where(near, d, bdist); nz = np.where(near, z - 0.1 * r, nz); nk = np.where(near, tk, nk)
    # under a higher clump's lower edge: in its shadow (the HQ's caps are told apart so: the upper one darkens the one below)
    shadow = np.zeros(gx.shape, np.float32)
    for k_ in (1, 2, 3):
        up_c = np.roll(bc, k_, axis=0); up_t = np.roll(best, k_, axis=0)
        shadow = np.maximum(shadow, ((up_c >= 0) & (up_c != bc) & (up_t > best + 0.2)).astype(np.float32) * (1.0 - 0.25 * (k_ - 1)))
    shadow = cv2.GaussianBlur(shadow, (0, 0), 0.8)
    zs = np.where(best > -1e8, bz, nz)                                       # (outside every clump: the nearest clump's rim height)
    zs = cv2.GaussianBlur(zs.astype(np.float32), (0, 0), 1.2)                 # (no cliffs between neighbouring clumps)
    idx = -np.ones(gx.shape, int); verts = []
    pts = np.argwhere(inside)
    # back-project each grid point at its height: the ray through the pixel meets the plane z
    for (j, i) in pts:
        px, py, z = float(gx[j, i]), float(gy[j, i]), float(zs[j, i])
        # (measure.plan_at for one point: invert the projection by a 2-D search on the plane at z, two Newton steps from the z = 0 guess)
        verts.append((px, py, z)); idx[j, i] = len(verts) - 1
    V_ = np.array(verts, float)
    # the plane-at-z unprojection, vectorised: the camera ray through each pixel
    th = math.radians(json.load(open('art/sky_islands/camera.json'))['pitchDeg'])
    xc = (V_[:, 0] - 960) / _Z + 960; yc = (V_[:, 1] - 540) / _Z + 540
    dirc = np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(V_))]          # (camera space)
    dirw = (_R.T @ dirc.T).T                                                 # (world, x100 units)
    cam = _C * 100
    tt = (V_[:, 2] - cam[2]) / dirw[:, 2]
    world = cam[None, :] + dirw * tt[:, None]
    plan = np.c_[world[:, 0], world[:, 1] - Yc, V_[:, 2]]
    faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]
            k = [v for v in q if v >= 0]
            if len(k) == 4: faces.append(q)
            elif len(k) == 3: faces.append(k)
    out[kind] = dict(verts=[[round(float(a), 3) for a in p] for p in plan], faces=[[int(v) for v in q] for q in faces],
                     d=[round(float(bd[j, i]), 2) for (j, i) in pts], tree=[int(bk[j, i] if bk[j, i] >= 0 else nk[j, i]) for (j, i) in pts], own=[int(bk[j, i] >= 0) for (j, i) in pts], shadow=[round(float(shadow[j, i]), 2) for (j, i) in pts], ang=[round(float(ba[j, i]), 2) for (j, i) in pts])      # (how far into its clump each vertex is: the rims darken)
    # check: the vertices' own projection lands on their pixels
    back = project(plan[:200]); err = np.abs(back - V_[:200, :2]).max()
    print(kind, len(plan), 'verts', len(faces), 'faces; reprojection error %.2f px' % err)
json.dump(out, open('art/hex_meadow/canopy_mass.json', 'w'))
