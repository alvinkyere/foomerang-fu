"""REFERENCE | PASS 1 | PASS 2 | PASS 3 panels (same crops as before_after.py) + focused comparisons.  python before_after3.py <frames> <p1> <p2> <p3> <out>"""
import sys, os, cv2, numpy as np
ref, p1, p2, p3, out = sys.argv[1:6]; os.makedirs(out, exist_ok=True)
PANELS = {'stalls': (233, 70, 125, 215, 235, 3), 'fountain': (233, 235, 120, 405, 250, 3), 'trees': (264, 360, 215, 520, 330, 3), 'lighting': (233, 0, 0, 640, 360, 1),
          'characters': (300, 280, 150, 440, 330, 3), 'vfx_burst': (345, 215, 195, 345, 300, 4), 'vfx_ring': (228, 440, 190, 560, 290, 4),
          'teal': (312, 195, 105, 265, 180, 6), 'materials_ground': (233, 150, 200, 330, 290, 4)}
def lab(im, t): im = im.copy(); cv2.putText(im, t, (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 3, cv2.LINE_AA); cv2.putText(im, t, (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1, cv2.LINE_AA); return im
for n, (f, x0, y0, x1, y1, z) in PANELS.items():
    tiles = []
    for d, t in ((ref, 'REFERENCE'), (p1, 'PASS 1'), (p2, 'PASS 2'), (p3, 'PASS 3')):
        im = cv2.imread(f'{d}/f{f:04d}.png')[y0:y1, x0:x1]; im = cv2.resize(im, ((x1 - x0) * z, (y1 - y0) * z), interpolation=cv2.INTER_CUBIC); tiles.append(lab(im, f'{t} f{f}'))
    if n == 'lighting': img = np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:])])
    elif tiles[0].shape[1] > 500: img = np.vstack([np.hstack(tiles[:2]), np.hstack(tiles[2:])])
    else: img = np.hstack(tiles)
    cv2.imwrite(f'{out}/{n}.png', img)
print(len(PANELS), 'panels')
