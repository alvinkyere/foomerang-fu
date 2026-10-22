"""Cut an effect out of the reference video, frame by frame, as a flipbook the TV plays (owner, 2026-10-21: the video is the
owner's own; the effects must be exactly the video's).

  vfx_extract.py SPEC.json  ->  OUT/<name>.webp (frames in a grid, RGBA) + OUT/<name>.json (fps, frames, grid, size)

The spec says when the effect plays (`from`, `to`, seconds), where (`at`: its anchor in the frame at `from`, 640x360 px), how big
a crop (`half`, px), how wide a character is drawn there (`charPx`, for the scale), which frames make the clean background
(`plate`: [from, to], before the effect), and which pixels belong to the effect (`keep`: HSV ranges, each with an optional time
window and radius about the anchor). Frames are aligned to the frame at `from` (ORB + RANSAC homographies, chained), so a panning
camera does not smear the effect. Alpha is how far a pixel is from the plate (soft threshold), times the `keep` masks.
"""
import json, sys, os
import cv2, numpy as np

VIDEO = 'foomerang - fu physics.mp4'


def frames(c, fps, t0, t1):
    c.set(cv2.CAP_PROP_POS_FRAMES, int(round(t0 * fps)))
    i = int(round(t0 * fps))
    while i <= int(round(t1 * fps)):
        ok, f = c.read()
        if not ok:
            break
        yield i, i / fps, f
        i += 1


def align_all(c, fps, t_first, t_last, t_ref):
    """Every frame in [t_first, t_last] warped into the frame at t_ref's coordinates."""
    orb = cv2.ORB_create(3000)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    mask = np.full((360, 640), 255, np.uint8)
    mask[0:80, 0:90] = 0  # not the names in the corner
    seq = list(frames(c, fps, t_first, t_last))
    feats = [orb.detectAndCompute(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), mask) for _, _, f in seq]
    # H[k] maps frame k to frame k-1
    step = [np.eye(3)]
    for k in range(1, len(seq)):
        (ka, da), (kb, db) = feats[k], feats[k - 1]
        m = bf.match(da, db)
        H, _ = cv2.findHomography(np.float32([ka[x.queryIdx].pt for x in m]), np.float32([kb[x.trainIdx].pt for x in m]),
                                  cv2.RANSAC, 2.0)
        step.append(H if H is not None else np.eye(3))
    acc = [np.eye(3)]
    for k in range(1, len(seq)):
        acc.append(acc[-1] @ step[k])  # frame k -> frame 0
    ref = min(range(len(seq)), key=lambda k: abs(seq[k][1] - t_ref))
    to_ref = np.linalg.inv(acc[ref])
    return [(t, cv2.warpPerspective(f, to_ref @ acc[k], (640, 360), flags=cv2.INTER_LINEAR)) for k, (_, t, f) in enumerate(seq)]


