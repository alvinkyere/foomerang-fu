"""The temple court's game folder (2026-11-07): apps/console/public/maps/temple_court/.

  plaza.glb      the court: paving, planters, trees, buildings, gates, statues, banners, lanterns, shadows, outskirts
                 (blender/build.py: court.glb)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's mapping from world units to plan units, the
                 plaza's characters (shared: `assetsFrom`), and `plants`: the two hex fields' pads (hexfields.py) in the scene's ground
                 units, their stems' height, their three oranges, their buds, stems and shadow (render/hexPlants.ts parses it)
  floor.json/.webp  the yellow ground under everything

  python art/temple_court/package.py <tmp_dir>/court.glb          (from the repository root; then npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/temple_court/'
A = json.load(open('art/temple_court/arena.json'))
HF = json.load(open('art/temple_court/hexfields.json'))
YC = 73.72                                           # (measure.py)
GROUND = '#f8e68a'
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=A['X0'] / 100, planOriginY=(YC + A['Y1']) / 100)
ZOOM = json.load(open('art/sky_islands/camera.json'))['referenceZoom']
look = json.loads(json.dumps(gong['look']))
look['sky'] = [{'at': 0.0, 'colour': GROUND}, {'at': 1.0, 'colour': GROUND}]
if 'mist' in look: look['mist']['tint'] = GROUND
# the pads in the scene's ground units: Blender's (x, Yc + y) exported Y-up is the scene's (x, -(Yc + y)); their shadow falls west
# (-0.75 plan units a unit of height) and a little north (the frame's olive under the fields, 121.5 s), the scene's z the plan's -y
pads = [[round(p['x'], 3), round(-(YC + p['y']), 3), p['shade'], p['flower']] for p in HF['pads']]
plants = {'s': HF['s'], 'height': HF['H'], 'turn': -HF['turn'], 'shade': HF['shade'], 'flower': '#f6b88a', 'stem': '#b5683f', 'rim': 0.9,
          'shadow': {'colour': '#c2c883', 'perHeight': [-0.75, -0.1]}, 'pads': pads}
manifest = {
    'map': 'temple_court',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': look,
    'fixedFrame': {'zoom': round(ZOOM, 4), 'u': 0, 'v': 0},
    'hqFrame': {'zoom': round(ZOOM, 4), 'u': 0, 'v': 0},
    # (the round's camera goes in up to 1.48x its READY view: 119.8-146 s)
    'followFrame': {'minZoom': round(ZOOM, 4), 'maxZoom': round(ZOOM * 1.45, 4)},
    'plants': plants,
    # the court stands still and its trees never turn see-through, as the HQ's (owner, 2026-11-11; measured: the crowns move under 1 px
    # against their planters while the camera holds, the banners hang still): render/three/sceneryMotion.ts
    'scenery': {'fade': False, 'sway': False},
    'characters': gong['characters'],
    'provenance': 'art/temple_court (measure.py, mosaic.py, floor.py, fit_planters.py, hexfields.py, layout.py, arena.py, blender/build.py, package.py) from ff physics hq 2.mp4 2:01',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), separators=(',', ':'))
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
bgr = tuple(int(GROUND[i:i + 2], 16) for i in (5, 3, 1))
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), bgr, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])
print('court packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model,', len(pads), 'pads')
