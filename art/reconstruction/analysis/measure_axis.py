"""Silhouette major-axis angle (image degrees, 0 = horizontal) and elongation per frame, reference vs a render, per character.
 python measure_axis.py <frames> <render_dir> <take>"""
import sys, json, cv2, numpy as np
FD, RD, TAKE = sys.argv[1:4]
src = open(__file__.replace('measure_axis.py', 'measure_facing.py')).read().split('out = {}')[0].replace('fd = sys.argv[1]', "fd = ''"); sys.argv = ['x']; exec(src)
T = json.load(open(__file__.replace('measure_axis.py', f'tracks_take{TAKE}.json')))
def axis(name, im, x, y):
    R = 22; x0, y0 = int(max(0, x - R)), int(max(0, y - R)); m = mask(name, im[y0:int(y + R), x0:int(x + R)]).astype(np.uint8)
    n, lb, st, cen = cv2.connectedComponentsWithStats(m)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, 4]))
    if st[k, 4] < 25: return None
    ys, xs = np.nonzero(lb == k); c = np.cov(np.vstack([xs, ys])); w, v = np.linalg.eigh(c); ang = np.degrees(np.arctan2(v[1, 1], v[0, 1])) % 180
    return ang, float(np.sqrt(w[1] / max(w[0], 1e-6)))
out = {}
for name in ('teal', 'bread', 'watermelon'):
    rows = []
    for f, (x, y) in sorted(T[name].items(), key=lambda kv: int(kv[0])):
        a = cv2.imread(f'{FD}/f{int(f):04d}.png'); b = cv2.imread(f'{RD}/f{int(f):04d}.png')
        if b is None: continue
        ra, rb = axis(name, a, x, y), axis(name, b, x, y)
        if ra and rb: rows.append((int(f), ra[0], ra[1], rb[0], rb[1]))
    out[name] = rows; r = np.array(rows)
    if len(r):
        dang = np.abs(((r[:, 1] - r[:, 3]) + 90) % 180 - 90)
        print(f'{name}: frames {len(r)}  elongation ref median {np.median(r[:,2]):.2f} vs render {np.median(r[:,4]):.2f}   axis-angle error median {np.median(dang):.0f} deg, 90th {np.percentile(dang,90):.0f} deg')
json.dump(out, open('axis_takeB.json', 'w'))
