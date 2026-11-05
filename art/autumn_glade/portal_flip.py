"""The portals' cycle as traced frames (2026-11-04): ff physics hq 2.mp4, the west portal at FRAMES phases of its 5.833 s cycle
(measured: its shape repeats at that lag, similarity 0.964; phase 0 is 626.0 s, the HQ frame). For each phase the video frame is found
(626.0 s + phase; one period later if the portal is not clearly in view), the rock and portal located in it by a template match over
scales (the game's camera pans and zooms), the frame brought back to the reference's scale and place, and the portal's strokes traced
as portal_mass.py traces them (cyan strokes, a bloom halo) and put on the same plane. Both portals use these frames (the east mirrored
about its own foot; the frame shows the same design both sides). Writes portal_flip.json: {period, frames: [{verts, faces, tones,
layers: [{colour, poly}]}]} relative to the west portal's foot, in plan units: clean polygons, ~20 frames a second.

  python art/autumn_glade/portal_flip.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import Yc, R as _R, F as _F, C as _C, Z as _Z

PERIOD, FRAMES = 5.833, 120      # (~20 a second: the strokes' slow change reads as motion, not as a flip)
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
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= 25; m = keep[lab].astype(np.uint8)
    stroke = '#%02x%02x%02x' % tuple(int(v) for v in np.median(img[m > 0], 0)[::-1])
    light = '#%02x%02x%02x' % tuple(int(v) for v in np.percentile(img[m > 0], 75, axis=0)[::-1])      # (a little lighter than the stroke: its core)
    layers = []
    # three layers, each the frame's own outline as a clean polygon (straight edges, sharp corners: the HQ's ribbon is crisp):
    # the bloom round the strokes, the strokes, a lighter heart along them
    for mask, colour, z_off in ((cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))), '#d6faf2', 0.0),
                                (m, stroke, 0.03), (cv2.erode(m, np.ones((5, 5), np.uint8)), light, 0.06)):
        cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        for ci, cc in enumerate(cs):
            if cv2.contourArea(cc) < 12 or (hier is not None and hier[0][ci][3] >= 0): continue      # (outer outlines only)
            poly = cv2.approxPolyDP(cc, 1.0, True)[:, 0, :].astype(float)
            if len(poly) < 3: continue
            xc = (poly[:, 0] - 960) / _Z + 960; yc = (poly[:, 1] - 540) / _Z + 540
            dirw = (_R.T @ np.c_[(xc - 960) / _F, (yc - 540) / _F, np.ones(len(poly))].T).T
            cam = _C * 100; tt = ((Yc + P['foot'][1] - z_off) - cam[1]) / dirw[:, 1]; world = cam[None, :] + dirw * tt[:, None]
            layers.append(dict(colour=colour, poly=[[round(float(q[0] - P['foot'][0]), 3), round(float(q[1] - Yc - P['foot'][1]), 3), round(float(q[2]), 3)] for q in world]))
    out.append(dict(t=round(t, 3), match=round(float(mv), 3), layers=layers))
    if k % 20 == 0: print(k, 'at %.2f s' % t, 'match %.2f' % mv, len(layers), 'polygons')
json.dump(dict(period=PERIOD, frames=out), open('art/autumn_glade/portal_flip.json', 'w'))
