"""The cross pond's game folder (2026-10-27): apps/console/public/maps/lily_island/.

  plaza.glb      the banks, the wall, the water and the raft (blender/build.py)
  manifest.json  the gong islands' soft look and the plaza's camera rig, with this map's own mapping from world units to plan
                 units (arena.py: x east from X -21, y south from Y 92), and the plaza's characters (shared: `assetsFrom`)
  water.png      the plaza fountain's water field (art/physics_reference/water_field.py), baked over the pond: R how far each
                 spot of water is from the nearest bank or stone (0 … FAR units), G the noise that breaks the foam lines
  floor.json/.webp  the fountain water's colour under everything

  Blender -b --python art/lily_island/blender/build.py -- <tmp_dir>
  python art/lily_island/package.py <tmp_dir>/pond.glb          (from the repository root; npx prettier --write the manifest)
"""
import json, os, shutil, sys
import numpy as np, cv2

OUT = 'apps/console/public/maps/lily_island/'
SC = json.load(open('art/lily_island/scale.json'))
import sys
sys.path.insert(0, 'art/lily_island')
import colour as HQ                  # (the HQ's colours as the video looks in a browser)
_w = HQ.flat('#7aa8bb')
WATER = (int(_w[5:7], 16), int(_w[3:5], 16), int(_w[1:3], 16))          # BGR: the pond's water, beyond the sheet
os.makedirs(OUT, exist_ok=True)
shutil.copyfile(sys.argv[1], OUT + 'plaza.glb')
gong = json.load(open('apps/console/public/maps/gong_islands/manifest.json'))
camera = dict(gong['camera'])
_A = json.load(open('art/lily_island/arena.json'))
camera['world'] = dict(camera['world'], planOriginX=_A['X0'] / 100, planOriginY=_A['Y1'] / 100)      # (arena.py: x east from X -21, y south from Y 92)
manifest = {
    'map': 'lily_island',
    'canvas': gong['canvas'],
    'camera': camera,
    'occluders': [],
    'characterScale': gong['characterScale'],
    'assetsFrom': 'market_plaza',
    'look': dict(gong['look'], sky=[{'at': 0.0, 'colour': HQ.flat('#7aa8bb')}, {'at': 1.0, 'colour': HQ.flat('#7aa8bb')}]),
    # the pond's own water (4:27: base, the glow along an edge, the foam streaks), driven by the fountain's animation
    # the HQ's camera on this map does not follow: the whole pond in one frame, at the zoom the frame was measured at
    # (the game's camera needs gameZoomFit x the zoom the frame was read at to show the island as big as the HQ does: measured with
    # hqcompare.py / the grass masks, 2026-10-30)
    'fixedFrame': {'zoom': round(SC['hqZoom'] / SC['scale'] * SC['gameZoomFit'], 4), 'u': 0, 'v': 0},
    # ...but, as the HQ's camera on this map does (10:37-10:44: it closes in as the players come together), it follows them, from the
    # whole island to 1.3 times closer (the plaza's own closest)
    'hqFrame': {'zoom': round(SC['hqZoom'] / SC['scale'] * SC['gameZoomFit'], 4), 'u': 0.0185, 'v': 0.0394},       # (calibrated against the HQ frame: art/lily_island/hqcompare.py)
    'followFrame': {'minZoom': round(SC['hqZoom'] / SC['scale'] * SC['gameZoomFit'], 4), 'maxZoom': round(SC['hqZoom'] / SC['scale'] * SC['gameZoomFit'] * 1.3, 4)},
    # and its foam as measured (44 ribbons: 0.32 wide, within ~1 unit of the bank, 1.4-11 long, 4.6% of the water): one wide ribbon
    # at a time drifting off each edge, broken into long pieces (the field's noise, below)
    'water': {'base': HQ.flat('#7aa8bb'), 'light': HQ.flat('#9ac3d3'), 'foam': HQ.flat('#c2e8f4'), 'glowWidth': 0.9, 'foamSpacing': 1.0,
              'foamWidth': 0.26, 'foamReach': 1.15, 'drift': 0.07,
              # the raft is in the water: its edges get the foam too, as it turns (the shader reads where it is now)
              # (owner, 2026-10-29, three times "too strong": the HQ's steady water, studied with the camera jitter and compression flicker removed,
              # is nearly STILL: along the banks 3% of the foam changes in 0.1 s; round the raft almost none (short-lived streaks, 87% gone in 0.8 s).
              # So: banks' ribbons stay put and fade in and out, a new draw every ~6 s; the raft's are thin and sparse)
              # drawn as the HQ draws it: ribbons with wavy outlines morphing from one drawing to the next (CartoonWater, waterShader.ts); the widths
              # are fitted so the foam covers the HQ's share of the water (4.9%: 6.7% with the first widths, 0.34 and 0.20), the second ribbon
              # thinner and farther out
              'cartoon': {'fps': 0.17, 'wobble': 0.06, 'scale': 0.95, 'wobbleScale': 0.85, 'presence': [0.3, 0.55], 'motion': 0.5, 'glow': 0.55,
                          # the HQ draws three thin pale outlines round every edge (10:37, the SE kerb), nearly continuous
                          'ribbons': [{'centre': 0.55, 'width': 0.09, 'sway': 0.02}, {'centre': 1.05, 'width': 0.07, 'sway': 0.02}]},
              },
    'characters': gong['characters'],
    'provenance': 'art/lily_island (layout.py, arena.py, blender/build.py, package.py) from foomerang-fu physics hq.mp4 10:37',
}
json.dump(manifest, open(OUT + 'manifest.json', 'w'), indent=1)
open(OUT + 'floor.json', 'w').write('{ "x0": -200.0, "x1": 200.0, "y0": -100.0, "y1": 300.0, "px_per_bu": 0.04, "size": [16, 16] }\n')
cv2.imwrite(OUT + 'floor.webp', np.full((16, 16, 3), WATER, np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 100])

# the water field, over the square the game reads it on (blender/build.py's sheet, its half widened by 1.03 as the game does;
# rows north to south, columns west to east)
L = json.load(open('art/lily_island/layout.json'))
G = json.load(open('art/lily_island/ground.json'))
STONES = json.load(open('art/lily_island/stones.json'))
N, FAR, SS = 1536, 2.0, 3                   # (a texel 0.066 units: a ribbon 0.32 wide is five)
xs = [p[0] for b in G['polygons'] for p in b]; ys = [p[1] for b in G['polygons'] for p in b]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
half = (max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + 30) * 1.03     # (the sheet of blender/build.py: the same +12)
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
