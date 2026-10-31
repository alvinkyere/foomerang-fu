"""Object by object against the HQ (2026-10-31; the owner: "every object in the map, perfect down to the last pixel").

  python art/bridge_islands/objcmp.py <game_shot.png> [name ...]        (from the repository root; the Python of art/audio/output/venv)

The game shot is `shoot_hq.sh`'s (the camera pinned to the HQ frame, within ~2 px). For each object (a box in the 1920x1080 reference) writes
output/obj_<name>.png: the HQ crop beside the game's, enlarged 3x, and prints the share of pixels that differ by more than 12 levels in the box.
`OBJECTS` is the catalogue: every object of the map, its box in the reference frame. Work the list top to bottom.
"""
import sys
import numpy as np, cv2

OBJECTS = {
    'gate': (1190, 90, 1360, 310), 'bush_n': (770, 130, 960, 300), 'bush_e': (1270, 370, 1420, 470), 'bush_s': (680, 770, 860, 910),
    'tree_nw': (470, 130, 650, 380), 'tree_w': (330, 340, 540, 560), 'tree_mid': (1090, 450, 1300, 650), 'tree_e': (1650, 140, 1900, 500),
    'bridge': (620, 300, 1100, 770), 'wall_nw': (600, 290, 920, 570), 'wall_se': (870, 560, 1110, 780),
    'block_w': (300, 520, 430, 660), 'block_lever_w': (530, 500, 650, 610), 'block_s': (650, 770, 800, 870), 'block_lever_s': (810, 750, 930, 850),
    'block_tall': (1210, 770, 1310, 910), 'block_mid': (1070, 520, 1180, 610), 'block_nw': (480, 70, 580, 190), 'block_top': (1000, 110, 1110, 210),
    'block_ne': (1280, 310, 1380, 400), 'back_wall': (1090, 0, 1700, 340), 'islet_e': (1640, 380, 1900, 570), 'islet_pots': (1030, 740, 1190, 860),
    'islet_nw': (490, 270, 660, 430), 'lantern_n': (990, 20, 1070, 110), 'lantern_e': (1460, 380, 1540, 460), 'plant_pot': (1360, 290, 1440, 380),
    'bamboo_e': (1320, 500, 1460, 680), 'bamboo_w': (320, 470, 420, 560), 'crates': (1090, 570, 1210, 670),
    'pad_1': (60, 750, 190, 830), 'pad_2': (200, 840, 380, 990), 'pad_3': (1490, 770, 1640, 880), 'pad_4': (1600, 840, 1780, 970), 'pad_5': (1440, 910, 1600, 1010),
}

g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)); h = cv2.imread('art/bridge_islands/output/reference.png')
names = sys.argv[2:] or list(OBJECTS)
for n in names:
    x0, y0, x1, y1 = OBJECTS[n]
    a, b = h[y0:y1, x0:x1], g[y0:y1, x0:x1]
    d = np.abs(a.astype(int) - b.astype(int)).max(2)
    big = (d > 12).mean()
    sheet = np.hstack([cv2.resize(a, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC), np.full((a.shape[0] * 3, 6, 3), 255, np.uint8), cv2.resize(b, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)])
    cv2.imwrite(f'art/bridge_islands/output/obj_{n}.png', sheet)
    print('%-14s differing %.0f%%' % (n, 100 * big))
