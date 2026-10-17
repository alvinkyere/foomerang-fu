"""Put the 3D plaza's moving objects into the game's market_plaza (apps/console/public/maps/market_plaza/): each moving object's
frames (blender/render_moving.py) are cropped to the box they ever cover, packed into one sheet (frames left to right, then down,
at most 4096 px wide), and its layer in the manifest becomes that animated sheet, keeping its depth slices (widened to the new
box). Under the moving objects the ground becomes the 3D floor (filled under every object), so nothing painted stays behind
when a pennant swings away.  python package_moving.py <frames_dir> <maps/market_plaza dir> [period_s]"""
import sys, os, json, glob
import cv2, numpy as np

FR, OUT = sys.argv[1:3]
PERIOD = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
man_path = os.path.join(OUT, 'manifest.json')
man = json.load(open(man_path))
ground = cv2.imread(os.path.join(OUT, 'ground.webp'))
floor = cv2.imread(os.path.join(FR, 'floor.png'))[..., :3]
ever = np.zeros(ground.shape[:2], bool)
by_key = {o['key']: o for o in man['occluders']}
for key in sorted(os.listdir(FR)):
    d = os.path.join(FR, key)
    if not os.path.isdir(d) or key not in by_key:
        continue
    frames = [cv2.imread(f, cv2.IMREAD_UNCHANGED) for f in sorted(glob.glob(os.path.join(d, 'f*.png')))]
    alpha = np.max([f[..., 3] for f in frames], axis=0)
    ys, xs = np.nonzero(alpha > 0)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    w, h = x1 - x0, y1 - y0
    cols = max(1, min(len(frames), 4096 // w))
    rows = -(-len(frames) // cols)
    sheet = np.zeros((rows * h, cols * w, 4), np.uint8)
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = f[y0:y1, x0:x1]
    name = f'anim_{key}.webp'
    cv2.imwrite(os.path.join(OUT, name), sheet, [cv2.IMWRITE_WEBP_QUALITY, 92])
    ever |= cv2.dilate((alpha > 0).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    o = by_key[key]
    old = os.path.join(OUT, o['file'])
    sl = [dict(s) for s in o['slices']]
    sl = [s for s in sl if s['x1'] > x0 and s['x0'] < x1]
    sl[0]['x0'], sl[-1]['x1'] = x0, x1
    for a, b in zip(sl, sl[1:]):
        b['x0'] = max(b['x0'], a['x1'])
    sl = [s for s in sl if s['x1'] > s['x0']]
    if old.endswith('.webp') and os.path.basename(old).startswith('occ_') and os.path.exists(old):
        os.remove(old)                                    # the still cut-out is replaced by the moving one
    o.update(file=name, x=x0, y=y0, slices=sl, animation=dict(frames=len(frames), periodS=PERIOD, width=w, height=h))
    print(key, len(frames), 'frames', w, 'x', h, '->', cols, 'x', rows, 'sheet', round(os.path.getsize(os.path.join(OUT, name)) / 1e6, 2), 'MB')
ground[ever] = floor[ever]
cv2.imwrite(os.path.join(OUT, 'ground.webp'), ground, [cv2.IMWRITE_WEBP_QUALITY, 101])
man['provenance'] += '; moving objects: the 3D plaza (art/reconstruction/environ2/blender: animate.py, render_moving.py, package_moving.py)'
json.dump(man, open(man_path, 'w'), indent=1)
total = sum(os.path.getsize(f) for f in glob.glob(os.path.join(OUT, '*')) if not os.path.basename(f).startswith('char_'))
print('map art', round(total / 1e6, 2), 'MB')
