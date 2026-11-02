"""The south-west section's four stone blocks, measured (2026-11-01; the owner: "model them exactly"): per block, the box round it in the reference frame; its TOP face
(the pale, V >= 225 stone pixels: the largest piece) and its silhouette (all stone pixels); the height from the side pixels under the top (the silhouette's bottom edge
below the top's) over the pixels a unit of height moves a point; the top face unprojected at that height. Writes sw_blocks.json.

  python art/bridge_islands/sw_blocks.py      (from the repository root)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F_, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    return 960 + (F_ * v[0] / v[2]) * Z, 540 + (F_ * v[1] / v[2]) * Z


def unproject(pts, z):
    g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
    Hz = cv2.findHomography(np.float32([ref(X, Y, z) for X, Y in g]), np.float32(g))[0]
    return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hz).reshape(-1, 2)


h = cv2.imread('art/bridge_islands/output/reference.png'); x = cv2.cvtColor(h, cv2.COLOR_BGR2HSV).astype(int); v = h.max(2)
stone = (x[..., 0] >= 108) & (x[..., 0] <= 135) & (x[..., 1] >= 40)
BOXES = {'w': (290, 500, 450, 670), 'lw': (520, 490, 660, 620), 's': (640, 760, 790, 880), 'ls': (800, 740, 940, 860)}
out = {}
for n, (x0, y0, x1, y1) in BOXES.items():
    sil = np.zeros((1080, 1920), np.uint8); sil[y0:y1, x0:x1] = stone[y0:y1, x0:x1]
    top = (sil > 0) & (v >= 225); top = cv2.morphologyEx(top.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    sil = cv2.morphologyEx(sil, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(top, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    tp = cv2.approxPolyDP(cv2.convexHull(c), 3.0, True).reshape(-1, 2)
    ss, _ = cv2.findContours(sil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    sc = max(ss, key=cv2.contourArea); sp = cv2.approxPolyDP(cv2.convexHull(sc), 3.0, True).reshape(-1, 2)
    side = int(sp[:, 1].max() - tp[:, 1].max())                         # pixels of side under the top face's lowest point
    SHIFT = {'s': (12, 10), 'lw': (2, -14)}.get(n, (0, 0))      # (the game's own view, 2026-11-01: the shift that best puts each block on the HQ's)
    tp = tp + np.array(SHIFT); sp = sp + np.array(SHIFT)
    cx, cy = tp.mean(0)
    guess = unproject([[cx, cy]], 0.0)[0]
    dy = abs(ref(guess[0], guess[1], 1.0)[1] - ref(guess[0], guess[1], 0.0)[1])
    height = round(max(side, 8) / dy, 2)
    out[n] = dict(height=height, side_px=side, top_px=tp.tolist(), sil_px=sp.tolist(),
                  top=[[round(float(a), 2), round(float(b), 2)] for a, b in unproject(tp, height)],
                  foot=[[round(float(a), 2), round(float(b), 2)] for a, b in unproject(sp, 0.0)])
    print(n, 'top px', len(tp), 'side px', side, 'height %.2f' % height)
json.dump(out, open('art/bridge_islands/sw_blocks.json', 'w'))
