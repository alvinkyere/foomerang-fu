"""Package baked market_plaza layers + character cells into runtime assets (WebP + manifest.json), loaded by the Phaser renderer.
python package_plaza.py <env_bake_dir> <char_bake_dir> <out_dir>
 * ground and occluders get the MEASURED screen-space light field of take A (lightfield_takeA.npy, resized to the canvas): the same
   treatment the reconstruction renders get in post3.py; occluders are cropped to their alpha bounds.
 * characters: 16 headings x (standing, airborne) cells packed 16 per row into one spritesheet per character."""
import sys, os, json, cv2, numpy as np
ENV, CH, OUT = sys.argv[1:4]; os.makedirs(OUT, exist_ok=True)
AN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'analysis')
cam = json.load(open(os.path.join(ENV, 'camera.json'))); W, H = cam['width'], cam['height']
F = cv2.resize(np.load(os.path.join(AN, 'lightfield_takeA.npy')), (W, H), interpolation=cv2.INTER_CUBIC)
Q = [cv2.IMWRITE_WEBP_QUALITY, 92]
g = cv2.imread(os.path.join(ENV, 'ground.png')).astype(np.float32) * F
cv2.imwrite(os.path.join(OUT, 'ground.webp'), np.clip(g, 0, 255).astype(np.uint8), Q)
layers = json.load(open(os.path.join(ENV, 'layers.json'))); occ = []
import sys as _s; _s.path.insert(0, AN); from proj import plane_H
def depth_of(x_bu, y_bu):      # screen y (canvas px) of a ground point, take-A camera
    q = plane_H('A', 233, 0.0) @ np.array([x_bu / 100, y_bu / 100, 1.0]); return float(q[1] / q[2] * (W / 640))
# the far wall group also holds the (nearer) notice board, which pulled its centre forward; the wall itself lies behind the pots
if 'far_wall' in layers: layers['far_wall']['depth_y'] = depth_of(-5.0, 104.9)
for k, meta in layers.items():
    im = cv2.imread(os.path.join(ENV, f'occ_{k}.png'), cv2.IMREAD_UNCHANGED)
    a = im[..., 3]; ys, xs = np.nonzero(a > 2)
    if len(xs) == 0: continue
    if im[a > 128][:, :3].mean() < 45: continue          # an object enclosed by another (renders black): invisible in the reconstruction
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    c = im[y0:y1, x0:x1].astype(np.float32); c[..., :3] = np.clip(c[..., :3] * F[y0:y1, x0:x1], 0, 255)
    cv2.imwrite(os.path.join(OUT, f'occ_{k}.webp'), c.astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 95])
    TALL = k.startswith(('stall_', 'golden_tree', 'bunting', 'far_wall'))      # only tall objects may fade to reveal someone behind them
    occ.append(dict(key=k, file=f'occ_{k}.webp', x=int(x0), y=int(y0), depth=round(meta['depth_y'], 2), fade=TALL))
cells = json.load(open(os.path.join(CH, 'cells.json'))); C = cells['cell']; chars = {}
for name in cells['chars']:
    sheet = np.zeros((2 * C, 16 * C, 4), np.uint8)
    for r, t in enumerate(('stand', 'air')):
        for j in range(16):
            im = cv2.imread(os.path.join(CH, f'{name}_{t}_{j:02d}.png'), cv2.IMREAD_UNCHANGED)
            sheet[r * C:(r + 1) * C, j * C:(j + 1) * C] = im[:C, :C]
    cv2.imwrite(os.path.join(OUT, f'char_{name}.webp'), sheet, [cv2.IMWRITE_WEBP_QUALITY, 95])
    chars[name] = dict(file=f'char_{name}.webp', cell=C, anchor=[round(cells['anchor'][0], 2), round(cells['anchor'][1], 2)], frames=32)
json.dump(dict(map='market_plaza', canvas=[W, H], ground='ground.webp', occluders=sorted(occ, key=lambda o: o['depth']), characters=chars,
               provenance='art/reconstruction (bake_plaza.py, bake_chars.py, package_plaza.py); camera = master video take A f233'),
          open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
sz = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)); print('packaged', len(occ), 'occluders,', len(chars), 'characters,', round(sz / 1e6, 2), 'MB')
