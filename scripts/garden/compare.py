#!/usr/bin/env python3
"""
Compares the Garden implementation screenshot (docs/garden/implementation.png) with the READ-ONLY reference
"Garden Map - Fu.jpeg" at the repository root, and writes docs/garden/{reference-small,overlay,diff,wallmask}.png and a
metrics file. The reference is only ever read.

These numbers measure position, scale and large-shape alignment. They are NOT a measure of visual quality (docs/GARDEN.md).
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'Garden Map - Fu.jpeg')
OUT = os.path.join(ROOT, 'docs', 'garden')
impl_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'implementation.png')
W, H = 1376, 783   # a canvas of the reference's aspect, the size of the screenshots

ref = Image.open(REF).convert('RGB').resize((W, H), Image.LANCZOS)
impl = Image.open(impl_path).convert('RGB').resize((W, H), Image.LANCZOS)
ref.save(os.path.join(OUT, 'reference-small.png'))
a = np.asarray(ref).astype(float); b = np.asarray(impl).astype(float)

overlay = Image.fromarray(((a + b) / 2).astype('uint8'))
overlay.save(os.path.join(OUT, 'overlay.png'))
diff = np.abs(a - b).mean(axis=2)
Image.fromarray(np.clip(diff * 3, 0, 255).astype('uint8')).save(os.path.join(OUT, 'diff.png'))

def lavender(x):
    r, g, bl = x[..., 0], x[..., 1], x[..., 2]
    m = (bl - g > 20) & (bl > 140) & (bl - r > 12)
    return ndi.binary_opening(m, structure=np.ones((3, 3)))
ma, mb = lavender(a), lavender(b)
inter = (ma & mb).sum(); union = (ma | mb).sum()
# tolerant version: a wall pixel counts as matched if the other image has wall within 5 px (alignment, not exact shape)
da = ndi.binary_dilation(ma, iterations=5); db = ndi.binary_dilation(mb, iterations=5)
tol = ((ma & db).sum() + (mb & da).sum()) / (ma.sum() + mb.sum())
rgb = np.zeros((H, W, 3), 'uint8'); rgb[..., 0] = (ma * 255); rgb[..., 1] = (mb * 255)
Image.fromarray(rgb).save(os.path.join(OUT, 'wallmask.png'))
metrics = {
    'meanAbsColourDiff': round(float(diff.mean()), 2),
    'stoneMaskIoU': round(float(inter / union), 3),
    'stoneMaskWithin5px': round(float(tol), 3),
    'referenceStonePixels': int(ma.sum()), 'implementationStonePixels': int(mb.sum()),
}
json.dump(metrics, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=1)
print(json.dumps(metrics, indent=1))
