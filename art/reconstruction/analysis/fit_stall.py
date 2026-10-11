"""Fit the canonical stall's dimensions by SILHOUETTE overlap (IoU of the roof-red + front-magenta/purple mask) against reference frames of both takes.
 Alignment fit only (objective geometry), coordinate descent over roof height / counter height / long / deep / roof thickness.   python fit_stall.py <frames_dir> <workdir>"""
import sys, os, json, subprocess, cv2, numpy as np
FD, WD = sys.argv[1:3]; os.makedirs(WD, exist_ok=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')); BL = '/Applications/Blender.app/Contents/MacOS/Blender'; SC = os.path.join(ROOT, 'art/reconstruction/blender/build_courtyard4.py')
JOBS = [('A', [233]), ('B', [264, 312])]
def lab(img, rgb): return cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
def smask(img):
    b, g, r = [img[..., i].astype(int) for i in range(3)]
    red = (r > 175) & (g < 135) & (b < 120) & (r - g > 70); mag = (r > 90) & (r - g > 35) & (b > g + 5) & (r < 215) & (g < 110)
    m = red.astype(np.uint8);          # ROOF only: the front elements are fitted separately
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0
ref = {(t, f): smask(cv2.imread(f'{FD}/f{f:04d}.png')) for t, fr in JOBS for f in fr}
def evaluate(stall):
    json.dump({'stall': stall}, open(f'{WD}/params.json', 'w')); s = []
    for t, fr in JOBS:
        env = dict(os.environ, FOO_TAKE=t, FOO_SAMPLES='4'); subprocess.run([BL, '-b', '--python', SC, '--', WD] + [str(f) for f in fr], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        for f in fr:
            m = smask(cv2.imread(f'{WD}/f{f:04d}.png')); r = ref[(t, f)]; s.append((m & r).sum() / max((m | r).sum(), 1))
    return float(np.mean(s))
cur = dict(roof_h=5.75, counter_h=3.5, long=8.2, deep=4.9, roof_t=0.5, over=0.9); best = evaluate(cur); print('start IoU', round(best, 3), flush=True)
grid = {'roof_h': [4.5, 5.0, 5.75, 6.5, 7.0], 'long': [6.5, 7.2, 8.2, 9.0, 10.0], 'deep': [3.4, 4.0, 4.9, 5.6], 'over': [0.2, 0.6, 0.9, 1.3]}
for sweep in range(2):
    for k, vals in grid.items():
        for v in vals:
            if v == cur[k]: continue
            t = dict(cur); t[k] = v; s = evaluate(t)
            if s > best + 0.002: best, cur = s, t; print(f'  {k}={v}  IoU {s:.3f}', flush=True)
json.dump(cur, open('stall_fit.json', 'w')); print('fitted', cur, 'IoU', round(best, 3))
