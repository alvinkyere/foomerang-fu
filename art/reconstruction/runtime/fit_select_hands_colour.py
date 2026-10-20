"""Calibrates each character's hand material so its hands RENDER in the video's colour (select_look.json `hand_colour`) under the
select light: render, read the hands' colour at their projected centres, scale the material colour (linear) by target/rendered,
repeat. blender -b --python fit_select_hands_colour.py -- <scratch dir> [char,...]  Writes `hand_albedo` into select_look.json."""
import bpy, json, os, sys
import numpy as np
from bpy_extras.object_utils import world_to_camera_view as w2c
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_rig as R  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]; TMP = args[0]; os.makedirs(TMP, exist_ok=True)
look = json.load(open(R.LOOK_FILE)); CHARS = args[1].split(',') if len(args) > 1 else list(look['chars'])
SIZE = 160
sc, cam = R.setup_scene(SIZE, samples=32)
lin = lambda c: np.array([R.srgb_to_linear(v) for v in c])
srgb = lambda x: np.array([255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055) for v in np.clip(x, 0, 1)])
for name in CHARS:
    c = look['chars'][name]; target = np.array(c['hand_colour'], float)
    for it in range(8):
        rig = R.Rig(name, c); rig.frame(cam); rig.pose()
        path = os.path.join(TMP, f'{name}_hc.png'); sc.render.filepath = path; bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path); W, H = img.size; px = np.array(img.pixels[:]).reshape(H, W, 4); bpy.data.images.remove(img)
        got = []
        for h in rig.hands:
            v = w2c(sc, cam, h.matrix_world.translation); x, y = int(v.x * W), int(v.y * H)   # pixels[] rows run bottom-up, as v.y
            patch = px[y - 1:y + 2, x - 1:x + 2, :3].reshape(-1, 3)
            got.append(np.median(patch, 0))
        rendered = np.mean(got, 0) * 255      # a loaded PNG's pixels[] hold its stored (sRGB) values in 0..1
        err = np.abs(rendered - target).mean()
        print(f'HC {name} it{it}: rendered {rendered.round()} target {target} err {err:.1f}')
        if err < 3: break
        alb = lin(c["hand_albedo"]) * np.clip(lin(target) / np.maximum(lin(rendered), 1e-4), 0.25, 4.0) ** 0.5   # half steps: the AgX curve is steep for some colours
        c['hand_albedo'] = [float(v) for v in srgb(np.clip(alb, 0, 1))]
    look['chars'][name] = c
json.dump(look, open(R.LOOK_FILE, 'w'), indent=1)
print('wrote', R.LOOK_FILE)
