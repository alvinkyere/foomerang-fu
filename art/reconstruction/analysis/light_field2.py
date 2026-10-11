"""Screen-space LIGHT FIELD of a take, per colour channel, measured on the LIT ground only (pavement + sand classes by chroma; shadows, props and
 characters are rejected by the class masks).  Each class is normalised by its own median so material albedo cancels; the result F(u,v) is the
 relative illumination/atmosphere multiplier (warm glow, right-side falloff, vignette).   python light_field2.py <frames_dir> <first> <last> <step> <out.npy>"""
import sys, cv2, numpy as np
fd, a, b, st, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
def cl(rgb): return cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
PAV, SAND = cl((247, 243, 200)), cl((234, 196, 118))
acc = {k: np.zeros((360, 640, 3), np.float64) for k in ('p', 's')}; cnt = {k: np.zeros((360, 640), np.float64) for k in ('p', 's')}; vals = {'p': [], 's': []}
for f in range(a, b + 1, st):
    im = cv2.imread(f'{fd}/f{f:04d}.png'); lab = cv2.cvtColor(im, cv2.COLOR_BGR2LAB).astype(np.float32); f32 = im.astype(np.float32)
    dp = np.linalg.norm(lab[..., 1:] - PAV[1:], axis=2); ds = np.linalg.norm(lab[..., 1:] - SAND[1:], axis=2)
    mp = (dp < 9) & (dp < ds) & (lab[..., 0] > 190); ms = (ds < 12) & (ds < dp) & (lab[..., 0] > 150)
    for k, m in (('p', mp), ('s', ms)):
        m = cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0; acc[k][m] += f32[m]; cnt[k][m] += 1; vals[k].append(f32[m])
F = np.zeros((360, 640, 3), np.float64); W = np.zeros((360, 640), np.float64)
for k in ('p', 's'):
    med = np.median(np.concatenate(vals[k]), axis=0)          # per-channel class median (BGR)
    sig = 22; num = np.dstack([cv2.GaussianBlur((acc[k][..., c]), (0, 0), sig) for c in range(3)]); den = cv2.GaussianBlur(cnt[k], (0, 0), sig)
    ok = den > 1e-3 * max(cnt[k].max(), 1); fld = np.where(ok[..., None], num / np.maximum(den, 1e-9)[..., None], 0) / med
    wgt = np.minimum(den / max(cnt[k].max(), 1) * 8, 1) * ok; F += fld * wgt[..., None]; W += wgt
    print(k, 'class median BGR', med.round(1), 'coverage', round(float((den > 0.05 * max(cnt[k].max(), 1)).mean()), 2))
Fm = np.where(W[..., None] > 0.02, F / np.maximum(W, 1e-6)[..., None], np.nan)
# fill holes by progressive blur extrapolation (nearest valid)
valid = ~np.isnan(Fm[..., 0]); filled = np.where(valid[..., None], Fm, 0); w = valid.astype(np.float64)
for s in (30, 60, 120, 250):
    nf = np.dstack([cv2.GaussianBlur(filled[..., c] * w, (0, 0), s) for c in range(3)]); nw = cv2.GaussianBlur(w, (0, 0), s)
    est = nf / np.maximum(nw, 1e-6)[..., None]; hole = w < 0.5; filled = np.where(hole[..., None] & (nw[..., None] > 1e-4), est, filled); w = np.where(hole & (nw > 1e-4), 1.0, w)
F = filled; F = np.dstack([cv2.GaussianBlur(F[..., c], (0, 0), 12) for c in range(3)])
F = F / F[130:230, 220:420].reshape(-1, 3).mean(0)         # normalise to the screen centre
np.save(out, F.astype(np.float32))
print('F (relative to centre) B,G,R at corners / edges / bottom:', [tuple(F[y, x].round(3)) for (x, y) in ((20, 20), (620, 20), (20, 340), (620, 340), (320, 20), (320, 340), (20, 180), (620, 180))])
cv2.imwrite(out.replace('.npy', '_vis.png'), np.clip(F * 160, 0, 255).astype(np.uint8))
