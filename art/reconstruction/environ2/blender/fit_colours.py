"""Fit a model's material colours to environ2: render (Blender, the builder), measure each part's mean colour in the render and
in environ2's clean plate over the same pixels (the builder's part-id render, edges eroded away), scale each part's albedo by
target / rendered (linear light), repeat.  python fit_colours.py <builder.py> <out_dir> <iterations> <part=r,g,b ...>
(part colours are the id colours the builder renders, 0/1 per channel)"""
import sys, os, json, subprocess
import cv2, numpy as np

BUILDER, OUT, ITERS = sys.argv[1], sys.argv[2], int(sys.argv[3])
PARTS = {k: tuple(int(c) for c in v.split(',')) for k, v in (a.split('=') for a in sys.argv[4:])}
BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'
PLATE = cv2.imread(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'step2_clean.png'))
lin = lambda s: np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)
os.makedirs(OUT, exist_ok=True)
mats_path = os.path.join(OUT, 'materials.json')
albedo = json.load(open(mats_path)) if os.path.exists(mats_path) else {}
for it in range(ITERS + 1):
    d = os.path.join(OUT, f'it{it}')
    subprocess.run([BLENDER, '-b', '--python', BUILDER, '--', d] + ([mats_path] if albedo else []), check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    R = cv2.imread(os.path.join(d, os.path.basename(BUILDER).replace('.py', '_render.png')))
    ids = cv2.imread(os.path.join(d, os.path.basename(BUILDER).replace('.py', '_ids.png')))
    current = json.load(open(os.path.join(d, 'albedo_used.json')))
    report = {}
    for name, rgb in PARTS.items():
        m = np.all(np.abs(ids.astype(int) - np.array(rgb[::-1]) * 255) < 40, axis=-1).astype(np.uint8)
        m = cv2.erode(m, np.ones((5, 5), np.uint8)) > 0
        if m.sum() < 30:
            continue
        tgt = lin(PLATE[m][:, ::-1] / 255.0).mean(0)
        got = lin(R[m][:, ::-1] / 255.0).mean(0)
        err = float(np.abs(PLATE[m].astype(int) - R[m].astype(int)).mean())
        report[name] = dict(px=int(m.sum()), mean_abs_err_8bit=round(err, 2))
        if it < ITERS:
            albedo[name] = [float(np.clip(a * t / max(g, 1e-4), 0.005, 0.98)) for a, t, g in zip(current[name], tgt, got)]
    print(f'iteration {it}:', json.dumps(report))
    if it < ITERS:
        json.dump(albedo, open(mats_path, 'w'), indent=1)
