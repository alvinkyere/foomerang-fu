"""The broken mug at 2:21 (plaza frames ~740-800): the coffee's spread over time, in world units."""
import os, sys, pickle, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from world import to_world, project
OUT = os.environ.get('PHYS_OUT', 'art/physics_reference/output/')
frames = pickle.load(open(OUT + 'frames.pkl', 'rb'))
c = cv2.VideoCapture('foomerang - fu physics.mp4'); fps = c.get(cv2.CAP_PROP_FPS)
X0, Y0, X1, Y1 = 520, 560, 860, 760          # environ2 px window round the puddle (not the bunting's posts)
# world units per environ2 px near there (ground scale)
cx, cy = to_world(690, 650); ax, ay = to_world(691, 650); bx, by = to_world(690, 651)
u_per_px_x, u_per_px_y = abs(ax - cx), abs(by - cy)
print('scale near the puddle: %.2f u/px across, %.2f u/px down' % (u_per_px_x, u_per_px_y))
DEATH = 718  # the yellow boomerang meets the mug (frames 716-718)
t_death = frames[DEATH][0]
rows = []
for i in range(DEATH, 806):
    t, H, _ = frames[i]
    c.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, f = c.read()
    w = cv2.warpPerspective(cv2.resize(f, (1280, 720), interpolation=cv2.INTER_CUBIC), H, (1280, 720))[Y0:Y1, X0:X1]
    hsv = cv2.cvtColor(w, cv2.COLOR_BGR2HSV)
    # the coffee: a dark warm brown (value low, hue orange-red, some saturation)
    m = ((hsv[..., 2] < 110) & (hsv[..., 1] > 70) & ((hsv[..., 0] < 25) | (hsv[..., 0] > 170))).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    if n <= 1:
        print(f'{i} t={t:.3f}  none'); continue
    big = 1 + int(np.argmax(st[1:, 4]))
    x, y, bw, bh, area = st[big]
    others = [k for k in range(1, n) if k != big and st[k, 4] >= 3]
    drops = len(others)
    pc = cen[big]
    spread = max([np.hypot((cen[k][0] - pc[0]) * u_per_px_x, (cen[k][1] - pc[1]) * u_per_px_y) for k in others], default=0)
    a = area * u_per_px_x * u_per_px_y
    r = (a / np.pi) ** 0.5
    rows.append((t - t_death, r, drops, spread))
    print(f'{i} +{t - t_death:5.3f}s  blob r_eq {r:5.1f} u  ({bw * u_per_px_x:4.0f} x {bh * u_per_px_y:4.0f} u)  droplets {drops:3d}  furthest droplet {spread:5.0f} u')
np.save(OUT + 'puddle_rows.npy', np.array(rows))
