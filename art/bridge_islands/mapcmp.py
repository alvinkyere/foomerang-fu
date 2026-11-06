"""The map-only comparison (2026-11-05): a game shot made with `?frame=hq&bare=on` (no characters, boomerangs, pickups, HUD) against the HQ
frame with ITS characters and HUD masked out (MASK: boxes round them, padded). Pixels differing by more than 12 levels in any channel,
over the pixels both show the map. This measures the map alone: the players' places and the names no longer count.

  <shoot_bare.sh> name 1500; python art/bridge_islands/mapcmp.py art/bridge_islands/output/<name>.png [--boxes]
"""
import sys
import numpy as np, cv2

# the HQ frame's own actors at 1:15.5 (reference.png): the names, the eggplant, the donut, the banana, two things in flight
MASK = [(0, 90, 215, 385), (405, 555, 485, 625), (885, 835, 960, 915), (1420, 430, 1495, 515), (1045, 440, 1095, 480), (920, 255, 990, 295)]


def mask():
    m = np.ones((1080, 1920), bool)
    for x0, y0, x1, y1 in MASK: m[y0:y1, x0:x1] = False
    return m


if __name__ == '__main__':
    h = cv2.imread('art/bridge_islands/output/reference.png').astype(int)
    g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)).astype(int)
    m = mask(); d = np.abs(h - g).max(2) > 12
    print('map only: %.2f%% differing (over %.1f%% of the frame)' % (100 * d[m].mean(), 100 * m.mean()))
    if '--boxes' in sys.argv:
        src = open('art/bridge_islands/objcmp.py').read(); O = eval(src.split('OBJECTS = ')[1].split('}')[0] + '}')
        cover = np.zeros(d.shape, bool); rows = []
        for n, (x0, y0, x1, y1) in O.items():
            b = np.zeros(d.shape, bool); b[y0:y1, x0:x1] = True; b &= ~cover & m; cover |= b
            rows.append((100 * (d & b).sum() / m.sum(), n, d[b].mean() if b.any() else 0))
        for r in sorted(rows, reverse=True)[:20]: print('%5.2f%%  %-14s %.0f%%' % (r[0], r[1], 100 * r[2]))
        print('outside boxes %.2f%%' % (100 * (d & ~cover & m).sum() / m.sum()))
