"""Fits the canopies' lumps to the frame (ff physics hq 2.mp4 626.0 s). Each tree has lumps (x offset from its trunk base, height z,
radius r); a lump is a disc at height z, which the camera shows as an ellipse (r x 0.83 r pixels' worth). A hill-climb moves, grows,
shrinks, adds and drops lumps to maximise the overlap (IoU) of the union of the ellipses of a colour with that colour's mask
(red / gold canopy), outside the HUD, the READY text and the players. Writes lumps.json (one list per tree of layout.json, in order; run after props.py).

  python art/autumn_glade/fit_trees.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, random, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import ref, Yc

SC = 0.5                                        # fit at half resolution
import os
_FILL = 'art/autumn_glade/output/reference_fill.png'      # (fill_ready.py: the READY box mostly seen at 626.6 s)
f = cv2.imread(_FILL if os.path.exists(_FILL) else 'art/autumn_glade/output/reference.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
valid = np.ones(H.shape, bool); valid[95:375, :215] = False       # (the players' names; READY: what is still hidden)
if os.path.exists('art/autumn_glade/output/ready_hidden.npy'): valid &= ~np.load('art/autumn_glade/output/ready_hidden.npy')
else: valid[470:620, 740:1190] = False
red = valid & (((H <= 8) | (H >= 172)) & (S > 120) & (V > 150))
gold = valid & ((H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232))
K = lambda n: np.ones((n, n), np.uint8)
masks = {k: cv2.resize(cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, K(5)), None, fx=SC, fy=SC, interpolation=cv2.INTER_NEAREST) for k, m in (('r', red), ('g', gold))}
vmask = cv2.resize(valid.astype(np.uint8), None, fx=SC, fy=SC, interpolation=cv2.INTER_NEAREST)
L = json.load(open('art/autumn_glade/layout.json'))
trees = L['trees']
rng = random.Random(4)
NIT = 50000      # (annealed: early on a slightly worse move is kept now and then, so a lump can get out of a bad spot)


def ellipse(t, lump):
    """The silhouette of blender/build.py's umbrella: its rim (lobes ~1.07 r) at z - 0.2 r, its dome up to z + 0.3 r, its skirt down to
    z - 0.52 r, drawn as one ellipse: centred at z - 0.11 r, 1.07 r wide, as tall as the rim's ellipse plus the dome and the skirt."""
    bx, by = t['plan']; x = bx + lump['x']; r = lump['r']
    cx, cy = ref(x, Yc + by, lump['z'] - 0.11 * r)
    ppu = ref(x + 1, Yc + by, lump['z'])[0] - ref(x, Yc + by, lump['z'])[0]
    return (int(cx * SC), int(cy * SC)), (max(1, int(1.07 * r * ppu * SC)), max(1, int((1.07 * 0.83 + 0.41 * 0.56) * r * ppu * SC)))


def draw(kind):
    m = np.zeros(vmask.shape, np.uint8)
    for t in trees:
        if t['kind'] != kind: continue
        for lump in t['lumps']:
            c, ax = ellipse(t, lump); cv2.ellipse(m, c, ax, 0, 0, 360, 1, -1)
    return m


def loss(kind, m=None):
    m = draw(kind) if m is None else m
    t = masks[kind] > 0; e = (m > 0) & (vmask > 0)
    return 1 - (e & t).sum() / max((e | t).sum(), 1)


def total():
    return loss('r') + loss('g')


for t in trees:
    t['lumps'] = [dict(x=l['x'], z=l['z'], r=l['r']) for l in (t.get('lumps') or [dict(x=0, z=5.0, r=2.4)])]
best = total(); print('start IoU r %.3f g %.3f' % (1 - loss('r'), 1 - loss('g')))
for it in range(NIT):
    t = rng.choice(trees); kind = t['kind']
    before = loss(kind); old = [dict(l) for l in t['lumps']]
    op = rng.random()
    if op < 0.7 and t['lumps']:
        l = rng.choice(t['lumps']); l['x'] += rng.gauss(0, 0.25); l['z'] += rng.gauss(0, 0.3); l['r'] = max(0.6, l['r'] * math.exp(rng.gauss(0, 0.08)))
    elif op < 0.85 and len(t['lumps']) < 12:
        base = rng.choice(t['lumps']); t['lumps'].append(dict(x=base['x'] + rng.gauss(0, 1.5), z=base['z'] + rng.gauss(0, 1.5), r=max(0.9, base['r'] * 0.7)))
    elif len(t['lumps']) > 1:
        t['lumps'].pop(rng.randrange(len(t['lumps'])))
    for l in t['lumps']: l['x'] = max(-3.5, min(3.5, l['x'])); l['z'] = max(2.5, min(11.0, l['z'])); l['r'] = min(3.8, l['r'])      # (a lump stays on its own tree)
    temp = 0.002 * max(0.0, 1 - it / (0.7 * NIT))
    if loss(kind) < before - 1e-5 or (temp > 0 and rng.random() < math.exp(-(loss(kind) - before) / temp)): pass
    else: t['lumps'] = old
    if it % 5000 == 4999: print(it + 1, 'IoU r %.3f g %.3f' % (1 - loss('r'), 1 - loss('g')))
for t in trees:
    for l in t['lumps']: l.update(x=round(l['x'], 2), z=round(l['z'], 2), r=round(l['r'], 2))
json.dump([t['lumps'] for t in trees], open('art/autumn_glade/lumps.json', 'w'), indent=1)      # (blender/build.py reads these over layout.json's k-means starting lumps)
print('lumps', sum(len(t['lumps']) for t in trees))
