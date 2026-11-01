"""Masks of output/render.png (blender/build.py ... render) against output/reference.png: IoU of the red canopies, gold canopies, logs and
rocks, and the sand's median colour in the two (the render is the game's light through the HQ's camera).

  python art/autumn_glade/compare.py       (from the repository root; the Python of art/audio/output/venv)
"""
import numpy as np, cv2


def masks(path):
    f = cv2.imread(path); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); H, S, V = h[..., 0], h[..., 1], h[..., 2]
    hud = np.ones(H.shape, bool); hud[95:375, :215] = False      # (all but the players' names)
    return f, dict(
        red=hud & ((H <= 8) | (H >= 172)) & (S > 120) & (V > 150), gold=hud & (H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232),
        rock=hud & (H >= 108) & (H <= 130) & (S >= 55) & (S < 150) & (V >= 150), log=hud & (H >= 168) & (S >= 60) & (S <= 125) & (V >= 70) & (V < 150),
        sand=hud & (H >= 18) & (H <= 28) & (S >= 70) & (S <= 140) & (V >= 225))


(fa, a), (fb, b) = masks('art/autumn_glade/output/render.png'), masks('art/autumn_glade/output/reference.png')
for n in a:
    i, u = (a[n] & b[n]).sum(), (a[n] | b[n]).sum()
    print('%-5s IoU %.2f   area render %7d  reference %7d' % (n, i / max(u, 1), a[n].sum(), b[n].sum()))
med = lambda f, m: '#%02x%02x%02x' % tuple(int(v) for v in np.median(f[m], 0)[::-1])
print('sand median: render', med(fa, a['sand']), 'reference', med(fb, b['sand']))
