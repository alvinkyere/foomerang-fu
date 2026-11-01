"""The autumn glade, slice 2 (2026-11-01): colour masks of output/reference.png (ff physics hq 2.mp4 626.0 s), each blob unprojected
onto the ground (z 0) with measure.py's rig; writes layout.json (plan units, x east, y north, relative to the frame's centre ground
point) and output/layout_overlay.jpg to check it by eye.

  python art/autumn_glade/layout.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import plan

f = cv2.imread('art/autumn_glade/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
hud = np.arange(1920)[None, :] > 215
k = lambda n: np.ones((n, n), np.uint8)
clean = lambda m, n: cv2.morphologyEx(cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_OPEN, k(n)), cv2.MORPH_CLOSE, k(n))
M = dict(
    red=hud & ((H <= 8) | (H >= 172)) & (S > 120) & (V > 150),
    gold=hud & (H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232),
    rock=hud & (H >= 108) & (H <= 130) & (S >= 55) & (S < 150) & (V >= 150),
    portal=hud & (H >= 85) & (H <= 100) & (S > 120) & (V > 200),
    log=hud & (H >= 168) & (S >= 60) & (S <= 125) & (V >= 70) & (V < 150),
)
ground = hud & (H >= 18) & (H <= 28) & (S >= 70) & (S <= 140) & (V >= 225)
mm = f.reshape(-1, 3)[ground.reshape(-1)]
print('ground median #%02x%02x%02x' % tuple(int(x) for x in np.median(mm, 0)[::-1]), ground.sum(), 'px')
out, ov = {}, f.copy()
col = dict(red=(0, 0, 255), gold=(0, 215, 255), rock=(255, 100, 0), portal=(255, 255, 0), log=(0, 80, 160))
for n, m in M.items():
    c = clean(m, 5 if n == 'portal' else 9)
    cnt, lab, st, cen = cv2.connectedComponentsWithStats(c)
    items = []
    for i in range(1, cnt):
        x, y, w, hh, a = st[i]
        if a < (150 if n == 'portal' else 1500): continue
        cs, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cc = max(cs, key=cv2.contourArea)
        rect = cv2.minAreaRect(cc)
        pts = plan(cv2.boxPoints(rect))
        # a canopy's base and a prop's centre sit at the blob's lower middle for trees; use the blob centre for the rest
        px = (x + w / 2, y + hh * (0.8 if n in ('red', 'gold') else 0.5))
        items.append(dict(px=[round(px[0]), round(px[1])], area=int(a), plan=[round(float(v), 2) for v in plan([px])[0]],
                          box=[[round(float(v), 2) for v in p] for p in pts]))
        cv2.drawContours(ov, [cc], -1, col[n], 2)
    out[n] = items
    print(n, len(items))
json.dump(out, open('art/autumn_glade/layout.json', 'w'), indent=1)
cv2.imwrite('art/autumn_glade/output/layout_overlay.jpg', cv2.resize(ov, (1280, 720)))
