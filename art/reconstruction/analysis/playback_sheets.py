"""Sample the side-by-side comparison at 10 fps cadence (every 3rd frame) into sheets read in order, to judge MOTION continuity (not stills of single checkpoints).
 python playback_sheets.py <side_dir> <out_dir> <n_frames>"""
import sys, os, cv2, numpy as np
sd, od, n = sys.argv[1], sys.argv[2], int(sys.argv[3]); os.makedirs(od, exist_ok=True); fr = list(range(0, n, 3))
for si in range(0, len(fr), 8):
    t = [cv2.resize(cv2.imread(f'{sd}/s{k:04d}.png'), (640, 180)) for k in fr[si:si + 8]]
    while len(t) < 8: t.append(np.zeros_like(t[0]))
    cv2.imwrite(f'{od}/playback_{si // 8:02d}.png', np.vstack([np.hstack(t[i:i + 2]) for i in range(0, 8, 2)]))
print(len(fr), 'sampled frames ->', (len(fr) + 7) // 8, 'sheets')
