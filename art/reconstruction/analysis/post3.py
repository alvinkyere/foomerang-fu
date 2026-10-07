"""Pass-3 post: the MEASURED screen-space light field of each take (warm glow, side/bottom falloff, vignette; lit-ground only, albedo cancelled)
 plus the reference's video softness.   python post3.py <in_dir> <out_dir>   (frames <= 263 are take A, otherwise take B)"""
import sys, os, glob, cv2, numpy as np
src, dst = sys.argv[1:3]; os.makedirs(dst, exist_ok=True); H = os.path.dirname(os.path.abspath(__file__))
FA = np.load(os.path.join(H, 'lightfield_takeA.npy')); FB = np.load(os.path.join(H, 'lightfield_takeB.npy')); SIGMA = float(os.environ.get('FOO_SOFT', '0.7'))
for f in sorted(glob.glob(f'{src}/f*.png')):
    n = int(os.path.basename(f)[1:5]); F = FA if n <= 263 else FB
    im = cv2.imread(f).astype(np.float32) * F
    if SIGMA > 0: im = cv2.GaussianBlur(im, (0, 0), SIGMA)
    cv2.imwrite(os.path.join(dst, os.path.basename(f)), np.clip(im, 0, 255).astype(np.uint8))
