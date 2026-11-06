"""The hex meadow's bamboo (2026-11-06): each stalk's foot and cut top read by hand off output/reference_fill.png (ff physics hq 2.mp4
1202.0 s); the top put back in 3D leaning across the screen only (its height and sideways lean the two unknowns its pixel fixes). The
stalks the frame cuts off (the right edge's, the top's) stand as tall as their shadows say. Writes bamboo.json for blender/build.py.

  python art/hex_meadow/bamboo.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, 'art/hex_meadow')
from measure import plan, ref, Yc

# (foot px, top px or None, height if the top is out of the frame, sideways lean then, fronds: (along, angle deg))
STALKS = [((232, 988), (178, 842), None, None, [(0.35, 200), (0.5, 20), (0.65, 160)]),
          ((236, 982), (212, 898), None, None, [(0.6, -20)]),
          ((1915, 948), None, 7.0, 1.6, [(0.4, 30), (0.7, 200)]),
          ((463, 18), None, 6.0, -0.4, [(0.5, 150)])]
out = []
for foot_px, top_px, hgt, side, fronds in STALKS:
    fx, fy = [float(v) for v in plan([foot_px])[0]]
    if top_px is not None:
        res = least_squares(lambda v: np.array(ref(fx + v[0], Yc + fy, v[1])) - np.array(top_px), [0.0, 4.0])
        dx, z = [float(v) for v in res.x]
    else:
        dx, z = side, hgt
    out.append(dict(foot=[round(fx, 3), round(fy, 3)], top=[round(fx + dx, 3), round(fy, 3), round(z, 3)], r=0.36, fronds=fronds))
    print(foot_px, '->', out[-1]['foot'], 'top', out[-1]['top'])
json.dump(out, open('art/hex_meadow/bamboo.json', 'w'), indent=1)
