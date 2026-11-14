"""The gong court's still view (2026-11-14): the HQ's camera holds still through READY (33.3-35.2 s: within a few px of the 35.0 s frame,
H.json), so the court is sharpest there; the round's mosaic (mosaic.py), a median of a moving camera's frames, smears whatever stands
tall (its parallax). Every frame of 34.0-35.25 s laid on the 35.0 s frame (ECC, translation) and their median taken; where the players,
the READY text and the names stand (MASKS, frame px), the mosaic. The result replaces the frame's part of the mosaic, in OpenCV's colours
(output/mosaic.png) and in Chrome's (output/mosaic_chrome.png), so every step measures the still view; the round's own mosaic is kept as
output/mosaic_round.png and mosaic_round_chrome.png (re-run this after mosaic.py).

  python art/gong_court/still.py      (after mosaic.py; the Python of art/audio/output/venv)
"""
import json, os, shutil, sys
import numpy as np, cv2
sys.path.insert(0, 'art/warm_up'); from chrome import chrome

O = 'art/gong_court/output/'
FPS = 59.999381405241095
MASKS = {'mug': (540, 190, 640, 290), 'banana': (1290, 190, 1380, 300), 'eggplant': (490, 760, 600, 850), 'donut': (1205, 735, 1320, 830),
         'ready': (730, 460, 1190, 610), 'names': (0, 40, 230, 390)}
if not os.path.exists(O + 'mosaic_round.png'): shutil.copyfile(O + 'mosaic.png', O + 'mosaic_round.png')
M = cv2.imread(O + 'mosaic_round.png'); ox, oy = json.load(open(O + 'mosaic.json'))['origin']
c = cv2.VideoCapture('foomerang-fu physics hq.mp4'); c.set(cv2.CAP_PROP_POS_FRAMES, round(35.0 * FPS)); ref = c.read()[1]
g0 = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32)
keep = np.full(g0.shape, 255, np.uint8)
for x0, y0, x1, y1 in MASKS.values(): keep[max(0, y0 - 20):y1 + 20, max(0, x0 - 20):x1 + 20] = 0
c.set(cv2.CAP_PROP_POS_FRAMES, round(34.0 * FPS)); st = []
for _ in range(round(1.25 * FPS)):
    ok, f = c.read()
    if not ok: break
    w = np.eye(2, 3, dtype=np.float32)
    try: _, w = cv2.findTransformECC(g0, cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32), w, cv2.MOTION_TRANSLATION,
                                     (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 1e-4), keep, 5)
    except cv2.error: pass
    st.append(cv2.warpAffine(f, w, (1920, 1080), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP))
still = np.median(np.stack(st), 0).astype(np.uint8)
mask = np.zeros(g0.shape, np.uint8)
for x0, y0, x1, y1 in MASKS.values(): mask[y0:y1, x0:x1] = 1
mask = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 3)[..., None]
part = M[-oy:-oy + 1080, -ox:-ox + 1920].astype(np.float32)
still = (still * (1 - mask) + part * mask).astype(np.uint8)
out = M.copy(); out[-oy:-oy + 1080, -ox:-ox + 1920] = still
cv2.imwrite(O + 'mosaic.png', out); cv2.imwrite(O + 'mosaic_chrome.png', chrome(out))
cv2.imwrite(O + 'mosaic_round_chrome.png', chrome(M)); cv2.imwrite(O + 'still_chrome.png', chrome(still))
d = np.abs(still.astype(int) - part.astype(int)).max(2)
print(len(st), 'frames; still vs the round mosaic inside the frame: mean |d| %.2f, %.1f%% over 30' % (d.mean(), 100 * (d > 30).mean()))
