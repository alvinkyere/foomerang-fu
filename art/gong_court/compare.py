"""The render (or a game shot) against the HQ: the READY frame as Chrome shows it (output/chrome_35000.png) and the round's mosaic
(players and READY gone; Chrome's colours), the names masked. Prints the mean and median Lab difference (CIE76, L 0-100) and the share
of pixels over 10; writes output/cmp.jpg (render | frame | mosaic) and output/heat.png (the difference against the mosaic, x6).

  python art/gong_court/compare.py <render.png>      (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
r = cv2.resize(cv2.imread(sys.argv[1]), (1920, 1080))
ox, oy = json.load(open('art/gong_court/output/mosaic.json'))['origin']
f = cv2.imread('art/gong_court/output/chrome_35000.png'); m = cv2.imread('art/gong_court/output/mosaic_chrome.png')[-oy:-oy + 1080, -ox:-ox + 1920]
mask = np.ones((1080, 1920), bool); mask[60:330, 0:230] = False
lab = lambda im: cv2.cvtColor(im, cv2.COLOR_BGR2Lab).astype(float) * [100 / 255, 1, 1] - [0, 128, 128]
for name, ref in (('frame', f), ('mosaic', m)):
    d = np.linalg.norm(lab(r) - lab(ref), axis=2)
    ok = mask & (ref.sum(2) > 30)
    print('%-6s mean dLab %.2f median %.2f, over 10: %.1f%%' % (name, d[ok].mean(), np.median(d[ok]), 100 * (d[ok] > 10).mean()))
    if name == 'mosaic': cv2.imwrite('art/gong_court/output/heat.png', np.clip(d * 6, 0, 255).astype(np.uint8))
cv2.imwrite('art/gong_court/output/cmp.jpg', np.vstack([cv2.resize(r, (960, 540)), cv2.resize(f, (960, 540)), cv2.resize(m, (960, 540))]))
