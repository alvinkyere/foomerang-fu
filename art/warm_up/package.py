"""The warm-up's game folder (2026-11-12): apps/console/public/maps/warm_up/.

  plaza.glb      the ground, the moat's banks and water sheet, the props (blender/build.py: warm_up.glb)
  manifest.json  the gong islands' soft look, the plaza's camera rig with this map's mapping from world units to plan units (arena.json:
                 x east from X0, y south from Y1), the plaza's characters (shared: `assetsFrom`), the moat's water (measured), the HQ's
                 camera at its READY frame (hqFrame) and following the players
  water.png      the water's field over the sheet's square (art/physics_reference/water_field.py's way): R how far each spot is from the
                 nearest bank (0 .. FAR units), G and B noise that breaks and wobbles the foam
  floor.json/.webp  the grass under everything

  python art/warm_up/package.py <tmp_dir>/warm_up.glb          (from the repository root; then npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/warm_up/'
A = json.load(open('art/warm_up/arena.json')); MOAT = json.load(open('art/warm_up/moat.json'))
ZOOM = json.load(open('art/warm_up/zoom.json'))['zoom']; YC = 73.72
GRASS = '#9cc98a'
STEM = '#64ab8c'      # (the fields' thin stems: a little darker than the darkest teal under them in the mosaic, #78b889, as thin lines read)
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=A['X0'] / 100, planOriginY=(YC + A['Y1']) / 100)
manifest = {
    'map': 'warm_up',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': dict(gong['look'], sky=[{'at': 0.0, 'colour': GRASS}, {'at': 1.0, 'colour': GRASS}]),
    'fixedFrame': {'zoom': ZOOM, 'u': 0, 'v': 0},
    'hqFrame': {'zoom': ZOOM, 'u': 0, 'v': 0},
    # (the HQ's camera holds the READY view to 0.6 s, then follows the players in, up to ~1.5x: measured over the round's frames)
    'followFrame': {'minZoom': ZOOM, 'maxZoom': round(ZOOM * 1.5, 4)},
    # the moat's water as the round's mosaic shows it (Chrome's colours): its blue, a hair darker by the walls, pale foam along the banks
    # (1.4% of the water), three thin ribbons as the lily island's
    # the moat's water as the round shows it (stabilised 8-12 s): a calm blue, a few pale spindle-shaped streaks 0.5-1.4 units off the
    # banks that come and go over about a second (no foam hugging the banks), a faint darker dashed line down the channel's middle
    'water': {'base': '#64a8e8', 'light': '#64a8e8', 'foam': '#9fdcf7', 'glowWidth': 0.5, 'foamSpacing': 1.0, 'foamWidth': 0.2,
              'foamReach': 1.0, 'drift': 0.07,
              'cartoon': {'fps': 1.0, 'wobble': 0.08, 'scale': 0.7, 'wobbleScale': 0.85, 'presence': [0.62, 0.78], 'motion': 0.6, 'glow': 0.12,
                          'ribbons': [{'centre': 0.85, 'width': 0.14, 'sway': 0.25}]}},
    # the four hex fields: the game's own plants (hexfields.py), their shadows already in the ground's drawing (ground.py)
    'plants': [dict(g, stem=STEM, shadow=False) for g in json.load(open('art/warm_up/hexfields.json'))],
    'characters': gong['characters'],
    'provenance': 'art/warm_up (measure.py, mosaic.py, ground.py, moat.py, fit_pens.py, layout.py, arena.py, blender/build.py, package.py) from foomerang-fu physics hq.mp4 0:00',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
bgr = tuple(int(GRASS[i:i + 2], 16) for i in (5, 3, 1))
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), bgr, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])

# the water field over the sheet's square (rows north to south, columns west to east)
box = json.load(open(os.path.join(os.path.dirname(sys.argv[1]), 'water_box.json')))
N, FAR, SS = 1536, 2.0, 2
cx, cy, half = box['cx'], box['cy'], box['half']
to = lambda pts: np.int32([((x - cx + half) / (2 * half) * N * SS, (cy + half - y) / (2 * half) * N * SS) for x, y in pts])
wet = np.zeros((N * SS, N * SS), np.uint8); cv2.fillPoly(wet, [to(MOAT['outer'])], 1); cv2.fillPoly(wet, [to(MOAT['inner'])], 0)
d = cv2.distanceTransform(wet, cv2.DIST_L2, 5) * (2 * half) / (N * SS)
r = np.clip(cv2.resize(d, (N, N), interpolation=cv2.INTER_AREA) / FAR * 255, 0, 255).astype(np.uint8)
rng = np.random.default_rng(7)
g = rng.random((N, N)).astype(np.float32); g = cv2.GaussianBlur(np.tile(g, (3, 3)), (0, 0), 24)[N:2 * N, N:2 * N]
g = (np.clip((g - g.mean()) / (g.std() * 2.2) + 0.5, 0, 1) * 255).astype(np.uint8)
b = rng.random((N, N)).astype(np.float32); b = cv2.GaussianBlur(np.tile(b, (3, 3)), (0, 0), 7)[N:2 * N, N:2 * N]
b = (np.clip((b - b.mean()) / (b.std() * 2.2) + 0.5, 0, 1) * 255).astype(np.uint8)
cv2.imwrite(OUT + 'water.png', cv2.merge([b, g, r]), [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('warm-up packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model')
