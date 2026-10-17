"""The painted pixels a snapped model does not reach: outlines of (own cut-out minus the model's painted render alpha).
python snap_fill.py <paint.png> <out.json> <prefix> <mask.npy ...>"""
import sys, json, cv2, numpy as np
import outlines as ol
R = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
own = np.zeros(R.shape[:2], bool)
for f in sys.argv[4:]:
    own |= np.load(f) > 0
import glob, os
mine = R[..., 3] > 127
miss = own & ~mine
others = np.zeros_like(own)
for f in glob.glob(os.path.join(os.path.dirname(sys.argv[4]), 'mask_*.npy')):
    if f not in sys.argv[4:]:
        others |= np.load(f) > 0
leak = mine & ~own & ~others                  # model pixels on bare ground: carved away
polys = ol.outline(miss, min_area=1)
carve = ol.outline(leak, min_area=1)
json.dump(dict(prefix=sys.argv[3], polys=[p.tolist() for p in polys], carve=[p.tolist() for p in carve]), open(sys.argv[2], 'w'))
print('missing px', int(miss.sum()), 'fill polygons', len(polys), '| bare-ground px', int(leak.sum()), 'carve polygons', len(carve))
