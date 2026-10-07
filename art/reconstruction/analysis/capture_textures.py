"""Projective TEXTURE CAPTURE of flat world surfaces from the reference, at their measured heights, with the measured light field divided out
 (so the result is albedo-like and the scene's own lights re-illuminate it).  Output (analysis/textures/): 1200x1200 canvases, 500 px/unit, box X -1..1.4, Y -0.4..2.
   ground0 (z=0, includes shadows/props)  ground_pav / ground_sand (class albedo, shadows & props filled from lit neighbours)
   plane_ring (z=0.0115)  plane_shell (z=0.021)  plane_roof (z=0.06)  plane_bush (z=0.004)
 python capture_textures.py <frames_dir> <F_A.npy> <F_B.npy>"""
import sys, cv2, numpy as np
from proj import *
fd, FA, FB = sys.argv[1], np.load(sys.argv[2]), np.load(sys.argv[3])
S = 500; BOX = (-1.0, 1.4, -0.4, 2.0); W, H = 1200, 1200
def load(f, take):
    im = cv2.imread(f'{fd}/f{f:04d}.png').astype(np.float32); F = (FA if take == 'A' else FB); return np.clip(im / np.maximum(F, 0.5), 0, 255)
def capture(take, frames, z):
    st = []; ms = []
    for f in frames:
        r, m = rectify(load(f, take), take, f, z, S, *BOX, interp=cv2.INTER_LINEAR); st.append(r); ms.append(m)
    st = np.array(st); ms = np.array(ms); a = np.where(ms[..., None], st, np.nan)
    with np.errstate(all='ignore'): med = np.nanmedian(a, axis=0)
    return np.nan_to_num(med, nan=0), ms.sum(0)
FRA = list(range(203, 264, 2)); FRB = list(range(266, 369, 3))
out = 'textures/'
def save(name, img): cv2.imwrite(out + name + '.png', np.clip(img, 0, 255).astype(np.uint8))
pa, ca = capture('A', FRA, 0.0); pb, cb = capture('B', FRB, 0.0)
g0 = np.where((ca >= 4)[..., None], pa, pb); cov = np.where(ca >= 4, ca, cb); save('ground0', g0)
# class albedos: fill shadows / props / characters from LIT pixels of the same class
def cl(rgb): return cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
lab = cv2.cvtColor(np.clip(g0, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32); PAV, SAND = cl((247, 243, 200)), cl((234, 196, 118))
dp = np.linalg.norm(lab[..., 1:] - PAV[1:], axis=2); ds = np.linalg.norm(lab[..., 1:] - SAND[1:], axis=2); valid = cov > 0
mp = (dp < 9) & (dp < ds) & (lab[..., 0] > 190) & valid; ms = (ds < 12) & (ds < dp) & (lab[..., 0] > 150) & valid
def fill(mask, src):
    mask = cv2.erode(mask.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0; w = mask.astype(np.float64); acc = np.where(mask[..., None], src, 0).astype(np.float64); res = np.zeros_like(acc); done = np.zeros(mask.shape, bool)
    for s in (1.5, 3.0, 6.0, 12.0, 24.0, 48.0, 96.0, 200.0):
        nf = np.dstack([cv2.GaussianBlur(acc[..., c], (0, 0), s) for c in range(3)]); nw = cv2.GaussianBlur(w, (0, 0), s); ok = nw > 0.0005
        est = nf / np.maximum(nw, 1e-9)[..., None]; take = ok & ~done; res[take] = est[take]; done |= ok
    res[mask] = src[mask]; return res
save('ground_pav', fill(mp, g0)); save('ground_sand', fill(ms, g0))
pr, _ = capture('A', FRA, 0.0115); save('plane_ring', pr)
psh, _ = capture('A', FRA, 0.021); save('plane_shell', psh)
pro, _ = capture('A', FRA, 0.060); save('plane_roof', pro)
pbu, _ = capture('A', FRA, 0.004); save('plane_bush', pbu)
# B-only captures (the part of the scene A does not cover)
pob, _ = capture('B', list(range(266, 290, 2)), 0.060); save('plane_roof_B', pob)
print('saved; ground coverage frac', float((cov > 0).mean()), 'pav lit px', int(mp.sum()), 'sand lit px', int(ms.sum()))
