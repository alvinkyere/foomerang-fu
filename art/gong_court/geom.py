"""The gong court's stone as prisms (stones.json: fit_stones.py): each body's top outline (plan units, y north) and height; the walls'
beams as their four corners. Shared by ground.py, objects.py, cards.py, arena.py and blender/build.py's checks."""
import json, math, os

_HERE = os.path.dirname(os.path.abspath(__file__))


def beam_corners(b):
    """A wall's top: its centre line widened by half its width each side (plan units, counter-clockwise)."""
    (x0, y0), (x1, y1) = b['ends']; dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy); nx, ny = -dy / L * b['width'] / 2, dx / L * b['width'] / 2
    return [(x0 - nx, y0 - ny), (x1 - nx, y1 - ny), (x1 + nx, y1 + ny), (x0 + nx, y0 + ny)]


def ccw(poly):
    a = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    return poly if a > 0 else poly[::-1]


def prisms():
    """name -> (outline (counter-clockwise), height, mint outline or None, kind)."""
    S = json.load(open(os.path.join(_HERE, 'stones.json')))
    out = {}
    for name, b in S.items():
        poly = beam_corners(b) if b['kind'] == 'wall' else [tuple(p) for p in b['top']]
        out[name] = (ccw(poly), b['h'], b.get('mint'), b['kind'])
    return out


def bamboo_mask(shape, pix, origin, grow=1.6):
    """Where the 3D bamboo (props.json) stands on screen: each stalk widened `grow` times its radius, each spray a disc its length round
    its base; in the pixels of an image whose (0, 0) is `origin` in the frame (the mosaic's MOSAIC_ORIGIN). A uint8 mask."""
    import numpy as np, cv2
    m = np.zeros(shape, np.uint8); p = os.path.join(_HERE, 'props.json')
    if not os.path.exists(p): return m
    for st in json.load(open(p))['bamboo']:
        (fx, fy, fz), (tx, ty, tz), r = st['foot'], st['top'], st['r'] * grow
        q = np.float32([pix(fx - r, fy, fz), pix(fx + r, fy, fz), pix(tx + r, ty, tz), pix(tx - r, ty, tz)]) - origin
        cv2.fillConvexPoly(m, np.int32(q), 1)
        for sp in st['sprays']:
            t = sp['t']; c = np.float32(pix(fx + (tx - fx) * t, fy, fz + (tz - fz) * t)) - origin
            cv2.circle(m, (int(c[0]), int(c[1])), int(sp['length'] * 36.5 * 1.1), 1, -1)
    return m


def pots_mask(shape, pix, origin, grow=1.15):
    """Where the 3D pots (props.json) stand on screen: each one's upright box (its widest radius x `grow`, its height plus its rim); in
    the pixels of an image whose (0, 0) is `origin` in the frame. A uint8 mask."""
    import numpy as np, cv2
    m = np.zeros(shape, np.uint8); p = os.path.join(_HERE, 'props.json')
    if not os.path.exists(p): return m
    for q in json.load(open(p)).get('pots', {}).values():
        (fx, fy), r, h = q['foot'], q['r'] * grow, q['h'] * 1.1
        pts = [pix(fx + r * math.cos(t), fy + r * math.sin(t), z) for t in np.linspace(0, 2 * math.pi, 16) for z in (0, h)]
        cv2.fillConvexPoly(m, cv2.convexHull(np.int32(np.float32(pts) - origin)), 1)
    return m
