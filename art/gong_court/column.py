"""Runs down one column of the mosaic: what each pixel is (T stone top tone, F stone face, M mint, g grass, . other), run-length coded.
  python art/gong_court/column.py x y0 y1 [x ...]"""
import sys
import numpy as np, cv2
M = cv2.imread('art/gong_court/output/mosaic.png'); h = cv2.cvtColor(M, cv2.COLOR_BGR2HSV).astype(int)
st = (h[..., 0] >= 108) & (h[..., 0] <= 140) & (h[..., 1] > 40) & (h[..., 2] > 60)
mint = (h[..., 0] >= 40) & (h[..., 0] <= 75) & (h[..., 1] >= 50) & (h[..., 2] >= 170)
grass = (h[..., 0] >= 25) & (h[..., 0] < 40) & (h[..., 2] >= 150)
a = sys.argv[1:]; y0, y1 = int(a[1]), int(a[2]); xs = [int(a[0])] + [int(v) for v in a[3:]]
for x in xs:
    s = ''.join('T' if st[y, x] and h[y, x, 2] >= 205 else 'F' if st[y, x] else 'M' if mint[y, x] else 'g' if grass[y, x] else '.' for y in range(y0, y1))
    runs, i = [], 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]: j += 1
        runs.append('%s%d@%d' % (s[i], j - i, y0 + i)); i = j
    print(x, ' '.join(runs))
