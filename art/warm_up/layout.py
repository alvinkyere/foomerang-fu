"""The warm-up's layout (2026-11-12): the props' feet read by hand off the READY frame (output/chrome_0.png, pixels) and unprojected
onto the ground (plan units), the levers (their knobs read, at the knob's height), and the dashed border (its sides read where the
frame shows the dashes: the west corner and three sides; the south-east side, off the frame, mirrored about the moat's middle).
Writes layout.json.

  python art/warm_up/layout.py      (the Python of art/audio/output/venv)
"""
import json, math, sys
sys.path.insert(0, 'art/warm_up')
from measure import plan, plan_at

LEVER_KNOBS = {'W': (515, 405), 'N': (818, 175), 'E': (1295, 552), 'S': (993, 815)}
KNOB_Z = 1.4
HOUSINGS = {'W': (499, 380), 'N': (800, 153), 'E': (1275, 526), 'S': (974, 788)}      # (their tan boxes' middles, 1.8 up: the frame's tan blobs, 2026-11-13)
HOUSING_Z = 1.8
# (pixel foot, radius in plan units): the three trees' trunks, the bamboo clumps, the potted aloes
FEET = [((880, 490), 0.6), ((300, 300), 0.6), ((1650, 590), 0.7)]
PLAN_SOLIDS = [(-37.5, 13.0, 0.9), (-23.0, -13.0, 0.9), (32.5, -1.0, 0.9), (29.0, -12.0, 0.5), (-33.5, -1.5, 0.8), (27.5, 27.0, 0.8)]
R2 = math.sqrt(2)
out = dict(housings={k: [round(float(v), 3) for v in plan_at([p], HOUSING_Z)[0]] for k, p in HOUSINGS.items()},
           levers={k: [round(float(v), 3) for v in plan_at([p], KNOB_Z)[0]] for k, p in LEVER_KNOBS.items()},
           solids=[[round(float(x), 3), round(float(y), 3), r] for (p, r) in FEET for x, y in [plan([p])[0]]] + [list(s) for s in PLAN_SOLIDS],
           # the border in the moat's axes (u north-east, v north-west), its dashes found in the frame (a high-pass of its grass, 2026-11-13;
           # the peaks of their u, v): the south-west side at u -21.45 (~2200 dash pixels; the west corner read at u -21.3 by eye), the
           # north-east at u 22.25, the north-west at v 18.9; the south-east side off the frame, mirrored about the moat's middle (v 0.7)
           border=dict(u0=-21.45, u1=22.2, v0=-17.5, v1=18.9))
json.dump(out, open('art/warm_up/layout.json', 'w'), indent=1)
print(out)
