"""Bake a map from ONE reference frame of its shot ("frame mode"): the game camera IS that frame's solved camera, at x3.
 * ground.png: the reference frame with movers (characters, effects) replaced by the median of a short window of frames warped into
   it through the shot track (the window is chosen where the camera moves little, so the warp is near-exact), upscaled x3.
 * occ_<name>.png: each CUT-OUT (maps/<map>.json "cutouts": polygon in reference-frame px) as its own RGBA layer, feathered; its depth
   key is the canvas y of its ground contact (the polygon's lowest point, unless "contact_px" is given).
 * layers.json, and the cut-outs' plan footprints (unprojected lower part of the polygon onto z = 0) for the rules generator.
Areas outside the reference frame do not exist in this mode: the canvas IS the observed frame (framing OBSERVED).
python build_frame_map.py <map> <frames_dir> <out_dir>"""
import sys, os, json, cv2, numpy as np
MAP, FD, OUT = sys.argv[1:4]; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'analysis'))
from proj import plane_H
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); fm = cfg['frame_mode']; KEY, REF = fm['camera_key'], fm['reference_frame']
W, H = cfg['camera']['canvas']; SC = W / 640
ref = cv2.imread(f'{FD}/f{REF:04d}.png').astype(np.float32)
# window median in the reference view (ground homography; small motion)
Href = plane_H(KEY, REF, 0.0); stack = []
for f in range(fm['window'][0], fm['window'][1] + 1):
    Hf = plane_H(KEY, f, 0.0); M = Href @ np.linalg.inv(Hf)
    stack.append(cv2.warpPerspective(cv2.imread(f'{FD}/f{f:04d}.png'), M, (640, 360), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0)).astype(np.float32))
st = np.array(stack); valid = st.sum(-1) > 0
with np.errstate(all='ignore'): med = np.nanmedian(np.where(valid[..., None], st, np.nan), 0)
med = np.where(np.isnan(med), ref, med)
# movers: where the reference deviates from the window median (plus explicit "clean_px" circles), dilated
dev = np.abs(ref - med).sum(-1) > fm.get('mover_threshold', 60)
dev = cv2.dilate(cv2.morphologyEx(dev.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((7, 7), np.uint8)) > 0
for c in fm.get('clean_px', []): m = np.zeros(dev.shape, np.uint8); cv2.circle(m, tuple(c['centre']), c['radius'], 1, -1); dev |= m > 0
for poly in fm.get('keep_px', []):          # regions that legitimately change (animated props): keep the reference pixels
    m = np.zeros(dev.shape, np.uint8); cv2.fillPoly(m, [np.array(poly, np.int32)], 1); dev &= m == 0
clean = np.where(dev[..., None], med, ref).clip(0, 255).astype(np.uint8)
for c in fm.get('inpaint_px', []):          # a mover that stayed put through the window (the median has it too): inpaint (INFERRED)
    m = np.zeros(dev.shape, np.uint8); cv2.circle(m, tuple(c['centre']), c['radius'], 255, -1); clean = cv2.inpaint(clean, m, 5, cv2.INPAINT_TELEA)
up = cv2.resize(clean, (W, H), interpolation=cv2.INTER_CUBIC); cv2.imwrite(os.path.join(OUT, 'ground.png'), up)
cv2.imwrite(os.path.join(OUT, 'movers_mask.png'), dev.astype(np.uint8) * 255)
Hi = np.linalg.inv(Href)
def unproject(u, v): q = Hi @ np.array([u, v, 1.0]); return [float(q[0] / q[2]), float(q[1] / q[2])]
layers, footprints = {}, {}
for c in cfg.get('cutouts', []):
    poly = np.array(c['polygon_px'], np.float32); a = np.zeros((360, 640), np.uint8); cv2.fillPoly(a, [poly.astype(np.int32)], 255)
    A = cv2.GaussianBlur(cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 1.2)
    rgba = np.dstack([up, A]); cv2.imwrite(os.path.join(OUT, f"occ_{c['name']}.png"), rgba)
    u0, v0 = c.get('contact_px', poly[np.argmax(poly[:, 1])].tolist())
    layers[c['name']] = dict(depth_y=float(v0 * SC), footprint=unproject(u0, v0))
    ys = poly[:, 1]; cut = ys.max() - 0.4 * (ys.max() - ys.min())          # the lower 40% of the outline touches the ground
    low = poly[ys >= cut]; footprints[c['name']] = [unproject(float(u), float(v)) for u, v in low] if len(low) >= 3 else [unproject(float(u), float(v)) for u, v in poly]
json.dump(layers, open(os.path.join(OUT, 'layers.json'), 'w'), indent=1)
json.dump(footprints, open(os.path.join(OUT, 'footprints.json'), 'w'), indent=1)
print('frame map', MAP, 'reference', REF, 'window', fm['window'], 'movers replaced', round(float(dev.mean()) * 100, 2), '% of pixels;', len(layers), 'cut-outs')
