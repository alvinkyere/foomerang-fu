"""READY and GO as the HQ video draws them (9:05.66-9:07.32), traced into our own vector letters (2026-10-22).

The owner: the same READY / GO before every round as the HQ video, "centered, same font and same animation with the spark-ish
thing around the GO". The words are a heavy rounded sans, white with a dark outline and no shadow. Rather than guess a font
(and ship one), the letters are traced from the video: the median of the frames where each word stands still (READY
9:05.85-9:06.60, GO 9:07.12-9:07.32, after its sparks) is thresholded to its white fill, every outline (holes included) is
smoothed and written as one SVG path; the dark outline is drawn as a round-joined stroke under the fill, as thick as the
video's. Sizes are the video's at 1920 x 1080 (the SVG's units are its pixels, centred on the screen's middle).

  python art/physics_reference/ready_go.py        (from the repository root; needs the HQ video)
"""
import json, os
import numpy as np, cv2

VIDEO = 'foomerang-fu physics hq.mp4'
OUT = os.environ.get('READY_GO_OUT', 'apps/console/public/ui/')
WORDS = {'ready': (545.85, 546.60), 'go': (547.12, 547.32)}
CX, CY = 960, 540          # the words sit on the screen's middle
BOX = (CY - 150, CY + 150, CX - 330, CX + 330)   # rows, cols round it
UP = 4                     # traced at 4x, for smooth outlines

os.makedirs(OUT, exist_ok=True)
cap = cv2.VideoCapture(VIDEO); fps = cap.get(cv2.CAP_PROP_FPS)
summary = {}
for word, (t0, t1) in WORDS.items():
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(t0 * fps)); stack = []
    for _ in range(round(t0 * fps), round(t1 * fps)):
        ok, f = cap.read(); stack.append(f[BOX[0]:BOX[1], BOX[2]:BOX[3]])
    med = np.median(np.array(stack), axis=0).astype(np.uint8)
    big = cv2.resize(med, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    # the fill: white, inside the dark outline (the map behind is pale, but never this white and never ringed in dark)
    white = (big.min(2) > 228).astype(np.uint8)
    dark = (big.max(2) < 110).astype(np.uint8)
    near_dark = cv2.dilate(dark, np.ones((3 * UP, 3 * UP), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(white)
    edge = (white > 0) & (cv2.erode(white, np.ones((3, 3), np.uint8)) == 0)    # each blob's own edge
    ringed_share = np.bincount(lab[edge], weights=near_dark[edge], minlength=n) / np.maximum(np.bincount(lab[edge], minlength=n), 1)
    ok = (stats[:, 4] > 400 * UP * UP) & (ringed_share > 0.6); ok[0] = False   # a letter: big, and ringed in dark all round
    keep = ok[lab].astype(np.uint8)
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((3 * UP, 3 * UP), np.uint8))
    keep = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.2 * UP) > 0.5
    # colours, and the outline's thickness: how far the dark reaches beyond the fill
    fill = np.median(big[keep], axis=0)[::-1]
    dist = cv2.distanceTransform((~keep).astype(np.uint8), cv2.DIST_L2, 5)
    ring = (dist > 0) & (dist < 12 * UP) & (dark > 0)
    thick = float(np.percentile(dist[ring], 90)) / UP
    core = big[ring & (dist < 3 * UP)].astype(int)
    line = np.median(core[core.sum(1) <= np.percentile(core.sum(1), 25)], axis=0)[::-1]   # its darkest quarter: no green blended in
    # the outlines: every contour (outer and holes), smoothed, in screen px about the screen's middle
    contours, _ = cv2.findContours(keep.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d = []
    for c in contours:
        c = c[:, 0, :].astype(np.float32)
        if len(c) < 20: continue
        k = 2 * UP + 1                                   # a circular moving average: smooth, corners still rounded
        pad = np.concatenate([c[-k:], c, c[:k]])
        sm = np.stack([np.convolve(pad[:, j], np.ones(k) / k, mode='same')[k:-k] for j in (0, 1)], 1)
        sm = cv2.approxPolyDP(sm.reshape(-1, 1, 2).astype(np.float32), 0.25 * UP, True)[:, 0, :]
        pts = [((x / UP + BOX[2]) - CX, (y / UP + BOX[0]) - CY) for x, y in sm]
        d.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z')
    ys, xs = np.where(keep)
    x0, x1 = xs.min() / UP + BOX[2] - CX - thick, xs.max() / UP + BOX[2] - CX + thick
    y0, y1 = ys.min() / UP + BOX[0] - CY - thick, ys.max() / UP + BOX[0] - CY + thick
    hexc = lambda c: '#%02x%02x%02x' % tuple(int(round(v)) for v in c)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {x1 - x0:.1f} {y1 - y0:.1f}">'
           f'<path d="{" ".join(d)}" fill="{hexc(fill)}" fill-rule="evenodd" stroke="{hexc(line)}" '
           f'stroke-width="{2 * thick:.1f}" stroke-linejoin="round" paint-order="stroke"/></svg>\n')
    open(OUT + f'{word}.svg', 'w').write(svg)
    summary[word] = dict(box=[round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)], fill=hexc(fill),
                         outline=hexc(line), outlineWidth=round(thick, 1), contours=len(d))
print(json.dumps(summary, indent=1))
