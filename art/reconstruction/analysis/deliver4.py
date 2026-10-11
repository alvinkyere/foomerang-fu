"""Pass-4 deliverables. python deliver4.py <frames> <p1> <p2> <p3> <p4> <out>
 before_after (REF|P1|P2|P3|P4 crops), char_motion strip (consecutive frames, ref over recon), burst_sequence (every 2nd frame f326-f368), stall + fountain close comparisons,
 playback_sheets (the side-by-side clip sampled every 3rd frame = 10 fps cadence, for reading motion)."""
import sys, os, cv2, numpy as np, json
ref, p1, p2, p3, p4, out = sys.argv[1:7]; os.makedirs(out, exist_ok=True)
def lab(im, t): im = im.copy(); cv2.putText(im, t, (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 3, cv2.LINE_AA); cv2.putText(im, t, (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1, cv2.LINE_AA); return im
def crop(d, f, b, z): x0, y0, x1, y1 = b; return cv2.resize(cv2.imread(f'{d}/f{f:04d}.png')[y0:y1, x0:x1], ((x1 - x0) * z, (y1 - y0) * z), interpolation=cv2.INTER_CUBIC)
PAN = {'stalls': (233, (70, 125, 215, 235), 3), 'fountain': (233, (235, 120, 405, 250), 3), 'trees': (264, (360, 215, 520, 330), 3), 'characters': (300, (280, 150, 440, 330), 3),
       'burst': (345, (215, 195, 345, 300), 4), 'ring': (228, (440, 190, 560, 290), 4), 'teal': (312, (195, 105, 265, 180), 6), 'lighting': (233, (0, 0, 640, 360), 1)}
os.makedirs(f'{out}/before_after', exist_ok=True)
for n, (f, b, z) in PAN.items():
    t = [lab(crop(d, f, b, z), f'{nm} f{f}') for d, nm in ((ref, 'REF'), (p1, 'P1'), (p2, 'P2'), (p3, 'P3'), (p4, 'P4'))]
    if t[0].shape[1] > 300: img = np.vstack([np.hstack(t[:3]), np.hstack(t[3:] + [np.zeros_like(t[0])])])
    else: img = np.hstack(t)
    cv2.imwrite(f'{out}/before_after/{n}.png', img)
# stall / fountain close comparisons across frames
rows = [np.hstack([lab(crop(d, f, (70, 125, 215, 235), 4), f'{nm} f{f}') for d, nm in ((ref, 'REF'), (p3, 'P3'), (p4, 'P4'))]) for f in (209, 233)]
rows.append(np.hstack([lab(crop(d, 312, (380, 160, 480, 285), 4), f'{nm} f312') for d, nm in ((ref, 'REF'), (p3, 'P3'), (p4, 'P4'))]))
w = max(r.shape[1] for r in rows); cv2.imwrite(f'{out}/stall_close.png', np.vstack([cv2.copyMakeBorder(r, 0, 0, 0, w - r.shape[1], cv2.BORDER_CONSTANT) for r in rows]))
rows = [np.hstack([lab(crop(d, f, (235, 120, 405, 250), 3), f'{nm} f{f}') for d, nm in ((ref, 'REF'), (p3, 'P3'), (p4, 'P4'))]) for f in (233,)]
rows.append(np.hstack([lab(crop(d, 312, (60, 150, 250, 310), 2), f'{nm} f312') for d, nm in ((ref, 'REF'), (p3, 'P3'), (p4, 'P4'))]))
w = max(r.shape[1] for r in rows); cv2.imwrite(f'{out}/fountain_close.png', np.vstack([cv2.copyMakeBorder(r, 0, 0, 0, w - r.shape[1], cv2.BORDER_CONSTANT) for r in rows]))
# character motion strips: ref over P4, consecutive frames
HERE = os.path.dirname(os.path.abspath(__file__)); T = {'A': json.load(open(HERE + '/tracks_takeA.json')), 'B': json.load(open(HERE + '/tracks_takeB.json'))}
def tile(d, name, f, take='B', h=15, z=5):
    x, y = T[take][name][str(f)]; im = cv2.imread(f'{d}/f{f:04d}.png'); x0 = int(round(x)) - h; y0 = int(round(y)) - h; c = np.zeros((2 * h, 2 * h, 3), np.uint8); xs0 = max(0, x0); ys0 = max(0, y0); sub = im[ys0:y0 + 2 * h, xs0:x0 + 2 * h]
    c[ys0 - y0:ys0 - y0 + sub.shape[0], xs0 - x0:xs0 - x0 + sub.shape[1]] = sub; c = cv2.resize(c, None, fx=z, fy=z, interpolation=cv2.INTER_CUBIC); return lab(c, str(f))
rows = []
for name in ('bread', 'teal', 'watermelon'):
    for d in (ref, p4): rows.append(np.hstack([tile(d, name, f) for f in range(284, 300, 2)]))
cv2.imwrite(f'{out}/character_motion_strip.png', np.vstack(rows))
# complete burst sequence
tiles = []
for f in range(326, 369, 2):
    r = cv2.imread(f'{ref}/f{f:04d}.png')[195:305, 230:340]; c = cv2.imread(f'{p4}/f{f:04d}.png')[195:305, 230:340]
    tiles.append(np.vstack([lab(cv2.resize(r, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), f'REF {f}'), lab(cv2.resize(c, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), 'P4')]))
cv2.imwrite(f'{out}/death_burst_sequence.png', np.vstack([np.hstack(tiles[:8]), np.hstack(tiles[8:16]), np.hstack(tiles[16:] + [np.zeros_like(tiles[0])] * (8 - len(tiles[16:])))]))
print('deliver4 done')
