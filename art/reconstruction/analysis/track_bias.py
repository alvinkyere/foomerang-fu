"""Signed image-space bias (reference mask centroid minus render mask centroid) per character -> track_bias.json (constant per character, px)."""
import sys, json, cv2, numpy as np
FD, RD, TAKE = sys.argv[1:4]
src = open(__file__.replace('track_bias.py', 'measure_facing.py')).read().split('out = {}')[0].replace('fd = sys.argv[1]', "fd = ''"); sys.argv = ['x']; exec(src); fd, rd, take = FD, RD, TAKE
T = json.load(open(__file__.replace('track_bias.py', f'tracks_take{take}.json'))); out = {}
for name in ('bread', 'teal', 'watermelon'):
    d = []
    for f, (x, y) in T[name].items():
        a = cv2.imread(f'{fd}/f{int(f):04d}.png'); b = cv2.imread(f'{rd}/f{int(f):04d}.png')
        if a is None or b is None: continue
        R = 22; x0, y0, x1, y1 = int(max(0, x - R)), int(max(0, y - R)), int(min(640, x + R)), int(min(360, y + R)); cs = []
        for im in (a, b):
            m = mask(name, im[y0:y1, x0:x1]).astype(np.uint8); n, lb, st, cen = cv2.connectedComponentsWithStats(m)
            if n < 2: cs.append(None); continue
            k = 1 + int(np.argmax(st[1:, 4])); cs.append((x0 + cen[k][0], y0 + cen[k][1]) if st[k, 4] > 12 else None)
        if cs[0] and cs[1]: d.append((cs[0][0] - cs[1][0], cs[0][1] - cs[1][1]))
    d = np.array(d); out[name] = [float(np.median(d[:, 0])), float(np.median(d[:, 1]))]; print(name, 'median bias dx,dy px', np.round(out[name], 1), 'n', len(d))
json.dump(out, open(f'track_bias_take{take}.json', 'w'))
