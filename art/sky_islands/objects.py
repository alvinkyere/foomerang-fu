"""The sky islands' objects, measured (2026-10-22): where each stands, how big, and its colours.

Positions are read in the opening frame (9:04.0, output/reference.png, the reference px every frame is registered to) at
each object's foot, cast onto the ground (the island tops, z 0) through the game's camera; heights by solving where its top
must be for the camera to show it where the frame does; widths by the camera's local scale. Colours are k-means over each
object in its sharpest close-up (the HQ round's frames where the camera is closest, 9:41.6, 9:15.5, 9:18.3, 9:43.2).
Writes objects.json for blender/build.py.

  python art/sky_islands/objects.py       (from the repository root)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
Z = CAM['referenceZoom']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return np.array([960 + (cx - 960) * Z, 540 + (cy - 540) * Z])


def ground(px, py, z=0.0):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    H = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32([[[px, py]]]), H)[0][0].astype(float)


def height(X, Y, top_py):  # how high a point over (X, Y) must be to show at top_py
    lo, hi = 0.0, 40.0
    for _ in range(50):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if ref(X, Y, mid)[1] > top_py else (lo, mid)
    return round((lo + hi) / 2, 2)


def scale(X, Y, z=0.0):
    return float(np.linalg.norm(ref(X + 1, Y, z) - ref(X, Y, z)))      # ref px per unit across


# (kind, foot px, top px or None, width px): read in the opening frame
SEEN = [
    ('gong', (969, 502), 418, 135),
    ('maple', (487, -12), -123, 105), ('maple', (745, 399), 238, 148), ('maple', (1805, 273), 46, 170),
    ('maple', (287, 1027), 818, 152), ('maple_low', (1330, 486), 358, 182),
    ('hexplant', (380, 478), 355, 118), ('hexplant', (730, 1023), 903, 119), ('hexplant', (1059, 113), 54, 80),
    ('hexplant', (332, 799), 731, 83),
    ('pot', (430, 21), -18, 33), ('pot', (494, 48), 16, 23), ('pot', (458, 85), 46, 32), ('pot', (230, 118), 80, 28),
    ('pot', (255, 92), 58, 26), ('pot', (1085, 388), 352, 32), ('pot', (1125, 402), 374, 34), ('pot', (1482, 660), 625, 34),
    ('pot', (1525, 696), 656, 39), ('pot', (405, 1006), 958, 38),
    ('crate', (1233, 968), 912, 42), ('crate', (1263, 930), 885, 40),
    ('aloe', (1076, 1020), 952, 55),
    ('bamboo', (1218, 70), 0, 16), ('bamboo', (1277, 250), 170, 18), ('bamboo', (1486, 95), -10, 18),
    ('bamboo', (1664, 90), 20, 14), ('bamboo', (1452, 1058), 960, 22), ('bamboo', (1407, 1090), 990, 20),
    ('tuft', (835, 73), None, 31), ('tuft', (870, 84), None, 27), ('tuft', (1162, 388), None, 26),
    ('tuft', (864, 527), None, 35), ('tuft', (917, 523), None, 33), ('tuft', (938, 498), None, 30),
    ('tuft', (986, 497), None, 30), ('tuft', (1573, 596), None, 32), ('tuft', (714, 645), None, 20),
    ('tuft', (1355, 144), None, 18), ('tuft', (1369, 147), None, 18),
]
# the spiral tiles: on the stone blocks' faces at the map's top corners, facing the camera (foot = their lower edge)
TILES = [('tile_blue', (262, 60), 0, 72), ('tile_gold', (1555, 70), 0, 72)]   # (their blocks: layout.py)
PALETTES = {                                   # light, mid, dark (sRGB)
    'gong_frame': ['#4f527f', '#3f4267', '#313552'], 'gong_bell': ['#eff5a6', '#b0aa59', '#745f29'],
    'maple': ['#d46a5c', '#ca6358', '#a95454'], 'trunk': ['#8f93c2', '#6f73a4', '#565a87'],
    'hexplant': ['#bbecae', '#87d79e', '#6ec48f'], 'pot': ['#af7e6e', '#916251', '#6a4a3b'],
    'crate': ['#ad8189', '#926676', '#73556a'], 'aloe': ['#b8e39a', '#79b37c', '#4f8a5f'],
    'aloe_pot': ['#8d90b5', '#6d7099', '#53567a'], 'bamboo': ['#c3f097', '#99d46c', '#6bb057'],
    'tuft': ['#9fbe71', '#86a85c', '#6e8d4a'], 'tile_blue': ['#22dcf3', '#137ba7', '#3b3f71'],
    'tile_gold': ['#f2c053', '#c49c51', '#3b3f71'],
}
HEX_PLATES = 2.0      # the hex plants' plates: how high they stand (their stems as long; the close-up 9:41.6)
out = []
for kind, (fx, fy), top, wpx in SEEN:
    base_z = -3.0 if kind == 'maple_low' else 0.0      # this one grows from the cliff below the bridge
    if kind == 'hexplant':
        # the foot read is the plates' front edge, at their height; the plant stands at the cluster's middle
        X, Yf = ground(fx, fy, HEX_PLATES)
        w = wpx / scale(X, Yf, HEX_PLATES)
        out.append(dict(kind=kind, x=round(X, 2), y=round(Yf + w / 2, 2), z=0.0, width=round(w, 2), height=HEX_PLATES))
        continue
    X, Y = ground(fx, fy, base_z)
    w = wpx / scale(X, Y, base_z)
    item = dict(kind=kind.replace('_low', ''), x=round(X, 2), y=round(Y, 2), z=base_z, width=round(w, 2))
    solid = kind in ('pot', 'crate', 'aloe', 'tuft')
    if solid:
        item['y'] = round(Y + w / 2, 2)                  # the foot read is its front; it stands at its middle
    if top is not None:
        # what the frame shows highest is its top's far edge: a solid's back, a canopy's far side, the gong's beam
        back = {'gong': 0.3}.get(kind, w if solid else w / 2)
        item['height'] = round(height(X, Y + back, top) - base_z, 2)
    # small solids: their tops are too small and too foreshortened to read; their shapes are the close-ups' (9:41.6,
    # 9:15.5, 9:18.3): a vase 1.15x as tall as wide, a cube, an aloe 1.5x
    if kind in ('pot', 'crate', 'aloe'):
        item['height'] = round(w * {'pot': 1.15, 'crate': 1.0, 'aloe': 1.5}[kind], 2)
    if kind == 'maple_low':
        item['height'] = 9.0      # its canopy level with the centre island's maple's (it rises from the cliff below)
    out.append(item)
for kind, (fx, fy), _, wpx in TILES:
    X, Y = ground(fx, fy, 2.5)                                  # on a block's face, its foot at the block's top height
    out.append(dict(kind=kind, x=round(X, 2), y=round(Y, 2), z=0.6, width=round(wpx / scale(X, Y, 2.5), 2)))
json.dump(dict(objects=out, palettes=PALETTES), open('art/sky_islands/objects.json', 'w'), indent=1)
for o in out: print(o)
