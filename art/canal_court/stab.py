"""A stabilised close-up of the canal court round: every 10th frame (output/frames, mosaic.py) laid onto the READY frame by its homography
(output/H.json) and cropped to a box of the READY frame. Local only: for watching what happens where.

  python art/canal_court/stab.py x0 y0 x1 y1 t0 t1 out.jpg [cols]      (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
x0, y0, x1, y1 = map(int, sys.argv[1:5]); t0, t1 = map(float, sys.argv[5:7]); out = sys.argv[7]; cols = int(sys.argv[8]) if len(sys.argv) > 8 else 4
Hs = json.load(open('art/canal_court/output/H.json'))
tiles = []
for name in sorted(Hs):
    t = int(name[:5]) / 60
    if not t0 <= t <= t1: continue
    f = cv2.imread('art/canal_court/output/frames/' + name)
    T = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float)
    w = cv2.warpPerspective(f, T @ np.array(Hs[name]), (x1 - x0, y1 - y0))
    cv2.putText(w, '%.2f' % t, (4, 16), 0, 0.5, (0, 0, 255), 2); tiles.append(w)
while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]))
