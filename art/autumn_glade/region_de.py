"""The Lab difference (render with the game's beams vs frame) over the frame's canopies, its sand and everything else.

  python art/autumn_glade/region_de.py [render.png]       (from the repository root; the Python of art/audio/output/venv)
"""
import sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from beams_emu import apply
a = apply(cv2.imread(sys.argv[1] if len(sys.argv) > 1 else 'art/autumn_glade/output/render.png')); b = cv2.imread('art/autumn_glade/output/reference.png')
la, lb = cv2.cvtColor(a, cv2.COLOR_BGR2LAB).astype(float), cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(float)
la[..., 0] *= 100 / 255; lb[..., 0] *= 100 / 255; la[..., 1:] -= 128; lb[..., 1:] -= 128
d = np.sqrt(((la - lb) ** 2).sum(-1))
h = cv2.cvtColor(b, cv2.COLOR_BGR2HSV).astype(int); H, S, V = h[..., 0], h[..., 1], h[..., 2]
valid = np.ones(d.shape, bool); valid[95:375, :215] = False; valid[470:620, 740:1190] = False
canopy = ((((H <= 12) | (H >= 170)) & (S > 90) & (V > 140)) | ((H >= 17) & (H <= 27) & (S > 125) & (V > 165) & (V < 232))) & valid
sand = (H >= 15) & (H <= 34) & (S >= 30) & (S <= 150) & (V >= 200) & valid & ~canopy
print('canopy dE %.2f   sand dE %.2f   other dE %.2f   all %.2f' % (d[canopy].mean(), d[sand].mean(), d[valid & ~canopy & ~sand].mean(), d[valid].mean()))
