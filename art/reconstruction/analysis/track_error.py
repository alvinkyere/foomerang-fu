"""Objective position error: mask centroid of each character in the reference vs in a reconstruction render (px), per frame.  python track_error.py <frames> <render_dir> <take> """
import sys, json, cv2, numpy as np
FD, RD, TAKE = sys.argv[1:4]
src = open(__file__.replace('track_error.py', 'measure_facing.py')).read().split('out = {}')[0].replace('fd = sys.argv[1]', "fd = ''"); sys.argv = ['x']; exec(src); fd, rd, take = FD, RD, TAKE
T = json.load(open(__file__.replace('track_error.py', f'tracks_take{take}.json'))); errs = {}
for name in ('bread', 'teal', 'watermelon'):
    e = []
    for f, (x, y) in T[name].items():
        f = int(f)
        try: a = cv2.imread(f'{fd}/f{f:04d}.png'); b = cv2.imread(f'{rd}/f{f:04d}.png')
        except Exception: continue
        if a is None or b is None: continue
        R = 22; x0, y0, x1, y1 = int(max(0, x - R)), int(max(0, y - R)), int(min(640, x + R)), int(min(360, y + R)); cs = []
        for im in (a, b):
            m = mask(name, im[y0:y1, x0:x1]).astype(np.uint8); n, lb, st, cen = cv2.connectedComponentsWithStats(m)
            if n < 2: cs.append(None); continue
            k = 1 + int(np.argmax(st[1:, 4])); cs.append((x0 + cen[k][0], y0 + cen[k][1]) if st[k, 4] > 12 else None)
        if cs[0] and cs[1]: e.append(float(np.hypot(cs[0][0] - cs[1][0], cs[0][1] - cs[1][1])))
    errs[name] = e; print(name, 'frames', len(e), 'median centroid error %.1f px, 90th pct %.1f px' % (np.median(e), np.percentile(e, 90)) if e else 'no data')
