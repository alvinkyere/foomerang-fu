"""Class albedo of the ground: pavement and sand textures with shadows, props and characters replaced by the nearest LIT pixels of the same class
 (normalised convolution, small scale first).   python fill_ground.py"""
import cv2, numpy as np
g0 = cv2.imread('textures/ground0.png').astype(np.float32); cov = g0.sum(2) > 0
def cl(rgb): return cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
lab = cv2.cvtColor(g0.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32); PAV, SAND = cl((247, 243, 200)), cl((234, 196, 118))
dp = np.linalg.norm(lab[..., 1:] - PAV[1:], axis=2); ds = np.linalg.norm(lab[..., 1:] - SAND[1:], axis=2)
masks = {'pav': (dp < 9) & (dp < ds) & (lab[..., 0] > 190) & cov, 'sand': (ds < 12) & (ds < dp) & (lab[..., 0] > 150) & cov}
for name, m in masks.items():
    mask = cv2.erode(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0; w = mask.astype(np.float64); acc = np.where(mask[..., None], g0, 0).astype(np.float64)
    res = np.zeros_like(acc); done = np.zeros(mask.shape, bool)
    for s in (1.5, 3.0, 6.0, 12.0, 24.0, 48.0, 96.0, 200.0):
        nf = np.dstack([cv2.GaussianBlur(acc[..., c], (0, 0), s) for c in range(3)]); nw = cv2.GaussianBlur(w, (0, 0), s); ok = nw > 0.0005
        est = nf / np.maximum(nw, 1e-9)[..., None]; take = ok & ~done; res[take] = est[take]; done |= ok
    res[mask] = g0[mask]
    if name == 'pav':     # thin neutral dark lines (the pavement-edge stripes): kept from the capture, not filled away
        L = lab[..., 0]; bh = cv2.morphologyEx(L, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        near = cv2.dilate(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        neutral = np.linalg.norm(lab[..., 1:] - 128, axis=2) < 16
        line = (bh > 5) & near & neutral & cov & ~mask
        res[line] = g0[line]; print('stripe px', int(line.sum()))
    cv2.imwrite(f'textures/ground_{name}.png', np.clip(res, 0, 255).astype(np.uint8))
    print(name, 'lit px', int(mask.sum()), 'zero px inside coverage', int(((res.sum(2) == 0) & cov).sum()))

# ---- single ground albedo: the capture itself wherever it looks like ground (keeps boundaries + stripes exactly); class fill under shadows / props / characters
import json
lay = json.load(open('layout_merged.json')); Sx, X0, Y1 = 500.0, -1.0, 2.0
poly = np.zeros(g0.shape[:2], np.uint8)
def px(p): return np.array([[(x - X0) * Sx, (Y1 - y) * Sx] for x, y in p], np.int32)
for p in lay['classes']['pavement']:
    if not p['hole']: cv2.fillPoly(poly, [px(p['pts'])], 255)
for p in lay['classes']['pavement']:
    if p['hole']: cv2.fillPoly(poly, [px(p['pts'])], 0)
fp = cv2.imread('textures/ground_pav.png').astype(np.float32); fs = cv2.imread('textures/ground_sand.png').astype(np.float32)
choice = np.where((poly > 0)[..., None], fp, fs)
labc = lambda a: cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
dE = np.minimum(np.linalg.norm(labc(g0) - labc(fp), axis=2), np.linalg.norm(labc(g0) - labc(fs), axis=2))
b_, g_, r_ = [g0[..., i] for i in range(3)]
shadowish = (g_ >= r_ - 8) & (b_ <= r_ + 8) & (r_ < 215) & (r_ > 90) & cov            # grey-green painted ground shadows (not props: those are purple/red/orange/cyan)
shadowish = cv2.morphologyEx(shadowish.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
keep = ((dE < 13) | shadowish) & cov; keep = cv2.morphologyEx(keep.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0
alb = np.where(keep[..., None], g0, choice); cv2.imwrite('textures/ground_albedo.png', np.clip(alb, 0, 255).astype(np.uint8))
print('ground_albedo: captured px kept', round(float(keep[cov].mean()), 3))
