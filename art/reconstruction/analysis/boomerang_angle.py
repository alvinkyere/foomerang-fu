"""Boomerang spin per frame: direction from the dark crescent's centroid to its convex-hull centroid (points to the open side).  Output boomerang_angle.json (radians, unwrapped).
 python boomerang_angle.py <frames_dir>"""
import sys, json, cv2, numpy as np
fd = sys.argv[1]; out = {}
for take, names in (('B', ('boomerang_a', 'boomerang_b')),):
    tr = json.load(open(f'tracks_take{take}.json'))
    for n in names:
        fr = sorted(int(k) for k in tr[n]); ang = {}
        for f in fr:
            x, y = tr[n][str(f)]; im = cv2.imread(f'{fd}/f{f:04d}.png'); R = 12; x0, y0 = int(max(0, x - R)), int(max(0, y - R)); sub = im[y0:int(y + R), x0:int(x + R)]
            b, g, r = [sub[..., i].astype(int) for i in range(3)]; m = ((r < 140) & (g < 110) & (b < 100) & (r - b > -10)).astype(np.uint8)
            cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            if not cs: continue
            c = max(cs, key=cv2.contourArea)
            if cv2.contourArea(c) < 6: continue
            M = cv2.moments(c); cen = np.array([M['m10'] / M['m00'], M['m01'] / M['m00']]); hull = cv2.convexHull(c); Mh = cv2.moments(hull)
            if Mh['m00'] < 1: continue
            hc = np.array([Mh['m10'] / Mh['m00'], Mh['m01'] / Mh['m00']]); v = hc - cen
            if np.linalg.norm(v) < 0.2: continue
            ang[f] = float(np.arctan2(v[1], v[0]))
        ks = sorted(ang); a = np.array([ang[k] for k in ks]); a = np.unwrap(a) if len(a) > 1 else a
        out[n] = {str(k): float(v) for k, v in zip(ks, a)}; print(n, 'frames with an angle', len(ks), 'of', len(fr), ' first angles (deg):', [int(np.degrees(v)) for v in a[:10]])
json.dump(out, open('boomerang_angle.json', 'w'))
