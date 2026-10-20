"""Fits each character's body tone (select_look.json `tone`: saturation and value of its textured colour) so its main colours render
as in game-setting.mp4: the video's three dominant body colours against the nearest of ours, by HSV. blender -b --python
fit_select_tone.py -- <scratch dir> <video_dominant.json> [char,...]"""
import bpy, colorsys, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import select_rig as R  # noqa: E402

args = sys.argv[sys.argv.index('--') + 1:]; TMP = args[0]; VD = json.load(open(args[1])); os.makedirs(TMP, exist_ok=True)
look = json.load(open(R.LOOK_FILE)); CHARS = args[2].split(',') if len(args) > 2 else list(VD)
sc, cam = R.setup_scene(128, samples=16)


def dominant(px, k=3):
    q = (px // 20).astype(int); _, inv, c = np.unique(q, axis=0, return_inverse=True, return_counts=True); inv = inv.ravel()
    return [np.median(px[inv == t], 0) for t in np.argsort(-c)[:k]]


for name in CHARS:
    c = look['chars'][name]; c['tone'] = dict(sat=1.0, val=1.0); target = [np.array(v) for v in VD[name]]
    for it in range(5):
        rig = R.Rig(name, c); rig.frame(cam); rig.pose()
        path = os.path.join(TMP, f'{name}_tone.png'); sc.render.filepath = path; bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path); W, H = img.size; px = np.array(img.pixels[:]).reshape(H, W, 4); bpy.data.images.remove(img)
        ours = dominant(px[px[..., 3] > 0.8][:, :3] * 255)
        pairs = [(t, min(ours, key=lambda o: np.abs(o - t).mean())) for t in target]
        err = np.mean([np.abs(t - o).mean() for t, o in pairs])
        hsv = lambda v: colorsys.rgb_to_hsv(*(np.clip(v, 0, 255) / 255))
        ds = np.mean([hsv(t)[1] / max(hsv(o)[1], 1e-3) for t, o in pairs if hsv(t)[1] > 0.15] or [1.0])
        dv = np.mean([hsv(t)[2] / max(hsv(o)[2], 1e-3) for t, o in pairs])
        print(f'TONE {name} it{it}: sat {c["tone"]["sat"]:.2f} val {c["tone"]["val"]:.2f} err {err:.1f}')
        c['tone']['sat'] = float(np.clip(c['tone']['sat'] * ds ** 0.7, 0.5, 2.0)); c['tone']['val'] = float(np.clip(c['tone']['val'] * dv ** 0.7, 0.6, 1.6))
    look['chars'][name] = c
json.dump(look, open(R.LOOK_FILE, 'w'), indent=1); print('wrote', R.LOOK_FILE)
