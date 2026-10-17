"""Painted outlines as 3D outlines: a cut-out's outline (its step-3 mask), traced so that exactly its own pixels' centres lie inside,
then carried through environ2's camera onto the 3D surface that faces the camera (a horizontal plane at a measured height, or a
measured vertical plane). The result is in plan BU, ready to be built into a slab of real thickness whose silhouette from the
camera is the painted outline.  Library: outline(mask) -> image polygons; lift_h(poly, z); lift_v(poly, a, b)."""
import math
import cv2, numpy as np
import fit_stall as fs

UP = 4


def outline(mask, min_area=20):
    """Outer outlines of a mask, as image-px polygons whose insides hold exactly the mask's pixel centres (traced on a x4 grid,
    the line passes 3/8 px outside each edge pixel's centre; raster coordinates, pixel x spans [x, x+1)). Holes are ignored (filled)."""
    m = cv2.resize(mask.astype(np.uint8), None, fx=UP, fy=UP, interpolation=cv2.INTER_NEAREST)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    polys = []
    for c in cs:
        if cv2.contourArea(c) < min_area * UP * UP:
            continue
        c = cv2.approxPolyDP(c, 1.0, True)[:, 0].astype(np.float64)        # within 1/4 px of the traced line
        polys.append((c + 0.5) / UP)            # raster coordinates: pixel x spans [x, x+1) (Blender's and the camera's)
    return polys


def lift_h(poly, z):
    """Image polygon -> plan points on the horizontal plane at height z (BU)."""
    return np.array([fs.unproj(x, y, z)[:2] for x, y in poly])


def lift_v(poly, a, b):
    """Image polygon -> 3D points on the vertical plane through plan points a and b (BU)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = np.array([b[1] - a[1], -(b[0] - a[0]), 0.0])
    n /= np.linalg.norm(n)
    out = []
    for x, y in poly:
        d = fs.R.T @ np.array([(x - 640) / fs.F, (y - 360) / fs.F, 1.0])
        t = (np.array([a[0], a[1], 0.0]) - fs.C) @ n / (d @ n)
        out.append(fs.C + t * d)
    return np.array(out)


def coverage(polys_px, mask):
    """How exactly the polygons cover the mask (pixel centres inside), as IoU."""
    K = 8                                           # rasterise at x8 and read each pixel's centre sample
    big = np.zeros((mask.shape[0] * K, mask.shape[1] * K), np.uint8)
    for p in polys_px:
        cv2.fillPoly(big, [np.round(p * K * 16).astype(np.int32)], 1, shift=4)
    m = big[K // 2::K, K // 2::K] > 0
    return (m & mask).sum() / max(1, (m | mask).sum())


def ray_slab(poly, surface_points, depth):
    """A solid whose front is `surface_points` (3D, the painted outline on its surface) and whose back is the same image outline
    `depth` BU further along each camera ray: its outline from the camera is exactly the painted one."""
    back = []
    for (x, y), p in zip(poly, surface_points):
        d = fs.R.T @ np.array([(x - 640) / fs.F, (y - 360) / fs.F, 1.0])
        d /= np.linalg.norm(d)
        back.append((np.asarray(p, float) + d * depth).tolist())
    return [list(map(float, p)) for p in surface_points], back
