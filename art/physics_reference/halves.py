"""The donut cut in two at 1:03 (stabilised by stab.py as `donut`): the pink half's slide, in donut widths."""
import pickle, cv2, numpy as np
OUT = 'art/physics_reference/output/'
a = np.load(OUT + 'donut.npy'); idx = pickle.load(open(OUT + 'donut_idx.pkl', 'rb'))
X0, Y0, X1, Y1 = 440, 80, 760, 300
def pink(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return ((hsv[..., 0] > 150) & (hsv[..., 1] > 90) & (hsv[..., 2] > 150)).astype(np.uint8)
# the donut's own width before the hit: the yardstick
m0 = pink(a[0][Y0:Y1, X0:X1]); n, lab, st, cen = cv2.connectedComponentsWithStats(m0)
k = 1 + int(np.argmax(st[1:, 4])); W = float(st[k, 2])
print('donut width before the hit: %.0f px (= 1 donut)' % W)
t0 = idx[0][1]; prev = None
for f in range(0, len(a)):
    m = pink(a[f][Y0:Y1, X0:X1])
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    if n <= 1: continue
    k = 1 + int(np.argmax(st[1:, 4]))
    p = cen[k]; small = int(((st[1:, 4] >= 4) & (np.arange(1, n) != k)).sum())
    if f % 3 == 0:
        print(f'{f:2d} +{idx[f][1] - t0:4.2f}s  half at ({p[0] / W:5.2f}, {p[1] / W:5.2f}) donuts  area {st[k, 4]:4d}px  bits {small:2d}')
