"""Fits the character-select look on game-setting.mp4: per character, the hands' size, spread and height (and Banana's lean), so the
rest pose seen through the select camera has the proportions of the video's resting frame. blender -b --python fit_select_look.py
-- <video_look.json> [char,...]
video_look.json holds, per character, measured on its resting frame (body height H without the hands): hand_sep (centre to
centre / H), hand_height (hand centres above the body's lowest point / H), hand_size (hand width / H). Writes select_look.json
(keeps its other keys: camera, light, hand colours)."""
import bpy, json, math, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view as w2c
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_rig as R  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]
VIDEO = json.load(open(args[0])); CHARS = args[1].split(',') if len(args) > 1 else list(VIDEO)
UPRIGHT = set()                 # automatic upright (long axis vertical): misled by Banana's peel; its roll 0 was chosen by eye


def measure(rig, sc, cam):
    proj = lambda p: w2c(sc, cam, p)
    body = [proj(rig.mesh.matrix_world @ v.co) for v in rig.mesh.data.vertices]
    y0 = min(p.y for p in body); y1 = max(p.y for p in body); H = y1 - y0
    hands = []
    for h in rig.hands:
        pts = [proj(h.matrix_world @ v.co) for v in h.data.vertices]
        hands.append((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), max(p.x for p in pts) - min(p.x for p in pts)))
    # camera view: x right, y up (0..1); image y grows downwards, so "above the lowest point" is y - y0
    return dict(hand_sep=(hands[1][0] - hands[0][0]) / H, hand_height=((hands[0][1] + hands[1][1]) / 2 - y0) / H,
                hand_size=(hands[0][2] + hands[1][2]) / 2 / H)


def upright_roll(rig, sc, cam):
    """The roll (deg) that stands the body's projected long axis vertical."""
    import numpy as np
    pts = np.array([tuple(w2c(sc, cam, rig.mesh.matrix_world @ v.co))[:2] for v in rig.mesh.data.vertices])
    pts -= pts.mean(0); w, v = np.linalg.eigh(np.cov(pts.T)); ax = v[:, 1]
    return math.degrees(math.atan2(ax[0], ax[1])) if ax[1] > 0 else math.degrees(math.atan2(-ax[0], -ax[1]))


look = json.load(open(R.LOOK_FILE)) if os.path.exists(R.LOOK_FILE) else {}
look.setdefault('elevation_deg', R.ELEVATION_DEG); look.setdefault('turn_deg', R.TURN_DEG); look.setdefault('chars', {})
sc, cam = R.setup_scene(256, samples=4)
for name in CHARS:
    target = VIDEO[name]; cur = dict(look['chars'].get(name, {}))
    hands = dict(scale=1.0, out=0.0, up=0.0); cur['hands'] = hands
    if name in UPRIGHT:
        cur['roll'] = 0.0
        for _ in range(3):
            rig = R.Rig(name, cur); rig.frame(cam); cur['roll'] += -upright_roll(rig, sc, cam)
    for it in range(6):
        rig = R.Rig(name, cur); rig.frame(cam); m = measure(rig, sc, cam)
        hands['scale'] *= target['hand_size'] / m['hand_size']
        eps = 0.02
        for key, metric in (('out', 'hand_sep'), ('up', 'hand_height')):
            hands[key] += eps; rig = R.Rig(name, cur); rig.frame(cam); m2 = measure(rig, sc, cam); hands[key] -= eps
            slope = (m2[metric] - m[metric]) / eps
            if abs(slope) > 1e-6: hands[key] += (target[metric] - m[metric]) / slope
    rig = R.Rig(name, cur); rig.frame(cam); m = measure(rig, sc, cam)
    print(f"FIT {name}: scale {hands['scale']:.2f} out {hands['out']:+.3f} up {hands['up']:+.3f} roll {cur.get('roll', 0):+.1f} | "
          + ' '.join(f"{k} {m[k]:.3f}/{target[k]:.3f}" for k in ('hand_sep', 'hand_height', 'hand_size')))
    look['chars'][name] = cur
json.dump(look, open(R.LOOK_FILE, 'w'), indent=1)
print('wrote', R.LOOK_FILE)
