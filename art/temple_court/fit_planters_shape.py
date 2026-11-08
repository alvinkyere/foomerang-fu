"""An octagon's corners (plan units): half sizes a (x), b (y), its corners cut by k of the half size."""


def octagon(cx, cy, a, b, k):
    return [(cx + sx, cy + sy) for sx, sy in [(a, b * (1 - k)), (a * (1 - k), b), (-a * (1 - k), b), (-a, b * (1 - k)), (-a, -b * (1 - k)),
                                             (-a * (1 - k), -b), (a * (1 - k), -b), (a, -b * (1 - k))]]
