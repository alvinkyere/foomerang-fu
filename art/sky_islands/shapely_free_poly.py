"""Open places on the sky islands (for arena.py): for each island, the point of it farthest from its edges and from every solid
(a distance transform over a 5-unit raster), the islands' best for the six spawns, then the next best, a fair way from the
spawns, for the Book spots."""
import numpy as np, cv2


def clearance_points(islands, solids, _w, cell=5.0):
    W = int(max(x for poly in islands for x, _ in poly) / cell) + 4
    H = int(max(y for poly in islands for _, y in poly) / cell) + 4
    free = np.zeros((H, W), np.uint8)
    for poly in islands:
        cv2.fillPoly(free, [np.int32([[x / cell, y / cell] for x, y in poly])], 1)
    for s in solids:
        if s['shape'] == 'disc':
            cv2.circle(free, (int(s['x'] / cell), int(s['y'] / cell)), int(s['radius'] / cell) + 1, 0, -1)
        else:
            box = cv2.boxPoints(((s['x'] / cell, s['y'] / cell), (2 * s['halfWidth'] / cell, 2 * s['halfHeight'] / cell),
                                 np.degrees(s['angle'])))
            cv2.fillPoly(free, [np.int32(box)], 0)
    spawns, books = [], []
    for poly in islands:
        mask = np.zeros_like(free); cv2.fillPoly(mask, [np.int32([[x / cell, y / cell] for x, y in poly])], 1)
        d = cv2.distanceTransform((mask & free).astype(np.uint8), cv2.DIST_L2, 5) * cell
        y, x = np.unravel_index(d.argmax(), d.shape)
        spawns.append((round(float(x * cell), 1), round(float(y * cell), 1)))
        # the island's next most open place at least 250 units from its spawn
        yy, xx = np.mgrid[0:H, 0:W]
        d2 = np.where(np.hypot(xx - x, yy - y) * cell > 220, d, 0)
        y2, x2 = np.unravel_index(d2.argmax(), d2.shape)
        if d2.max() > 55: books.append((round(float(x2 * cell), 1), round(float(y2 * cell), 1)))
    return spawns, books
