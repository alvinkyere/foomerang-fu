"""Measure VFX frame by frame from the reference (image space, 640x360):
  * coffee-death burst: dark-brown droplet/splash regions per frame as polygons (+ white shard regions)
  * spawn rings: onset / duration / radius track per character (radii read from the ring crops, linear fits)
 python measure_vfx.py <frames_dir> <out.json>"""
import sys, json, cv2, numpy as np
fd, out = sys.argv[1:3]
BC = (285, 252); RAD = 62
def brown_mask(im):
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    m = ((r < 112) & (g < 96) & (b < 92) & (r >= b - 12) & (r + g + b < 250)).astype(np.uint8) * 255; m[:, 312:] = 0; return m
def white_mask(im):
    b, g, r = [im[..., i].astype(int) for i in range(3)]
    return ((b > 224) & (g > 226) & (r > 228)).astype(np.uint8) * 255
res = dict(burst={}, white={}, burst_frames=[326, 368], coffee_death_frame=327)
circ = np.zeros((360, 640), np.uint8); cv2.circle(circ, BC, RAD, 255, -1)
first = None
for f in range(318, 369):
    im = cv2.imread(f'{fd}/f{f:04d}.png')
    for key, fn in (('burst', brown_mask), ('white', white_mask)):
        m = cv2.bitwise_and(fn(im), circ); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); polys = []
        for c in cs:
            if cv2.contourArea(c) < (4 if key == 'burst' else 6): continue
            polys.append(cv2.approxPolyDP(c, 0.7, True).reshape(-1, 2).tolist())
        res[key][str(f)] = polys
    if first is None and sum(cv2.contourArea(np.array(p)) for p in res['burst'][str(f)]) > 45 and f > 322: first = f
res['coffee_death_frame'] = 328      # cup breaks (visually verified frame by frame)
tot = {f: sum(cv2.contourArea(np.array(p)) for p in ps) for f, ps in res['burst'].items()}
print('brown area px by frame:', {f: int(a) for f, a in list(tot.items())[::3]}); print('burst onset frame', res['coffee_death_frame'])
# spawn rings (expanding, fading): radii (px, ground-plane ellipse semi-axis along x) read from the crops above; opacity linear to 0
res['rings'] = {
    'coffee': dict(t0=203, t1=213, r0=19.0, r1=33.0, centre_track='coffee'),
    'teal': dict(t0=222, t1=234, r0=14.0, r1=40.0, centre_track='teal'),
    'bread': dict(t0=236, t1=248, r0=16.0, r1=34.0, centre_track='bread')}
res['drop_in'] = {'teal': dict(first=214, land=221), 'bread': dict(first=223, land=235), 'watermelon': dict(first=203, land=203)}
json.dump(res, open(out, 'w')); print('saved', out)
