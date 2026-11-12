"""The render (or a game shot) against the HQ: the READY frame as Chrome shows it (output/chrome_0.png) and the round's mosaic (players,
pens and READY gone), with the names masked. Prints the mean and median Lab difference and the share of pixels over 10; writes
output/cmp.jpg (render | frame | mosaic) and output/heat.png.

  python art/warm_up/compare.py <render.png>      (the Python of art/audio/output/venv)
"""
import sys
import numpy as np, cv2
r = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080))
f = cv2.imread('art/warm_up/output/chrome_0.png'); m = cv2.imread('art/warm_up/output/mosaic_chrome.png')[80:1160, 120:2040]
mask = np.ones((1080, 1920), bool); mask[60:300, 0:210] = False
for name, ref in (('frame', f), ('mosaic', m)):
    d = np.abs(cv2.cvtColor(r, cv2.COLOR_BGR2Lab).astype(float) - cv2.cvtColor(ref, cv2.COLOR_BGR2Lab).astype(float)).sum(2)
    ok = mask & (ref.sum(2) > 30)
    print('%-6s mean dLab %.2f median %.2f, over 10: %.1f%%' % (name, d[ok].mean(), np.median(d[ok]), 100 * (d[ok] > 10).mean()))
    if name == 'mosaic': cv2.imwrite('art/warm_up/output/heat.png', np.clip(d * 4, 0, 255).astype(np.uint8))
cv2.imwrite('art/warm_up/output/cmp.jpg', np.vstack([cv2.resize(r, (960, 540)), cv2.resize(f, (960, 540)), cv2.resize(m, (960, 540))]))
