"""The hex meadow's layout (2026-11-06): ff physics hq 2.mp4 1202.0 s (output/reference_fill.png). The frame's footprint on the ground, the
dashed border (read off the frame, a rectangle within 2 degrees through the camera rig: measure.py), and the measured palette (k-means of
each class: ground, the shadow on it, the pads' three shades, rocks, gold canopies). Writes layout.json; later steps add to it.

  python art/hex_meadow/layout.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, os, sys
sys.path.insert(0, 'art/hex_meadow')
from measure import plan

L = json.load(open('art/hex_meadow/layout.json')) if os.path.exists('art/hex_meadow/layout.json') else {}
L['frame'] = [[round(float(v), 2) for v in p] for p in plan([(0, 0), (1920, 0), (1920, 1080), (0, 1080)])]
L['border'] = dict(x0=-23.97, x1=25.44, y0=-17.04, y1=20.92)      # (corners (356,105) (1612,105) (1688,955) (262,955))
L['colours'] = dict(ground='#bfe580', ground_light='#c0ec8a', shadow='#a1d07d', pad=['#6cc791', '#7bd29a', '#8fe0a5'],
                    rock=['#9eaae1', '#7582bc', '#596798'], gold=['#d1b959', '#c4a95a', '#b6995a'])
json.dump(L, open('art/hex_meadow/layout.json', 'w'), indent=1)
print('frame footprint', L['frame'])
