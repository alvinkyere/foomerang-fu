"""Decide a height map from a plane-sweep cost volume (plane_sweep.py): the per-plane cost is AGGREGATED over a window (so a
textureless top borrows the parallax of its textured edges), and a cell is raised only where its best plane beats the ground
plane by a clear MARGIN (otherwise it is ground: z = 0 is the prior for these stylised maps). The colour of each cell is the
median at its chosen plane (the surface seen where it really is). Writes an npz in plane_sweep's layout (z / colour / confidence)
so dsm_mesh.py meshes it.  python heights_from_volume.py <sweep.npz> <out.npz> [window_px] [margin] [view.png]"""
import sys, cv2, numpy as np
D = dict(np.load(sys.argv[1])); OUT = sys.argv[2]; WIN = int(sys.argv[3]) if len(sys.argv) > 3 else 15; MARGIN = float(sys.argv[4]) if len(sys.argv) > 4 else 12.0
V = D['volume'].astype(np.float32); zs = D['zs']; VC = D['volume_colour']
seen = V[0] < 6e4 - 1
A = np.stack([cv2.boxFilter(np.where(seen, v, 0), -1, (WIN, WIN), normalize=False) / np.maximum(cv2.boxFilter(seen.astype(np.float32), -1, (WIN, WIN), normalize=False), 1) for v in V])
k = A.argmin(0); best = np.take_along_axis(A, k[None], 0)[0]; gain = A[0] - best
z = np.where((gain > MARGIN) & seen, zs[k], 0.0).astype(np.float32)
ki = np.where(z > 0, k, 0); col = np.take_along_axis(VC, ki[None, ..., None].repeat(3, -1), 0)[0]
out = {key: D[key] for key in ('box', 'px_per_unit', 'frames', 'count')}
np.savez_compressed(OUT, z=z, colour=col, confidence=np.clip(gain / (MARGIN * 3), 0, 1).astype(np.float32), cost=best, **out)
print('raised cells', round(float((z > 0).mean()) * 100, 1), '% ; height percentiles of raised', np.round(np.percentile(z[z > 0], [10, 50, 90]), 3) if (z > 0).any() else '-')
if len(sys.argv) > 5:
    zz = cv2.applyColorMap((np.clip(z / zs[-1], 0, 1) * 255).astype(np.uint8), cv2.COLORMAP_TURBO); zz[z == 0] = 40
    cv2.imwrite(sys.argv[5], np.vstack([col, zz]))
