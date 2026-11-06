"""The hex meadow's game folder (2026-11-06): apps/console/public/maps/hex_meadow/.

  plaza.glb      the ground, still shadows, trees, rocks, bamboo and the outskirts (blender/build.py: meadow.glb)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's mapping from world units to plan units, the
                 plaza's characters (shared: `assetsFrom`), and `plants`: every pad (pads.py) in the scene's ground units, their
                 stems' height, their three shades (render/hexPlants.ts parses it, render/three/hexPlantsView.ts draws it)
  floor.json/.webp  the lime under everything

  python art/hex_meadow/package.py <tmp_dir>/meadow.glb          (from the repository root; then npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/hex_meadow/'
L = json.load(open('art/hex_meadow/layout.json'))
A = json.load(open('art/hex_meadow/arena.json'))
Lt = json.load(open('art/hex_meadow/lattice.json'))
GROUND = json.load(open('art/hex_meadow/ground_field.json'))['base']
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=A['X0'] / 100, planOriginY=(L['Yc'] + A['Y1']) / 100)
ZOOM = json.load(open('art/sky_islands/camera.json'))['referenceZoom']
look = json.loads(json.dumps(gong['look']))
look['sky'] = [{'at': 0.0, 'colour': GROUND}, {'at': 1.0, 'colour': GROUND}]
if 'mist' in look: look['mist']['tint'] = GROUND
# the plants in the scene's ground units: Blender's (x, Yc + y) exported Y-up is the scene's (x, -(Yc + y))
pads = [[round(p['x'], 3), round(-(L['Yc'] + p['y']), 3), p['shade'], p['flower']] for p in json.load(open('art/hex_meadow/pads.json'))]
manifest = {
    'map': 'hex_meadow',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': look,
    'fixedFrame': {'zoom': round(ZOOM, 4), 'u': 0, 'v': 0},
    'hqFrame': {'zoom': round(ZOOM, 4), 'u': 0, 'v': 0},
    'followFrame': {'minZoom': round(ZOOM, 4), 'maxZoom': round(ZOOM * 1.3, 4)},
    'plants': {'s': Lt['s'], 'height': Lt['H'], 'shade': L['colours']['pad'], 'pads': pads},
    'characters': gong['characters'],
    'provenance': 'art/hex_meadow (measure.py, fit_lattice.py, pads.py, props.py, arena.py, blender/build.py, package.py) from ff physics hq 2.mp4 20:02',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), separators=(',', ':'))
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
bgr = tuple(int(GROUND[i:i + 2], 16) for i in (5, 3, 1))
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), bgr, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])
print('meadow packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model,', len(pads), 'pads')
