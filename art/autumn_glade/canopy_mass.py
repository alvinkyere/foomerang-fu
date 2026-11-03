"""The glade's canopies as measured masses (2026-11-03): their outlines are the frame's canopy masks (ff physics hq 2.mp4 626.0 s), their
surface is the fitted clumps' (fit_trees.py): over each canopy pixel the clumps that the camera sees there are domes, the highest wins,
and the pixel is put back in 3D at that height (measure.plan_at). Where the frame is hidden (the players' names, READY) the model's own
clumps stand in. The mesh is our own geometry: a 4 px grid over each mask, its shading done in blender/build.py from its normals.
Writes canopy_mass.json: per kind (r, g) vertices (plan x, plan y relative to the frame's centre ground point, height) and faces.

  python art/autumn_glade/canopy_mass.py       (after props.py and fit_trees.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import ref, Yc, R as _R, F as _F, C as _C, Z as _Z

STEP = 3
from beams_emu import remove
f = remove(cv2.imread('art/autumn_glade/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)      # (the beams out: their crisp edges would cut the masks)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
red = ((H <= 12) | (H >= 170)) & (S > 90) & (V > 140)
gold = (H >= 15) & (H <= 28) & (S > 120) & (V > 160) & (V < 234) & ~red
hidden = np.zeros(H.shape, bool); hidden[95:375, :215] = True; hidden[470:620, 740:1190] = True
L = json.load(open('art/autumn_glade/layout.json')); FIT = json.load(open('art/autumn_glade/lumps.json'))
trees = [dict(t, lumps=FIT[k]) for k, t in enumerate(L['trees'])]


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
        clumps[t['kind']].append((cx, cy, 1.07 * r * ppu, (1.07 * 0.83 + 0.41 * 0.56) * r * ppu, z, r, x, by))
out = {}
for kind, mask in (('r', red), ('g', gold)):
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
    # where the frame is hidden: the model's clumps' ellipses
    model = np.zeros(H.shape, np.uint8)
    for cx, cy, ax, ay, *_ in clumps[kind]: cv2.ellipse(model, (int(cx), int(cy)), (max(1, int(ax)), max(1, int(ay))), 0, 0, 360, 1, -1)
    # where the frame is hidden: its mask carried in from round the box (inpainted), with the model's clumps
    # (READY's box: the mask carried in only near the model's clumps; the names' box: the model alone, its edge borders other red)
    ready = np.zeros(H.shape, bool); ready[470:620, 740:1190] = True
    carried = cv2.inpaint((m * 255).astype(np.uint8), ready.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA) > 127
    near = cv2.dilate(model, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
    m = np.where(ready, (carried & near) | (model > 0), np.where(hidden, model > 0, m))
    # the surface: per grid point, the highest clump dome over it (a clump's dome: height r * 0.6 * sqrt(1 - d^2), d its ellipse distance)
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]
    inside = m[gy, gx]
    best = np.full(gx.shape, -1e9); bz = np.zeros(gx.shape); bdist = np.full(gx.shape, 1e9); nz = np.zeros(gx.shape); bd = np.full(gx.shape, 1.2)
    for cx, cy, ax, ay, z, r, *_ in clumps[kind]:
        d = np.sqrt(((gx - cx) / ax) ** 2 + ((gy - cy) / ay) ** 2)
        top = z + 0.6 * r * np.sqrt(np.clip(1 - d ** 2, 0, 1))
        on = (d < 1) & (top > best)
        best = np.where(on, top, best); bz = np.where(on, top, bz); bd = np.where(on, d, bd)
        near = (d < bdist); bdist = np.where(near, d, bdist); nz = np.where(near, z - 0.1 * r, nz)
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
                     d=[round(float(bd[j, i]), 2) for (j, i) in pts])      # (how far into its clump each vertex is: the rims darken)
    # check: the vertices' own projection lands on their pixels
    back = project(plan[:200]); err = np.abs(back - V_[:200, :2]).max()
    print(kind, len(plan), 'verts', len(faces), 'faces; reprojection error %.2f px' % err)
json.dump(out, open('art/autumn_glade/canopy_mass.json', 'w'))
