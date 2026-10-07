"""Measure tree canopies: orange blobs in the rectified plans -> hex-tile cells (the canopies are visibly hex-tiled).
 Output cell centres in WORLD plan coordinates (not height-corrected; the builder applies the ray correction for the canopy height).
 python extract_trees.py <planA.png> <planB.png> <out.json>"""
import sys, json, math, cv2, numpy as np
PLANS = [(sys.argv[1], 500.0, -1.0, 2.0), (sys.argv[2], 500.0, -0.6, 1.3)]
HEX_R_PX = 5.2        # hex circumradius in plan px (1.04 BU), measured on the canopy crops
ORANGE = np.array([243, 151, 93], np.float32)
def lab_of(rgb): return cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32)
trees = []
for path, S, X0, Y1 in PLANS:
    pl = cv2.imread(path); raw = (pl.sum(2) > 0).astype(np.uint8); valid = cv2.erode(raw, np.ones((15, 15), np.uint8)) > 0; edge = cv2.dilate(1 - raw, np.ones((11, 11), np.uint8)) > 0
    lab = cv2.cvtColor(cv2.GaussianBlur(pl, (0, 0), 1.0), cv2.COLOR_BGR2LAB).astype(np.float32)
    m = ((np.linalg.norm(lab - lab_of(ORANGE), axis=2) < 24) & valid).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lb, st, cen = cv2.connectedComponentsWithStats(m)
    for k in range(1, n):
        if st[k, 4] < 350: continue
        x0, y0, w, h = st[k, :4]; sub = (lb == k)
        if (sub & edge).any(): continue      # silhouette cut by the edge of the covered area: not a real outline
        cells = []; dx, dy = 1.5 * HEX_R_PX, math.sqrt(3) * HEX_R_PX
        for i in range(-2, int(w / dx) + 3):
            for j in range(-2, int(h / dy) + 3):
                cx = x0 + i * dx; cy = y0 + j * dy + (dy / 2 if i % 2 else 0)
                if 0 <= int(cy) < sub.shape[0] and 0 <= int(cx) < sub.shape[1]:
                    r = int(HEX_R_PX * 0.8); patch = sub[max(0, int(cy) - r):int(cy) + r + 1, max(0, int(cx) - r):int(cx) + r + 1]
                    if patch.size and patch.mean() > 0.45: cells.append([round(cx / S + X0, 4), round(Y1 - cy / S, 4)])
        if len(cells) < 2: continue
        cs_, _ = cv2.findContours(sub.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); big = max(cs_, key=cv2.contourArea)
        outline = [[round(p[0] / S + X0, 4), round(Y1 - p[1] / S, 4)] for p in cv2.approxPolyDP(big, 0.9, True).reshape(-1, 2)]
        c = [round(cen[k][0] / S + X0, 4), round(Y1 - cen[k][1] / S, 4)]
        col = pl[sub].mean(0)[::-1].round().astype(int).tolist()
        if all(math.dist(c, t['centre']) > 0.08 for t in trees): trees.append(dict(centre=c, outline=outline, cells=cells, rgb=col, area_px=int(st[k, 4]), plan=path))
json.dump(trees, open(sys.argv[3], 'w')); print(len(trees), [(t['centre'], len(t['cells'])) for t in trees])
