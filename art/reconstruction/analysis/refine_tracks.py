"""Per-frame character/boomerang tracks: hand-read keyframes (every 8th frame) are refined to every frame by template matching
 (template = the keyframe crop nearest in time; search +-8 px around the interpolated position).  Output: annotations_take?_refined.json
 python refine_tracks.py <frames_dir> <annotations.json> <out.json> <first> <last>"""
import sys, json, cv2, numpy as np
fd, annf, out, F0, F1 = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
ann = json.load(open(annf)); imgs = {}
def img(t):
    if t not in imgs: imgs[t] = cv2.imread(f'{fd}/f{t:04d}.png')
    return imgs[t]
def interp(tr, t):
    ks = sorted(int(k) for k in tr)
    if t <= ks[0]: return list(tr[str(ks[0])])
    if t >= ks[-1]: return list(tr[str(ks[-1])])
    for a, b in zip(ks, ks[1:]):
        if a <= t <= b: u = (t - a) / (b - a); pa, pb = tr[str(a)], tr[str(b)]; return [pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u]   # LINEAR here: no smoothstep bias
res = {}; HALF = {'boomerang_a': 7, 'boomerang_b': 7}
for name, tr in ann.items():
    if name in ('note', 'spawn_rings', 'burst') or not isinstance(tr, dict): continue
    ks = sorted(int(k) for k in tr); h = HALF.get(name, 12); res[name] = {}
    for t in range(max(F0, ks[0]), min(F1, ks[-1]) + 1):
        p = interp(tr, t); k = min(ks, key=lambda k: abs(k - t)); kx, ky = tr[str(k)]; im = img(t); kim = img(k)
        x0, y0 = int(round(kx)) - h, int(round(ky)) - h
        if min(x0, y0) < 0 or x0 + 2 * h >= 640 or y0 + 2 * h >= 360: res[name][t] = p; continue
        tmpl = kim[y0:y0 + 2 * h, x0:x0 + 2 * h]
        sx, sy = int(round(p[0])) - h - 8, int(round(p[1])) - h - 8
        sx0, sy0 = max(0, sx), max(0, sy); sw = img(t)[sy0:min(360, sy + 2 * h + 16), sx0:min(640, sx + 2 * h + 16)]
        if sw.shape[0] < tmpl.shape[0] or sw.shape[1] < tmpl.shape[1]: res[name][t] = p; continue
        r = cv2.matchTemplate(sw, tmpl, cv2.TM_CCOEFF_NORMED); _, mx, _, loc = cv2.minMaxLoc(r)
        # sub-pixel parabola on the peak
        px_, py_ = loc; dx = dy = 0.0
        if 0 < px_ < r.shape[1] - 1: a_, b_, c_ = r[py_, px_ - 1], r[py_, px_], r[py_, px_ + 1]; dx = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-9)
        if 0 < py_ < r.shape[0] - 1: a_, b_, c_ = r[py_ - 1, px_], r[py_, px_], r[py_ + 1, px_]; dy = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-9)
        q = [sx0 + loc[0] + dx + h, sy0 + loc[1] + dy + h]
        # keyframes are authoritative at their own frame
        res[name][t] = q if (mx > 0.5 and t != k) else (list(tr[str(t)]) if str(t) in tr else p)
    # light temporal smoothing (3-tap) that keeps keyframes
    fr = sorted(res[name]); arr = np.array([res[name][t] for t in fr])
    if len(arr) > 4:
        sm = arr.copy(); sm[1:-1] = 0.25 * arr[:-2] + 0.5 * arr[1:-1] + 0.25 * arr[2:]
        for i, t in enumerate(fr):
            if str(t) not in tr: res[name][t] = sm[i].tolist()
    print(name, len(fr), 'frames')
# stage 2: colour-centroid refinement for characters with a distinctive colour (keyframe annotations were hand-read and can be off by >10 px)
def mask_of(name, im):
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    if name == 'teal': return (g > r + 35) & (b > r + 20) & (g > 150)
    if name == 'watermelon': return (r > 190) & (g < 120) & (b < 110)
    if name == 'coffee': return (b > 214) & (r > 205) & (g > 205) & (abs(r - b) < 40)
    return None
shifts = {}
for name, d in res.items():
    for t in list(d):
        m = mask_of(name, img(t))
        if m is None: continue
        x, y = d[t]
        for _ in range(3):
            R = 13; x0, y0 = int(max(0, x - R)), int(max(0, y - R)); sub = m[y0:int(min(360, y + R)), x0:int(min(640, x + R))]
            ys_, xs_ = np.nonzero(sub)
            if len(xs_) < 6: break
            x, y = x0 + xs_.mean(), y0 + ys_.mean()
        shifts.setdefault(name, []).append(float(np.hypot(x - d[t][0], y - d[t][1]))); d[t] = [x, y]
for n, v in shifts.items(): print(n, 'centroid shift mean %.1f px max %.1f' % (np.mean(v), np.max(v)))
json.dump({n: {str(t): v for t, v in d.items()} for n, d in res.items()}, open(out, 'w'))
