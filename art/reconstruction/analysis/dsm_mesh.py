"""Mesh a shot's height map (plane_sweep.py) into coloured geometry for the runtime bake: one PLY per group (ground + each
elevated component = one occluder layer). Tops are the height map's cells with the sweep's agreeing-frame colour; vertical sides
(only those that face the game camera: south / east / west) are subdivided in height and coloured by a VISIBILITY-AWARE median of
the reference frames (a sample counts only if the ray to that frame's camera clears the height map). Plan units throughout.
python dsm_mesh.py <frames_dir> <camera_key> <height.npz> <out_dir> [min_height] [min_area_cells]"""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proj import plane_H, cam, K, Rt
FD, KEY, NPZ, OUT = sys.argv[1:5]; ZMIN = float(sys.argv[5]) if len(sys.argv) > 5 else 0.012; AMIN = int(sys.argv[6]) if len(sys.argv) > 6 else 60
os.makedirs(OUT, exist_ok=True); D = np.load(NPZ); Z = D['z'].astype(np.float32); COL = D['colour']; X0, X1, Y0, Y1 = D['box']; S = float(D['px_per_unit'])
H, W = Z.shape
# clean: median filter, small heights to the ground, elevated mask opened/closed, components below AMIN cells dropped
Z = cv2.medianBlur(Z, 5); Z[Z < ZMIN] = 0
el = (Z > 0).astype(np.uint8); el = cv2.morphologyEx(cv2.morphologyEx(el, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(el, connectivity=8)
for i in range(1, n):
    if st[i, 4] < AMIN: el[lab == i] = 0
Z = np.where(el > 0, np.maximum(Z, ZMIN), 0).astype(np.float32)
n, lab, st, _ = cv2.connectedComponentsWithStats(el, connectivity=8)
# fill heights inside a component's closing holes with its median height (the sweep leaves uniform tops at z = 0)
for i in range(1, n):
    m = lab == i; zi = Z[m]; zi = zi[zi > 0]; Z[m & (Z == 0)] = np.median(zi) if len(zi) else ZMIN
xs = X0 + (np.arange(W + 1)) / S; ys = Y1 - (np.arange(H + 1)) / S           # cell corner coordinates
frames = [int(f) for f in D['frames']][::2]; Ps = []; Cs = []; IMS = []
for f in frames:
    R, t = Rt(KEY, f); Ps.append(K(KEY) @ np.column_stack([R, t])); Cs.append(-R.T @ t); IMS.append(cv2.imread(f'{FD}/f{f:04d}.png'))
def zat(x, y):
    j = np.clip(((x - X0) * S).astype(int), 0, W - 1); i = np.clip(((Y1 - y) * S).astype(int), 0, H - 1); return Z[i, j]
def side_colours(P3):
    """median colour of 3D points over the frames that see them (ray to the camera clears the height map)."""
    acc = np.full((len(frames), len(P3), 3), np.nan, np.float32)
    for k, (Pm, C, im) in enumerate(zip(Ps, Cs, IMS)):
        q = (Pm @ np.c_[P3, np.ones(len(P3))].T).T; u, v = q[:, 0] / q[:, 2], q[:, 1] / q[:, 2]
        ok = (u >= 0) & (u < 639) & (v >= 0) & (v < 359)
        for s in np.linspace(0.02, 0.6, 24):          # march toward the camera; occluded if the surface rises above the ray
            R_ = P3 + s * 0.25 * (C - P3) / np.linalg.norm(C - P3, axis=1, keepdims=True)
            ok &= zat(R_[:, 0], R_[:, 1]) <= R_[:, 2] + 0.002
        ui, vi = np.clip(u.astype(int), 0, 639), np.clip(v.astype(int), 0, 359); acc[k][ok] = im[vi[ok], ui[ok]].astype(np.float32)
    with np.errstate(all='ignore'): med = np.nanmedian(acc, 0)
    return med
groups = {0: 'ground'}; groups.update({i: f'g{i:02d}' for i in range(1, n)})
meta = {}
for gi, gname in groups.items():
    V, Cc, F = [], [], []
    cells = np.argwhere(lab == gi) if gi else np.argwhere(el == 0)
    for i, j in cells:            # top quad
        z = float(Z[i, j]); b = len(V); V += [(xs[j], ys[i], z), (xs[j + 1], ys[i], z), (xs[j + 1], ys[i + 1], z), (xs[j], ys[i + 1], z)]
        c = COL[i, j][::-1]; Cc += [c] * 4; F.append((b, b + 3, b + 2, b + 1))
    side_pts, side_quads = [], []
    if gi:
        for i, j in cells:
            z = float(Z[i, j])
            # neighbours: south (i+1), east (j+1), west (j-1); a side exists where the neighbour is lower
            for di, dj, ax in ((1, 0, 's'), (0, 1, 'e'), (0, -1, 'w')):
                ni, nj = i + di, j + dj; zn = float(Z[ni, nj]) if 0 <= ni < H and 0 <= nj < W else 0.0
                if zn >= z - 1e-6: continue
                if ax == 's': a, b2 = (xs[j], ys[i + 1]), (xs[j + 1], ys[i + 1])
                elif ax == 'e': a, b2 = (xs[j + 1], ys[i + 1]), (xs[j + 1], ys[i])
                else: a, b2 = (xs[j], ys[i]), (xs[j], ys[i + 1])
                levels = np.linspace(zn, z, max(2, int((z - zn) / 0.004) + 1))
                base = len(side_pts)
                for zz in levels: side_pts += [(a[0], a[1], zz), (b2[0], b2[1], zz)]
                for k in range(len(levels) - 1): side_quads.append((base + 2 * k, base + 2 * k + 1, base + 2 * k + 3, base + 2 * k + 2))
    if side_pts:
        sp = np.array(side_pts, np.float32); sc = side_colours(sp)
        # unseen side points take their column's nearest seen colour, else the darkened top colour
        top = np.array([COL[min(H - 1, int((Y1 - p[1]) * S)), min(W - 1, int((p[0] - X0) * S))][::-1] * 0.7 for p in sp], np.float32)
        sc = np.where(np.isnan(sc), top, sc); b = len(V); V += [tuple(p) for p in sp]; Cc += [tuple(c[::-1]) for c in sc]
        F += [(b + q[0], b + q[1], b + q[2], b + q[3]) for q in side_quads]
    V = np.array(V, np.float32); Cc = np.clip(np.array(Cc, np.float32), 0, 255).astype(np.uint8)
    with open(os.path.join(OUT, f'{gname}.ply'), 'wb') as fh:
        fh.write((f'ply\nformat binary_little_endian 1.0\nelement vertex {len(V)}\nproperty float x\nproperty float y\nproperty float z\n'
                  f'property uchar red\nproperty uchar green\nproperty uchar blue\nelement face {len(F)}\nproperty list uchar int vertex_indices\nend_header\n').encode())
        vd = np.zeros(len(V), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('r', 'u1'), ('g', 'u1'), ('b', 'u1')])
        vd['x'], vd['y'], vd['z'] = V[:, 0], V[:, 1], V[:, 2]; vd['r'], vd['g'], vd['b'] = Cc[:, 0], Cc[:, 1], Cc[:, 2]; fh.write(vd.tobytes())
        fd_ = np.zeros(len(F), dtype=[('n', 'u1'), ('i', '<i4', 4)]); fd_['n'] = 4; fd_['i'] = np.array(F, np.int32); fh.write(fd_.tobytes())
    if gi:
        m = lab == gi; ii, jj = np.nonzero(m)
        meta[gname] = dict(cells=int(m.sum()), height=float(np.median(Z[m])), max_height=float(Z[m].max()),
                           bbox=[float(xs[jj.min()]), float(xs[jj.max() + 1]), float(ys[ii.max() + 1]), float(ys[ii.min()])],
                           front=[float((xs[jj.min()] + xs[jj.max() + 1]) / 2), float(ys[ii.max() + 1])])
    print(gname, len(V), 'vertices', len(F), 'faces', flush=True)
np.save(os.path.join(OUT, 'height_clean.npy'), Z)
json.dump(dict(box=[float(X0), float(X1), float(Y0), float(Y1)], px_per_unit=S, groups=meta), open(os.path.join(OUT, 'groups.json'), 'w'), indent=1)
