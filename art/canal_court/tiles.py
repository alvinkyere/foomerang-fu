"""The court's paving (2026-11-15): the HQ's court is laid in regular stone slabs, rows ~3.05 units deep, joints on a 4.39-unit pitch with
a half-step joint in some rows (the READY frame laid flat on the ground, PX px a unit; its thin dark lines (a black-hat) summed along each
row and across each band: the peaks). Every row's joint runs the court's width; within each band, the main pitch's joints and the half
steps found there. Each joint is cut into short pieces, each the frame's own ground colour there a little darkened (JOINT_DARK), so a joint
crossing a shadow darkens the shadow. Writes tiles.json ([{colour, pts}]), output/tiles_check.png.

  python art/canal_court/tiles.py      (after kerb.py, ready.py; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
from scipy.signal import find_peaks
sys.path.insert(0, 'art/canal_court')
from measure import H as GH, Yc

PX = 20.0
X0, X1, Y0, Y1 = -26.0, 28.0, -16.0, 19.0
W_JOINT, JOINT_DARK, PIECE = 0.05, 0.996, 0.8      # (the HQ's joints are faint: 1-5 levels under the slabs)
A = np.array([[1 / PX, 0, X0], [0, -1 / PX, Y1 + Yc], [0, 0, 1]])
f = cv2.imread('art/canal_court/output/clean_ref.png')
fl = cv2.warpPerspective(f, np.linalg.inv(GH) @ A, (int((X1 - X0) * PX), int((Y1 - Y0) * PX)), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
g = cv2.cvtColor(fl, cv2.COLOR_BGR2GRAY).astype(np.float32)
bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
hsv = cv2.cvtColor(fl, cv2.COLOR_BGR2HSV).astype(int)
busy = cv2.dilate(((hsv[..., 1] > 45) | (hsv[..., 2] < 150)).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
K = json.load(open('art/canal_court/kerb.json'))['bands'][-1]['pts']
to_px = lambda pts: np.int32([((x - X0) * PX, (Y1 - y) * PX) for x, y in pts])
court = np.zeros(g.shape, np.uint8); cv2.fillPoly(court, [to_px(K)], 1)
court_in = cv2.erode(court, np.ones((9, 9), np.uint8)) > 0
m = court_in & ~busy
b = np.where(m, np.minimum(bh, 8), 0)
prof = b.sum(1) / np.maximum(m.sum(1), 1)
pk, _ = find_peaks(prof, distance=30, prominence=0.15)
rows = sorted(Y1 - p / PX for p in pk)
pitch_y = float(np.median(np.diff(rows)))
cx0, cx1 = min(p[0] for p in K), max(p[0] for p in K); cy0, cy1 = min(p[1] for p in K), max(p[1] for p in K)
while rows[0] - pitch_y > cy0 + 0.4: rows.insert(0, rows[0] - pitch_y)
while rows[-1] + pitch_y < cy1 - 0.4: rows.append(rows[-1] + pitch_y)
# the main pitch's phase from every band's peaks
allx = []
bands = [(cy0, rows[0])] + list(zip(rows, rows[1:])) + [(rows[-1], cy1)]
band_peaks = []
for ya, yb in bands:
    r0, r1 = sorted((int((Y1 - ya) * PX), int((Y1 - yb) * PX)))
    pv = b[r0 + 3:r1 - 3].sum(0) / np.maximum(m[r0 + 3:r1 - 3].sum(0), 1) if r1 - r0 > 8 else np.zeros(b.shape[1])
    pkv, _ = find_peaks(pv, distance=40, prominence=0.3)
    xs = [X0 + p / PX for p in pkv]; band_peaks.append(xs); allx += xs
PITCH_X = 4.39
phase = np.angle(np.mean(np.exp(2j * np.pi * np.array(allx) / PITCH_X))) / (2 * np.pi) * PITCH_X
main = [phase + k * PITCH_X for k in range(-10, 12) if cx0 + 0.4 < phase + k * PITCH_X < cx1 - 0.4]
out = []
inside = lambda x, y: court[int(np.clip((Y1 - y) * PX, 0, court.shape[0] - 1)), int(np.clip((x - X0) * PX, 0, court.shape[1] - 1))] > 0


def piece(xa, ya, xb, yb):
    """A joint from (xa, ya) to (xb, yb), cut into PIECE-long bits, each the ground's colour there darkened."""
    L = np.hypot(xb - xa, yb - ya); n = max(1, int(np.ceil(L / PIECE))); ux, uy = (xb - xa) / L, (yb - ya) / L; nx_, ny_ = -uy * W_JOINT / 2, ux * W_JOINT / 2
    for i in range(n):
        a0, a1 = i / n, (i + 1) / n; x0_, y0_ = xa + (xb - xa) * a0, ya + (yb - ya) * a0; x1_, y1_ = xa + (xb - xa) * a1, ya + (yb - ya) * a1
        mx, my = (x0_ + x1_) / 2, (y0_ + y1_) / 2
        if not inside(mx, my): continue
        c = fl[int((Y1 - my) * PX), int((mx - X0) * PX)].astype(float) * JOINT_DARK
        out.append(dict(colour='#%02x%02x%02x' % (int(c[2]), int(c[1]), int(c[0])),
                        pts=[[round(x0_ + nx_, 3), round(y0_ + ny_, 3)], [round(x1_ + nx_, 3), round(y1_ + ny_, 3)],
                             [round(x1_ - nx_, 3), round(y1_ - ny_, 3)], [round(x0_ - nx_, 3), round(y0_ - ny_, 3)]]))


for y in rows: piece(cx0, y, cx1, y)
for (ya, yb), xs in zip(bands, band_peaks):
    halves = [x for x in xs if min(abs(x - mx) for mx in main) > 1.0]           # (the half steps found in this band)
    r0, r1 = sorted((int((Y1 - ya) * PX), int((Y1 - yb) * PX)))
    keep = []
    for x in main:
        c = int((x - X0) * PX); seen_ = m[r0:r1, max(0, c - 3):c + 4].mean() if r1 > r0 else 0
        # (a main joint the frame shows clearly but no peak there: the HQ's slab runs on over it; where the frame cannot see, the pitch)
        if any(abs(x - q) < 0.6 for q in xs) or seen_ < 0.4: keep.append(x)
    for x in keep + halves: piece(x, ya, x, yb)
json.dump(out, open('art/canal_court/tiles.json', 'w'))
vis = fl.copy()
for t in out: cv2.fillPoly(vis, [to_px(t['pts'])], (0, 0, 255))
cv2.imwrite('art/canal_court/output/tiles_check.png', vis)
print(len(rows), 'rows at %.2f;' % pitch_y, len(main), 'columns at %.2f, phase %.2f;' % (PITCH_X, phase), len(out), 'pieces')
