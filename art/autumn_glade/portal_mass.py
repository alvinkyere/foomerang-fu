"""The portals as the frame shows them (2026-11-03): ff physics hq 2.mp4 626.0 s, each portal's pixels (its cyan rim, its paler cyan, its
white heart; beams taken out) in a box round it, on a 2 px grid, put on the vertical plane through its foot (props.py), facing the
camera; three tones clustered from its pixels, each vertex the tone of its region (traced flat regions, as the rocks'). Writes
portal_mass.json (in layout.json's portal order).

  python art/autumn_glade/portal_mass.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z
from beams_emu import remove

STEP = 2
f = remove(cv2.imread('art/autumn_glade/output/reference.png')); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
L = json.load(open('art/autumn_glade/layout.json'))
out = []
for p in L['portals']:
    x, y, w, hh = p['px']
    box = np.zeros(H.shape, bool); box[max(y - 12, 0):y + hh + 12, max(x - 12, 0):x + w + 12] = True
    # its strokes only: the true cyan, lines kept thin (the glow on the sand shows through the middle, as the frame's)
    cyan = (H >= 78) & (H <= 104) & (S > 90) & (V > 170)
    m = cv2.morphologyEx((cyan & box).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 25; m = keep[lab]
    halo = (cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0) & ~m      # (the bloom round the strokes)
    px_ = np.float32(f[m]); _, lab_, cen = cv2.kmeans(px_, 2, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full(H.shape, 255, np.uint8); lm[m] = lab_[:, 0]; lm = cv2.medianBlur(lm, 3)
    tones = ['#%02x%02x%02x' % tuple(int(v) for v in c[::-1]) for c in cen] + ['#a8f2f4']      # (the last: the halo)
    lm[halo] = 2
    m = m | halo
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = m[gy, gx]
    px, py = gx[ins].astype(float), gy[ins].astype(float)
    xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
    dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T
    cam = _C * 100; tt = ((Yc + p['foot'][1]) - cam[1]) / dirw[:, 1]; world = cam[None, :] + dirw * tt[:, None]
    idx = -np.ones(gx.shape, int); idx[ins] = np.arange(len(px))
    faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; k = [v for v in q if v >= 0]
            if len(k) == 4: faces.append([int(v) for v in q])
            elif len(k) == 3: faces.append([int(v) for v in k])
    vl = lm[py.astype(int), px.astype(int)]; vl = np.where(vl == 255, int(np.argmax([c.sum() for c in cen])), vl)
    out.append(dict(side=p['side'], verts=[[round(float(world[i, 0]), 3), round(float(world[i, 1] - Yc), 3), round(float(world[i, 2]), 3)] for i in range(len(px))],
                    faces=faces, tones=tones, tone=[int(v) for v in vl]))
    print(p['side'], int(m.sum()), 'pixels; tones', tones)
json.dump(out, open('art/autumn_glade/portal_mass.json', 'w'))
