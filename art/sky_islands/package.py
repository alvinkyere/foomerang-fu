"""The gong islands' game folder (2026-10-22): apps/console/public/maps/gong_islands/.

  plaza.glb      the islands, cliffs, blocks, bridges and objects (blender/build.py)
  manifest.json  the plaza's camera rig (the islands were measured through it: calibrate.py), with the islands' own mapping
                 from world units to plan units (arena.py: x east from X -34, y south from Y 106, 2748 world units a plan
                 unit, as the plaza), and the plaza's characters: their atlases are shared (`assetsFrom`), not copied
  floor.json/.webp  the mist under everything: one flat colour, the cliffs fade into it

  Blender -b --python art/sky_islands/blender/build.py -- <tmp_dir>
  python art/sky_islands/package.py <tmp_dir>/sky.glb          (from the repository root; npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/gong_islands/'
MIST = (0xde, 0xf3, 0xe5)          # BGR of #e5f3de
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
plaza = json.load(open('apps/console/public/maps/market_plaza/manifest.json'))
camera = dict(plaza['camera'])
camera['world'] = dict(camera['world'], planOriginX=-0.34, planOriginY=1.06)
manifest = {
    'map': 'gong_islands',
    'canvas': plaza['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': plaza['characterScale'],
    'assetsFrom': 'market_plaza',
    'characters': plaza['characters'],
    'provenance': 'art/sky_islands (register.py, calibrate.py, layout.py, objects.py, arena.py, blender/build.py, '
                  'package.py) from the HQ videos: foomerang-fu physics hq.mp4 9:03-9:47, ff physics hq 2.mp4 7:24-8:43',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), MIST, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])
print('gong islands packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model')
