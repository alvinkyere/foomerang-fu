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
