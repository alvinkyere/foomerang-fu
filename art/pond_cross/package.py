"""The cross pond's game folder (2026-10-27): apps/console/public/maps/pond_cross/.

  plaza.glb      the banks, the wall, the water and the raft (blender/build.py)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's own mapping from world units to plan
                 units (arena.py: x east from X -34, y south from Y 107), and the plaza's characters (shared: `assetsFrom`)
  water.png      the plaza fountain's water field (art/physics_reference/water_field.py), baked over the pond: R how far each
                 spot of water is from the nearest bank or stone (0 … FAR units), G the noise that breaks the foam lines
  floor.json/.webp  the fountain water's colour under everything

  Blender -b --python art/pond_cross/blender/build.py -- <tmp_dir>
  python art/pond_cross/package.py <tmp_dir>/pond.glb          (from the repository root; npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/pond_cross/'
SC = json.load(open('art/pond_cross/scale.json'))
RAFT = json.load(open('art/pond_cross/raft.json'))
import sys
sys.path.insert(0, 'art/pond_cross')
import colour as HQ                  # (the HQ's colours as the video looks in a browser)
_w = HQ.flat('#74a2b3')
WATER = (int(_w[5:7], 16), int(_w[3:5], 16), int(_w[1:3], 16))          # BGR: the pond's water, beyond the sheet
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
camera['world'] = dict(camera['world'], planOriginX=-0.34, planOriginY=1.07)      # (arena.py: x east from X -34, y south from Y 107)
manifest = {
    'map': 'pond_cross',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': dict(gong['look'], sky=[{'at': 0.0, 'colour': HQ.flat('#74a2b3')}, {'at': 1.0, 'colour': HQ.flat('#74a2b3')}]),
    # the pond's own water (4:27: base, the glow along an edge, the foam streaks), driven by the fountain's animation
    # the HQ's camera on this map does not follow: the whole pond in one frame, at the zoom the frame was measured at
    'fixedFrame': {'zoom': round(SC['hqZoom'] / SC['scale'], 4), 'u': 0, 'v': 0},
    # and its foam as measured (44 ribbons: 0.32 wide, within ~1 unit of the bank, 1.4-11 long, 4.6% of the water): one wide ribbon
    # at a time drifting off each edge, broken into long pieces (the field's noise, below)
    'water': {'base': HQ.flat('#74a2b3'), 'light': HQ.flat('#9bc5d1'), 'foam': HQ.flat('#a8deeb'), 'glowWidth': 0.25, 'foamSpacing': 1.0,
              'foamWidth': 0.26, 'foamReach': 1.15, 'drift': 0.07,
              # the raft is in the water: its edges get the foam too, as it turns (the shader reads where it is now)
              # drawn as the HQ draws it: ribbons with wavy outlines re-drawn in steps (CartoonWater, render/three/waterShader.ts); the widest
              # reads 0.32-0.67 across (44 ribbons measured), the second one thinner and farther out
              'cartoon': {'fps': 1.5, 'wobble': 0.30, 'motion': 1.6, 'glow': 0.3,
                          'ribbons': [{'centre': 0.42, 'width': 0.34, 'sway': 0.10}, {'centre': 1.05, 'width': 0.20, 'sway': 0.15}]},
              'raft': {'halfArm': round(RAFT['arm'] / 2, 3), 'halfWidth': round(RAFT['width'] / 2, 3)}},
    'characters': gong['characters'],
    'provenance': 'art/pond_cross (layout.py, arena.py, blender/build.py, package.py) from foomerang-fu physics hq.mp4 4:27',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), WATER, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])

# the water field, over the square the game reads it on (blender/build.py's sheet, its half widened by 1.03 as the game does;
# rows north to south, columns west to east)
L = json.load(open('art/pond_cross/layout.json'))
G = json.load(open('art/pond_cross/ground.json'))
STONES = json.load(open('art/pond_cross/stones.json'))
N, FAR, SS = 1024, 2.0, 4                   # (a texel 0.066 units: a ribbon 0.32 wide is five)
xs = [p[0] for b in G['polygons'] for p in b]; ys = [p[1] for b in G['polygons'] for p in b]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
half = (max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 12) * 1.03     # (the sheet of blender/build.py: the same +12)
dry = np.zeros((N * SS, N * SS), np.uint8)
for p in G['polygons'] + [b['top'] for b in STONES]:
    cv2.fillPoly(dry, [np.int32([((x - cx + half) / (2 * half) * N * SS, (cy + half - y) / (2 * half) * N * SS) for x, y in p])], 1)
d = cv2.distanceTransform(1 - dry, cv2.DIST_L2, 5) * (2 * half) / (N * SS)
r = np.clip(cv2.resize(d, (N, N), interpolation=cv2.INTER_AREA) / FAR * 255, 0, 255).astype(np.uint8)
rng = np.random.default_rng(7)  # (as the plaza's: smooth noise that tiles)
g = rng.random((N, N)).astype(np.float32)
g = cv2.GaussianBlur(np.tile(g, (3, 3)), (0, 0), 24)[N:2 * N, N:2 * N]   # (blobs ~2.5 units: the ribbons' long pieces)
g = (np.clip((g - g.mean()) / (g.std() * 2.2) + 0.5, 0, 1) * 255).astype(np.uint8)      # (a ribbon shows where this is over ~0.5: ~40% of an edge)
# B: finer noise (blobs ~0.6 units) for the ribbons' wobble: the cartoon water looks it up somewhere new at every step of its boil
b = rng.random((N, N)).astype(np.float32)
b = cv2.GaussianBlur(np.tile(b, (3, 3)), (0, 0), 7)[N:2 * N, N:2 * N]
b = (np.clip((b - b.mean()) / (b.std() * 2.2) + 0.5, 0, 1) * 255).astype(np.uint8)
cv2.imwrite(OUT + 'water.png', cv2.merge([b, g, r]), [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('pond packaged:', os.path.getsize(OUT + 'plaza.glb') // 1024, 'kB model')
