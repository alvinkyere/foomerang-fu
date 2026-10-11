"""Illumination field of the LIT ground: per material class (pavement, sand) the smooth multiplier of colour across the screen (take A, static camera).
 Shadows and props are excluded by colour-class + tolerance masks; the field is a normalised-convolution low-pass.  python light_field.py <frames_dir> <out_prefix>"""
import sys, cv2, numpy as np
fd, outp = sys.argv[1:3]
A = list(range(203, 264, 3)); ims = np.array([cv2.imread(f'{fd}/f{f:04d}.png') for f in A]).astype(np.float32); med = np.median(ims, axis=0)
lab = cv2.cvtColor(med.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
def cl(rgb): return cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
# class centres measured on lit patches
PAV, SAND = cl((247, 243, 200)), cl((234, 196, 118))
dp = np.linalg.norm(lab[..., 1:] - PAV[1:], axis=2); ds = np.linalg.norm(lab[..., 1:] - SAND[1:], axis=2)    # chroma only: brightness is what we measure
mp = (dp < 9) & (dp < ds) & (lab[..., 0] > 190); ms = (ds < 12) & (ds < dp) & (lab[..., 0] > 150)
mp = cv2.erode(mp.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0; ms = cv2.erode(ms.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
def field(mask, sigma=28):
    out = np.zeros_like(med); w = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)
    for c in range(3): out[..., c] = cv2.GaussianBlur(med[..., c] * mask, (0, 0), sigma) / np.maximum(w, 1e-3)
    return out, w
fp, wp = field(mp); fs, ws = field(ms)
print('pavement lit px', mp.sum(), ' sand lit px', ms.sum())
for name, f, w, m in (('pavement', fp, wp, mp), ('sand', fs, ws, ms)):
    print(name, 'luminance field (rows top->bottom; cols left->right; 0 = no data)')
    L = f[..., 0] * 0.114 + f[..., 1] * 0.587 + f[..., 2] * 0.299
    for gy in range(6):
        print(' '.join(f'{L[gy*60+30, gx*80+40]:6.1f}' if w[gy*60+30, gx*80+40] > 0.05 else '   -- ' for gx in range(8)))
    ref = np.median(L[m]); print(' median', round(float(ref), 1))
np.save(outp + '_pav.npy', np.dstack([fp, wp])); np.save(outp + '_sand.npy', np.dstack([fs, ws]))
vis = np.hstack([np.clip(fp, 0, 255), np.clip(fs, 0, 255)]).astype(np.uint8); cv2.imwrite(outp + '_vis.png', vis)
cv2.imwrite(outp + '_masks.png', np.hstack([mp, ms]).astype(np.uint8) * 255)
