"""Our render as the HQ's camera saw it in one of the round's frames (2026-11-14): blender/build.py's `wide` render (the mosaic's view: the
READY frame's (0, 0) at its (229, 97)) taken through that frame's homography (output/H.json: the frame's pixels -> the READY frame's, for the ground) beside the frame
itself (as Chrome shows it). Parallax off the ground is not modelled (the camera moves little): for checking what the READY view never
shows (the outskirts, the trees' crowns, the bushes).

  python art/canal_court/view_at.py <wide render.png> <frame name, e.g. 39660> <out.jpg>      (the Python of art/audio/output/venv)
"""
import json, sys
import numpy as np, cv2
sys.path.insert(0, 'art/canal_court')
from chrome import chrome
Hs = json.load(open('art/canal_court/output/H.json'))
hi = cv2.imread(sys.argv[1]); name = sys.argv[2] + '.png'
H = np.array(Hs[name]); f = chrome(cv2.imread('art/canal_court/output/frames/' + name))
S2 = np.array([[1.0, 0, 229], [0, 1.0, 97], [0, 0, 1]])
w = cv2.warpPerspective(hi, S2 @ H, (1920, 1080), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
cv2.imwrite(sys.argv[3], np.vstack([cv2.resize(w, (960, 540)), cv2.resize(f, (960, 540))]))
