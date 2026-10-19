"""Pass 3: drop always-moving pixels, convert blobs to world units, link them into tracks."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import pickle, numpy as np, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from world import to_world
S = OUT
data = pickle.load(open(S + 'blobs.pkl', 'rb'))
# where blobs keep appearing whatever happens: animation, edges, HUD residue (coarse 8 px cells)
heat = np.zeros((90, 160))
for _, bl in data:
    seen = set((int(b['cy'] // 8), int(b['cx'] // 8)) for b in bl)
    for c in seen: heat[c] += 1
noisy = heat > 0.25 * len(data)
def keep(b):
    return not noisy[int(b['cy'] // 8), int(b['cx'] // 8)]
dets = []
for i, (t, bl) in enumerate(data):
    for b in bl:
        if not keep(b): continue
        foot = (b['x'] + b['w'] / 2, b['y'] + b['h'])        # a body's ground contact: the bottom of its blob
        wx, wy = to_world(*foot)
        cx, cy = to_world(b['cx'], b['cy'])
        dets.append(dict(i=i, t=t, area=b['area'], h=b['h'], w=b['w'], fx=wx, fy=wy, cx=cx, cy=cy, bgr=b['bgr'], px=b['cx'], py=b['cy']))
pickle.dump(dets, open(S + 'dets.pkl', 'wb'))
areas = np.array([d['area'] for d in dets])
print('detections', len(dets), 'noisy cells', int(noisy.sum()))
print('area percentiles', np.percentile(areas, [10, 50, 75, 90, 95, 99]).round())
big = [d for d in dets if d['area'] >= 250]
print('big blobs per frame', round(len(big) / len(data), 2), 'heights', np.percentile([d['h'] for d in big], [10, 50, 90]))
