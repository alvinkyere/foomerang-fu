"""PROXY KIT for maps reconstructed from panned shots: a map's architecture as measured primitives in plan units (JSON), expanded
into triangle meshes here, shared by the fit overlay (overlay_proxies.py), the Blender bake (runtime/bake_proxies.py) and the rules
generator. Primitive types (all z in plan units, ground z = 0):
  box      centre [x, y], size [w, d], height h, z0 (default 0), rot (deg, about z), roof {type: pyramid|gable, height}
  wall     path [[x, y], ...], thickness t, height h, z0           (a prism along a polyline)
  cylinder centre, radius r, height h, z0, taper (top radius / bottom radius)
  flat     polygon [[x, y], ...], z                                   (a raised or sunken flat surface: decks, water)
Every primitive has a name and a group (the runtime occluder layer it bakes into; 'ground' = part of the ground layer) and may set
blocks: false (rules ignore it, e.g. a deck you walk on) and fidelity (MEASURED | REFERENCE-CONSTRAINED | INFERRED)."""
import json, math, numpy as np
def _box_faces(c, w, d, z0, h, rot):
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    corners = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
    P = [(c[0] + x * ca - y * sa, c[1] + x * sa + y * ca) for x, y in corners]
    V = [(x, y, z0) for x, y in P] + [(x, y, z0 + h) for x, y in P]
    F = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return V, F, P
def mesh(p):
    """-> (vertices [(x, y, z)], faces [tuple of vertex indices]) of one primitive."""
    t = p['type']; z0 = p.get('z0', 0.0)
    if t == 'box':
        V, F, P = _box_faces(p['centre'], p['size'][0], p['size'][1], z0, p['height'], p.get('rot', 0.0))
        r = p.get('roof')
        if r:
            top = z0 + p['height']; o = p.get('roof_overhang', 0.0); cx, cy = p['centre']
            Q = [(cx + (x - cx) * (1 + o), cy + (y - cy) * (1 + o)) for x, y in P]; b = len(V); V += [(x, y, top) for x, y in Q]
            if r['type'] == 'pyramid':
                V.append((cx, cy, top + r['height'])); a = len(V) - 1; F += [(b + i, b + (i + 1) % 4, a) for i in range(4)] + [(b + 3, b + 2, b + 1, b)]
            else:          # gable along the box's local x axis
                m0 = ((Q[0][0] + Q[3][0]) / 2, (Q[0][1] + Q[3][1]) / 2); m1 = ((Q[1][0] + Q[2][0]) / 2, (Q[1][1] + Q[2][1]) / 2)
                V += [(m0[0], m0[1], top + r['height']), (m1[0], m1[1], top + r['height'])]; a = len(V) - 2
                F += [(b, b + 1, a + 1, a), (b + 2, b + 3, a, a + 1), (b + 1, b + 2, a + 1), (b + 3, b, a), (b + 3, b + 2, b + 1, b)]
        return V, F
    if t == 'wall':
        V, F = [], []
        for (x0, y0), (x1, y1) in zip(p['path'][:-1], p['path'][1:]):
            L = math.hypot(x1 - x0, y1 - y0); ang = math.degrees(math.atan2(y1 - y0, x1 - x0)); th = p['thickness']
            v, f, _ = _box_faces(((x0 + x1) / 2, (y0 + y1) / 2), L + th, th, z0, p['height'], ang); b = len(V); V += v; F += [tuple(i + b for i in q) for q in f]
        return V, F
    if t == 'cylinder':
        n = 16; c = p['centre']; r0 = p['radius']; r1 = r0 * p.get('taper', 1.0); h = p['height']
        V = [(c[0] + r0 * math.cos(2 * math.pi * i / n), c[1] + r0 * math.sin(2 * math.pi * i / n), z0) for i in range(n)]
        V += [(c[0] + r1 * math.cos(2 * math.pi * i / n), c[1] + r1 * math.sin(2 * math.pi * i / n), z0 + h) for i in range(n)]
        F = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)] + [tuple(range(2 * n - 1, n - 1, -1)), tuple(range(n))]
        return V, F
    if t == 'flat':
        V = [(x, y, p['z']) for x, y in p['polygon']]; return V, [tuple(range(len(V)))]
    raise ValueError(t)
def footprint(p):
    """plan polygon(s) a primitive blocks (for the rules)."""
    t = p['type']
    if t == 'box': return [_box_faces(p['centre'], p['size'][0], p['size'][1], 0, 0, p.get('rot', 0.0))[2]]
    if t == 'wall':
        out = []
        for (x0, y0), (x1, y1) in zip(p['path'][:-1], p['path'][1:]):
            L = math.hypot(x1 - x0, y1 - y0); ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
            out.append(_box_faces(((x0 + x1) / 2, (y0 + y1) / 2), L + p['thickness'], p['thickness'], 0, 0, ang)[2])
        return out
    if t == 'cylinder':
        c, r = p['centre'], p['radius']; return [[(c[0] + r * math.cos(2 * math.pi * i / 12), c[1] + r * math.sin(2 * math.pi * i / 12)) for i in range(12)]]
    return [p['polygon']]
def load(path): return json.load(open(path))
