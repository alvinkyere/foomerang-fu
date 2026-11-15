"""The canal court's game folder (2026-11-13): apps/console/public/maps/canal_court/ (after art/gong_court/package.py).

  plaza.glb      the ground, the kerb, the aqueduct, the basin, the rocks, the cards (blender/build.py: canal_court.glb)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's mapping from world units to plan units (arena.json:
                 x east from X0, y south from Y1), the HQ's READY view (zoom.json: 1.15x the rig's zoom) and its follow, the plaza's
                 characters (shared: `assetsFrom`); the court stands still (scenery: no fade, no sway) until measured otherwise
  floor.json/.webp  the sand beyond the drawn ground (the ground's own edge colour)

  python art/canal_court/package.py <tmp_dir>/canal_court.glb          (from the repository root)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/canal_court/'
A = json.load(open('art/canal_court/arena.json')); G = json.load(open('art/canal_court/ground.json'))
YC = 73.72
ZOOM = round(json.load(open('art/canal_court/zoom.json'))['zoom'], 4)
# the sand beyond the drawing: the median of the ground's base along its edge
grid = np.array(G['bgr']).reshape(G['ny'], G['nx'], 3)
edge = np.concatenate([grid[0], grid[-1], grid[:, 0], grid[:, -1]])
b, g, r = np.median(edge, 0).astype(int); GRASS = '#%02x%02x%02x' % (r, g, b)
# the waters' places for the game's shaders (render/three/canalWater.ts): the pool's middle and size, the run's line (from the pool's
# middle down the channel's centreline: fit_tops.py), the basin's octagon (fit_basin.py)
TOPS = json.load(open('art/canal_court/tops.json')); WAT = json.load(open('art/canal_court/water.json')); BA = json.load(open('art/canal_court/basin.json'))
POOL = json.load(open(os.path.join(os.path.dirname(sys.argv[1]), 'pool.json')))      # (build.py: the pool's water octagon)
CANAL = dict(yc=YC, pool={k: round(v, 3) for k, v in POOL.items()},
             run=dict(line=TOPS["channel"]["line"], halfWidth=0.5, speed=1.2),      # (noise units: the streaks go 1.33 units a second, the HQ's 1.2-1.6: stabilised frames, 657-666 s)
             basin=dict(cx=BA['cx'], cy=BA['cy'], r=BA['rin'], turn=BA['turn']))
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=A['X0'] / 100, planOriginY=(YC + A['Y1']) / 100)
manifest = {
    'map': 'canal_court',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': dict(gong['look'], sky=[{'at': 0.0, 'colour': GRASS}, {'at': 1.0, 'colour': GRASS}]),
    'fixedFrame': {'zoom': ZOOM, 'u': 0, 'v': 0},
    'hqFrame': {'zoom': ZOOM, 'u': 0, 'v': 0},
    'followFrame': {'minZoom': ZOOM, 'maxZoom': round(ZOOM * 1.18, 4)},      # (the HQ's round, 653-675 s: its camera zooms in to 1.18x the READY view at most (H.json))
    'scenery': {'fade': False, 'sway': False},
    'canalWater': CANAL,
    'characters': gong['characters'],
    'provenance': 'art/canal_court (measure.py, mosaic.py, kerb.py, fit_tops.py, fit_basin.py, ground.py, cards.py, arena.py, blender/build.py, package.py) from foomerang-fu physics hq.mp4 10:55',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), (b, g, r), np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])
print('canal court packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model; grass', GRASS, '; zoom', ZOOM)
