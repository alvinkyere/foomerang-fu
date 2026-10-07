"""Roof silhouettes straight from the captured roof plane (z = 0.06, take A): red-roof regions -> polygons in WORLD plan coordinates (exact, since the plane is rectified at the roof height).
 Output roofs.json: [{outline, centre, size, angle}]   python extract_roofs.py"""
import cv2, numpy as np, json
tex = cv2.imread('textures/plane_roof.png'); S, X0, Y1 = 500.0, -1.0, 2.0
b, g, r = [tex[..., i].astype(int) for i in range(3)]
m = ((r > 185) & (g < 102) & (b < 92) & (r - g > 85)).astype(np.uint8) * 255      # roof red only: the carpet (g~105-116) projects into the same plane and must not merge
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); out = []
W = lambda p: [round(p[0] / S + X0, 5), round(Y1 - p[1] / S, 5)]
for c in cs:
    a = cv2.contourArea(c)
    if a < 900: continue
    (cx, cy), (w, h), ang = cv2.minAreaRect(c); out.append(dict(outline=[W(p) for p in cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2)], centre=W((cx, cy)), size_px=[round(w, 1), round(h, 1)], angle=round(ang, 1), area_px=int(a)))
json.dump(out, open('roofs.json', 'w')); print(len(out), [(o['centre'], o['size_px'], o['angle'], o['area_px']) for o in out])
vis = tex.copy(); [cv2.drawContours(vis, [c], -1, (255, 255, 0), 1) for c in cs if cv2.contourArea(c) >= 900]; cv2.imwrite('/private/tmp/claude-501/-Users-alvin-Desktop-Foomerang-Fu/b7de35c5-fc94-4e2d-ae71-3e4005de2e4a/scratchpad/roofs_vis.png', vis[300:900, 100:800])
