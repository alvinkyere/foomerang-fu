"""The any-shape inset of fit_stones.py, importable on its own."""
import numpy as np, cv2


def inset(poly, d):
    """Any polygon moved in by d: drawn at 40 px a unit, eroded by d, traced back (the largest piece)."""
    P = np.float32(poly); x0, y0 = P.min(0) - 1 - max(0, -d); PXU = 40
    img = np.zeros((int((P[:, 1].max() - y0 + 1 + max(0, -d)) * PXU), int((P[:, 0].max() - x0 + 1 + max(0, -d)) * PXU)), np.uint8)
    cv2.fillPoly(img, [np.int32((P - [x0, y0]) * PXU)], 1)
    k = int(round(2 * abs(d) * PXU)) | 1; se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    img = cv2.erode(img, se) if d > 0 else cv2.dilate(img, se)
    cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs: return None
    ap = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 0.03 * PXU, True).reshape(-1, 2)
    return [[round(float(u / PXU + x0), 3), round(float(v / PXU + y0), 3)] for u, v in ap]


