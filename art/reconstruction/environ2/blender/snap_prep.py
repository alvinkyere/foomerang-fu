"""Outline cones for snapping a model to its painted outline: the outline of the object's own cut-out together with the cut-outs of
everything painted IN FRONT of it (nearer ground contact, which may legitimately hide it), traced in raster coordinates.
python snap_prep.py <masks_dir> <layers.json> <out.json> <own key> ...  -> {"cone": [polygons], "own": [polygons]}"""
import sys, json
import numpy as np
import outlines as ol

MASKS, LAYERS, OUT = sys.argv[1:4]
own_keys = sys.argv[4:]
depth = {o['key']: o['depth'] for o in json.load(open(LAYERS))['occluders']}
own = np.zeros((720, 1280), bool)
for k in own_keys:
    own |= np.load(f'{MASKS}/mask_{k}.npy') > 0
front = np.zeros_like(own)
d_own = max(depth[k] for k in own_keys)
for k, d in depth.items():
    if k not in own_keys and d > d_own:
        front |= np.load(f'{MASKS}/mask_{k}.npy') > 0
cone = ol.outline(own | front, min_area=4)
json.dump(dict(cone=[p.tolist() for p in cone], own=[p.tolist() for p in ol.outline(own, min_area=4)]), open(OUT, 'w'))
print('cone polygons', len(cone), 'own outline coverage', round(ol.coverage(ol.outline(own, 4), own), 4))
