"""Slides each prop in the game's view onto the HQ's (props.json, applied by layout.py to the prop's pixel position): per prop, the shift of the game's crop that
best matches the HQ's crop (smallest mean |difference| of the colour, blurred a little), within +-20 px. Cumulative; run it after each shot.

  <bi_loop.sh> name; python art/bridge_islands/fit_props.py art/bridge_islands/output/<name>.png
"""
import json, os, sys
import numpy as np, cv2

BOX = {'pad0': (60, 750, 190, 830), 'pad1': (200, 840, 380, 990), 'pad2': (1490, 770, 1640, 880), 'pad3': (1600, 840, 1780, 970), 'pad4': (1440, 910, 1600, 1010), 'pad5': (330, 1010, 440, 1080),
       'bush0': (770, 130, 960, 300), 'bush1': (680, 770, 860, 910), 'bush2': (1270, 370, 1420, 470),
       'lantern0': (990, 20, 1070, 110), 'lantern1': (1460, 380, 1540, 460), 'crate0': (1090, 570, 1210, 670)}
g = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080)); h = cv2.imread('art/bridge_islands/output/reference.png')
blur = lambda f: cv2.GaussianBlur(f, (0, 0), 2).astype(np.float32)
G, H = blur(g), blur(h)
cur = json.load(open('art/bridge_islands/props.json')) if os.path.exists('art/bridge_islands/props.json') else {}
for n, (x0, y0, x1, y1) in BOX.items():
    best = None; ref = H[y0:y1, x0:x1]
    for dx in range(-20, 21, 2):
        for dy in range(-20, 21, 2):
            xa, ya = x0 - dx, y0 - dy
            if xa < 0 or ya < 0 or xa + (x1 - x0) > 1920 or ya + (y1 - y0) > 1080: continue
            e = np.abs(G[ya:ya + (y1 - y0), xa:xa + (x1 - x0)] - ref).mean()
            if best is None or e < best[0]: best = (e, dx, dy)
    e0 = np.abs(G[y0:y1, x0:x1] - ref).mean()
    o = cur.get(n, [0, 0]); cur[n] = [o[0] + best[1], o[1] + best[2]]
    print('%-9s move (%d, %d) px   error %.1f -> %.1f' % (n, best[1], best[2], e0, best[0]))
json.dump(cur, open('art/bridge_islands/props.json', 'w'))
