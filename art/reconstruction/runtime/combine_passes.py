"""Per-pixel median of several bake passes (bake_proxies.py with FOO_RANK = 0, 1, 2, ...): movers that crossed a primitive in the
frame one pass projected drop out. Alpha is identical across passes (same geometry), so it is taken from pass 0.
python combine_passes.py <out_dir> <pass_dir> [<pass_dir> ...]"""
import sys, os, shutil, cv2, numpy as np
OUT, PASSES = sys.argv[1], sys.argv[2:]; os.makedirs(OUT, exist_ok=True)
for name in sorted(os.listdir(PASSES[0])):
    if not name.endswith('.png'): continue
    ims = [cv2.imread(os.path.join(p, name), cv2.IMREAD_UNCHANGED) for p in PASSES]
    out = ims[0].copy(); out[..., :3] = np.median(np.array([im[..., :3] for im in ims]), 0).astype(np.uint8); cv2.imwrite(os.path.join(OUT, name), out)
shutil.copy(os.path.join(PASSES[0], 'layers.json'), os.path.join(OUT, 'layers.json')); print('combined', len(PASSES), 'passes ->', OUT)
