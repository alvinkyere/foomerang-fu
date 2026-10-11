"""Axis-angle error and character-window difference for a few frames.  python axis_test.py <frames> <dir>... """
import sys, json, cv2, numpy as np
HERE = __file__.rsplit('/', 1)[0]
src = open(HERE + '/measure_facing.py').read().split('\nout = {}')[0].replace('fd = sys.argv[1]', "fd = ''")
argv = sys.argv; sys.argv = ['x']; exec(src); sys.argv = argv
T = json.load(open(HERE + '/tracks_takeB.json')); FD = sys.argv[1]; FR = [270, 282, 294, 306, 318, 330, 342, 354]
def axis(name, im, x, y):
    R = 22; x0, y0 = int(max(0, x - R)), int(max(0, y - R)); m = mask(name, im[y0:int(y + R), x0:int(x + R)]).astype(np.uint8)
    n, lb, st, cen = cv2.connectedComponentsWithStats(m)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, 4]))
    if st[k, 4] < 25: return None
    ys, xs = np.nonzero(lb == k); w, v = np.linalg.eigh(np.cov(np.vstack([xs, ys]))); return np.degrees(np.arctan2(v[1, 1], v[0, 1])) % 180
for d in sys.argv[2:]:
    errs = []; pix = []
    for f in FR:
        a = cv2.imread(f'{FD}/f{f:04d}.png'); b = cv2.imread(f'{d}/f{f:04d}.png')
        for n in ('teal', 'bread', 'watermelon'):
            x, y = T[n][str(f)]; ra, rb = axis(n, a, x, y), axis(n, b, x, y)
            if ra is not None and rb is not None: errs.append(abs(((ra - rb) + 90) % 180 - 90))
            R = 22; x0, y0 = int(max(0, x - R)), int(max(0, y - R)); pix.append(np.abs(a[y0:int(y + R), x0:int(x + R)].astype(int) - b[y0:int(y + R), x0:int(x + R)].astype(int)).max(2).mean())
    print(f'{d:10s} axis err median {np.median(errs):.0f} deg (n={len(errs)}) | character-window mean|diff| {np.mean(pix):.1f}')
