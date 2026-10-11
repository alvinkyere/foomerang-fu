"""Pass 2 vs Pass 3 DIFFERENCE-REDUCTION sheet: for chosen frames, |ref-P2| | |ref-P3| | signed change (green = discrepancy closed, red = made worse).
 Diagnostic only (no score is a gate); a per-frame mean-abs-diff line is printed for orientation.   python reduction_sheet.py <frames> <p2> <p3> <out.png> <frame>..."""
import sys, cv2, numpy as np
fd, p2, p3, out = sys.argv[1:5]; frames = [int(x) for x in sys.argv[5:]]; rows = []
for f in frames:
    r = cv2.imread(f'{fd}/f{f:04d}.png').astype(np.int32); a = cv2.imread(f'{p2}/f{f:04d}.png').astype(np.int32); b = cv2.imread(f'{p3}/f{f:04d}.png').astype(np.int32)
    d2 = np.abs(r - a).max(2); d3 = np.abs(r - b).max(2); delta = d2 - d3        # positive = closer in Pass 3
    vis = np.zeros((360, 640, 3), np.uint8); vis[..., 1] = np.clip(delta * 3, 0, 255); vis[..., 2] = np.clip(-delta * 3, 0, 255)
    t = lambda im, s: cv2.putText(im.copy(), s, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    rows.append(np.hstack([t(np.clip(d2 * 3, 0, 255).astype(np.uint8)[..., None].repeat(3, 2), f'P2 |diff| f{f}'), t(np.clip(d3 * 3, 0, 255).astype(np.uint8)[..., None].repeat(3, 2), 'P3 |diff|'), t(vis, 'green = closed, red = worse')]))
    print(f'f{f}: mean |diff| PREV {d2.mean():.1f} -> NEW {d3.mean():.1f}   (share of pixels >40: {100*(d2>40).mean():.1f}% -> {100*(d3>40).mean():.1f}%)')
cv2.imwrite(out, np.vstack(rows))
