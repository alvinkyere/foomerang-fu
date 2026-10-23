"""The sky islands' layout in plan units (Blender X east, Y north; the island tops are the ground, z 0) (2026-10-22).

Measured from the HQ round through the plaza's camera rig (calibrate.py):
  * the islands' outlines: their grass seen from above (output/plan.png), gridded square to each island's own axis and
    cleaned by hand where a tree, a pot or a stone block hides the edge (an edge then runs straight on);
  * the tilted top-right island: its three visible edges fitted to the grass boundary (-62, 31 and -60 degrees);
  * the bridges: their wood (#936f90) seen from above; the log bridge turned -17.5 degrees;
  * the stone blocks: their light tops (#afbce6) segmented in the opening frame (9:04.0) and cast back into the plan at their
    height. The block on the centre island's north-east corner shows 40 px of front face above the grass in that frame:
    2.5 units, a character's height; the others start at that height and are corrected by comparing renders with the video.
Writes layout.json.

  python art/sky_islands/layout.py       (from the repository root)
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
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


def unproject(pts, z):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    H = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)


def line(angle_deg, through):
    a = math.radians(angle_deg)
    return np.array(through, float), np.array([math.cos(a), math.sin(a)])


def meet(l1, l2):
    (p, d), (q, e) = l1, l2
    t = np.linalg.solve(np.array([d, -e]).T, q - p)[0]
    return p + t * d


# the tilted island: its edges as fitted; its north corner where its north-east edge reaches the grass's top (y 103.3)
SW, SE, NE = line(-61.96, (23.66, 85.83)), line(30.94, (32.33, 83.65)), line(-60.37, (31.55, 94.96))
s, e = meet(SW, SE), meet(SE, NE)
n = meet(NE, (np.array([0.0, 103.3]), np.array([1.0, 0.0])))
NW = (n, SE[1])
w = meet(SW, NW)
tilted = [list(map(float, np.round(p, 2))) for p in (w, n, e, s)]

ISLANDS = {
    # the long one round the top-left: its west end, the arm south, the bar east, the lobe at its east end
    'north': [(-29.3, 100.5), (-17.0, 100.5), (-17.0, 98.0), (13.0, 98.0), (13.0, 91.2), (18.5, 91.2), (18.5, 88.4),
              (11.8, 88.4), (11.8, 91.0), (-17.5, 91.0), (-17.5, 74.3), (-24.2, 74.3), (-24.2, 88.6), (-29.3, 88.6)],
    'northeast': tilted,
    # where the north bar's east end meets the tilted island, behind the blocks (the opening frame: the grass runs on)
    'northeast_join': [(12.5, 90.5), (21.0, 90.5), (18.6, 97.8), (12.5, 97.8)],
    'centre': [(-9.5, 66.9), (10.5, 66.9), (10.5, 82.8), (-9.5, 82.8)],
    'east': [(19.1, 61.4), (25.8, 61.4), (25.8, 73.6), (19.1, 73.6)],
    'southwest': [(-24.3, 52.1), (-4.2, 52.1), (-4.2, 58.7), (-17.0, 58.7), (-17.0, 65.4), (-24.3, 65.4)],
    'south': [(2.0, 51.6), (21.0, 51.6), (21.0, 58.8), (2.0, 58.8)],
}
BRIDGES = {
    # planks laid across the way, two ropes along it; their ends just over the islands' edges
    'north': dict(kind='planks', corners=[(-2.75, 82.5), (3.05, 82.5), (3.05, 91.3), (-2.75, 91.3)], along=90.0),
    'south': dict(kind='planks', corners=[(-8.5, 58.4), (-2.8, 58.4), (-2.8, 67.2), (-8.5, 67.2)], along=90.0),
    # logs side by side, each lying across the way (from the centre island east to the east island)
    'east': dict(kind='logs', corners=[(10.0, 71.15), (19.6, 68.54), (21.7, 73.74), (12.1, 76.75)], along=-17.5),
}

# the stone blocks: their tops in the opening frame, back into the plan at their height
H0 = 2.5
f = cv2.imread('art/sky_islands/output/reference.png')
hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
h, sat, val = (hsv[..., i].astype(int) for i in range(3))
top = ((h >= 110) & (h <= 135) & (sat > 25) & (val > 215)).astype(np.uint8)
top[0:400, 0:240] = 0                                                   # the names
top = cv2.morphologyEx(top, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
nlab, lab, st, _ = cv2.connectedComponentsWithStats(top)
blocks = []
for i in range(1, nlab):
    if st[i, 4] < 900: continue
    cs, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    quad = cv2.approxPolyDP(c, 6, True)[:, 0, :]
    plan = unproject(quad, H0)
    blocks.append(dict(top=[list(map(float, np.round(p, 2))) for p in plan], height=H0,
                       image=[int(st[i, 0]), int(st[i, 1]), int(st[i, 2]), int(st[i, 3])]))
# beyond the opening frame's top (seen as the camera moves north, output/plan.png): the tall block at the north-west corner
# that carries the blue spiral tile, and the great block behind the north bar's east end that carries the gold one
for top, hgt in (([(-31.0, 96.5), (-26.5, 96.5), (-26.5, 103.5), (-31.0, 103.5)], 4.0),
                 ([(8.0, 98.5), (19.0, 98.5), (19.0, 107.0), (8.0, 107.0)], 6.5),
                 ([(19.5, 94.5), (24.0, 94.5), (24.0, 99.5), (19.5, 99.5)], 4.0)):
    blocks.append(dict(top=top, height=hgt, image=None))
# the bodies of rock the islands are built as: islands that overlap are one body (one top, one rim round the outside: two
# coplanar tops would flicker, and each would draw its rim across the other's grass), outlined at 1/50 unit
K = 50
x0 = min(x for o in ISLANDS.values() for x, _ in o) - 2; y0 = min(y for o in ISLANDS.values() for _, y in o) - 2
x1 = max(x for o in ISLANDS.values() for x, _ in o) + 2; y1 = max(y for o in ISLANDS.values() for _, y in o) + 2
mask = np.zeros((int((y1 - y0) * K), int((x1 - x0) * K)), np.uint8)
for o in ISLANDS.values():
    cv2.fillPoly(mask, [np.int32([[(x - x0) * K, (y - y0) * K] for x, y in o])], 1)
cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
bodies = []
for c in cs:
    q = cv2.approxPolyDP(c, 0.03 * K, True)[:, 0, :]
    bodies.append([[round(float(px) / K + x0, 3), round(float(py) / K + y0, 3)] for px, py in q])
# the blocks the bridges rest on (the opening frame: the planks and logs run onto them; built flush with the bridges as
# their landings), and the one in the seam where the north bar's lobe meets the tilted island; all walked over, not walls
PIERS = {'bridges': [6, 7, 15], 'seam': [1]}
json.dump(dict(islands=ISLANDS, bridges=BRIDGES, blocks=blocks, bodies=bodies, piers=PIERS['bridges'] + PIERS['seam'],
               landings=PIERS['bridges']), open('art/sky_islands/layout.json', 'w'), indent=1)
print(len(bodies), 'bodies of rock:', [len(b) for b in bodies])
print(len(ISLANDS), 'islands,', len(BRIDGES), 'bridges,', len(blocks), 'blocks; tilted island', tilted)
