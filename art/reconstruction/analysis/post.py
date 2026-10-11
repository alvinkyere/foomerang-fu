"""Measured screen-space post: camera vignette (pavement luminance falls ~10 % toward the sides and ~7 % toward the bottom, measured on the
 flat cream pavement in the reference) and the reference's video softness.   python post.py <in_dir> <out_dir>"""
import sys, os, glob, cv2, numpy as np
src, dst = sys.argv[1:3]; os.makedirs(dst, exist_ok=True)
SIGMA = float(os.environ.get('FOO_SOFT', '0.7'))
yy, xx = np.mgrid[0:360, 0:640].astype(np.float32); nx = (xx - 320) / 320; ny = (yy - 180) / 180
v = 1.0 - 0.10 * nx ** 2 - 0.07 * np.clip(ny, 0, 1) ** 2 - 0.02 * np.clip(-ny, 0, 1) ** 2
for f in sorted(glob.glob(f'{src}/f*.png')):
    im = cv2.imread(f).astype(np.float32) * v[..., None]
    if SIGMA > 0: im = cv2.GaussianBlur(im, (0, 0), SIGMA)
    cv2.imwrite(os.path.join(dst, os.path.basename(f)), np.clip(im, 0, 255).astype(np.uint8))
