"""Measures the HQ's lily pads (1:12): each pad's ellipse on screen (its centre, its size), the way its notch faces and whether a flower sits on it,
plus the small round pads. Writes pads.json (frame pixels) for layout.py.

  python art/bridge_islands/fit_pads.py
"""
import json, math
import numpy as np, cv2

f = cv2.imread('art/bridge_islands/output/reference.png'); x = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
green = (x[..., 0] >= 45) & (x[..., 0] <= 80) & (x[..., 1] >= 60) & (x[..., 2] >= 110)
pink = ((x[..., 0] >= 150) | (x[..., 0] <= 10)) & (x[..., 1] <= 90) & (x[..., 2] >= 200)
REGIONS = [(30, 720, 420, 1080), (1400, 740, 1820, 1080), (380, 60, 520, 200), (620, 400, 760, 480), (1820, 500, 1920, 640)]          # (the open water south-west and south-east, where the pads float)
pads, small = [], []
for x0, y0, x1, y1 in REGIONS:
    m = np.zeros(green.shape, np.uint8); m[y0:y1, x0:x1] = (green | pink)[y0:y1, x0:x1]
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    for i in range(1, n):
        area = st[i, cv2.CC_STAT_AREA]
        if area < 60: continue
        c = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0][0]
        if len(c) < 6: continue
        if area < 900:
            (cx, cy), r = cv2.minEnclosingCircle(c); small.append([round(cx, 1), round(cy, 1), round(r, 1)]); continue
        hull = cv2.convexHull(c); (cx, cy), (w, h), ang = cv2.fitEllipse(hull)
        # the notch: the direction from the centre where the pad's own pixels are missing inside its hull
        # the notch: the direction (screen degrees, y down) in which a ray from the centre crosses the fewest of the pad's own pixels
        pad = (lab == i); cover = []
        for a in range(0, 360, 3):
            t = np.linspace(0.15, 0.9, 25); ex, ey = cx + math.cos(math.radians(a)) * t * max(w, h) / 2, cy + math.sin(math.radians(a)) * t * min(w, h) / 2
            ok = (ex >= 0) & (ex < 1920) & (ey >= 0) & (ey < 1080)
            cover.append(pad[ey[ok].astype(int), ex[ok].astype(int)].mean() if ok.any() else 1.0)
        cover = np.convolve(np.r_[cover[-3:], cover, cover[:3]], np.ones(5) / 5, 'same')[3:-3]
        notch = float(np.argmin(cover) * 3) if cover.min() < 0.5 else None
        notch = None if notch is None else (notch if notch <= 180 else notch - 360)
        fl = int((pink & (lab == i)).sum()) > 80
        pads.append(dict(c=[round(cx, 1), round(cy, 1)], axes=[round(max(w, h) / 2, 1), round(min(w, h) / 2, 1)], notch=None if notch is None else round(notch, 1), flower=fl))
for p in pads: print(p)
print(len(small), 'small pads', small)
json.dump(dict(pads=pads, small=small), open('art/bridge_islands/pads.json', 'w'))
