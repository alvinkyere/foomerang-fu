"""Ground texture of a map for the runtime bake: the median of the shot's frames rectified onto z = 0 (movers drop out) over a plan
box, plus a coverage mask. Plan cells the footage never showed are INFERRED: filled with the nearest observed cell (so the floor,
walls and water continue outward), and the mask is kept so reports can say exactly which pixels are inferred.
Unobserved cells can instead take a CLASS fill from the map config's "inferred_fill": a list of {"polygon": plan polygon,
"colour": [r, g, b] | "nearest", or "copy_offset": [dx, dy] to repeat observed texture from that far away}, applied in order (later wins), so floors / water continue without streaking objects outward.
"clean": [{"centre": [x, y], "radius": r}] inpaints movers that stood still long enough to survive the median.
python ground_texture.py <frames_dir> <camera_key> <first> <last> <step> <px_per_unit> <X0> <X1> <Y0> <Y1> <out.png> [map_config.json]
(writes <out>.png, <out>_observed.png [255 = observed], <out>.json [box, px_per_unit, inferred fraction])"""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proj import rectify, cam
FD, KEY = sys.argv[1], sys.argv[2]; F0, F1, ST = map(int, sys.argv[3:6]); S, X0, X1, Y0, Y1 = map(float, sys.argv[6:11]); OUT = sys.argv[11]
CFG = json.load(open(sys.argv[12])).get('ground', {}) if len(sys.argv) > 12 else {}
def px(p): return [int((p[0] - X0) * S), int((Y1 - p[1]) * S)]
fr = [f for f in range(F0, F1 + 1, ST) if f in cam(KEY)[1]]; st, ms = [], []
for f in fr:
    r, m = rectify(cv2.imread(f'{FD}/f{f:04d}.png'), KEY, f, 0.0, S, X0, X1, Y0, Y1); st.append(r); ms.append(m)
st = np.array(st, np.float32); ms = np.array(ms); n = ms.sum(0)
with np.errstate(all='ignore'): med = np.nanmedian(np.where(ms[..., None], st, np.nan), 0)
obs = n >= 3; obs = cv2.erode(obs.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0          # ragged coverage edge is not trusted
med = np.nan_to_num(med).astype(np.uint8)
# nearest observed cell for every unobserved one
_, lab = cv2.distanceTransformWithLabels((~obs).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys, xs = np.nonzero(obs); src = np.zeros((lab.max() + 1, 3), np.uint8)
idx = lab[obs]; src[idx] = med[ys, xs]; fill = src[lab]
for c in CFG.get('clean', []):
    m = np.zeros(obs.shape, np.uint8); cv2.circle(m, tuple(px(c['centre'])), int(c['radius'] * S), 255, -1); med = cv2.inpaint(med, m, 9, cv2.INPAINT_TELEA)
fill = cv2.GaussianBlur(fill, (0, 0), 3); nearest = fill.copy()
for r in CFG.get('inferred_fill', []):
    m = np.zeros(obs.shape, np.uint8); cv2.fillPoly(m, [np.array([px(p) for p in r['polygon']], np.int32)], 255)
    if 'copy_offset' in r:          # repeat the OBSERVED texture found copy_offset (plan units) away (INFERRED, but real texture)
        dx, dy = r['copy_offset']; Tm = np.float32([[1, 0, -dx * S], [0, 1, dy * S]])
        src_img = cv2.warpAffine(med, Tm, (med.shape[1], med.shape[0])); src_ok = cv2.warpAffine(obs.astype(np.uint8), Tm, (med.shape[1], med.shape[0])) > 0
        sel = (m > 0) & src_ok; fill[sel] = src_img[sel]
    else: fill[m > 0] = nearest[m > 0] if r['colour'] == 'nearest' else r['colour'][::-1]
soft = cv2.GaussianBlur(obs.astype(np.float32), (0, 0), 6)[..., None] * obs[..., None]          # feather the observed / inferred seam
tex = (soft * med + (1 - soft) * fill).astype(np.uint8)
cv2.imwrite(OUT, tex); cv2.imwrite(OUT.replace('.png', '_observed.png'), obs.astype(np.uint8) * 255)
json.dump(dict(box=[X0, X1, Y0, Y1], px_per_unit=S, inferred_fraction=round(float(1 - obs.mean()), 4), frames=[fr[0], fr[-1], ST]),
          open(OUT.replace('.png', '.json'), 'w'), indent=1)
print('ground texture', OUT, tex.shape[1], 'x', tex.shape[0], 'inferred', round(float(1 - obs.mean()) * 100, 1), '%')
