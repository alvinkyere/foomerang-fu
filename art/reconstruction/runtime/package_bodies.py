"""Packs the hands-off character bakes (FOO_NO_HANDS=1 bake_chars.py) for the plaza: python3 package_bodies.py <bake dir> <map dir>
Per character: body_<name>.webp, the same 16 headings x (stand, air) atlas as char_<name>.webp but without its two side hands, which
the game draws itself so they can hold, swing and walk (apps/console/src/render/three/hands.ts); and in the map's manifest.json,
characters[name].body (the atlas) and characters[name].hands: the video's hand colour, a hand's size, and where each hand is in
every frame (frames.stand / frames.air: 16 headings x [left, right] x [x, y, z]), from the ground point under the body, in
Blender units as baked, Blender axes (x right, y away from the camera, z up). The 3D plaza is built in the same units (a Blender
point (X, Y, Z) is its scene point (X, Z, -Y)), and draws characters `characterScale` times their baked size."""
import json, os, sys
import cv2
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
cells = json.load(open(os.path.join(SRC, 'cells.json')))
C = cells['cell']
man_path = os.path.join(OUT, 'manifest.json')
man = json.load(open(man_path))
for name, meta in cells['chars'].items():
    sheet = np.zeros((2 * C, 16 * C, 4), np.uint8)
    for r, t in enumerate(('stand', 'air')):
        for j in range(16):
            im = cv2.imread(os.path.join(SRC, f'{name}_{t}_{j:02d}.png'), cv2.IMREAD_UNCHANGED)
            sheet[r * C:(r + 1) * C, j * C:(j + 1) * C] = im[:C, :C]
    cv2.imwrite(os.path.join(OUT, f'body_{name}.webp'), sheet, [cv2.IMWRITE_WEBP_QUALITY, 95])
    h = meta['hands']
    entry = man['characters'][name]
    entry['body'] = f'body_{name}.webp'
    H = h['height']
    entry['hands'] = dict(
        colour='#%02x%02x%02x' % tuple(h['colour']),
        size=round(h['size'] * H, 4),
        frames={t: [[[round(v * H, 4) for v in hand] for hand in h['frames'][f'{t}_{j:02d}']] for j in range(16)] for t in ('stand', 'air')},
    )
    print(name, 'body + hands')
json.dump(man, open(man_path, 'w'), indent=1)
