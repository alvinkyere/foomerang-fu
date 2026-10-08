"""Package a reconstructed map's baked layers + character cells into runtime assets (WebP + manifest.json) for the Phaser renderer.
Everything map-specific comes from the map config (art/reconstruction/maps/<map>.json); nothing here names a map.
python package_map.py <map> <env_bake_dir> <char_bake_dir> <out_dir>
 * camera: the map's game camera (from the solve named in the config, or an explicit pose for an INFERRED framing) is written
   into the manifest in the runtime's MapCameraConfig form; the bake rendered through exactly this camera.
 * ground and occluders get the map's MEASURED screen-space light field when it has one (resized to the canvas); occluders are
   cropped to their alpha bounds; objects enclosed by another (render black) are skipped.
 * characters: 16 headings x (standing, airborne) cells packed 16 per row into one spritesheet per character."""
import sys, os, json, math, cv2, numpy as np
MAP, ENV, CH, OUT = sys.argv[1:5]; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); AN = os.path.join(HERE, '..', 'analysis'); sys.path.insert(0, AN)
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); cc = cfg['camera']; W, H = cc['canvas']; SC = cc.get('scale', W / 640)
PX, PY = cc.get('principal', [W / 2, H / 2])          # canvas px; off-centre when the canvas is larger than one view
from proj import plane_H, cam as solved
if 'pose' in cc: f640, pose = cc['f'], cc['pose']
else: f640, pose = solved(cc['solve'])[0]['f'], solved(cc['solve'])[1][cc['frame']]
wm = cfg['world']
camera = dict(canvas=dict(width=W, height=H), focalPx=f640 * SC, principal=dict(x=PX, y=PY), pitchDeg=pose['pitch_deg'], yawDeg=pose['yaw_deg'],
              rollDeg=pose['roll_deg'], centre=list(pose['C']),
              world=dict(unitsPerPlanUnit=wm['units_per_plan_unit'], planOriginX=wm['plan_origin_x'], planOriginY=wm['plan_origin_y']))
def screen_y(x_plan, y_plan):          # canvas y of a ground point (plan units), through the game camera
    th, yw, rl = (math.radians(pose[k]) for k in ('pitch_deg', 'yaw_deg', 'roll_deg')); s, c = math.sin(th), math.cos(th)
    R0 = np.array([[1, 0, 0], [0, -s, -c], [0, c, -s]]); Rz = np.array([[math.cos(yw), math.sin(yw), 0], [-math.sin(yw), math.cos(yw), 0], [0, 0, 1]])
    Rr = np.array([[math.cos(rl), -math.sin(rl), 0], [math.sin(rl), math.cos(rl), 0], [0, 0, 1]]); p = (Rr @ R0 @ Rz) @ (np.array([x_plan, y_plan, 0.0]) - pose['C'])
    return float(f640 * SC * p[1] / p[2] + PY)
F = cv2.resize(np.load(os.path.join(AN, cfg['light_field'])), (W, H), interpolation=cv2.INTER_CUBIC) if cfg.get('light_field') else np.ones((H, W), np.float32)
g = cv2.imread(os.path.join(ENV, 'ground.png')).astype(np.float32) * F[..., None] if F.ndim == 2 else cv2.imread(os.path.join(ENV, 'ground.png')).astype(np.float32) * F
cv2.imwrite(os.path.join(OUT, 'ground.webp'), np.clip(g, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 92])
layers = json.load(open(os.path.join(ENV, 'layers.json'))); occ = []
for k, (xb, yb) in cfg.get('depth_overrides', {}).items():          # a group whose footprint centre misrepresents its depth
    if k in layers: layers[k]['depth_y'] = screen_y(xb / 100, yb / 100)
for k, meta in layers.items():
    im = cv2.imread(os.path.join(ENV, f'occ_{k}.png'), cv2.IMREAD_UNCHANGED)
    a = im[..., 3]; ys, xs = np.nonzero(a > 2)
    if len(xs) == 0: continue
    if im[a > 128][:, :3].mean() < 45: continue          # an object enclosed by another (renders black): invisible in the reconstruction
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    c = im[y0:y1, x0:x1].astype(np.float32); Fc = F[y0:y1, x0:x1]; c[..., :3] = np.clip(c[..., :3] * (Fc[..., None] if Fc.ndim == 2 else Fc), 0, 255)
    cv2.imwrite(os.path.join(OUT, f'occ_{k}.webp'), c.astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 95])
    occ.append(dict(key=k, file=f'occ_{k}.webp', x=int(x0), y=int(y0), depth=round(meta['depth_y'], 2), fade=k.startswith(tuple(cfg.get('fade_prefixes', [])))))
cells = json.load(open(os.path.join(CH, 'cells.json'))); C = cells['cell']; chars = {}
for name in cells['chars']:
    sheet = np.zeros((2 * C, 16 * C, 4), np.uint8)
    for r, t in enumerate(('stand', 'air')):
        for j in range(16):
            im = cv2.imread(os.path.join(CH, f'{name}_{t}_{j:02d}.png'), cv2.IMREAD_UNCHANGED)
            sheet[r * C:(r + 1) * C, j * C:(j + 1) * C] = im[:C, :C]
    cv2.imwrite(os.path.join(OUT, f'char_{name}.webp'), sheet, [cv2.IMWRITE_WEBP_QUALITY, 95])
    chars[name] = dict(file=f'char_{name}.webp', cell=C, anchor=[round(cells['anchor'][0], 2), round(cells['anchor'][1], 2)], frames=32)
json.dump(dict(map=MAP, canvas=[W, H], camera=camera, camera_evidence=cc.get('evidence', {}), ground='ground.webp',
               occluders=sorted(occ, key=lambda o: o['depth']), characters=chars,
               provenance=f'art/reconstruction (maps/{MAP}.json; bake_map.py, bake_chars.py, package_map.py)'),
          open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
sz = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)); print('packaged', MAP, len(occ), 'occluders,', len(chars), 'characters,', round(sz / 1e6, 2), 'MB')
