"""Painted cards for what stands up off the ground (2026-11-05): the trees' canopies (and later the bushes and the gate) are 3D in our map but
the HQ draws them as soft painted masses. Each object's region in the HQ frame (its colour class, in its box) is grouped into tones, every
tone region traced, and the outlines laid on a plane that faces the camera at the object's own depth (the plane through the object's anchor,
perpendicular to the camera's view direction), so they cover exactly the HQ's pixels from the HQ's camera. Our own flat shapes in measured
colours, not the video's pixels. Writes cards.json; blender/build.py builds them (CARD_*) in place of the canopy blobs.

  python art/bridge_islands/cards.py
"""
import json, math, sys
import numpy as np, cv2
sys.path.insert(0, 'art/bridge_islands')
from mapcmp import mask

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])
Cw = C * 100                                                      # (the camera, world units)
def ref(P):
    v = R @ (np.array(P) / 100 - C)
    return np.array([960 + (F * v[0] / v[2]) * Z, 540 + (F * v[1] / v[2]) * Z])
def ray(px, py):
    """The world direction through a frame pixel."""
    v = np.array([(px - 960) / (F * Z), (py - 540) / (F * Z), 1.0])
    d = R.T @ v; return d / np.linalg.norm(d)
VIEW = ray(960, 540)
def on_card(px, py, anchor):
    """Where the pixel's ray meets the plane through `anchor` facing the camera."""
    d = ray(px, py); t = ((np.array(anchor) - Cw) @ VIEW) / (d @ VIEW)
    return Cw + d * t

f = cv2.medianBlur(cv2.imread('art/bridge_islands/output/reference.png'), 3)
hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); rgb = f.astype(int)[..., ::-1]
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32)
CLASS = {'red': ((hsv[..., 0] <= 12) | (hsv[..., 0] >= 170)) & (hsv[..., 1] > 80) & (hsv[..., 2] > 140),
         'gold': (hsv[..., 0] >= 11) & (hsv[..., 0] <= 26) & (hsv[..., 1] > 70) & (hsv[..., 2] > 150)}
L = json.load(open('art/bridge_islands/layout.json'))
# per tree: its box in the frame and colour class (fit_trees.py's), and its anchor: the canopy's middle, in the world (layout.py's lumps)
BOXES = [(430, 110, 680, 330, 'red'), (300, 330, 560, 560, 'gold'), (1050, 440, 1330, 640, 'gold'), (1640, 100, 1920, 500, 'red'), (780, 0, 1000, 80, 'gold')]
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2)
cards = []
for k, (x0, y0, x1, y1, kind) in enumerate(BOXES):
    t = L['trees'][k]
    anchor = [float(np.mean([l['at'][0] for l in t['lumps']])), float(np.mean([l['at'][1] for l in t['lumps']])), float(np.mean([l['z'] for l in t['lumps']]))]
    box = np.zeros(CLASS[kind].shape, bool); box[y0:y1, x0:x1] = True
    m = CLASS[kind] & box & mask()
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    if m.sum() < 200: continue
    NK = 5
    _, lb, _ = cv2.kmeans(lab[m], NK, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    labels = np.full(m.shape, -1, int); labels[m] = lb.ravel()
    order = sorted(range(NK), key=lambda q: -(labels == q).sum())
    # the silhouette first, in the commonest tone, then each tone's regions on it
    parts = []
    sil = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]
    base_col = '#%02x%02x%02x' % tuple(np.median(rgb[labels == order[0]], 0).astype(int))
    for c in sil:
        if cv2.contourArea(c) < 30: continue
        parts.append((cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2), base_col))
    for q in order[1:]:
        mq = cv2.morphologyEx((labels == q).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        for c in cv2.findContours(mq, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]:
            if cv2.contourArea(c) < 8: continue
            one = np.zeros(m.shape, np.uint8); cv2.drawContours(one, [c], -1, 1, -1)
            parts.append((cv2.approxPolyDP(c, 0.8, True).reshape(-1, 2), '#%02x%02x%02x' % tuple(np.median(rgb[(one > 0) & (labels == q)], 0).astype(int))))
    out = []
    for i, (poly, col) in enumerate(parts):
        if len(poly) < 3: continue
        P = [on_card(float(px), float(py) - 6, anchor) for px, py in poly]          # (the game's view ~6 px lower than this camera model)
        out.append(dict(pts=[[round(float(a), 3) for a in p] for p in P], colour=col))
    cards.append(dict(tree=k, anchor=anchor, toward=[round(float(-a), 4) for a in VIEW], parts=out))
    print('tree', k, kind, len(out), 'parts')
json.dump(dict(cards=cards), open('art/bridge_islands/cards.json', 'w'))
