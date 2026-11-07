"""The bridge islands' three hex bushes (foomerang-fu physics hq.mp4 1:12, art/bridge_islands/output/reference.png) as the game's own
hex plants (owner, 2026-11-06: the meadow's plants move and burn the same wherever they grow; the bridge map had them as painted cards).
Each bush's hexagonal lattice fitted to the frame as fit_lattice.py fits the meadow's (the pads' edges darker than their middles), its
pads read cell by cell (pad-green at the middle), its flowers (a pale dot); the stems' height fitted with the lattice. Through the bridge
map's own camera (art/bridge_islands: the plaza's rig at its HQ zoom; Blender coordinates are the scene's x, -z). Writes the bridge's
manifest `plants` (one field a bush) and `plantsReplace` (its painted bush cards: the game hides them).

  python art/hex_meadow/bridge_bushes.py       (from the repository root; the Python of art/audio/output/venv; then prettier the manifest)
"""
import json, math
import numpy as np, cv2
from scipy.optimize import differential_evolution

CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/bridge_islands/scale.json'))
Z = SC['hqZoom'] / SC['scale']; th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]]); F, C = CAM['focalPx'], np.array(CAM['centre'])


def project(P):
    v = (R @ (np.asarray(P, float) / 100 - C).T).T
    return np.c_[960 + F * v[:, 0] / v[:, 2] * Z, 540 + F * v[:, 1] / v[:, 2] * Z]


f = cv2.imread('art/bridge_islands/output/reference.png'); hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
g = cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 0.8)
pad = (hsv[..., 0] >= 62) & (hsv[..., 0] <= 92) & (hsv[..., 1] >= 50) & (hsv[..., 2] >= 120)
rock = (hsv[..., 0] >= 100) & (hsv[..., 0] <= 135) & (hsv[..., 1] >= 40) & (hsv[..., 2] >= 80)
L = json.load(open('art/bridge_islands/layout.json'))
BUSH_PX = [(860, 240), (770, 879), (1356, 470)]      # (art/bridge_islands/layout.py BUSHES: their middles in the frame)


def cells(s, t, ox, oy, span=6):
    i, j = np.meshgrid(np.arange(-span, span + 1), np.arange(-span, span + 1))
    x = 1.5 * s * i; y = math.sqrt(3) * s * (j + i / 2.0)
    c, sn = math.cos(t), math.sin(t)
    return np.c_[(c * x - sn * y).ravel() + ox, (sn * x + c * y).ravel() + oy]


groups = []
for k, ((bx, by), bu) in enumerate(zip(BUSH_PX, L['bushes'])):
    ax, ay = bu['at']; win = np.zeros(pad.shape, bool); win[by - 130:by + 130, bx - 170:bx + 170] = True
    inner = cv2.erode((pad & win).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0

    def score(v):
        s, t, ox, oy, H = v
        Cc = cells(s, t, ax + ox, ay + oy)
        ang = np.arange(6) * math.pi / 3 + t; cr = np.stack([np.cos(ang), np.sin(ang)], 1) * s
        E = np.concatenate([Cc + (cr[q] + (cr[(q + 1) % 6] - cr[q]) * u) for q in range(6) for u in (0.3, 0.5, 0.7)])
        pe = project(np.c_[E, np.full(len(E), H)]); pm = project(np.c_[Cc, np.full(len(Cc), H)])
        def sample(p):
            x = np.clip(p[:, 0].astype(int), 0, 1919); y = np.clip(p[:, 1].astype(int), 0, 1079); return g[y, x], inner[y, x]
        ve, ie = sample(pe); vm, im = sample(pm)
        ie = ie.reshape(18, -1).all(0); im = im & ie
        if im.sum() < 6: return 0.0
        return -(vm[im].mean() - ve.reshape(18, -1)[:, im].mean())
    res = differential_evolution(score, [(0.25, 0.9), (-math.pi / 6, math.pi / 6), (-1.5, 1.5), (-2.5, 2.5), (2.0, 3.2)], seed=3, maxiter=80, popsize=24, tol=1e-7, polish=True)
    s, t, ox, oy, H = [float(v) for v in res.x]
    Cc = cells(s, t, ax + ox, ay + oy)
    P = project(np.c_[Cc, np.full(len(Cc), H)]); ppu = project(np.array([[ax + 1, ay, H]]))[0, 0] - project(np.array([[ax, ay, H]]))[0, 0]
    pads = []
    for (x, y), (px, py) in zip(Cc, P):
        r = max(2, int(0.45 * s * ppu)); y0, y1, x0, x1 = int(py) - r, int(py) + r + 1, int(px) - r, int(px) + r + 1
        if not (win[int(py), int(px)] if 0 <= py < 1080 and 0 <= px < 1920 else False): continue
        if pad[y0:y1, x0:x1].mean() < 0.4 or rock[y0:y1, x0:x1].mean() > 0.5: continue
        Lm = float(np.median(cv2.cvtColor(f[y0:y1, x0:x1], cv2.COLOR_BGR2LAB)[..., 0]))
        dot = ((hsv[y0:y1, x0:x1, 1] < 70) & (hsv[y0:y1, x0:x1, 2] > 200)).sum() >= 3
        pads.append((x, y, Lm, bool(dot)))
    # (a pad with fewer than two pads touching it is a stray: a leaf, a player's green, not the bush)
    near = lambda p: sum(1 for q in pads if 0 < math.hypot(p[0] - q[0], p[1] - q[1]) < math.sqrt(3) * s * 1.15)
    for _ in range(2): pads = [p for p in pads if near(p) >= 2]
    Ls = np.array([p[2] for p in pads]); lo, hi = np.percentile(Ls, 33), np.percentile(Ls, 66)
    tones = [[], [], []]
    rows = []
    for x, y, Lm, dot in pads:
        q = 0 if Lm < lo else 2 if Lm > hi else 1
        # (Blender (x, y) -> the scene's (x, -y))
        rows.append([round(x, 3), round(-y, 3), q, dot])
    for (x, y, Lm, dot), (px, py) in zip(pads, project(np.array([[p[0], p[1], H] for p in pads]))):
        q = 0 if Lm < lo else 2 if Lm > hi else 1
        tones[q].append(f[int(py) - 2:int(py) + 3, int(px) - 2:int(px) + 3].reshape(-1, 3))
    shade = ['#%02x%02x%02x' % tuple(int(v) for v in np.median(np.concatenate(tq), 0)[::-1]) for tq in tones]
    # (the scene's turn: a corner's angle from +x toward +z, the plan's -y)
    groups.append(dict(s=round(s, 3), height=round(H, 3), turn=round(-t % (math.pi / 3), 4), shade=shade, pads=rows))
    print('bush', k, len(rows), 'pads,', sum(r[3] for r in rows), 'flowers; s %.3f turn %.1f deg, stems %.2f, contrast %.1f' % (s, math.degrees(t), H, -res.fun), shade)
D = 'apps/console/public/maps/bridge_islands/manifest.json'
M = json.load(open(D)); M['plants'] = groups; M['plantsReplace'] = '^BUSHCARD_'
json.dump(M, open(D, 'w'), indent=1)
