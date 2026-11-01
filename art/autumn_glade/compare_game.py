"""The game's shot (shoot_hq.sh: $TMPDIR/NAME.png, 1920x1080) against the frame: where the logs and the rocks are (centroids, bounding
boxes) in each, so the manifest's hqFrame (zoom, u, v) can be fitted. Players, text and the HUD hide a little of the scene: only the logs
and rocks are read.

  python art/autumn_glade/compare_game.py NAME       (from the repository root; the Python of art/audio/output/venv)
"""
import sys
import numpy as np, cv2


def objs(path):
    f = cv2.imread(path); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); H, S, V = h[..., 0], h[..., 1], h[..., 2]
    hud = np.arange(1920)[None, :] > 215
    lg = (hud & (H >= 168) & (S >= 60) & (S <= 125) & (V >= 70) & (V < 150)).astype(np.uint8)
    rk = (hud & (H >= 104) & (H <= 132) & (S >= 40) & (V >= 90) & ((S >= 55) | (V < 150))).astype(np.uint8)
    out = {}
    for n, m in (('log', lg), ('rock', rk)):
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        c, lab, st, cen = cv2.connectedComponentsWithStats(m)
        out[n] = sorted([(int(cen[i][0]), int(cen[i][1]), int(st[i][2]), int(st[i][3]), int(st[i][4])) for i in range(1, c) if st[i][4] > 2500])
    return out


import os
shot = os.path.join(os.environ.get('TMPDIR', '/tmp'), sys.argv[1] + '.png')
a, b = objs(shot), objs('art/autumn_glade/output/reference.png')
for n in ('log', 'rock'):
    print(n, 'game', a[n]); print(n, 'ref ', b[n])
# a fit of game -> ref: x' = s x + tx, y' = s y + ty over the matched centroids (sorted by x)
ga = np.array([[o[0], o[1]] for n in a for o in a[n]], float); rb = np.array([[o[0], o[1]] for n in b for o in b[n]], float)
if len(ga) == len(rb) and len(ga) >= 2:
    A = np.c_[ga[:, 0], np.ones(len(ga))]; sx = np.linalg.lstsq(A, rb[:, 0], rcond=None)[0]
    A = np.c_[ga[:, 1], np.ones(len(ga))]; sy = np.linalg.lstsq(A, rb[:, 1], rcond=None)[0]
    print('game -> ref: x scale %.4f shift %.1f ; y scale %.4f shift %.1f' % (sx[0], sx[1], sy[0], sy[1]))
