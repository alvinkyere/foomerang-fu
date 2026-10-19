"""Registered frames (environ2 px) cropped to a fixed window with a 50 px grid, for measuring by eye."""
import os
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
os.makedirs(OUT, exist_ok=True)
import cv2, numpy as np, pickle, sys
S = OUT
frames = pickle.load(open(S + 'frames.pkl', 'rb'))
x0, y0, x1, y1 = (int(v) for v in sys.argv[1].split(','))
ids = [int(v) for v in sys.argv[2].split(',')]
out = sys.argv[3]; zoom = float(sys.argv[4]) if len(sys.argv) > 4 else 1.5
c = cv2.VideoCapture('foomerang - fu physics.mp4'); fps = c.get(cv2.CAP_PROP_FPS)
tiles = []
for i in ids:
    t, H, _ = frames[i]
    c.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, f = c.read()
    w = cv2.warpPerspective(cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC), H, (1280, 720))[y0:y1, x0:x1].copy()
    for gx in range((x0 // 50 + 1) * 50, x1, 50): cv2.line(w, (gx - x0, 0), (gx - x0, y1 - y0), (120, 120, 120), 1)
    for gy in range((y0 // 50 + 1) * 50, y1, 50): cv2.line(w, (0, gy - y0), (x1 - x0, gy - y0), (120, 120, 120), 1)
    w = cv2.resize(w, None, fx=zoom, fy=zoom, interpolation=cv2.INTER_NEAREST)
    cv2.putText(w, str(i), (4, 16), 0, 0.55, (0, 0, 255), 2); tiles.append(w)
cols = 4
while len(tiles) % cols: tiles.append(np.full_like(tiles[0], 255))
cv2.imwrite(S + out, np.vstack([np.hstack(tiles[k:k + cols]) for k in range(0, len(tiles), cols)]))
