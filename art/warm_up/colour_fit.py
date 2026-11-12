"""The HQ video as a browser shows it against OpenCV's decode (the warm-up's frame 0.0 s): an affine fit chrome = M @ opencv + b over every
pixel, so the mosaic (OpenCV) can be shown in the browser's colours. Writes colour.json.

  python art/warm_up/colour_fit.py      (after videoshot.mjs 0.0; the Python of art/audio/output/venv)
"""
import json
import numpy as np, cv2
a = cv2.imread('art/warm_up/output/chrome_0.png').astype(float)[..., ::-1].reshape(-1, 3)
b = cv2.imread('art/warm_up/output/f000.png').astype(float)[..., ::-1].reshape(-1, 3)
X = np.c_[b, np.ones(len(b))]
W, *_ = np.linalg.lstsq(X, a, rcond=None)
err = np.abs(X @ W - a)
print('mean error %.2f, p95 %.2f' % (err.mean(), np.percentile(err, 95)))
json.dump(dict(M=W[:3].T.round(5).tolist(), b=W[3].round(3).tolist()), open('art/warm_up/colour.json', 'w'), indent=1)


def to_chrome(img_bgr):
    rgb = img_bgr[..., ::-1].astype(float)
    out = rgb @ W[:3] + W[3]
    return np.clip(out, 0, 255)[..., ::-1].astype(np.uint8)
