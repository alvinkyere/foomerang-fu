"""The portals' cycle as traced frames (2026-11-04): ff physics hq 2.mp4, the west portal at FRAMES phases of its 5.833 s cycle
(measured: its shape repeats at that lag, similarity 0.964; phase 0 is 626.0 s, the HQ frame). For each phase the video frame is found
(626.0 s + phase; one period later if the portal is not clearly in view), the rock and portal located in it by a template match over
scales (the game's camera pans and zooms), the frame brought back to the reference's scale and place, and the portal's strokes traced
as portal_mass.py traces them (cyan strokes, a bloom halo) and put on the same plane. Both portals use these frames (the east mirrored
about its own foot; the frame shows the same design both sides). Writes portal_flip.json: {period, frames: [{verts, faces, tones,
tone}]} relative to the west portal's foot, in plan units.

  python art/autumn_glade/portal_flip.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z

PERIOD, FRAMES, STEP = 5.833, 24, 2
c = cv2.VideoCapture('ff physics hq 2.mp4')
refimg = cv2.imread('art/autumn_glade/output/reference.png')
TX0, TY0, TX1, TY1 = 230, 250, 500, 470
tpl = cv2.cvtColor(refimg[TY0:TY1, TX0:TX1], cv2.COLOR_BGR2GRAY)
L = json.load(open('art/autumn_glade/layout.json')); P = next(p for p in L['portals'] if p['side'] == 'W')
x, y, w, hh = P['px']; box = (max(y - 12, 0), y + hh + 12, max(x - 12, 0), x + w + 12)


def located(t):
    """The video at t brought back to the reference's pixels round the portal (or None), and the match's score."""
    c.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * 60))); ok, f = c.read()
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY); best = None
    for s in np.arange(0.85, 1.4, 0.025):                  # (the frame shows the portal s times as big as the reference)
        gs = cv2.resize(g, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
        if gs.shape[0] < tpl.shape[0] or gs.shape[1] < tpl.shape[1]: continue
        r = cv2.matchTemplate(gs, tpl, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
        if best is None or mv > best[0]: best = (mv, s, ml)
    mv, s, (lx, ly) = best
    fs = cv2.resize(f, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA)
    M = np.float32([[1, 0, TX0 - lx], [0, 1, TY0 - ly]])
    return cv2.warpAffine(fs, M, (1920, 1080), borderValue=(0, 0, 0)), mv


out = []
for k in range(FRAMES):
    t = 626.0 + PERIOD * k / FRAMES
    img, mv = located(t)
    if mv < 0.88: img, mv = located(t + PERIOD)
    h = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
    bx = np.zeros((1080, 1920), bool); bx[box[0]:box[1], box[2]:box[3]] = True
    cyan = (h[..., 0] >= 78) & (h[..., 0] <= 104) & (h[..., 1] > 90) & (h[..., 2] > 170) & bx
    m = cv2.morphologyEx(cyan.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 25; m = keep[lab]
    halo = (cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0) & ~m
    px_ = np.float32(img[m]); _, lab_, cen = cv2.kmeans(px_, 2, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 4, cv2.KMEANS_PP_CENTERS)
    lm = np.full((1080, 1920), 255, np.uint8); lm[m] = lab_[:, 0]; lm = cv2.medianBlur(lm, 3); lm[halo] = 2
    tones = ['#%02x%02x%02x' % tuple(int(v) for v in cc[::-1]) for cc in cen] + ['#a8f2f4']
    mm = m | halo
    gy, gx = np.mgrid[0:1080:STEP, 0:1920:STEP]; ins = mm[gy, gx]
    px, py = gx[ins].astype(float), gy[ins].astype(float)
    xc = (px - 960) / _Z + 960; yc = (py - 540) / _Z + 540
    dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(px))].T).T
    cam = _C * 100; tt = ((Yc + P['foot'][1]) - cam[1]) / dirw[:, 1]; world = cam[None, :] + dirw * tt[:, None]
    idx = -np.ones(gx.shape, int); idx[ins] = np.arange(len(px)); faces = []
    for j in range(gx.shape[0] - 1):
        for i in range(gx.shape[1] - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]]; kk = [v for v in q if v >= 0]
            if len(kk) == 4: faces.append([int(v) for v in q])
            elif len(kk) == 3: faces.append([int(v) for v in kk])
    vl = lm[py.astype(int), px.astype(int)]; vl = np.where(vl == 255, 0, vl)
    out.append(dict(t=round(t, 3), match=round(float(mv), 3), verts=[[round(float(world[i, 0] - P['foot'][0]), 3), round(float(world[i, 1] - Yc - P['foot'][1]), 3), round(float(world[i, 2]), 3)] for i in range(len(px))],
                    faces=faces, tones=tones, tone=[int(v) for v in vl]))
    print(k, 'at %.2f s' % t, 'match %.2f' % mv, int(m.sum()), 'stroke px')
json.dump(dict(period=PERIOD, frames=out), open('art/autumn_glade/portal_flip.json', 'w'))
