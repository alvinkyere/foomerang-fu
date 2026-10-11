"""Reference | reconstruction | 50/50 overlay | |difference|x3 for chosen frames (all exactly 640x360).
python compare.py <frames_dir> <render_dir> <out.png> <frame> [<frame>...]    (diagnostic only: no similarity score is produced)"""
import sys, cv2, numpy as np
fd, rd, out = sys.argv[1:4]; frames = [int(a) for a in sys.argv[4:]]; rows = []
for f in frames:
    ref = cv2.imread(f'{fd}/f{f:04d}.png'); rec = cv2.imread(f'{rd}/f{f:04d}.png')
    assert ref.shape == rec.shape == (360, 640, 3), (ref.shape, rec.shape)
    ov = cv2.addWeighted(ref, 0.5, rec, 0.5, 0); df = np.clip(cv2.absdiff(ref, rec).astype(np.int32) * 3, 0, 255).astype(np.uint8)
    for im, t in ((ref, f'REF f{f}'), (rec, 'RECON'), (ov, '50/50'), (df, 'DIFF x3')): cv2.putText(im, t, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1, cv2.LINE_AA)
    rows.append(np.vstack([np.hstack([ref, rec]), np.hstack([ov, df])]))
cv2.imwrite(out, np.vstack(rows))
