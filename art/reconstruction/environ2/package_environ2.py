"""Step 5 of the environ2 map: package it as the game's `market_plaza` (apps/console/public/maps/market_plaza/).
 * The renderer's canvas is 1920 x 1080 (the screen every map is baked for), so the clean plate is upscaled x1.5 (Lanczos) ONCE
   here, and every layer is cut from that upscaled plate with its mask upscaled the same way: ground + layers still reproduce
   the (upscaled) plate exactly, and the camera, layer positions and depth slices are scaled by the same factor.
 * Characters: the pack atlases already in the folder (baked through the previous plaza camera, pitch 55.0 deg vs environ2's
   56.2), drawn at environ2's character size: 45 px tall at 1280 wide = 67.5 px on the canvas; the coffee cell is 59 px.
 * Lossless WebP throughout (a layer's pixels are the plate's pixels).
python package_environ2.py <step3_layers> <step4_arena.json> <maps/market_plaza dir>"""
import sys, os, json, glob, cv2, numpy as np

LAYERS, ARENA, OUT = sys.argv[1:4]
K = 1.5
LOSSLESS = [cv2.IMWRITE_WEBP_QUALITY, 101]
ground = cv2.imread(os.path.join(LAYERS, 'ground.webp'))
H0, W0 = ground.shape[:2]
W, H = round(W0 * K), round(H0 * K)
up = cv2.resize(ground, (W, H), interpolation=cv2.INTER_LANCZOS4)
layers = json.load(open(os.path.join(LAYERS, 'layers.json')))
arena = json.load(open(ARENA))
old = json.load(open(os.path.join(OUT, 'manifest.json')))

for f in glob.glob(os.path.join(OUT, 'occ_*.webp')) + glob.glob(os.path.join(OUT, 'ground.*')):
    os.remove(f)                                          # the previous plaza's layers: replaced, never mixed
cv2.imwrite(os.path.join(OUT, 'ground.webp'), up, LOSSLESS)

occluders = []
comp = up.astype(np.float32)
for o in layers['occluders']:
    im = cv2.imread(os.path.join(LAYERS, o['file']), cv2.IMREAD_UNCHANGED)
    full = np.zeros((H0, W0), np.uint8)
    h, w = im.shape[:2]
    full[o['y']:o['y'] + h, o['x']:o['x'] + w] = im[..., 3]
    alpha = cv2.resize(full, (W, H), interpolation=cv2.INTER_LINEAR)          # a 1 px antialiased edge at the new size
    ys, xs = np.nonzero(alpha)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    cv2.imwrite(os.path.join(OUT, o['file']), np.dstack([up[y0:y1, x0:x1], alpha[y0:y1, x0:x1]]), LOSSLESS)
    a = alpha[y0:y1, x0:x1, None].astype(np.float32) / 255
    comp[y0:y1, x0:x1] = up[y0:y1, x0:x1] * a + comp[y0:y1, x0:x1] * (1 - a)
    sl = []
    for s in o['slices']:                                 # scaled; the first and last widened to the cut-out's new edges
        sl.append(dict(x0=max(x0, round(s['x0'] * K)), x1=min(x1, round(s['x1'] * K)), depth=round(s['depth'] * K, 1)))
    sl[0]['x0'], sl[-1]['x1'] = x0, x1
    sl = [s for s in sl if s['x1'] > s['x0']]
    for a_, b_ in zip(sl, sl[1:]):
        b_['x0'] = a_['x1']
    occluders.append(dict(key=o['key'], file=o['file'], x=x0, y=y0, depth=round(o['depth'] * K, 1), fade=o['fade'], slices=sl))
proof = float(np.abs(np.rint(comp) - up).max())
assert proof == 0.0, proof

c = arena['camera']
camera = dict(canvas=dict(width=W, height=H), focalPx=c['focalPx'] * K, principal=dict(x=c['principal']['x'] * K, y=c['principal']['y'] * K),
              pitchDeg=c['pitchDeg'], yawDeg=c['yawDeg'], rollDeg=c['rollDeg'], centre=c['centre'], world=c['world'])
manifest = dict(
    map='market_plaza', canvas=[W, H], camera=camera,
    camera_evidence=dict(
        lens_and_pitch='vanishing-point calibration of environ2.avif (art/reconstruction/environ2/camera.json): f = 2577.4 px at 1280 '
                       'wide (bootstrap 2569-2641), pitch 56.17 deg (55.6-56.3), yaw 0 and roll 0 (the plaza is mirror-symmetric about x = '
                       '651.25)',
        framing='OBSERVED: environ2.avif is the whole map; the arena runs fence to fence, from the far wall to the bottom of the frame',
        scale='a player circle is as large against environ2\'s characters (45 px tall) as on the other maps: radius 36 = 26 px at the '
              'fountain at 1280 wide'),
    ground='ground.webp', occluders=sorted(occluders, key=lambda o: o['depth']),
    characterScale=round(67.5 / 59, 4), characters=old['characters'],
    provenance='art/reconstruction/environ2 (clean_environ2.py, layers_environ2.py, arena_environ2.py, package_environ2.py) from '
               'environ2.avif; character atlases: the previous plaza bake (bake_chars.py)')
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if not f.startswith('char_'))
print('packaged', len(occluders), 'layers,', sum(len(o['slices']) for o in occluders), 'slices; composite max |diff|', proof,
      '; map art', round(size / 1e6, 2), 'MB')
