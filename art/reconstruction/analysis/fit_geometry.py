"""Analysis-by-synthesis fit of raised-object geometry (diagnostic alignment, not an aesthetic gate).
 Renders the reconstruction through the solved camera for several reference frames and compares colour-class masks
 (red roofs / orange canopies) with the reference by intersection-over-union.  python fit_geometry.py <frames_dir> <workdir>"""
import sys, os, json, subprocess, itertools, cv2, numpy as np
FD, WD = sys.argv[1], sys.argv[2]; os.makedirs(WD, exist_ok=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'; SCRIPT = os.path.join(ROOT, 'art/reconstruction/blender/build_courtyard.py')
FRAMES = [264, 300, 340]
def mask_of(img, rgb, tol=38):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32); c = cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
    return (np.linalg.norm(lab - c, axis=2) < tol)
ref = {f: cv2.imread(f'{FD}/f{f:04d}.png') for f in FRAMES}
ROOF, ORANGE = (203, 100, 86), (226, 159, 93)
def render(params):
    json.dump(params, open(f'{WD}/params.json', 'w'))
    env = dict(os.environ, FOO_SAMPLES='6')
    subprocess.run([BLENDER, '-b', '--python', SCRIPT, '--', WD] + [str(f) for f in FRAMES], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return {f: cv2.imread(f'{WD}/f{f:04d}.png') for f in FRAMES}
def iou(a, b): u = (a | b).sum(); return (a & b).sum() / u if u else 0.0
def score(params, rgb):
    rec = render(params); return np.mean([iou(mask_of(ref[f], rgb), mask_of(rec[f], rgb)) for f in FRAMES])
base = json.load(open(f'{WD}/start.json')) if os.path.exists(f'{WD}/start.json') else {}
best = {}
def sweep(group, key, values, rgb):
    res = []
    for v in values:
        p = json.loads(json.dumps(base)); p.setdefault(group, {}).update(best.get(group, {})); p[group][key] = v
        for g, d in best.items(): p.setdefault(g, {}); [p[g].setdefault(k2, v2) for k2, v2 in d.items()]
        s = score(p, rgb); res.append((s, v)); print(f'  {group}.{key} = {v:6.2f}  IoU {s:.3f}', flush=True)
    s, v = max(res); best.setdefault(group, {})[key] = v; print(f'=> {group}.{key} = {v} (IoU {s:.3f})', flush=True); return v
print('roofs'); sweep('pavilion', 'roof_h', [2, 3, 4, 5, 6, 7, 8, 9, 10], ROOF)
print('canopies'); sweep('tree', 'canopy_h', [4, 6, 8, 10, 12, 14], ORANGE); sweep('tree', 'canopy_scale', [0.5, 0.7, 0.9, 1.1, 1.3], ORANGE)
json.dump(best, open(f'{WD}/fitted_geometry.json', 'w'), indent=1); print(best)
