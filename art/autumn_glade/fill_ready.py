"""The ground behind READY (2026-11-03): at 626.6 s the frame's word is a smaller one and the camera has hardly moved (mean grey
difference 5 outside the box). That frame, aligned to 626.0 s by an affine fit over everything outside the box (ECC), fills the READY box
wherever its own word (white, with its dark outline: dilated 15 px) is not. Writes output/reference_fill.png (local only, like
reference.png: for the masks of fit_trees.py and canopy_mass.py, never shipped) and output/ready_hidden.npy (what stays hidden).

  python art/autumn_glade/fill_ready.py       (from the repository root; the Python of art/audio/output/venv)
"""
import numpy as np, cv2

ref = cv2.imread('art/autumn_glade/output/reference.png')
c = cv2.VideoCapture('ff physics hq 2.mp4'); c.set(cv2.CAP_PROP_POS_FRAMES, int(round(626.6 * 60))); ok, f = c.read()
g0, g1 = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32), cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
m = np.ones(g0.shape, np.uint8); m[440:650, 700:1230] = 0; m[:, :230] = 0
warp = np.eye(2, 3, dtype=np.float32)
cc, warp = cv2.findTransformECC(g0, g1, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), m, 5)
al = cv2.warpAffine(f, warp, (1920, 1080), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
diff = np.abs(cv2.cvtColor(al, cv2.COLOR_BGR2GRAY).astype(float) - g0)[m > 0].mean()
text = (al.min(-1) > 235).astype(np.uint8)
text = cv2.dilate(text, np.ones((31, 31), np.uint8)) > 0
box = np.zeros(g0.shape, bool); box[470:620, 740:1190] = True
fill = box & ~text
out = ref.copy(); out[fill] = al[fill]
cv2.imwrite('art/autumn_glade/output/reference_fill.png', out)
np.save('art/autumn_glade/output/ready_hidden.npy', box & text)
print('ECC %.4f, mean grey difference outside the box after alignment %.2f; the box filled %.0f%%' % (cc, diff, 100 * fill.sum() / box.sum()))
