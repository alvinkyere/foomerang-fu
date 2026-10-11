"""Merge per-shot layouts (same world frame). Ground classes are UNIONED geometrically (rasterise each layout's polygons on a common
 canvas, OR the masks, re-vectorise) so the result has no overlapping coplanar polygons (which black out under Cycles' shadow rays);
 objects are de-duplicated by position.   python merge_layouts.py <out.json> <layout1.json> <layout2.json> ..."""
import sys, json, math, cv2, numpy as np
L = [json.load(open(p)) for p in sys.argv[2:]]; out = json.loads(json.dumps(L[0]))
S, X0, X1, Y0, Y1 = 500.0, -1.3, 1.7, -0.5, 2.2; W, H = int((X1 - X0) * S), int((Y1 - Y0) * S)
def px(p): return np.array([[(x - X0) * S, (Y1 - y) * S] for x, y in p], np.int32)
def to_world(c): return [round(c[0] / S + X0, 5), round(Y1 - c[1] / S, 5)]
for cls in out['classes']:
    union = np.zeros((H, W), np.uint8)
    for lay in L:
        m = np.zeros((H, W), np.uint8); polys = lay['classes'].get(cls, [])
        for p in polys:
            if not p['hole']: cv2.fillPoly(m, [px(p['pts'])], 255)
        for p in polys:
            if p['hole']: cv2.fillPoly(m, [px(p['pts'])], 0)
        union |= m
    union = cv2.morphologyEx(union, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, hier = cv2.findContours(union, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE); res = []
    if hier is not None:
        for i, c in enumerate(cs):
            if cv2.contourArea(c) < 30: continue
            ap = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2)
            if len(ap) >= 3: res.append(dict(hole=bool(hier[0][i][3] >= 0), pts=[to_world(q) for q in ap]))
    out['classes'][cls] = res
for other in L[1:]:
    for kind in ('pavilions', 'trees'):
        for o in other['objects'].get(kind, []):
            if all(math.dist(o['centre'], q['centre']) > 0.06 for q in out['objects'][kind]): out['objects'][kind].append(o)
json.dump(out, open(sys.argv[1], 'w')); print({k: len(v) for k, v in out['objects'].items() if isinstance(v, list)}, {k: len(v) for k, v in out['classes'].items()})
