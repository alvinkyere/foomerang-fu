"""Fits the conversion in colour.py: the HQ video as OpenCV decodes it -> as Chrome shows it (2026-10-29).

  node <scratch>/videoshot.mjs   (loads foomerang-fu physics hq.mp4 in Chrome, seeks to 267.0 s, screenshots the video element to
                                  chrome_frame.png: the integration package's Playwright; see art/pond_cross/videoshot.mjs)
  python art/pond_cross/colour_fit.py chrome_frame.png      (from the repository root)

A least-squares affine map RGB_shown = M * RGB_decoded + b over the pond's pixels (edges skipped), written to colour.json.
"""
import sys, json
import numpy as np, cv2

c = cv2.imread(sys.argv[1])
cap = cv2.VideoCapture('foomerang-fu physics hq.mp4'); fps = cap.get(5); cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(267.0 * fps))); o = cap.read()[1]
c = cv2.resize(c, (o.shape[1], o.shape[0]), interpolation=cv2.INTER_AREA)
m = np.zeros(o.shape[:2], bool); m[40:1040, 260:1880] = True
m &= cv2.erode(cv2.Canny(cv2.cvtColor(o, cv2.COLOR_BGR2GRAY), 50, 150), np.ones((9, 9), np.uint8)) == 0
X = o[m][:, ::-1].astype(np.float64); Y = c[m][:, ::-1].astype(np.float64)
sol = np.linalg.lstsq(np.c_[X, np.ones(len(X))], Y, rcond=None)[0]
M, b = sol[:3].T, sol[3]
print('mean abs error after the fit', np.abs(np.c_[X, np.ones(len(X))] @ sol - Y).mean(0).round(2), 'before', np.abs(X - Y).mean(0).round(2))
json.dump(dict(M=np.round(M, 5).tolist(), b=np.round(b, 3).tolist(), note='RGB (0-255) of the HQ video as OpenCV decodes it -> as Chrome shows it; fitted on 4:27 (267.0 s) of foomerang-fu physics hq.mp4'), open('art/pond_cross/colour.json', 'w'))
