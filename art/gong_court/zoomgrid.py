"""A crop of the round's mosaic (or the tone map: `tones`) at 2x with a 20 px grid labelled in mosaic pixels, for reading corners by hand.
  python art/gong_court/zoomgrid.py x0 y0 x1 y1 out.png [tones] [scale]      (the Python of art/audio/output/venv)"""
import sys
import numpy as np, cv2
x0, y0, x1, y1 = map(int, sys.argv[1:5]); out = sys.argv[5]; tones = 'tones' in sys.argv[6:]
S = float(next((a for a in sys.argv[6:] if a.replace('.', '').isdigit()), 2))
M = cv2.imread('art/gong_court/output/mosaic.png')
if tones:
    h = cv2.cvtColor(M, cv2.COLOR_BGR2HSV).astype(int)
    st = (h[..., 0] >= 108) & (h[..., 0] <= 140) & (h[..., 1] > 40) & (h[..., 2] > 60)
    M = M.copy(); M[st & (h[..., 2] >= 205)] = (255, 255, 255)
c = cv2.resize(M[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_NEAREST)
for x in range((x0 + 19) // 20 * 20, x1, 20):
    X = int((x - x0) * S); cv2.line(c, (X, 0), (X, c.shape[0]), (0, 0, 255) if x % 100 == 0 else (0, 140, 255), 1)
    if x % 100 == 0: cv2.putText(c, str(x), (X + 2, 14), 0, 0.45, (0, 0, 200), 2)
for y in range((y0 + 19) // 20 * 20, y1, 20):
    Y = int((y - y0) * S); cv2.line(c, (0, Y), (c.shape[1], Y), (0, 0, 255) if y % 100 == 0 else (0, 140, 255), 1)
    if y % 100 == 0: cv2.putText(c, str(y), (2, Y - 3), 0, 0.45, (0, 0, 200), 2)
cv2.imwrite(out, c)
