"""Per-frame visible surface of Bread in the reference: FACE (crumb + eyes), BACK (crumb, no eyes), EDGE (mostly crust, narrow).
 Output bread_vis_takeB.json {frame: {cls, crumb_frac, aspect, eyes}}.   python bread_visibility.py <frames>"""
import sys, json, cv2, numpy as np
fd = sys.argv[1]; T = json.load(open('tracks_takeB.json'))['bread']; out = {}
for f, (x, y) in sorted(T.items(), key=lambda kv: int(kv[0])):
    im = cv2.imread(f'{fd}/f{int(f):04d}.png'); R = 20; x0, y0 = int(max(0, x - R)), int(max(0, y - R)); w = im[y0:int(y + R), x0:int(x + R)].astype(int)
    b, g, r = w[..., 0], w[..., 1], w[..., 2]
    crust = (r - b > 40) & (r < 200) & (g < 175) & (r > 70); crumb = (r - b > 60) & (r > 205); body = cv2.morphologyEx((crust | crumb).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lb, st, _ = cv2.connectedComponentsWithStats(body)
    if n < 2: continue
    k = 1 + int(np.argmax(st[1:, 4])); bx, by, bw, bh, area = st[k]
    if area < 120: continue
    reg = lb == k; cf = float((crumb & reg).sum() / max(area, 1))
    dark = (w.max(2) < 75) & (cv2.dilate(reg.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0); nd, _, sd, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8))
    eyes = int(sum(1 for i in range(1, nd) if 2 <= sd[i, 4] <= 30))
    aspect = bw / max(bh, 1)
    cls = 'EDGE' if (cf < 0.25 or aspect < 0.55) else ('FACE' if eyes >= 2 else 'BACK')
    out[f] = dict(cls=cls, crumb_frac=round(cf, 2), aspect=round(float(aspect), 2), eyes=eyes)
json.dump(out, open('bread_vis_takeB.json', 'w'))
print(' '.join(f"{f}:{v['cls'][0]}" for f, v in out.items()))
