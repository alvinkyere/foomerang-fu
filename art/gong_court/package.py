"""The gong court's game folder (2026-11-13): apps/console/public/maps/gong_court/ (after art/temple_court/package.py).

  plaza.glb      the ground, the stone, the cards (blender/build.py: gong_court.glb)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's mapping from world units to plan units (arena.json:
                 x east from X0, y south from Y1), the HQ's READY view (zoom.json K x the rig's zoom: measure.py) and its follow, the plaza's
                 characters (shared: `assetsFrom`); the court stands still (scenery: no fade, no sway) until measured otherwise
  floor.json/.webp  the grass beyond the drawn ground (the ground's own edge colour)

  python art/gong_court/package.py <tmp_dir>/gong_court.glb          (from the repository root)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/gong_court/'
A = json.load(open('art/gong_court/arena.json')); G = json.load(open('art/gong_court/ground.json'))
YC = 73.72
ZOOM = round(json.load(open('art/sky_islands/camera.json'))['referenceZoom'] * json.load(open('art/gong_court/zoom.json'))['K'], 4)
# the grass beyond the drawing: the median of the ground's base along its edge
grid = np.array(G['bgr']).reshape(G['ny'], G['nx'], 3)
edge = np.concatenate([grid[0], grid[-1], grid[:, 0], grid[:, -1]])
b, g, r = np.median(edge, 0).astype(int); GRASS = '#%02x%02x%02x' % (r, g, b)
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=A['X0'] / 100, planOriginY=(YC + A['Y1']) / 100)
manifest = {
    'map': 'gong_court',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': dict(gong['look'], sky=[{'at': 0.0, 'colour': GRASS}, {'at': 1.0, 'colour': GRASS}]),
    'fixedFrame': {'zoom': ZOOM, 'u': 0, 'v': 0},
    'hqFrame': {'zoom': ZOOM, 'u': 0, 'v': 0},
    'followFrame': {'minZoom': ZOOM, 'maxZoom': round(ZOOM * 1.3, 4)},
    'scenery': {'fade': False, 'sway': False},
    'characters': gong['characters'],
    'provenance': 'art/gong_court (measure.py, mosaic.py, fit_stones.py, ground.py, stone_colours.py, cards.py, arena.py, blender/build.py, package.py) from foomerang-fu physics hq.mp4 0:35',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), (b, g, r), np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])
print('gong court packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model; grass', GRASS, '; zoom', ZOOM)
