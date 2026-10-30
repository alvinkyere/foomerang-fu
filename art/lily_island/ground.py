"""The cross pond's ground and its grass (2026-10-28): the walkable plan, and the grass painted in the HQ's own flat colours.

The HQ's grass is not textured: flat lime (#d8f78b), a paler green stripe along the bank's edge (#b4e993), and a hard-edged
darker green (#a4da82) where the stone's shadow falls. This measures where each lies (colour classes of the 4:27 frame,
unprojected onto the ground), smooths the shapes and paints them, in those flat colours, into our own texture in plan space.

  grass.png    the texture, PX px a plan unit, covering the box in ground.json
  ground.json  the banks (polygons, plan units): the grass seen, the slabs standing on them, the strip a slab hides (a boulder is not in it)

  python art/lily_island/ground.py       (from the repository root; needs layout.py and stones.py run first; then
                                        npx prettier --write art/lily_island/*.json art/lily_island/blender/*.json)
"""
import json, math
import numpy as np, cv2

CAM = json.load(open('art/sky_islands/camera.json'))
_SC = json.load(open('art/lily_island/scale.json'))
Z = _SC['hqZoom'] / _SC['scale']      # the zoom the frame is read at: the HQ's, over the scale (scale.json: the pond is `scale` times larger beside the characters)
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])
PX = 28                                   # texture pixels a plan unit
X0, X1, Y0, Y1 = -50.0, 50.0, 20.0, 125.0  # the box (plan units; the content well inside it: a closing spills at a border)
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


f = cv2.imread('art/lily_island/output/reference.png')
h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int)
v = f.max(2)
hud = np.arange(1920)[None, :] > 215
grass = hud & (((h[..., 0] > 25) & (h[..., 0] < 60) & (h[..., 1] > 40) & (h[..., 2] > 150)) | ((h[..., 0] >= 60) & (h[..., 0] <= 95) & (h[..., 1] > 30) & (h[..., 1] < 95) & (h[..., 2] >= 228)))
# each grass pixel to the nearest of the three measured colours (in Lab), the lime, the pale stripe and the shadow green
lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(float)
swatch = [cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_BGR2LAB).astype(float)[0, 0] for c in ((0x94, 0xf2, 0xdd), (0x9a, 0xf3, 0xe6), (0x96, 0xe9, 0xca))]
dist = np.stack([np.linalg.norm(lab - s_, axis=2) for s_ in swatch])
nearest = dist.argmin(0)
lime, rim, shade = grass & (nearest == 0), grass & (nearest == 1), grass & (nearest == 2)
L = json.load(open('art/lily_island/layout.json'))
S = json.load(open('art/lily_island/stones.json'))


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
ground = (cv2.GaussianBlur(ground.astype(np.float32), (0, 0), 0.15 * PX) > 0.5).astype(np.uint8)   # the HQ's edges are smooth
ground = (cv2.GaussianBlur(ground.astype(np.float32), (0, 0), 0.25 * PX) > 0.5).astype(np.uint8)
cs, _ = cv2.findContours(ground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
polys = []
for c in cs:
    if cv2.contourArea(c) < 40 * PX * PX / 4: continue
    c = cv2.approxPolyDP(c, 1.6, True).reshape(-1, 2)
    polys.append([[round(float(x / PX + X0), 2), round(float(Y1 - y / PX), 2)] for x, y in c])
json.dump(dict(box=[X0, X1, Y0, Y1], px=PX, polygons=polys), open('art/lily_island/ground.json', 'w'))

# the grass: lime everywhere on the ground, the rim stripe along its edge, the shadow where it was measured
tex = np.zeros((H_, W, 3), np.uint8)
# the HQ's lime #d8f78b, pale stripe #b4e993 and shadow green #a4da82 (as OpenCV reads them), each x1.022 (the game's light renders a top 2%
# darker), then converted to how the video looks in a browser (colour.py)
import sys
sys.path.insert(0, 'art/lily_island')
import colour as HQ                       # (the HQ's colours as the video looks in a browser)
bgr = lambda h: tuple(int(h[i:i + 2], 16) for i in (5, 3, 1))
LIME, RIM, SHADE = (bgr(HQ.lit(h, 0.98)) for h in ('#ddf293', '#e4f6a2', '#cae996'))
tex[:] = RIM
edge = cv2.distanceTransform(ground, cv2.DIST_L2, 5) / PX                        # units from the ground's edge
# The grass is flat lime; the HQ's shadow green and its pale patches (a spawn's lit circle) are DRAWN SHAPES, not texture: they are
# kept as outlines (ground.json `shade`, `pale`) and built as flat meshes, so they stay crisp at any zoom (a texture's texels showed
# as steps when the camera closed in). The pale stripe at the island's edge is built from the bank's outline pulled in.
def shapes(mask, least):
    cs2, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs2:
        if cv2.contourArea(c) < least * PX * PX: continue
        if min(cv2.minAreaRect(c)[1]) < 0.9 * PX: continue                     # (a sliver is not a drawn shape)
        c = cv2.approxPolyDP(c, 1.4, True).reshape(-1, 2)
        out.append([[round(float(x / PX + X0), 2), round(float(Y1 - y / PX), 2)] for x, y in c])
    return out
shade_m = in_plan(shade) & (ground > 0) & (edge >= 0.15)
shade_m = cv2.morphologyEx(shade_m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
pale_m = in_plan(rim) & (ground > 0) & (edge >= 1.3)
pale_m = cv2.morphologyEx(pale_m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
G2 = json.load(open('art/lily_island/ground.json'))
inner_m = cv2.morphologyEx((edge >= 1.0).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))   # (the lime: the ground less its pale edge stripe)
G2['shade'], G2['pale'], G2['lime'] = shapes(shade_m, 0.6), shapes(pale_m, 0.8), shapes(inner_m, 5.0)
json.dump(G2, open('art/lily_island/ground.json', 'w'))
tex = tex[:16, :16]                                                              # (flat lime: a small texture is all it is)
cv2.imwrite('art/lily_island/blender/grass.png', tex)
json.dump(dict(x0=X0, x1=X1, y0=Y0, y1=Y1), open('art/lily_island/blender/grass.json', 'w'))
print('ground polygons', len(polys), 'shade', len(G2['shade']), 'pale', len(G2['pale']))
