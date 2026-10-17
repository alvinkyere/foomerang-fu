"""The plaza floor as its own asset: a top-down texture of the ground plane (25 texels per BU), each texel taking the clean plate's
pixel where the camera sees that ground point; under the objects (whose cut-outs hide the floor) the floor is filled in from its
surroundings (Navier-Stokes inpainting), so the floor is complete wherever an object moves.
python ground_texture.py <masks_dir> <out_dir>  -> ground.png, ground.json (plan extent)"""
import sys, os, json, glob
import cv2, numpy as np
import fit_stall as fs

MASKS, OUT = sys.argv[1:3]
os.makedirs(OUT, exist_ok=True)
plate = cv2.imread(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'step2_clean.png'))
objects = np.zeros(plate.shape[:2], np.uint8)
for f in glob.glob(f'{MASKS}/mask_*.npy'):
    objects |= (np.load(f) > 0).astype(np.uint8)
hole = objects                  # only the objects' own pixels: their soft painted edges stay part of the floor, as painted
floor = cv2.inpaint(plate, hole * 255, 7, cv2.INPAINT_NS)
# the plan extent seen by the camera: the frame's four corners on the ground
corners = np.array([fs.unproj(x, y, 0)[:2] for x, y in ((0, 0), (1280, 0), (1280, 720), (0, 720))])
x0, y0 = corners.min(0)
x1, y1 = corners.max(0)
K = float(os.environ.get('GROUND_K', '25'))
w, h = int((x1 - x0) * K), int((y1 - y0) * K)
X, Y = np.meshgrid(x0 + (np.arange(w) + 0.5) / K, y1 - (np.arange(h) + 0.5) / K)      # texture row 0 = far edge
P = np.stack([X.ravel(), Y.ravel(), np.zeros(X.size)], 1)
uv = fs.proj(P)                                        # raster coordinates
mx = (uv[:, 0] - 0.5).reshape(h, w).astype(np.float32)
my = (uv[:, 1] - 0.5).reshape(h, w).astype(np.float32)
tex = cv2.remap(floor, mx, my, cv2.INTER_NEAREST if os.environ.get('GROUND_NEAREST') else cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE)
cv2.imwrite(os.path.join(OUT, 'ground.png'), tex)
cv2.imwrite(os.path.join(OUT, 'floor_inpainted.png'), floor)
json.dump(dict(x0=float(x0), x1=float(x1), y0=float(y0), y1=float(y1), texels_per_bu=K, size=[w, h]),
          open(os.path.join(OUT, 'ground.json'), 'w'))
print('ground texture', w, 'x', h, 'over x', round(x0, 1), round(x1, 1), 'y', round(y0, 1), round(y1, 1), 'BU')
