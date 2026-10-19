"""Pass 2: per frame, the foreground blobs in environ2 px (1280x720)."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import cv2, numpy as np, pickle
S = OUT
frames = pickle.load(open(S + 'frames.pkl', 'rb'))
bg0 = cv2.GaussianBlur(cv2.imread(S + 'bg.png'), (3, 3), 0)
# edge-tolerant: a pixel is foreground only outside the background's range over a 7x7 neighbourhood (registration jitter)
k7 = np.ones((7, 7), np.uint8)
lo = cv2.erode(bg0, k7).astype(np.int16); hi = cv2.dilate(bg0, k7).astype(np.int16)
hud = np.full((720, 1280), 255, np.uint8); hud[0:150, 0:170] = 0
c = cv2.VideoCapture('foomerang - fu physics.mp4')
c.set(cv2.CAP_PROP_POS_FRAMES, int(round(frames[0][0] * c.get(cv2.CAP_PROP_FPS))))
out = []
k3 = np.ones((3, 3), np.uint8)
for i, (t, H, _) in enumerate(frames):
    ok, f = c.read()
    f2 = cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC)
    w = cv2.GaussianBlur(cv2.warpPerspective(f2, H, (1280, 720)), (3, 3), 0).astype(np.int16)
    valid = cv2.erode((cv2.warpPerspective(hud, H, (1280, 720)) > 0).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    d = np.maximum(lo - w, w - hi).max(2)
    m = ((d > 30) & valid).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k3)
    m = cv2.dilate(m, k3)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    blobs = []
    for j in range(1, n):
        x, y, bw, bh, area = st[j]
        if area < 12: continue
        col = cv2.mean(w.astype(np.uint8), (lab == j).astype(np.uint8))[:3]
        blobs.append(dict(cx=float(cen[j][0]), cy=float(cen[j][1]), x=int(x), y=int(y), w=int(bw), h=int(bh), area=int(area), bgr=[round(v) for v in col]))
    out.append((t, blobs))
    if i in (0, 150, 450, 800):
        vis = w.astype(np.uint8).copy()
        for b in blobs: cv2.rectangle(vis, (b['x'], b['y']), (b['x'] + b['w'], b['y'] + b['h']), (0, 0, 255), 1)
        cv2.imwrite(S + f'blobs_{i}.png', vis)
pickle.dump(out, open(S + 'blobs.pkl', 'wb'))
print('frames', len(out), 'median blobs/frame', np.median([len(b) for _, b in out]))
