"""The players' names over the frame's top-left (ff physics hq 2.mp4 1202.0 s): their letters (red and blue) and the letters' drop shadow,
widened 6 px, as a mask of what the frame does not show (output/hud_hidden.npy); between the letters the frame is seen as it is.

  python art/hex_meadow/hud_mask.py       (from the repository root; the Python of art/audio/output/venv)
"""
import numpy as np, cv2
f = cv2.imread('art/hex_meadow/output/reference_fill.png'); h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
H, S, V = h[..., 0], h[..., 1], h[..., 2]
letters = (((H <= 8) | (H >= 168)) & (S > 100) & (V > 150)) | ((H >= 98) & (H <= 114) & (S > 110) & (V > 190))
box = np.zeros(H.shape, bool); box[95:375, :215] = True
m = (letters & box).astype(np.uint8)
m = cv2.dilate(m, np.ones((5, 5), np.uint8))
m = m | np.roll(np.roll(m, 4, 0), 4, 1)                       # (their drop shadow, down and right)
m = cv2.dilate(m, np.ones((7, 7), np.uint8)) > 0
np.save('art/hex_meadow/output/hud_hidden.npy', m & box)
print(int((m & box).sum()), 'px hidden of', int(box.sum()))
