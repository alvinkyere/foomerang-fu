"""The gong islands' grass (2026-10-22): our own tileable texture for the island tops, writes blender/grass.png.

The HQ (foomerang-fu physics hq.mp4 9:04.0, 9:15.5, 9:41.6) shows the grass as one flat tone with soft rounded patches 2-4
units across, a little darker and a little lighter: #dff9ab, soft green #c6f0a9 for ~13%, light yellow #f4faaf for ~11%. Here the patches come from smooth noise that wraps at the edges (white noise filtered in frequency is
periodic), so the tile repeats without a seam. One tile covers TILE plan units.

  python art/sky_islands/grass.py       (from the repository root)
"""
import numpy as np, cv2

TILE = 16.0                # plan units a tile covers
PX = 1024                  # its size in pixels (64 px a unit; the game draws a unit ~16-30 px)
BASE, DARK, LIGHT = '#dff9ab', '#c6f0a9', '#f4faaf'
SHARE_DARK, SHARE_LIGHT = 0.13, 0.11
SOFT = 2.5                 # px: how soft a patch's edge is


def periodic_noise(seed, wavelength_px):
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((PX, PX))
    f = np.fft.fftfreq(PX)
    fx, fy = np.meshgrid(f, f)
    r = np.hypot(fx, fy) * wavelength_px
    keep = np.exp(-(r ** 2) * 4.0)                 # a soft low-pass: blobs about `wavelength_px` across
    n = np.real(np.fft.ifft2(np.fft.fft2(white) * keep))
    return (n - n.mean()) / n.std()


def bgr(h):
    return np.array([int(h[i:i + 2], 16) for i in (5, 3, 1)], np.float32)


def soft_mask(field, share):
    edge = np.quantile(field, 1 - share)
    m = (field > edge).astype(np.float32)
    m = cv2.GaussianBlur(np.tile(m, (3, 3)), (0, 0), SOFT)[PX:2 * PX, PX:2 * PX]     # blurred with its neighbours: seamless
    return m[..., None]


dark = soft_mask(periodic_noise(7, 150), SHARE_DARK)
light = soft_mask(periodic_noise(11, 120), SHARE_LIGHT) * (1 - dark)
img = bgr(BASE) * (1 - dark - light) + bgr(DARK) * dark + bgr(LIGHT) * light
cv2.imwrite('art/sky_islands/blender/grass.png', np.clip(img, 0, 255).astype(np.uint8))
print('grass tile:', PX, 'px for', TILE, 'units; dark', round(float(dark.mean()), 3), 'light', round(float(light.mean()), 3))
