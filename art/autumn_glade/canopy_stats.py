"""The canopies' colour distribution in the render and the frame: median and lightness (Lab L) percentiles of the red and gold masks.

  python art/autumn_glade/canopy_stats.py       (from the repository root; the Python of art/audio/output/venv)
"""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from beams_emu import apply as with_beams
for n in ('render', 'reference'):
    f = cv2.imread(f'art/autumn_glade/output/{n}.png')
    if n == 'render': f = with_beams(f)
    h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); H, S, V = h[..., 0], h[..., 1], h[..., 2]
    for k, m in (('red', ((H <= 8) | (H >= 172)) & (S > 120) & (V > 150)), ('gold', (H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232))):
        L = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)[m][:, 0].astype(float)
        print('%-9s %-4s median #%02x%02x%02x  L p10/50/90 %s' % ((n, k) + tuple(np.median(f[m].astype(float), 0)[::-1].astype(int)) + (np.percentile(L, [10, 50, 90]).astype(int),)))
