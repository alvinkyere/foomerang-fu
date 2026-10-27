"""The cross pond's game folder (2026-10-27): apps/console/public/maps/pond_cross/.

  plaza.glb      the banks, the wall, the water and the raft (blender/build.py)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's own mapping from world units to plan
                 units (arena.py: x east from X -24, y south from Y 97), and the plaza's characters (shared: `assetsFrom`)
  water.png      the plaza fountain's water field (art/physics_reference/water_field.py), baked over the pond: R how far each
                 spot of water is from the nearest bank or stone (0 … FAR units), G the noise that breaks the foam lines
  floor.json/.webp  the fountain water's colour under everything

  Blender -b --python art/pond_cross/blender/build.py -- <tmp_dir>
  python art/pond_cross/package.py <tmp_dir>/pond.glb          (from the repository root; npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/pond_cross/'
WATER = (0xe7, 0xd2, 0x78)          # BGR of #78d2e7 (the fountain water's base, render/waterLook.ts: beyond the sheet)
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=-0.24, planOriginY=0.97)
manifest = {
    'map': 'pond_cross',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': dict(gong['look'], sky=[{'at': 0.0, 'colour': '#78d2e7'}, {'at': 1.0, 'colour': '#78d2e7'}]),
    'characters': gong['characters'],
    'provenance': 'art/pond_cross (layout.py, arena.py, blender/build.py, package.py) from foomerang-fu physics hq.mp4 4:27',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), WATER, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])

# the water field, over the square the game reads it on (blender/build.py's sheet, its half widened by 1.03 as the game does;
# rows north to south, columns west to east)
L = json.load(open('art/pond_cross/layout.json'))
N, FAR, SS = 512, 2.0, 4
xs = [p[0] for b in L['banks'] for p in b]; ys = [p[1] for b in L['banks'] for p in b]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
half = (max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 40) * 1.03
dry = np.zeros((N * SS, N * SS), np.uint8)
for p in L['banks'] + L['walls']:
    cv2.fillPoly(dry, [np.int32([((x - cx + half) / (2 * half) * N * SS, (cy + half - y) / (2 * half) * N * SS) for x, y in p])], 1)
d = cv2.distanceTransform(1 - dry, cv2.DIST_L2, 5) * (2 * half) / (N * SS)
r = np.clip(cv2.resize(d, (N, N), interpolation=cv2.INTER_AREA) / FAR * 255, 0, 255).astype(np.uint8)
rng = np.random.default_rng(7)  # (as the plaza's: smooth noise that tiles)
g = rng.random((N, N)).astype(np.float32)
g = cv2.GaussianBlur(np.tile(g, (3, 3)), (0, 0), 5)[N:2 * N, N:2 * N]
g = (np.clip((g - g.mean()) / (g.std() * 4) + 0.5, 0, 1) * 255).astype(np.uint8)
cv2.imwrite(OUT + 'water.png', cv2.merge([np.zeros_like(r), g, r]), [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('pond packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model')
