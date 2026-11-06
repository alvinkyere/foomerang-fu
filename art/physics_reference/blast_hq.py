"""The Explosive's blast measured on the HQ video (2026-11-05): foomerang-fu physics hq.mp4, the blast at 5:22.47 (frame 19347 = t 0, the
first white frame; 60 fps), on the sky islands' green, every frame to 1.05 s. The camera's own motion (the follow camera's pan and the
blast's shake) is measured by ECC translation on everything but a circle round the blast and taken out, so each part is measured about
the blast's own centre. Per frame: the white ball, the yellow fireball, the ring (outer and inner edge per angle, its colour), the fire
balls (count, size, distance out, colour), the dark smoke, the pale puffs. Prints a table; writes output/blast_hq.json.

  python art/physics_reference/blast_hq.py       (from the repository root; the Python of art/audio/output/venv)
"""
import json
import numpy as np, cv2

F0, N = 19347, 64
c = cv2.VideoCapture('foomerang-fu physics hq.mp4')
c.set(cv2.CAP_PROP_POS_FRAMES, F0 - 10); ok, f0 = c.read()
g0 = cv2.cvtColor(cv2.resize(f0, (960, 540)), cv2.COLOR_BGR2GRAY).astype(np.float32)
mask = np.ones((540, 960), np.uint8); cv2.circle(mask, (515, 270), 190, 0, -1); mask[:, :110] = 0
CX0, CY0 = 1030.0, 541.0                            # the white ball's centre at t 0.05 (frame +3), less that frame's camera offset
hx = lambda col: '#%02x%02x%02x' % tuple(int(v) for v in col[::-1])
frames = []
for k in range(-3, N):
    c.set(cv2.CAP_PROP_POS_FRAMES, F0 + k); ok, f = c.read()
    g = cv2.cvtColor(cv2.resize(f, (960, 540)), cv2.COLOR_BGR2GRAY).astype(np.float32); w = np.eye(2, 3, dtype=np.float32)
    try: _, w = cv2.findTransformECC(g0, g, w, cv2.MOTION_TRANSLATION, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5), mask, 5)
    except cv2.error: pass
    frames.append((k, f, float(w[0, 2]) * 2, float(w[1, 2]) * 2))
off3 = next((dx, dy) for k, f, dx, dy in frames if k == 3)
base = next(f for k, f, dx, dy in frames if k == -3).astype(int)
rows = []
for k, f, dx, dy in frames:
    if k < 0: continue
    cx, cy = CX0 - off3[0] + dx, CY0 - off3[1] + dy
    h = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(int); H, S, V = h[..., 0], h[..., 1], h[..., 2]
    yy, xx = np.mgrid[0:1080, 0:1920]; ddx = xx - cx; ddy = (yy - cy) / 0.88; r = np.hypot(ddx, ddy); ang = np.arctan2(ddy, ddx)
    near = r < 360
    # (against the frame before the blast, shifted by the camera's motion since)
    M = np.float32([[1, 0, dx - [d for kk, _, d, _ in frames if kk == -3][0]], [0, 1, dy - [d for kk, _, _, d in frames if kk == -3][0]]])
    b = cv2.warpAffine(base.astype(np.uint8), M, (1920, 1080)).astype(int)
    chg = np.abs(f.astype(int) - b).sum(-1) > 70
    white = near & (S < 30) & (V > 247) & (r < 140)
    yellow = near & chg & (H >= 22) & (H <= 34) & (S > 90) & (V > 235)
    warm = near & chg & (S > 100) & ((H <= 35) | (H >= 160)) & (V > 170)
    fire = near & chg & (S > 140) & ((H <= 14) | (H >= 165)) & (V > 90) & (V <= 235)
    smoke = near & chg & (V < 150) & (S < 150)
    pale = near & chg & (S < 100) & (V > 215) & ~white
    rr_o, rr_i = [], []
    for a in np.linspace(-np.pi, np.pi, 72, endpoint=False):
        sel = warm & (np.abs(np.angle(np.exp(1j * (ang - a)))) < np.pi / 72)
        if sel.sum() > 3: rr_o.append(np.percentile(r[sel], 97)); rr_i.append(np.percentile(r[sel], 20))
    n, lab, st, cen = cv2.connectedComponentsWithStats(fire.astype(np.uint8))
    blobs = [(st[i, 4], np.hypot(cen[i][0] - cx, (cen[i][1] - cy) / 0.88)) for i in range(1, n) if st[i, 4] >= 60]
    ring_band = warm & (r > (np.median(rr_o) * 0.85 if rr_o else 1e9))
    rows.append(dict(k=k, t=round(k / 60, 4), cx=round(cx, 1), cy=round(cy, 1), shake=[round(dx, 1), round(dy, 1)],
                     white_r=round(float(np.sqrt(white.sum() / np.pi)), 1), yellow_px=int(yellow.sum()),
                     yellow_r=round(float(np.percentile(r[yellow], 95)), 1) if yellow.sum() > 200 else 0,
                     ring_out=round(float(np.median(rr_o)), 1) if len(rr_o) > 20 else 0, ring_in=round(float(np.median(rr_i)), 1) if len(rr_i) > 20 else 0,
                     ring_col=hx(np.median(f[ring_band], 0)) if ring_band.sum() > 50 else '-',
                     fire_n=len(blobs), fire_px=int(fire.sum()), fire_area=round(float(np.median([a for a, _ in blobs])), 0) if blobs else 0,
                     fire_out=round(float(np.median([d for _, d in blobs])), 0) if blobs else 0, fire_col=hx(np.median(f[fire], 0)) if fire.sum() > 50 else '-',
                     smoke_px=int(smoke.sum()), smoke_col=hx(np.median(f[smoke], 0)) if smoke.sum() > 50 else '-', pale_px=int(pale.sum())))
    q = rows[-1]
    print('f%2d %.3f  white %5.1f  yellow %6d r%5.0f  ring %5.0f..%5.0f %s  fire %2d/%6d a%4.0f out%4.0f %s  smoke %6d %s  pale %6d' % (
        q['k'], q['t'], q['white_r'], q['yellow_px'], q['yellow_r'], q['ring_in'], q['ring_out'], q['ring_col'], q['fire_n'], q['fire_px'], q['fire_area'], q['fire_out'], q['fire_col'], q['smoke_px'], q['smoke_col'], q['pale_px']))
json.dump(rows, open('art/physics_reference/output/blast_hq.json', 'w'), indent=1)
