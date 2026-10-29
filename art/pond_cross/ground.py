"""The cross pond's ground and its grass (2026-10-28): the walkable plan, and the grass painted in the HQ's own flat colours.

The HQ's grass is not textured: flat lime (#d8f78b), a paler green stripe along the bank's edge (#b4e993), and a hard-edged
darker green (#a4da82) where the stone's shadow falls. This measures where each lies (colour classes of the 4:27 frame,
unprojected onto the ground), smooths the shapes and paints them, in those flat colours, into our own texture in plan space.

  grass.png    the texture, PX px a plan unit, covering the box in ground.json
  ground.json  the banks (polygons, plan units): the grass seen, the slabs standing on them, the strip a slab hides (a boulder is not in it)

  python art/pond_cross/ground.py       (from the repository root; needs layout.py and stones.py run first; then
                                        npx prettier --write art/pond_cross/*.json art/pond_cross/blender/*.json)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/pond_cross/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']      # the zoom the frame is read at: the HQ's, over the scale (scale.json: the pond is `scale` times larger beside the characters)
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])
PX = 28                                   # texture pixels a plan unit
X0, X1, Y0, Y1 = -46.0, 46.0, 32.0, 120.0  # the box (plan units; the content well inside it: a closing spills at a border)
W, H_ = int((X1 - X0) * PX), int((Y1 - Y0) * PX)


def ref(X, Y, z=0.0):
    v = R @ (np.array([X, Y, z]) / 100 - C)
    cx, cy = F * v[0] / v[2] + 960, F * v[1] / v[2] + 540
    return 960 + (cx - 960) * Z, 540 + (cy - 540) * Z


# texture pixel -> image pixel (the ground plane), so a class mask of the frame can be sampled into plan space
g = [(X, Y) for X in np.linspace(-60, 60, 7) for Y in np.linspace(30, 130, 7)]
to_image = cv2.findHomography(np.float32([((X - X0) * PX, (Y1 - Y) * PX) for X, Y in g]),
                              np.float32([ref(X, Y) for X, Y in g]))[0]
to_plan = np.linalg.inv(to_image)


def in_plan(mask_img):
    """A class mask of the frame, seen from above on the texture grid, smoothed so its edges are crisp curves."""
    m = cv2.warpPerspective(mask_img.astype(np.float32), to_image, (W, H_), flags=cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR)
    return cv2.GaussianBlur(m, (0, 0), 3.0) > 0.5


f = cv2.imread('art/pond_cross/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
v = f.max(2)
hud = np.arange(1920)[None, :] > 230
grass = hud & (h[..., 0] > 25) & (h[..., 0] < 60) & (h[..., 1] > 40) & (h[..., 2] > 150)
# each grass pixel to the nearest of the three measured colours (in Lab), the lime, the pale stripe and the shadow green
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(float)
swatch = [cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_BGR2LAB).astype(float)[0, 0] for c in ((0x8b, 0xf7, 0xd8), (0x93, 0xe9, 0xb4), (0x82, 0xda, 0xa4))]
dist = np.stack([np.linalg.norm(lab - s_, axis=2) for s_ in swatch])
nearest = dist.argmin(0)
lime, rim, shade = grass & (nearest == 0), grass & (nearest == 1), grass & (nearest == 2)
L = json.load(open('art/pond_cross/layout.json'))
S = json.load(open('art/pond_cross/stones.json'))


def raster(polys):
    m = np.zeros((H_, W), np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.int32([((x - X0) * PX, (Y1 - y) * PX) for x, y in p])], 1)
    return m


# the ground: where grass is seen, the banks' own outlines, the stones that stand on them, and the strip a wall hides
seen = in_plan(grass)
bank = (raster(L['banks']) > 0) | seen
slabs = raster([b['top'] for b in S if b['kind'] == 'slab']) > 0      # (a boulder overhangs the water: it must not bend the bank's edge)
ground = (bank | slabs).astype(np.uint8)
K = 2 * int(1.4 * PX) + 1                 # close gaps under 2.8 units: the strip behind a slab
ground = cv2.morphologyEx(ground, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (K, K)))
ground = (cv2.GaussianBlur(ground.astype(np.float32), (0, 0), 0.5 * PX) > 0.5).astype(np.uint8)   # the HQ's edges are smooth
# the raft at its full size (the HQ's: owner, 2026-10-29: "the raft has become too small ... it passes through the east and west
# edges"): its sweep, a circle through the corners of its arms, is carved out of the banks, so the grass edge round the pond is the
# arc the raft turns in and it never cuts the grass. (No stone stands inside the sweep: the nearest is 18.7 from its centre against
# a 17.8 sweep; it was only a bulge of the bank on the east and west.) The ground reaches a unit out over the water, so a player
# still steps from the bank onto an arm that is turning past.
RAFT = dict(L['raft'])
import os
if os.path.exists('art/pond_cross/raft_fit.json'):
    # the raft as fitted to the HQ deck (fit_raft.py): its centre, arms, width, angle and deck height. The crates, measured against the
    # first outline, are carried over: where each stands in the plan, then its place along the fitted arms
    fit = json.load(open('art/pond_cross/raft_fit.json'))
    oa = math.radians(RAFT['degrees']); na = math.radians(fit['degrees'])
    moved = []
    for u, v in RAFT['crates']:
        px, py = RAFT['centre'][0] + u * math.cos(oa) - v * math.sin(oa), RAFT['centre'][1] + u * math.sin(oa) + v * math.cos(oa)
        dx, dy = px - fit['centre'][0], py - fit['centre'][1]
        moved.append([round(dx * math.cos(na) + dy * math.sin(na), 2), round(-dx * math.sin(na) + dy * math.cos(na), 2)])
    # a crate stands on a plank: inside the arm it is on, a crate's half (0.72) and a little from every edge
    keep_w, keep_l = fit['width'] / 2 - 0.82, fit['arm'] / 2 - 0.9
    clamp = lambda x, m: round(max(-m, min(m, x)), 2)
    moved = [[clamp(u, keep_l), clamp(v, keep_w)] if abs(u) > abs(v) else [clamp(u, keep_w), clamp(v, keep_l)] for u, v in moved]
    RAFT.update(centre=fit['centre'], arm=fit['arm'], width=fit['width'], degrees=fit['degrees'], deck=fit['deck'], crates=moved)
rcx, rcy = RAFT['centre']
sweep = math.hypot(RAFT['arm'] / 2, RAFT['width'] / 2) + 0.25
cv2.circle(ground, (int((rcx - X0) * PX), int((Y1 - rcy) * PX)), int(sweep * PX), 0, -1)
ground = (cv2.GaussianBlur(ground.astype(np.float32), (0, 0), 0.25 * PX) > 0.5).astype(np.uint8)
json.dump(RAFT, open('art/pond_cross/raft.json', 'w'))
print('raft: full size, arm %.1f width %.1f, sweep %.1f units carved out of the banks' % (RAFT['arm'], RAFT['width'], sweep))
cs, _ = cv2.findContours(ground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
polys = []
for c in cs:
    if cv2.contourArea(c) < 40 * PX * PX / 4: continue
    c = cv2.approxPolyDP(c, 1.6, True).reshape(-1, 2)
    polys.append([[round(float(x / PX + X0), 2), round(float(Y1 - y / PX), 2)] for x, y in c])
json.dump(dict(box=[X0, X1, Y0, Y1], px=PX, polygons=polys), open('art/pond_cross/ground.json', 'w'))

# the grass: lime everywhere on the ground, the rim stripe along its edge, the shadow where it was measured
tex = np.zeros((H_, W, 3), np.uint8)
# the HQ's lime #d8f78b, pale stripe #b4e993 and shadow green #a4da82 (as OpenCV reads them), each x1.022 (the game's light renders a top 2%
# darker), then converted to how the video looks in a browser (colour.py)
import sys
sys.path.insert(0, 'art/pond_cross')
import colour as HQ                       # (the HQ's colours as the video looks in a browser)
bgr = lambda h: tuple(int(h[i:i + 2], 16) for i in (5, 3, 1))
LIME, RIM, SHADE = (bgr(HQ.lit(h, 0.98)) for h in ('#ddfc8e', '#b8ef96', '#a8de85'))
tex[:] = LIME
edge = cv2.distanceTransform(ground, cv2.DIST_L2, 5) / PX                        # units from the ground's edge
band = (edge < 0.55) & (ground > 0)
tex[band] = RIM
rim_seen = in_plan(rim) & (edge < 1.3)
tex[rim_seen & (ground > 0)] = RIM
tex[in_plan(shade) & (ground > 0) & (edge >= 0.15)] = SHADE
tex[ground == 0] = RIM                                                           # (never seen: the sides are lavender)
cv2.imwrite('art/pond_cross/blender/grass.png', tex)
json.dump(dict(x0=X0, x1=X1, y0=Y0, y1=Y1), open('art/pond_cross/blender/grass.json', 'w'))
print('ground polygons', len(polys), 'texture', tex.shape[1], 'x', tex.shape[0], 'shade share %.2f' % ((tex == np.array(SHADE)).all(2).sum() / max(ground.sum(), 1)))