def main(spec_path, out_dir):
    spec = json.load(open(spec_path))
    c = cv2.VideoCapture(VIDEO)
    fps = c.get(cv2.CAP_PROP_FPS)
    p0, p1 = spec['plate']
    aligned = align_all(c, fps, min(p0, spec['from']), max(p1, spec['to']), spec['from'])
    plate = np.median(np.array([f for t, f in aligned if p0 <= t <= p1]), axis=0).astype(np.float32)
    ax, ay = spec['at']
    h = spec['half']
    lo, hi = spec.get('threshold', [18, 48])
    cells = []
    track = spec.get('track')
    for t, f in aligned:
        if t < spec['from'] - 0.5 / fps or t > spec['to'] + 0.5 / fps:
            continue
        rel = t - spec['from']
        if track is not None:
            th = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
            tm = ((th[..., 0] >= track['h'][0]) & (th[..., 0] <= track['h'][1]) & (th[..., 1] >= track['s'][0]) & (th[..., 2] >= track['v'][0]))
            ty, tx = np.nonzero(tm)
            near = (tx - ax) ** 2 + (ty - ay) ** 2 <= track['radius'] ** 2
            if near.sum() > 8:
                ax, ay = float(np.median(tx[near])) + track.get('dx', 0), float(np.median(ty[near])) + track.get('dy', 0)
        diff = np.abs(f.astype(np.float32) - plate).max(axis=2)
        alpha = np.clip((diff - lo) / (hi - lo), 0, 1)
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        keep = np.zeros(alpha.shape, np.float32)
        yy, xx = np.mgrid[0:360, 0:640]
        for k in spec['keep']:
            if not (k.get('from', -1) <= rel <= k.get('to', 99)):
                continue
            hmin, hmax = k['h']
            hm = (hsv[..., 0] >= hmin) & (hsv[..., 0] <= hmax) if hmin <= hmax else (hsv[..., 0] >= hmin) | (hsv[..., 0] <= hmax)
            m = hm & (hsv[..., 1] >= k['s'][0]) & (hsv[..., 1] <= k['s'][1]) & (hsv[..., 2] >= k['v'][0]) & (hsv[..., 2] <= k['v'][1])
            if 'radius' in k:
                m &= (xx - ax) ** 2 + (yy - ay) ** 2 <= k['radius'] ** 2
            if 'above' in k:  # only pixels above anchor.y + above (e.g. smoke rising off a body)
                m &= yy <= ay + k['above']
            if 'below' in k:  # only pixels below anchor.y + below (e.g. not a badge above the effect)
                m &= yy >= ay + k['below']
            keep = np.maximum(keep, m.astype(np.float32))
        if 'cut' in spec:  # a solid shape the colours cannot isolate (the ice block): its outline, minus the character in it
            x0c, y0c, x1c, y1c, rr = spec['cut']
            box = np.zeros(alpha.shape, np.uint8)
            cv2.rectangle(box, (int(x0c + rr), int(y0c)), (int(x1c - rr), int(y1c)), 1, -1)
            cv2.rectangle(box, (int(x0c), int(y0c + rr)), (int(x1c), int(y1c - rr)), 1, -1)
            for qx, qy in ((x0c + rr, y0c + rr), (x1c - rr, y0c + rr), (x0c + rr, y1c - rr), (x1c - rr, y1c - rr)):
                cv2.circle(box, (int(qx), int(qy)), int(rr), 1, -1)
            keep = box.astype(np.float32)
            if spec.get('inpaint', False):
                # the character inside is not the block: fill where it is from the ice round it
                hole = np.zeros(alpha.shape, np.uint8)
                for ex in spec.get('except', []):
                    hole |= ((hsv[..., 0] >= ex['h'][0]) & (hsv[..., 0] <= ex['h'][1]) & (hsv[..., 1] >= ex['s'][0])
                             & (hsv[..., 1] <= ex['s'][1]) & (hsv[..., 2] >= ex['v'][0]) & (hsv[..., 2] <= ex['v'][1])).astype(np.uint8)
                hole = cv2.dilate(hole, np.ones((3, 3), np.uint8)) & box
                f = cv2.inpaint(f, hole, 4, cv2.INPAINT_TELEA)
                spec_except = []
            else:
                spec_except = spec.get('except', [])
            for ex in spec_except:
                hm = ((hsv[..., 0] >= ex['h'][0]) & (hsv[..., 0] <= ex['h'][1]) & (hsv[..., 1] >= ex['s'][0]) & (hsv[..., 1] <= ex['s'][1])
                      & (hsv[..., 2] >= ex['v'][0]) & (hsv[..., 2] <= ex['v'][1]))
                hm = cv2.dilate(hm.astype(np.uint8), np.ones((2, 2), np.uint8)) > 0
                keep[hm] = 0
            alpha = np.ones_like(alpha)
        if spec.get('open', 0) > 0:  # thin lines (a misaligned edge of the scenery) are not effect
            o = spec['open']
            keep = cv2.morphologyEx((keep * (alpha > 0.3)).astype(np.float32), cv2.MORPH_OPEN, np.ones((o, o), np.uint8))
        keep = cv2.GaussianBlur(keep, (3, 3), 0)
        a = alpha * keep
        x0, y0 = int(round(ax - h)), int(round(ay - h))
        crop = np.zeros((2 * h, 2 * h, 4), np.uint8)
        sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(640, x0 + 2 * h), min(360, y0 + 2 * h)
        crop[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0, :3] = f[sy0:sy1, sx0:sx1]
        crop[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0, 3] = (a[sy0:sy1, sx0:sx1] * 255).astype(np.uint8)
        cells.append(crop)
    if spec.get('fadeLast', 0) > 0:  # the video's own last frames, faded out (where the shot cuts before the effect ends)
        n_f = spec['fadeLast']
        for q in range(n_f):
            cc = cells[len(cells) - n_f + q]
            cc[..., 3] = (cc[..., 3].astype(np.float32) * (1 - (q + 1) / (n_f + 1))).astype(np.uint8)
    if 'ring' in spec:
        cells = split_ring(spec, cells, out_dir)
    # the raw cut (video resolution, RGBA) for vfx_vectorize.py, which traces it into our own vector frames
    raw = os.environ.get('VFX_RAW')
    if raw:
        os.makedirs(raw, exist_ok=True)
        np.savez_compressed(os.path.join(raw, spec['name'] + '.npz'), cells=np.array(cells), charPx=spec['charPx'],
                            fps=spec.get('fps', 30), ground=spec.get('ground', False), tintable=spec.get('tintable', False),
                            loop=spec.get('loop', False))
    if spec.get('tintable', False):
        # the power-coloured parts become white (light kept), so the TV tints them with any power's colour; the white flash
        # stays white either way
        for cc in cells:
            hsv = cv2.cvtColor(cc[..., :3], cv2.COLOR_BGR2HSV)
            v = hsv[..., 2].astype(np.float32) / 255
            grey = np.clip(0.55 + 0.45 * v + (1 - hsv[..., 1].astype(np.float32) / 255) * 0.3, 0, 1)
            cc[..., :3] = (grey[..., None] * 255).astype(np.uint8)
    write_atlas(spec, cells, out_dir)


