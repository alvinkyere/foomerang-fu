"""Synchronized comparison deliverables for a rendered sequence (all frames exactly 640x360, frame-for-frame aligned).
  python make_comparison.py <frames_dir> <render_dir> <out_dir> <first> <last> [<still frame> ...]
 writes: side/s%04d.png (REF | RECON), blink/s%04d.png (alternates every 8 frames), diff/s%04d.png (REF | RECON | |diff|x3), stills/cmp_f####.png
 then encode with:  /tmp/vmake <out>/side 0 N <out>/reference_vs_reconstruction.mp4 30      (diagnostic only: no similarity score)"""
import sys, os, cv2, numpy as np
fd, rd, out = sys.argv[1:4]; a, b = int(sys.argv[4]), int(sys.argv[5]); stills = [int(x) for x in sys.argv[6:]]
for d in ('side', 'blink', 'diff', 'stills'): os.makedirs(f'{out}/{d}', exist_ok=True)
def tag(im, t, c=(0, 0, 255)): im = im.copy(); cv2.putText(im, t, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 3, cv2.LINE_AA); cv2.putText(im, t, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, c, 1, cv2.LINE_AA); return im
for k, f in enumerate(range(a, b + 1)):
    ref = cv2.imread(f'{fd}/f{f:04d}.png'); rec = cv2.imread(f'{rd}/f{f:04d}.png'); assert ref.shape == rec.shape == (360, 640, 3)
    cv2.imwrite(f'{out}/side/s{k:04d}.png', np.hstack([tag(ref, f'REFERENCE f{f}'), tag(rec, 'RECONSTRUCTION')]))
    cv2.imwrite(f'{out}/blink/s{k:04d}.png', tag(ref, f'REFERENCE f{f}') if (k // 8) % 2 == 0 else tag(rec, f'RECONSTRUCTION f{f}'))
    df = np.clip(cv2.absdiff(ref, rec).astype(np.int32) * 3, 0, 255).astype(np.uint8)
    cv2.imwrite(f'{out}/diff/s{k:04d}.png', np.hstack([tag(ref, 'REF'), tag(rec, 'RECON'), tag(df, '|DIFF| x3')]))
    if f in stills:
        ov = cv2.addWeighted(ref, 0.5, rec, 0.5, 0)
        cv2.imwrite(f'{out}/stills/cmp_f{f:04d}.png', np.vstack([np.hstack([tag(ref, f'REF f{f}'), tag(rec, 'RECON')]), np.hstack([tag(ov, '50/50 overlay'), tag(df, '|DIFF| x3')])]))
print('frames', b - a + 1)
