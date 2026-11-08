"""The temple court's two orange hex fields (ff physics hq 2.mp4 121.5 s, east of the court, north and south of the east lane): the
game's own plants (render/hexPlants.ts: pushed aside, springing back, burning), measured as the meadow's were (art/hex_meadow:
fit_lattice.py, pads.py). Flat-topped hexagonal pads on a lattice at the stems' height H; the lattice (circumradius s, turn, offset)
fitted by the pads' darker outlines against their middles; then each cell: a pad where the frame is pad-orange at its middle, its
shade (three, by lightness), a pale dot (a bud) where one sits. Players and their badges hide cells: their neighbours' majority.
Writes hexfields.json.

  python art/temple_court/hexfields.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json, math, sys
import numpy as np, cv2
from scipy.optimize import differential_evolution
sys.path.insert(0, 'art/temple_court')
from measure import ref, Yc

H = 2.6
f = cv2.imread('art/temple_court/output/reference.png'); g = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 0.8)
hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); Hh, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
pad = (Hh >= 5) & (Hh <= 16) & (S >= 90) & (V >= 200)
hidden = np.zeros(pad.shape, bool)
for x0, y0, x1, y1 in ((1560, 170, 1690, 300), (1540, 720, 1640, 850)): hidden[y0:y1, x0:x1] = True     # (bacon and its badges; the blob)
inner = cv2.erode(pad.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
inner &= ~hidden
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)[..., 0].astype(float)
project = lambda P: np.array([ref(x, y + Yc, z) for x, y, z in P])


def cells(s, th, ox, oy, span=40):
    i, j = np.meshgrid(np.arange(-span, span + 1), np.arange(-span, span + 1))
    x = 1.5 * s * i; y = math.sqrt(3) * s * (j + i / 2.0)
    c, sn = math.cos(th), math.sin(th)
    return np.c_[(c * x - sn * y).ravel() + ox, (sn * x + c * y).ravel() + oy], i.ravel(), j.ravel()


def sample(p, img):
    x = np.clip(p[:, 0].astype(int), 0, 1919); y = np.clip(p[:, 1].astype(int), 0, 1079); return img[y, x]


def score(v):
    s, th, ox, oy = v
    C = cells(s, th, ox, oy)[0]; C = C[(C[:, 0] > 10) & (C[:, 0] < 30) & (np.abs(C[:, 1]) < 16)]
    ang = np.radians(np.arange(6) * 60 + math.degrees(th)); cs = np.stack([np.cos(ang), np.sin(ang)], 1) * s
    E = np.array([cs[k] + (cs[(k + 1) % 6] - cs[k]) * u for k in range(6) for u in (0.25, 0.5, 0.75)])
    PE = project(np.c_[(C[:, None, :] + E[None]).reshape(-1, 2), np.full(len(C) * len(E), H)]); PM = project(np.c_[C, np.full(len(C), H)])
    ie = sample(PE, inner).reshape(len(C), -1).all(1); im = sample(PM, inner) & ie
    if im.sum() < 25: return 0.0
    return -(sample(PM, g)[im].mean() - sample(PE, g).reshape(len(C), -1)[im].mean())


if __name__ == '__main__':
    if '--fit' in sys.argv:          # (slow, ~4 min: its result is kept in hexfields_lattice.json)
        res = differential_evolution(score, [(0.4, 0.9), (math.radians(-10), math.radians(10)), (0, 1.6), (0, 1.6)], seed=3, maxiter=60, popsize=20, tol=1e-6, polish=True)
        json.dump(dict(zip(('s', 'turn', 'ox', 'oy'), [float(x) for x in res.x]), contrast=float(-res.fun)), open('art/temple_court/hexfields_lattice.json', 'w'))
    Lt = json.load(open('art/temple_court/hexfields_lattice.json')); s, th, ox, oy = Lt['s'], Lt['turn'], Lt['ox'], Lt['oy']
    print('lattice s %.3f turn %.2f deg offset (%.3f, %.3f) contrast %.1f' % (s, math.degrees(th), ox, oy, Lt['contrast']))
    C, I, J = cells(s, th, ox, oy, 60)
    keep = (C[:, 0] > 9) & (C[:, 0] < 29) & (np.abs(C[:, 1]) < 17); C, I, J = C[keep], I[keep], J[keep]
    P = project(np.c_[C, np.full(len(C), H)])
    state, info = {}, {}
    for k, (cx, cy) in enumerate(P):
        r = max(2, int(0.4 * s * 27)); y0, y1, x0, x1 = int(cy) - r, int(cy) + r + 1, int(cx) - r, int(cx) + r + 1
        if y0 < 0 or x0 < 0 or y1 > 1080 or x1 > 1920: continue
        key = (int(I[k]), int(J[k]))
        if hidden[y0:y1, x0:x1].mean() > 0.3: state[key] = None; continue
        pm = pad[y0:y1, x0:x1]; state[key] = int(pm.mean() > 0.55)
        if state[key]:
            Lm = lab[y0:y1, x0:x1]; med = float(np.median(Lm[pm]))
            info[key] = dict(L=med, flower=bool((Lm > med + 9).sum() >= 3))      # (a bud: a small paler dot)
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)]
    for _ in range(12):
        for key, v in list(state.items()):
            if v is None:
                vals = [q for q in (state.get((key[0] + a, key[1] + b)) for a, b in nb) if q is not None]
                if len(vals) >= 3: state[key] = int(sum(vals) * 2 >= len(vals))
    Ls = np.array([d['L'] for d in info.values()]); lo, hi = np.percentile(Ls, 33), np.percentile(Ls, 66)
    pads = []
    for k, (x, y) in enumerate(C):
        key = (int(I[k]), int(J[k]))
        if state.get(key) != 1: continue
        d = info.get(key)
        pads.append(dict(x=round(float(x), 3), y=round(float(y), 3), shade=1 if d is None else (0 if d['L'] < lo else 2 if d['L'] > hi else 1), flower=bool(d and d['flower'])))
    # the pads' colours: each shade's median in the frame
    shades = []
    for t in range(3):
        px = [f[int(q[1]) - 2:int(q[1]) + 3, int(q[0]) - 2:int(q[0]) + 3].reshape(-1, 3) for p in pads if p['shade'] == t for q in project(np.array([[p['x'], p['y'], H]]))]
        m = np.median(np.vstack(px), 0).astype(int); shades.append('#%02x%02x%02x' % (m[2], m[1], m[0]))
    json.dump(dict(H=H, s=round(s, 4), turn=round(th, 5), shade=shades, pads=pads), open('art/temple_court/hexfields.json', 'w'))
    print(len(pads), 'pads,', sum(p['flower'] for p in pads), 'buds, shades', shades, [sum(p['shade'] == t for p in pads) for t in range(3)])
    ov = f.copy()
    for p in pads:
        q = project(np.array([[p['x'], p['y'], H]]))[0]; cv2.circle(ov, (int(q[0]), int(q[1])), 4, ((0, 0, 255), (0, 200, 255), (255, 255, 0))[p['shade']], -1)
    cv2.imwrite('art/temple_court/output/pads_overlay.jpg', ov[100:950, 1150:1850])
