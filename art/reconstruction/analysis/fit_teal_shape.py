"""(also used for any pack character via FOO_CHAR + FOO_BSCALE list) Fit teal's W/D/H by silhouette statistics: for each shape run the orientation search on every 6th take-B frame, take the best-scoring
heading per frame, and compare the candidate silhouettes' median area / major / minor axes with the reference (same mask, same stats)."""
import os, sys, json, subprocess, cv2, numpy as np
S = sys.argv[1]; FD = S + '/frames'; ROOT = '/Users/alvin/Desktop/Foomerang Fu'; CH = os.environ.get('FOO_CHAR', 'teal'); T = json.load(open(ROOT + '/art/reconstruction/analysis/tracks_takeB.json'))[{'icecream': 'teal'}.get(CH, CH)]
FR = list(range(264, 369, 6))
def stat_mask(m):
    n, lb, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
    if n < 2: return None
    k = 1 + np.argmax(st[1:, 4]); ys, xs = np.nonzero(lb == k); ev = np.sqrt(np.linalg.eigvalsh(np.cov(np.vstack([xs, ys])))) * 4; return st[k, 4], ev[1], ev[0]
def ref_stats():
    out = []
    for f in FR:
        x, y = T[str(f)]; im = cv2.imread(f'{FD}/f{f:04d}.png'); R = 40; w = im[int(max(0, y - R)):int(y + R), int(max(0, x - R)):int(x + R)].astype(int); b, g, r = w[..., 0], w[..., 1], w[..., 2]
        s = stat_mask(cv2.morphologyEx(((g > r + 30) & (b > r + 5) & (g > 130)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)))
        if s: out.append(s)
    return np.median(np.array(out), 0)
REF = ref_stats(); print('ref area/major/minor', REF.round(1), flush=True)
sys.path.insert(0, ROOT + '/art/reconstruction/analysis')
for wdh in sys.argv[2:]:
    d = f'{S}/tshape_{CH}_{wdh.replace(",", "_")}'; subprocess.run(['rm', '-rf', d])
    env = dict(os.environ, FOO_CHAR=CH, FOO_TEAL_WDH=wdh) if CH == 'teal' else dict(os.environ, FOO_CHAR=CH, FOO_BSCALE=wdh)
    for f in FR: subprocess.run(['/Applications/Blender.app/Contents/MacOS/Blender', '-b', '--python', ROOT + '/art/reconstruction/blender/char_yaw_search.py', '--', d, str(f), str(f), '1'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # best heading per frame by the surface score, then the candidate's alpha statistics
    exec(open(ROOT + '/art/reconstruction/analysis/solve_char_yaw.py').read().split('S = np.zeros')[0].replace("FD, CD = sys.argv[1:3]; LAM = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6", "FD, CD, LAM = '" + FD + "', '" + d + "', 0.6").replace("CHAR = os.environ.get('FOO_CHAR', 'bread')", "CHAR = '" + CH + "'"))
    st = []
    for f in FR:
        px, py = T[str(f)]; im = cv2.imread(f'{FD}/f{f:04d}.png'); x0, y0 = int(max(0, px - 24)), int(max(0, py - 24)); best = None
        for k in range(24):
            c = cv2.imread(f'{d}/f{f:04d}_y{k:02d}.png', cv2.IMREAD_UNCHANGED)
            if c is None: continue
            h, w = c.shape[:2]; ref = im[y0:y0 + h, x0:x0 + w]; h, w = ref.shape[:2]; c = c[:h, :w]; al = c[..., 3] > 110; cand = cv2.GaussianBlur(c[..., :3], (0, 0), 0.7)
            rc, rr, re = classes(ref); cc, cr, ce = classes(cand, al); near = cv2.dilate(al.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            sc_ = iou(rc & near, cc) + iou(rr & near, cr)
            if best is None or sc_ > best[0]: best = (sc_, al)
        if best: s = stat_mask(best[1]); st.append(s) if s else None
    M = np.median(np.array(st), 0); print(wdh, 'cand area/major/minor', M.round(1), ' ratio to ref', (M / REF).round(2), flush=True)
