"""OpenCV's decode of the HQ video -> the video as Chrome shows it (colour.json: colour_fit.py's affine fit, mean error 1.2 of 255)."""
import json, os
import numpy as np
_C = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'colour.json')))
M, B = np.array(_C['M']), np.array(_C['b'])


def chrome(img_bgr):
    rgb = img_bgr[..., ::-1].astype(float)
    return np.clip(rgb @ M.T + B, 0, 255)[..., ::-1].round().astype(np.uint8)
