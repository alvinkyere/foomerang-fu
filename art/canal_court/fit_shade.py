"""The solids' tones as the HQ shades them (2026-11-13): our models rendered through the HQ's camera with each vertex's normal, then its
height, as its colour (blender/build.py under SHADE_DEBUG=normal / height), against the READY frame's own pixels there (away from every
edge, the water and the props): for each kind (lavender aqueduct, rocks, brown blocks, navy footing) the frame's colour fitted as a
quadratic in the normal and a line in the height, least squares. Writes shade.json ({kind: 3 x 10 coefficients, sRGB 0-255}) for
build.py's shade(); prints each kind's fit (mean |error|).

  python art/canal_court/fit_shade.py <normal render dir> <height render dir>      (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2

f = cv2.imread('art/canal_court/output/clean_ref.png').astype(float)[..., ::-1]
lin = lambda im: np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
N = lin(cv2.imread(sys.argv[1] + '/render.png').astype(float)[..., ::-1] / 255) * 2 - 1
Hh = lin(cv2.imread(sys.argv[2] + '/render.png').astype(float)[..., ::-1] / 255)
z = Hh[..., 0] * 8; kindv = Hh[..., 1]
hsv = cv2.cvtColor(cv2.imread('art/canal_court/output/clean_ref_raw.png'), cv2.COLOR_BGR2HSV).astype(int)      # (masks in OpenCV's decode, where they were tuned; the tones from Chrome's)
water = (hsv[..., 0] >= 80) & (hsv[..., 0] <= 112) & (hsv[..., 1] >= 50) & (hsv[..., 2] >= 150)
props = np.zeros(z.shape, bool)
for x0, y0, x1, y1 in ((1398, 422, 1468, 478), (1283, 612, 1338, 672)): props[y0 - 6:y1 + 6, x0 - 6:x1 + 6] = True   # (the urns)
props[90:370, 0:240] = True                                                                                     # (the names)


def feats(n, zz):
    nx, ny, nz = n[..., 0], n[..., 1], n[..., 2]
    return np.stack([np.ones_like(nx), nx, ny, nz, nx * nx, ny * ny, nz * nz, nx * ny, zz, zz * nz], -1)


out = {}
KINDS = ['tower', 'channel', 'stub', 'rock_sw', 'rock_n', 'rock_e', 'rock_se', 'brown', 'navy']      # (build.py's: G = (index + 1) / 12)
for i_, kind in enumerate(KINDS):
    v = (i_ + 1) / 12
    m = ((np.abs(kindv - v) < 0.03) & (Hh[..., 2] < 0.005)).astype(np.uint8)
    m = cv2.erode(m, np.ones((7, 7), np.uint8)) > 0
    m &= ~cv2.dilate(water.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~props
    # (where the normal render is the background, or the model's normal is not a unit vector, nothing)
    m &= np.abs(np.linalg.norm(N, axis=2) - 1) < 0.15
    X = feats(N[m], z[m]); Y = f[m]
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    err = np.abs(X @ coef - Y).mean()
    # (and the range the frame shows it in: a normal it never shows (the stub's west end) is held to it, not extrapolated)
    out[kind] = dict(coef=coef.T.round(3).tolist(), lo=np.percentile(Y, 1, axis=0).round(1).tolist(), hi=np.percentile(Y, 99, axis=0).round(1).tolist())
    print('%-8s %6d px, mean |error| %.1f (of 255)' % (kind, m.sum(), err))
json.dump(out, open('art/canal_court/shade.json', 'w'), indent=1)
