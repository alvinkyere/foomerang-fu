"""The autumn glade's sand shading (2026-11-01), fitted to output/reference.png (ff physics hq 2.mp4 626.0 s): the ground is one sand colour
with soft darker patches in the lower half and pale yellow light shafts down from the top. The sand pixels (everything that is not an
object, text or a character) are inpainted across the objects, blurred, quantised in Lab into LEVELS colours, and each level's regions
traced, simplified and unprojected to plan units: our own flat polygons, painted largest first. Adds 'sand' to layout.json.

  python art/autumn_glade/sand.py       (after props.py; from the repository root; the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/autumn_glade')
from measure import plan

LEVELS = 7
f = cv2.imread('art/autumn_glade/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
sand = (h[..., 0] >= 15) & (h[..., 0] <= 34) & (h[..., 1] >= 30) & (h[..., 1] <= 150) & (h[..., 2] >= 200)
sand[:, :215] = False
sand = cv2.erode(sand.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
hole = cv2.dilate((~sand).astype(np.uint8), np.ones((9, 9), np.uint8))
filled = cv2.inpaint(f, hole * 255, 12, cv2.INPAINT_TELEA)
smooth = cv2.medianBlur(cv2.GaussianBlur(filled, (0, 0), 6), 15)
lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
roi = np.zeros(sand.shape, bool); roi[:, 215:] = True
X = lab[roi]
_, l, c = cv2.kmeans(X, LEVELS, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2), 3, cv2.KMEANS_PP_CENTERS)
lab_img = np.zeros(sand.shape, np.uint8); lab_img[roi] = l[:, 0]
lab_img = cv2.medianBlur(lab_img, 9)
rgb = lambda v: '#%02x%02x%02x' % tuple(int(x) for x in cv2.cvtColor(np.uint8([[v]]), cv2.COLOR_LAB2BGR)[0, 0][::-1])
cnt = np.bincount(lab_img[roi], minlength=LEVELS)
base = int(np.argmax(cnt))
layers = []
for i in np.argsort(-cnt):
    if i == base: continue
    m = ((lab_img == i) & roi).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for k_ in cs:
        if cv2.contourArea(k_) < 2500: continue
        k_ = cv2.approxPolyDP(k_, 4, True)[:, 0, :]
        if len(k_) >= 3: polys.append([[round(float(v), 2) for v in p] for p in plan(k_)])
    layers.append(dict(colour=rgb(c[i]), share=round(float(cnt[i] / cnt.sum()), 3), polygons=polys))
L = json.load(open('art/autumn_glade/layout.json'))
L['sand'] = dict(base=rgb(c[base]), layers=layers)
json.dump(L, open('art/autumn_glade/layout.json', 'w'), indent=1)
print('base', L['sand']['base'], [(l_['colour'], l_['share'], len(l_['polygons'])) for l_ in layers])
vis = cv2.cvtColor(np.uint8([[x] for x in c]).reshape(-1, 1, 3), cv2.COLOR_LAB2BGR)[:, 0, :]
cv2.imwrite('art/autumn_glade/output/sand_levels.jpg', cv2.resize(vis[lab_img], (960, 540)))
