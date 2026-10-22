"""The sky islands' camera and plan (2026-10-22): which view of the map the reference frame is, and the map seen from above.

The game has one camera rig: the plaza's, solved from environ2 (pitch 56.17 deg, focal 3866 px on a 1920 x 1080 canvas,
principal point at its middle; apps/console/public/maps/market_plaza/manifest.json). The sky islands are seen through the
same rig. Two checks on the reference frame (9:04.0):
  * the cliffs' vertical edges (lavender or mist on both sides; 44 long segments agreeing) meet 2,416 px below the frame's
    middle, at x 937: the plaza's camera puts that point 2,592 px below its principal point, so the reference frame is that
    view at 0.932x (wider), centred (and with no yaw);
  * a character is ~76 px wide in it, as the plaza's 76-unit-wide characters are at 0.932x (82 px at 1x).
(The island tops' north-south edges should meet far above; their short segments put it at y -3,369 +/- ~1,500, too loose to
test the pitch, and consistent with it.)

So: reference px = 960 + (canvas px - 960) * ZOOM (likewise about 540), and the island tops are the ground (height 0).
Writes camera.json, and output/plan.png: the median of the registered frames (register.py) seen from above, K px per plan
unit, for modelling the islands, bridges and props.

  python art/sky_islands/calibrate.py        (from the repository root, after register.py)
"""
import json, math, os
import numpy as np, cv2

OUT = os.environ.get('SKY_OUT', 'art/sky_islands/output/')
CAM = json.load(open('apps/console/public/maps/market_plaza/manifest.json'))['camera']
ZOOM = 2416 / (CAM['focalPx'] / math.tan(math.radians(CAM['pitchDeg'])))
MARGIN = 500                                   # register.py's margin round the reference frame
K = 40                                         # plan px per unit (the plaza floor's)
th = math.radians(CAM['pitchDeg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
F, PP, C = CAM['focalPx'], CAM['principal'], np.array(CAM['centre'])


def canvas(X, Y, Z=0.0):
    """Plan units (Blender: x east, y north, z up) -> canvas px, through the plaza's rig."""
    v = R @ (np.array([X, Y, Z]) / 100 - C)
    return F * v[0] / v[2] + PP['x'], F * v[1] / v[2] + PP['y']


def ref(X, Y, Z=0.0):
    cx, cy = canvas(X, Y, Z)
    return 960 + (cx - 960) * ZOOM, 540 + (cy - 540) * ZOOM


med = cv2.imread(OUT + 'median.png')
seen = (med.sum(2) > 0).astype(np.uint8)
# the plan's extent: what the median covers, on the ground
ys, xs = np.where(seen)
corners = np.float32([[xs.min(), ys.min()], [xs.max(), ys.min()], [xs.max(), ys.max()], [xs.min(), ys.max()]]) - MARGIN
grid = [(X, Y) for X in np.linspace(-120, 120, 9) for Y in np.linspace(-20, 200, 9)]
H_plan_to_ref = cv2.findHomography(np.float32(grid), np.float32([ref(X, Y) for X, Y in grid]))[0]
c = cv2.perspectiveTransform(corners.reshape(-1, 1, 2), np.linalg.inv(H_plan_to_ref)).reshape(-1, 2)
X0, X1 = math.floor(c[:, 0].min()), math.ceil(c[:, 0].max())
Y0, Y1 = math.floor(c[:, 1].min()), math.ceil(c[:, 1].max())
W, H = (X1 - X0) * K, (Y1 - Y0) * K
# plan px -> plan units -> ref px -> median px
S = np.array([[1 / K, 0, X0], [0, -1 / K, Y1], [0, 0, 1]])
T = np.array([[1, 0, MARGIN], [0, 1, MARGIN], [0, 0, 1]])
plan = cv2.warpPerspective(med, T @ H_plan_to_ref @ S, (W, H), flags=cv2.WARP_INVERSE_MAP | cv2.INTER_LINEAR)
cv2.imwrite(OUT + 'plan.png', plan)
json.dump(dict(rig='market_plaza', focalPx=F, pitchDeg=CAM['pitchDeg'], principal=PP, centre=list(C), referenceZoom=ZOOM,
               referenceTime=544.0, plan=dict(x0=X0, x1=X1, y0=Y0, y1=Y1, px_per_unit=K, size=[W, H])),
          open('art/sky_islands/camera.json', 'w'), indent=1)
print('zoom', round(ZOOM, 4), 'plan X', X0, X1, 'Y', Y0, Y1, 'size', W, H)