def split_ring(spec, cells, out_dir):
    """A ring that spreads on the ground (the Explosive's blast) is part-hidden in the video's shot. Each frame's ring is read as
    its radial colour profile (ellipse-normalised about the ring's centre, the median over the angles where it shows) and swept
    round a full circle lying flat: `<name>_ring`, a ground flipbook. The core (everything inside `ring.core` of the ring's
    radius) stays in the camera-facing flipbook."""
    r = spec['ring']
    h = spec['half']
    cx, cy = h + r['centre'][0], h + r['centre'][1]
    aspect = r['aspect']  # the ring's height / width on screen (the camera's foreshortening)
    yy, xx = np.mgrid[0:2 * h, 0:2 * h]
    ex, ey = (xx - cx), (yy - cy) / aspect
    rad = np.hypot(ex, ey)
    ang = (np.degrees(np.arctan2(ey, ex)) + 360) % 360
    # each frame's ring radius (horizontal semi-axis, video px): where its alpha-weighted band is, outside the core
    radii = []
    ringpx = []
    for cc in cells:
        a = cc[..., 3] > 100
        hsv = cv2.cvtColor(cc[..., :3], cv2.COLOR_BGR2HSV)
        hue = hsv[..., 0]
        warm = (hue <= 34) | (hue >= 160)
        band = a & warm & (hsv[..., 1] > 90) & (hsv[..., 2] > 190) & (rad > r['minRadius']) & (rad < r['maxRadius'])
        ringpx.append(band)
        radii.append(float(np.median(rad[band])) if band.sum() > r.get('minPixels', 150) else 0.0)
    radii = np.array(radii)
    radii = np.maximum.accumulate(radii)  # it only grows
    print('ring radii', [round(x) for x in radii])
    outer = max(radii) * 1.2
    n_out = 2 * int(np.ceil(outer))
    oy, ox = np.mgrid[0:n_out, 0:n_out]
    orad = np.hypot(ox - n_out / 2, oy - n_out / 2)
    # the angles where the ring shows in the frame it is most whole
    full = int(np.argmax([b.sum() for b in ringpx]))
    a_full = ringpx[full]
    print('full frame', full)
    visible = np.zeros(360, bool)
    for d in range(360):
        sel = (ang.astype(int) == d) & (rad > r['minRadius']) & (rad < r['maxRadius'])
        visible[d] = sel.any() and a_full[sel].any()
    print('visible degrees', int(visible.sum()))
    rings, cores = [], []
    R = int(r['maxRadius'] * 1.25)
    for k, cc in enumerate(cells):
        out = np.zeros((n_out, n_out, 4), np.uint8)
        if radii[k] > 0 and k >= r.get('firstFrame', 0):
            # undo the camera's foreshortening (stretch rows by 1/aspect about the centre), then resample in polar form:
            # rows are angles (1° each), columns radius (1 px each), continuous, no aliasing
            sy = 1 / aspect
            M = np.float32([[1, 0, 0], [0, sy, cy * (1 - sy)]])
            flat = cv2.warpAffine(cc, M, (2 * h, int(2 * h * sy) + 1), flags=cv2.INTER_LINEAR)
            polar = cv2.warpPolar(flat.astype(np.float32), (R, 360), (cx, cy), R, cv2.INTER_LINEAR + cv2.WARP_POLAR_LINEAR)
            band = cv2.warpPolar(ringpx[k].astype(np.float32), (R, 360), (cx, cy * 1.0), R, cv2.INTER_LINEAR)  # (before the stretch: only as a guide)
            # the ring at each angle: the strongest warm alpha beyond minRadius
            hsvp = cv2.cvtColor(np.clip(polar[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
            warm = ((hsvp[..., 0] <= 34) | (hsvp[..., 0] >= 160)) & (hsvp[..., 1] > 90) & (hsvp[..., 2] > 190)
            score = polar[..., 3] * warm
            lo_r = max(r['minRadius'], int(radii[k]) - 12)
            hi_r = min(r['maxRadius'], int(radii[k]) + 12)
            score[:, :lo_r] = 0
            score[:, hi_r:] = 0
            peaks = np.argmax(cv2.GaussianBlur(score, (1, 5), 0), axis=1)
            seen = np.array([visible[d] and score[d].max() > 60 for d in range(360)])
            if seen.sum() > 30:
                P = int(np.median(peaks[seen]))
                rows = []
                for d in np.nonzero(seen)[0]:
                    shift = P - peaks[d]
                    rows.append(np.roll(polar[d], shift, axis=0))
                prof = np.median(np.array(rows), axis=0)  # (R, 4)
                # colour where it is opaque is the mean colour of the rows that are opaque there (not dragged by clear ones)
                rows_a = np.array(rows)
                w = (rows_a[..., 3:4] > 140).astype(np.float32)
                prof[:, :3] = (rows_a[..., :3] * w).sum(0) / np.maximum(w.sum(0), 1e-3)
                prof[w.sum(0)[:, 0] < 5, 3] = 0  # no opaque samples: clear
                # only the ring's band: inside it is the core (its own flipbook)
                prof[: int(r['core'] * P), 3] = 0
                prof[: max(0, int(P * (1 - r['band']))), 3] = 0
                prof[int(P * (1 + r['band'])):, 3] = 0
                prof[:, 3] = cv2.GaussianBlur(prof[:, 3].reshape(-1, 1), (1, 3), 0).ravel()
                # an edge pixel's colour is the video's blend with the ground under it: take the ring's own colour from the
                # nearest solid radius
                solid = np.nonzero(prof[:, 3] > 200)[0]
                if len(solid):
                    for q in range(len(prof)):
                        prof[q, :3] = prof[solid[np.argmin(np.abs(solid - q))], :3]
                full_polar = np.repeat(prof[None, :, :], 360, axis=0).astype(np.float32)
                scale = 1.0
                big = cv2.warpPolar(full_polar, (n_out, n_out), (n_out / 2, n_out / 2), R * scale,
                                    cv2.INTER_LINEAR + cv2.WARP_POLAR_LINEAR + cv2.WARP_INVERSE_MAP)
                out = np.clip(big, 0, 255).astype(np.uint8)
                oy2, ox2 = np.mgrid[0:n_out, 0:n_out]
                out[np.hypot(ox2 - n_out / 2, oy2 - n_out / 2) >= R - 1] = 0
                radii[k] = float(P)
        rings.append(out)
        core = cc.copy()
        cut = rad > (r['core'] * radii[k] if radii[k] > 0 else 1e9)
        core[cut, 3] = 0
        cores.append(core)
    ring_spec = dict(spec, name=spec['name'] + '_ring', tintable=False)
    raw = os.environ.get('VFX_RAW')
    if raw:
        os.makedirs(raw, exist_ok=True)
        np.savez_compressed(os.path.join(raw, ring_spec['name'] + '.npz'), cells=np.array(rings), charPx=spec['charPx'],
                            fps=spec.get('fps', 30), ground=True, tintable=False, loop=False,
                            ringRadius=float(max(radii)) / n_out)
    # widths: one ring cell spans n_out video px horizontally; the ring's final radius is max(radii)
    write_atlas(ring_spec, rings, out_dir, widths=n_out / spec['charPx'], ground=True,
                extra={'ringRadius': float(max(radii)) / n_out})
    return cores


MAX_ATLAS = 4096  # what a TV's GPU can be relied on to hold in one texture


def write_atlas(spec, cells, out_dir, widths=None, ground=None, extra=None):
    """The frames in a grid (row by row), each upscaled as far as the grid still fits in MAX_ATLAS."""
    n = len(cells)
    cols = int(np.ceil(np.sqrt(n)))
    rows = int(np.ceil(n / cols))
    src = cells[0].shape[0]
    # 2x: the video is 640 x 360; more adds no detail
    cell = min(src * spec.get('upscale', 2), MAX_ATLAS // cols, MAX_ATLAS // rows)
    atlas = np.zeros((rows * cell, cols * cell, 4), np.uint8)
    for k, cc in enumerate(cells):
        r, q = divmod(k, cols)
        atlas[r * cell:(r + 1) * cell, q * cell:(q + 1) * cell] = cv2.resize(cc, (cell, cell), interpolation=cv2.INTER_CUBIC)
    os.makedirs(out_dir, exist_ok=True)
    cv2.imwrite(os.path.join(out_dir, spec['name'] + '.webp'), atlas, [cv2.IMWRITE_WEBP_QUALITY, 90])
    meta = {
        'name': spec['name'],
        'source': spec['source'],
        'fps': spec.get('fps', 30),
        'frames': n,
        'cols': cols,
        'rows': rows,
        # how many character widths one frame spans (the cell is 2·half px of video; a character is charPx px there)
        'widths': widths if widths is not None else src / spec['charPx'],
        'ground': ground if ground is not None else spec.get('ground', False),
        'tintable': spec.get('tintable', False),
        'loop': spec.get('loop', False),
        **(extra or {}),
    }
    json.dump(meta, open(os.path.join(out_dir, spec['name'] + '.json'), 'w'), indent=1)
    print(spec['name'], n, 'frames', atlas.shape)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'art/physics_reference/output/vfx')
