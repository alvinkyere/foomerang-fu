"""The autumn glade's game folder (2026-11-01): apps/console/public/maps/autumn_glade/.

  plaza.glb      the ground, shadows, trees, logs, rocks and portal discs (blender/build.py: glade.glb)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's own mapping from world units to plan units
                 (arena.py: x east from X0, y south from Y1 in Blender's coordinates, i.e. Yc + the layout's y), the plaza's characters (shared: `assetsFrom`)
  floor.json/.webp  the sand under everything

  Blender -b --python art/autumn_glade/blender/build.py -- <tmp_dir>
  python art/autumn_glade/package.py <tmp_dir>/glade.glb          (from the repository root; then npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/autumn_glade/'
L = json.load(open('art/autumn_glade/layout.json'))
A = json.load(open('art/autumn_glade/arena.json'))
SAND = L['colours']['ground']
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=A['X0'] / 100, planOriginY=(L['Yc'] + A['Y1']) / 100)
# the HQ rig's own zoom, no offset: the game's shot then equals blender/build.py's render (which is through the frame's camera) to within
# 1 px at the logs and the rocks (compare_game.py, 2026-11-01)
ZOOM = json.load(open('art/sky_islands/camera.json'))['referenceZoom']
U, V = 0, 0
look = json.loads(json.dumps(gong['look']))
look['sky'] = [{'at': 0.0, 'colour': SAND}, {'at': 1.0, 'colour': SAND}]
if 'mist' in look: look['mist']['tint'] = SAND
manifest = {
    'map': 'autumn_glade',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': look,
    'fixedFrame': {'zoom': round(ZOOM, 4), 'u': U, 'v': V},
    'hqFrame': {'zoom': round(ZOOM, 4), 'u': U, 'v': V},
    'followFrame': {'minZoom': round(ZOOM, 4), 'maxZoom': round(ZOOM * 1.3, 4)},
    # the light shafts: added over everything on the screen (render/three/beams.ts), fitted to the frame by fit_beams.py
    'beams': json.load(open('art/autumn_glade/beams.json')),
    'characters': gong['characters'],
    'provenance': 'art/autumn_glade (measure.py, layout.py, props.py, arena.py, blender/build.py, package.py) from ff physics hq 2.mp4 10:26',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
bgr = tuple(int(SAND[i:i + 2], 16) for i in (5, 3, 1))
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), bgr, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])
print('glade packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model')
