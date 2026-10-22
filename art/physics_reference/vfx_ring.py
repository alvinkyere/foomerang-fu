"""The Explosive's ring as our own animation (vfx_extract.py rebuilds it whole and radially symmetric from the video): each
frame's radial colour profile, read from the rebuilt ring, drawn as a perfect ring at any resolution, and written as an SVG
radial gradient (art/vfx_library/blast_ring/). Usage: vfx_ring.py RAW.npz LIBRARY_DIR ATLAS_DIR [--scale S]"""
import json, os, argparse
import cv2, numpy as np


def profile(cell):
    """RGBA against the radius (px, 0.25 px steps), the median round the circle."""
    n = cell.shape[0]
    c = n / 2
    R = int(c)
    polar = cv2.warpPolar(cell.astype(np.float32), (R * 4, 360), (c, c), R, cv2.INTER_LINEAR + cv2.WARP_POLAR_LINEAR)
    prof = np.median(polar, axis=0)  # (R*4, 4)
    a = prof[:, 3:4]
    # premultiplied median -> straight colour where it is opaque enough
    return prof, R


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('raw'); ap.add_argument('library'); ap.add_argument('atlas')
    ap.add_argument('--scale', type=float, default=6); ap.add_argument('--max-atlas', type=int, default=4096)
    o = ap.parse_args()
    z = np.load(o.raw)
    cells = list(z['cells'])
    name = os.path.splitext(os.path.basename(o.raw))[0]
    size = cells[0].shape[0]
    n = len(cells)
    cols = int(np.ceil(np.sqrt(n))); rows = int(np.ceil(n / cols))
    px = int(min(size * o.scale, o.max_atlas // cols, o.max_atlas // rows))
    atlas = np.zeros((rows * px, cols * px, 4), np.uint8)
    lib = os.path.join(o.library, name); os.makedirs(lib, exist_ok=True)
    yy, xx = np.mgrid[0:px, 0:px]
    rr = np.hypot(xx + 0.5 - px / 2, yy + 0.5 - px / 2) * (size / px)  # in video px
    for i, cell in enumerate(cells):
        prof, R = profile(cell)
        radii = np.arange(len(prof)) / 4.0
        # colour from opaque samples only (the edges keep the ring's colour, fade by alpha)
        a = np.clip(prof[:, 3] / 255, 0, 1)
        col = prof[:, :3].copy()
        solid = np.nonzero(a > 0.6)[0]
        if len(solid):
            for q in range(len(col)):
                col[q] = prof[solid[np.argmin(np.abs(solid - q))], :3]
        # sharpen the band's edges (the video's are soft from its low resolution): a 0.5-px edge at our scale
        a = np.interp(a, [0.25, 0.75], [0, 1])
        out = np.zeros((px, px, 4), np.float32)
        for ch in range(3):
            out[..., ch] = np.interp(rr, radii, col[:, ch])
        out[..., 3] = np.interp(rr, radii, a) * 255
        out[rr > radii[-1]] = 0
        r_, q_ = divmod(i, cols)
        atlas[r_ * px:(r_ + 1) * px, q_ * px:(q_ + 1) * px] = out.clip(0, 255).astype(np.uint8)
        # the SVG: a radial gradient with a stop wherever the profile changes
        stops = []
        last = None
        for q in range(0, len(radii), 2):
            b, g, r = (int(v) for v in col[q]); op = float(a[q])
            cur = (r, g, b, round(op, 2))
            if cur != last:
                stops.append(f'<stop offset="{radii[q] / R:.4f}" stop-color="#{r:02x}{g:02x}{b:02x}" stop-opacity="{op:.3f}"/>')
                last = cur
        open(os.path.join(lib, f'frame_{i:03d}.svg'), 'w').write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
            f'<defs><radialGradient id="g" cx="{size/2}" cy="{size/2}" r="{R}" gradientUnits="userSpaceOnUse">{"".join(stops)}'
            f'</radialGradient></defs><circle cx="{size/2}" cy="{size/2}" r="{R}" fill="url(#g)"/></svg>')
    os.makedirs(o.atlas, exist_ok=True)
    cv2.imwrite(os.path.join(o.atlas, name + '.webp'), atlas, [cv2.IMWRITE_WEBP_QUALITY, 92])
    meta = {'name': name, 'fps': float(z['fps']), 'frames': n, 'cols': cols, 'rows': rows, 'widths': size / float(z['charPx']),
            'ground': True, 'tintable': False, 'loop': False, 'ringRadius': float(z['ringRadius'])}
    json.dump(meta, open(os.path.join(o.atlas, name + '.json'), 'w'), indent=1)
    json.dump({**meta, 'size': size, 'frameFiles': [f'frame_{i:03d}.svg' for i in range(n)]},
              open(os.path.join(lib, 'animation.json'), 'w'), indent=1)
    print(name, n, 'frames', atlas.shape)


if __name__ == '__main__':
    main()
