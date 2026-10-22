"""Trace an effect cut out of the reference video (vfx_extract.py, VFX_RAW) into our own vector animation: one SVG per frame,
flat-colour shapes with smooth edges, the same motion frame for frame. The SVGs are the asset (resolution-free, editable, usable
in any engine: art/vfx_library/<name>/); the TV plays an atlas rendered from them at any size (owner, 2026-10-21: the
animation must be ours, reusable in another game, and crisp).

  vfx_vectorize.py RAW.npz LIBRARY_DIR ATLAS_DIR [--colours K] [--scale S]
"""
import json, os, sys, argparse
import cv2, numpy as np

SUPER = 8  # tracing resolution, x the video's
BLEED = 0.35  # video px each shape reaches into its neighbours (no hairline gaps)


def palette(cells, k):
    """The effect's own colours: k-means (in Lab) over every opaque pixel of every frame."""
    # only shape interiors: an edge pixel is the video's blur of a colour into the ground, not a colour of its own
    inner = [cv2.erode((c[..., 3] > 200).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0 for c in cells]
    px = np.concatenate([c[..., :3][m] for c, m in zip(cells, inner) if m.any()] or
                        [c[..., :3][c[..., 3] > 128] for c in cells if (c[..., 3] > 128).any()])
    if len(px) > 60000:
        px = px[np.random.default_rng(0).choice(len(px), 60000, replace=False)]
    lab = cv2.cvtColor(px.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    k = min(k, len(np.unique(px, axis=0)))
    _, labels, centres = cv2.kmeans(lab, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.2), 6,
                                    cv2.KMEANS_PP_CENTERS)
    bgr = cv2.cvtColor(centres.astype(np.uint8).reshape(-1, 1, 3), cv2.COLOR_LAB2BGR).reshape(-1, 3)
    return centres, bgr


def chaikin(pts, n=2):
    for _ in range(n):
        q = 0.75 * pts + 0.25 * np.roll(pts, -1, axis=0)
        r = 0.25 * pts + 0.75 * np.roll(pts, -1, axis=0)
        pts = np.empty((len(pts) * 2, 2), np.float32)
        pts[0::2], pts[1::2] = q, r
    return pts


def trace(cell, centres):
    """One frame -> [(colour index, opacity, [outer rings], [hole rings])] in video px."""
    a = cell[..., 3].astype(np.float32) / 255
    if a.max() < 0.05:
        return []
    lab = cv2.cvtColor(cell[..., :3], cv2.COLOR_BGR2LAB).astype(np.float32)
    d = ((lab[:, :, None, :] - centres[None, None]) ** 2).sum(-1)
    label = d.argmin(-1).astype(np.uint8)
    label = cv2.medianBlur(label, 3)
    h, w = a.shape
    layers = []
    # every colour's share of each pixel, smoothed up to SUPER x: a sub-pixel edge where the shares cross
    shares = []
    for ci in range(len(centres)):
        m = (label == ci).astype(np.float32) * a
        big = cv2.resize(m, (w * SUPER, h * SUPER), interpolation=cv2.INTER_CUBIC)
        shares.append(cv2.GaussianBlur(big, (0, 0), SUPER * 0.45))
    shares = np.array(shares)
    total = shares.sum(0)
    owner = shares.argmax(0)
    present = total > 0.5 * max(0.35, float(np.percentile(a[a > 0.05], 50)) if (a > 0.05).any() else 1)
    for ci in range(len(centres)):
        mask = ((owner == ci) & present).astype(np.uint8)
        if mask.sum() < SUPER * SUPER * 0.6:
            continue
        sel = (label == ci) & (a > 0.05)
        # the shape's own opacity: its solid part (its soft edges are the video's blur, not a fade)
        opacity = float(np.clip(np.percentile(a[sel], 90) * 1.05, 0, 1)) if sel.any() else 1.0
        opacity = 1.0 if opacity > 0.85 else opacity
        contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        outers, holes = [], []
        for k, c in enumerate(contours):
            if cv2.contourArea(c) < SUPER * SUPER * 1.5:
                continue
            c = cv2.approxPolyDP(c, SUPER * 0.35, True).reshape(-1, 2).astype(np.float32)
            if len(c) < 3:
                continue
            c = chaikin(c) / SUPER
            (holes if hier[0][k][3] >= 0 else outers).append(c)
        if outers:
            layers.append((ci, opacity, outers, holes))
    # big shapes first: small details sit on top
    layers.sort(key=lambda l: -sum(cv2.contourArea(o) for o in l[2]))
    return layers


def svg(layers, colours, size):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">']
    for ci, op, outers, holes in layers:
        b, g, r = (int(v) for v in colours[ci])
        d = ''.join('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in ring) + 'Z' for ring in outers + holes)
        # a hairline of its own colour round it: neighbouring colours meet without a gap
        out.append(f'<path fill="#{r:02x}{g:02x}{b:02x}" fill-opacity="{op:.3f}" fill-rule="evenodd" stroke="#{r:02x}{g:02x}{b:02x}" '
                   f'stroke-opacity="{op:.3f}" stroke-width="{BLEED * 2:.2f}" stroke-linejoin="round" d="{d}"/>')
    out.append('</svg>')
    return '\n'.join(out)


def render(layers, colours, size, px):
    """The frame drawn at px x px, anti-aliased (4x supersampled), premultiplied over clear."""
    ss = 4
    n = px * ss
    k = n / size
    acc = np.zeros((n, n, 4), np.float32)
    for ci, op, outers, holes in layers:
        m = np.zeros((n, n), np.uint8)
        cv2.fillPoly(m, [np.round(o * k).astype(np.int32) for o in outers], 255, cv2.LINE_AA)
        if holes:
            cv2.fillPoly(m, [np.round(hh * k).astype(np.int32) for hh in holes], 0, cv2.LINE_AA)
        g = max(1, int(round(BLEED * k)))
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * g + 1, 2 * g + 1)))
        al = (m.astype(np.float32) / 255 * op)[..., None]
        col = np.array(list(colours[ci]) + [1.0], np.float32)
        col[:3] /= 255
        acc = acc * (1 - al) + np.concatenate([col[:3] * al, al], -1)
    img = cv2.resize(acc, (px, px), interpolation=cv2.INTER_AREA)
    a = img[..., 3:4]
    rgb = np.where(a > 1e-4, img[..., :3] / np.maximum(a, 1e-4), 0)
    return (np.concatenate([rgb, a], -1) * 255).clip(0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('raw')
    ap.add_argument('library')
    ap.add_argument('atlas')
    ap.add_argument('--colours', type=int, default=8)
    ap.add_argument('--scale', type=float, default=16)  # as sharp as the atlas allows: the shapes are vectors
    ap.add_argument('--max-atlas', type=int, default=4096)
    o = ap.parse_args()
    z = np.load(o.raw)
    cells = list(z['cells'])
    name = os.path.splitext(os.path.basename(o.raw))[0]
    size = cells[0].shape[0]
    centres, colours = palette(cells, o.colours)
    lib = os.path.join(o.library, name)
    os.makedirs(lib, exist_ok=True)
    traced = [trace(c, centres) for c in cells]
    for i, layers in enumerate(traced):
        open(os.path.join(lib, f'frame_{i:03d}.svg'), 'w').write(svg(layers, colours, size))
    n = len(cells)
    cols = int(np.ceil(np.sqrt(n)))
    rows = int(np.ceil(n / cols))
    px = int(min(size * o.scale, o.max_atlas // cols, o.max_atlas // rows))
    atlas = np.zeros((rows * px, cols * px, 4), np.uint8)
    for i, layers in enumerate(traced):
        r, q = divmod(i, cols)
        atlas[r * px:(r + 1) * px, q * px:(q + 1) * px] = render(layers, colours, size, px)
    os.makedirs(o.atlas, exist_ok=True)
    cv2.imwrite(os.path.join(o.atlas, name + '.webp'), atlas, [cv2.IMWRITE_WEBP_QUALITY, 92])
    meta = {
        'name': name,
        'fps': float(z['fps']),
        'frames': n,
        'cols': cols,
        'rows': rows,
        'widths': size / float(z['charPx']),
        'ground': bool(z['ground']),
        'tintable': bool(z['tintable']),
        'loop': bool(z['loop']),
        **({'ringRadius': float(z['ringRadius'])} if 'ringRadius' in z else {}),
    }
    json.dump(meta, open(os.path.join(o.atlas, name + '.json'), 'w'), indent=1)
    json.dump({**meta, 'size': size, 'palette': ['#%02x%02x%02x' % tuple(int(v) for v in c[::-1]) for c in colours],
               'frameFiles': [f'frame_{i:03d}.svg' for i in range(n)]},
              open(os.path.join(lib, 'animation.json'), 'w'), indent=1)
    print(name, n, 'frames', len(colours), 'colours', atlas.shape, sum(len(l) for l in traced), 'shapes')


if __name__ == '__main__':
    main()
