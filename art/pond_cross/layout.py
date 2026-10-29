"""The cross pond (2026-10-27): foomerang-fu physics hq.mp4 4:27 (output/reference.png, 267.0 s: local only, not committed), measured through the plaza's camera
rig (art/sky_islands/camera.json) at this view's zoom: a stone-walled square of grass banks round a pond, a wooden cross
raft turning in it with crates on it, lily pads on the water. Colour masks of reference.png, outlines unprojected onto the
ground (z 0) in plan units; writes layout.json.

  python art/pond_cross/layout.py       (from the repository root; npx prettier --write art/pond_cross/layout.json)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/pond_cross/scale.json'))
# the HQ's zoom against the plaza rig is 1.12 (the crates ~32 px here, ~27 px at the gong islands' 0.9326; the characters' rings
# 1.09-1.17x the gong's). The owner (2026-10-29: "the arena is actually too small") asked for a bigger pond beside the characters:
# reading the frame at hqZoom / scale puts every plan size `scale` times larger, and the game's camera is set to the same zoom.
Z = _SC['hqZoom'] / _SC['scale']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
H = cv2.findHomography(np.float32([ref(X, Y) for X, Y in g]), np.float32(g))[0]
plan = lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H).reshape(-1, 2)
r1 = lambda a: [[round(float(x), 2), round(float(y), 2)] for x, y in a]

f = cv2.imread('art/pond_cross/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
grass = (h[..., 0] > 25) & (h[..., 0] < 50) & (h[..., 1] > 60) & (h[..., 2] > 190)
rock = (np.arange(1920)[None, :] > 230) & (h[..., 0] >= 105) & (h[..., 0] <= 135) & (h[..., 1] >= 25) & (h[..., 2] >= 140)
wood = (h[..., 0] >= 5) & (h[..., 0] <= 24) & (h[..., 1] > 40) & (h[..., 1] < 170) & (h[..., 2] > 90) & (h[..., 2] < 215)
water = (h[..., 0] >= 88) & (h[..., 0] <= 105) & (h[..., 1] > 40) & (h[..., 2] > 100) & (h[..., 2] < 200)
k = lambda n: np.ones((n, n), np.uint8)
clean = lambda m, n=7: cv2.morphologyEx(cv2.morphologyEx(m.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k(n)), cv2.MORPH_OPEN, k(n))


def outlines(m, least, eps=1.5):
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return [plan(cv2.approxPolyDP(c, eps, True).reshape(-1, 2)) for c in cs if cv2.contourArea(c) > least]


# the banks: the grass and its lavender lip (the lip is walked on, as on the gong islands)
banks = outlines(clean(grass | (rock & (cv2.dilate(clean(grass), k(15)) > 0)), 9), 4000)
# the stone wall: the lavender round the banks, outside them
walls = outlines(cv2.subtract(clean(rock, 9), cv2.dilate(clean(grass), k(9))), 1500)
# the raft: its hull and the crates (unclassified dark blobs inside it)
wm = clean(wood, 9)
c = max(cv2.findContours(wm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
hull = np.zeros_like(wm); cv2.fillConvexPoly(hull, cv2.convexHull(c), 255)
P = plan(c.reshape(-1, 2))
area = cv2.contourArea(np.float32(P))
# its arms: the angle at which a cross best covers its plan outline (not the box round it: a thin cross's smallest box lies
# at 45 degrees to its arms), the arms' length their reach along it, their width twice the outline's furthest from their middles
cx, cy = (float(v) for v in P.mean(0))
def reach(a):
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    u, v = (P[:, 0] - cx) * ca + (P[:, 1] - cy) * sa, -(P[:, 0] - cx) * sa + (P[:, 1] - cy) * ca
    return np.minimum(np.abs(u), np.abs(v)).max()      # how far the outline strays from the arms' middles
a = min(np.arange(-45, 45, 0.25), key=reach)
ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
U, V = (P[:, 0] - cx) * ca + (P[:, 1] - cy) * sa, -(P[:, 0] - cx) * sa + (P[:, 1] - cy) * ca
L_ = float(np.maximum(np.abs(U), np.abs(V)).max() * 2)
W_ = float(2 * reach(a))                              # (the outline's furthest from the arms' middles: half a width)
crates = []
# the crates: their purple (hue ~170) on the raft
purple = ((h[..., 0] >= 160) | (h[..., 0] <= 3)) & (h[..., 1] > 50) & (h[..., 2] > 110) & (cv2.dilate(hull, k(15)) > 0)
n, lab, st, cen = cv2.connectedComponentsWithStats(clean(purple, 5))
one = np.median([st[i, 4] for i in range(1, n) if st[i, 4] >= 250])
spots = []
for i in range(1, n):
    if st[i, 4] < 250: continue
    if st[i, 4] < 1.6 * one: spots.append(cen[i]); continue
    ys, xs = np.nonzero(lab == i)                        # two crates side by side: split along its length
    m, e = cv2.PCACompute(np.float32(np.c_[xs, ys]), mean=None)
    spots += [m[0] + e[0] * np.sqrt(one) / 2, m[0] - e[0] * np.sqrt(one) / 2]   # (a crate's side apart)
for (x, y), in (plan([p]) for p in spots):
    u, v = (x - cx) * ca + (y - cy) * sa, -(x - cx) * sa + (y - cy) * ca      # along the raft's arms
    if min(abs(u), abs(v)) < W_ / 2 + 0.5: crates.append([round(float(u), 2), round(float(v), 2)])
# lily pads: dark green blobs on the water
pad = (h[..., 0] >= 50) & (h[..., 0] <= 85) & (h[..., 1] > 60) & (h[..., 2] < 160)
n, lab, st, cen = cv2.connectedComponentsWithStats(clean(pad, 3))
pads = [dict(at=r1(plan([cen[i]]))[0], r=round(math.sqrt(st[i, 4] / math.pi) / 20, 2)) for i in range(1, n) if 60 < st[i, 4] < 3000]
out = dict(zoom=Z, banks=[r1(b) for b in banks], walls=[r1(w) for w in walls],
           raft=dict(centre=[round(cx, 2), round(cy, 2)], arm=round(L_, 2), width=round(W_, 2), degrees=round(float(a), 2),
                     crates=crates, crates_are='local, along the arms at degrees', degreesPerSecond=24), pads=pads)
json.dump(out, open('art/pond_cross/layout.json', 'w'))
allp = np.concatenate(banks + walls)
print('banks', [len(b) for b in banks], 'walls', [len(w) for w in walls], 'bounds', allp.min(0).round(1), allp.max(0).round(1))
print('raft', out['raft'], 'pads', len(pads))
