"""The temple court's paving (ff physics hq 2.mp4 121.5 s; profile.py read its edges across the mosaic): the cream court and its two
lanes, their corners rounded, ringed by the painted border: three grey lines with cream between and an amber kerb outside. Writes
floor.json: each band as polygons in plan units, widest first (Blender lays them one over the other).

  court   x -26.4 .. 9.45, y -15.1 .. 15.85 (the cream's own edge: the first grey line starts there)
  lanes   west y -4.3 .. 5.0 out past the map's edge; east y -2.0 .. 2.8 through the east gate
  bands   (outward from the cream, plan units) grey 0-0.4, cream 0.4-0.8, grey 0.8-1.2, cream 1.2-1.5, grey 1.5-1.85, kerb 1.85-2.5
          (east edge at y 9: 9.45 / 9.85 / 10.3 / 10.65 / 10.95 / 11.3 / 11.95; north at x -10 and south at x -5 alike)
  corners convex: the cream rounded r 2 (the lines concentric about it, the NE corner's arcs); concave: rounded r 1.2

  python art/temple_court/floor.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json
import numpy as np, cv2

RES = 0.02                                   # plan units per raster pixel
X0, X1, Y0, Y1 = -60.0, 60.0, -40.0, 40.0
COURT = (-26.4, 9.45, -15.1, 15.85)
LANES = [(-52.0, -26.4, -4.3, 5.0), (9.45, 52.0, -2.0, 2.8)]
R_CONVEX, R_CONCAVE = 2.0, 1.2
BANDS = [('kerb', 2.5, '#f3d083'), ('grey', 1.85, '#dbd8c4'), ('cream', 1.5, '#f9f6e6'), ('grey', 1.2, '#dbd8c4'), ('cream', 0.8, '#f9f6e6'),
         ('grey', 0.4, '#dbd8c4'), ('court', 0.0, '#f9f7e4')]

W, H = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
to_px = lambda x, y: (int(round((x - X0) / RES)), int(round((Y1 - y) / RES)))
m = np.zeros((H, W), np.uint8)
for x0, x1, y0, y1 in [COURT] + LANES:
    a, b = to_px(x0, y1), to_px(x1, y0); cv2.rectangle(m, a, b, 1, -1)
dist = lambda mask: cv2.distanceTransform(mask, cv2.DIST_L2, 5) * RES
erode = lambda a, r: (dist(a) > r).astype(np.uint8)              # (distance of each set pixel to the nearest unset one)
dilate = lambda a, r: 1 - erode(1 - a, r)
# round the convex corners (an opening) and the concave ones (a closing)
m = dilate(erode(m, R_CONVEX), R_CONVEX)
m = erode(dilate(m, R_CONCAVE), R_CONCAVE)
out = dist(1 - m)                              # how far outside the cream
bands = []
for name, d, colour in BANDS:
    region = (out <= d).astype(np.uint8) if d > 0 else m
    cs, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    polys = []
    for c in cs:
        if cv2.contourArea(c) < 50: continue
        a = cv2.approxPolyDP(c, 0.01 / RES, True).reshape(-1, 2)
        polys.append([[round(X0 + px * RES, 3), round(Y1 - py * RES, 3)] for px, py in a])
    bands.append(dict(name=name, out=d, colour=colour, polys=polys))
    print(name, d, len(polys), 'polygons', [len(p) for p in polys])
json.dump(dict(bands=bands, court=COURT, lanes=LANES), open('art/temple_court/floor.json', 'w'))
