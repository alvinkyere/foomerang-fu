"""Extract the courtyard layout in WORLD coordinates (units = reference camera height) from the median plan view:
 ground-class outlines (vectorised, simplified), plus fountain / pavilion / tree measurements.
 python extract_layout.py <plan_median.png> <out.json>     plan: 500 px/unit, X0=-0.6, Y1=1.3 (see plan builder)"""
import sys, json, cv2, numpy as np
S, X0, Y1 = (float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])) if len(sys.argv) > 5 else (500.0, -0.6, 1.3)
pl = cv2.imread(sys.argv[1]); valid = pl.sum(2) > 0
def W(x, y): return [round((x / S) + X0, 5), round(Y1 - (y / S), 5)]
# trim the ragged edge of the covered area
valid = cv2.erode(valid.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
lab = cv2.cvtColor(cv2.GaussianBlur(pl, (0, 0), 1.2), cv2.COLOR_BGR2LAB)
PAL = {  # measured k-means centres (sRGB)
    'pavement': (242, 237, 197), 'sand': (242, 215, 127), 'sand_shade': (228, 193, 118), 'path_edge': (217, 207, 173), 'tree_shadow': (182, 161, 115),
    'roof_red': (203, 100, 86), 'tree_orange': (226, 159, 93), 'stone_light': (161, 130, 118), 'stone_dark': (120, 94, 101), 'water': (108, 191, 221)}
cent = {k: cv2.cvtColor(np.uint8([[v[::-1]]]), cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32) for k, v in PAL.items()}
names = list(PAL); C = np.array([cent[n] for n in names])
d = np.linalg.norm(lab.astype(np.float32)[:, :, None, :] - C[None, None], axis=3); cls = d.argmin(2); cls[~valid] = -1
out = {'palette': PAL, 'plan': dict(S=S, X0=X0, Y1=Y1), 'classes': {}, 'objects': {}}
def polys(mask, eps, min_area):
    mask = cv2.morphologyEx(mask.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE); res = []
    if hier is None: return res
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < min_area: continue
        ap = cv2.approxPolyDP(c, eps, True).reshape(-1, 2); res.append(dict(hole=bool(hier[0][i][3] >= 0), pts=[W(*p) for p in ap]))
    return res
for n in ('pavement', 'sand', 'sand_shade', 'path_edge', 'tree_shadow', 'stone_light', 'stone_dark'):
    i = names.index(n); out['classes'][n] = polys(cls == i, 1.6, 30)
# objects
def blobs(n, min_area):
    i = names.index(n); m = ((cls == i).astype(np.uint8)) * 255; m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); return [c for c in cs if cv2.contourArea(c) > min_area]
out['objects']['pavilions'] = []
for c in blobs('roof_red', 350):
    (cx, cy), (w, h), ang = cv2.minAreaRect(c); out['objects']['pavilions'].append(dict(centre=W(cx, cy), size_units=[round(w / S, 4), round(h / S, 4)], angle_deg=round(ang, 1), area_px=int(cv2.contourArea(c))))
out['objects']['trees'] = []
for c in blobs('tree_orange', 250):
    (cx, cy), r = cv2.minEnclosingCircle(c); out['objects']['trees'].append(dict(centre=W(cx, cy), radius_units=round(r / S, 4), area_px=int(cv2.contourArea(c))))
wc = max(blobs('water', 800), key=cv2.contourArea); (fx, fy), (fa, fb), fang = cv2.fitEllipse(wc)
out['objects']['fountain'] = dict(centre=W(fx, fy), water_radius_units=round((fa + fb) / 4 / S, 4), aspect=round(min(fa, fb) / max(fa, fb), 3))
json.dump(out, open(sys.argv[2], 'w'))
print('fountain', out['objects']['fountain']); print('pavilions', len(out['objects']['pavilions']), [ (p['centre'], p['size_units'], p['angle_deg']) for p in out['objects']['pavilions']]); print('trees', len(out['objects']['trees']))
print({k: len(v) for k, v in out['classes'].items()})
