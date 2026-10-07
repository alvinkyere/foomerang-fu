"""Facing (yaw about the vertical) per frame from the character's apparent silhouette width: a slab of width W and thickness D seen at yaw psi has
 screen width ~ W|cos psi| + D|sin psi|.  Masks by colour inside a window around the refined track.  Output facing.json {take: {name: {frame: {w,h,cx,cy}}}}.
 python measure_facing.py <frames_dir>"""
import sys, json, cv2, numpy as np
fd = sys.argv[1]
def mask(name, im):
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    if name == 'teal': return (g > r + 30) & (b > r + 8) & (g > 140)
    if name == 'watermelon': return ((r > 175) & (g < 125) & (b < 115)) | ((g > r + 25) & (g > b + 25) & (g < 150) & (r < 90))
    if name == 'bread': return ((r > 150) & (g > 105) & (g < 235) & (b < 175) & (r - b > 38) & (r - g < 70)) & ~((r > 235) & (g > 225))
    if name == 'coffee': return (b > 205) & (r > 200) & (g > 205) & (abs(r - b) < 34) & ~((r > 243) & (g > 240))
out = {}
for take, lo, hi in (('A', 201, 263), ('B', 264, 368)):
    tr = json.load(open(f'tracks_take{take}.json')); out[take] = {}
    for name, d in tr.items():
        if name.startswith('boom'): continue
        out[take][name] = {}
        for f, (x, y) in d.items():
            im = cv2.imread(f'{fd}/f{int(f):04d}.png'); R = 20; x0, y0, x1, y1 = int(max(0, x - R)), int(max(0, y - R)), int(min(640, x + R)), int(min(360, y + R))
            m = mask(name, im[y0:y1, x0:x1]).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
            n, lb, st, cen = cv2.connectedComponentsWithStats(m)
            if n < 2: continue
            k = 1 + int(np.argmax(st[1:, 4]))
            if st[k, 4] < 18: continue
            bx, by, bw, bh, area = st[k]; out[take][name][f] = dict(w=int(bw), h=int(bh), area=int(area), cx=float(x0 + cen[k][0]), cy=float(y0 + cen[k][1]))
json.dump(out, open('facing.json', 'w'))
for name in ('bread', 'teal', 'watermelon', 'coffee'):
    d = out['B'].get(name, {}); fr = sorted(int(k) for k in d)
    print(name, 'B widths:', ' '.join(f"{f}:{d[str(f)]['w']}" for f in fr[::5]))
