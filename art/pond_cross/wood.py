"""The raft's wood (2026-10-28): our own painted texture in the HQ's colours, 4:27 of foomerang-fu physics hq.mp4.

The HQ's deck is one flat tan (#b39e7b: 4:27, its centre square, a standard deviation of 2 in 255, which is the video's own noise): no
grain, no streaks; the grooves between planks are dark brown, the plank's side a dark red-brown. Measured: the deck's lightness
varies by only ~2% across a plank (outside the shadow of a crate or an edge). This paints that: the base, low-frequency patches
of +-2%, a faint grain. Tiles seamlessly (wrap-around blur). Writes blender/wood.png.

  python art/pond_cross/wood.py       (from the repository root)
"""
import numpy as np, cv2

N = 512
rng = np.random.default_rng(3)
import sys
sys.path.insert(0, 'art/pond_cross')
import colour as HQ
_h = HQ.lit('#b39e7b', 0.98)                                      # the HQ's deck #b39e7b as the video looks in a browser, as a base the game's light scales by ~0.98
base = np.minimum(np.array([int(_h[5:7], 16), int(_h[3:5], 16), int(_h[1:3], 16)], np.float32) * 1.025, 255)   # (BGR; x1.025: measured in the game, the deck came 3 levels under the HQ's)


def soft(sigma, shape=(N, N)):
    n = rng.random(shape).astype(np.float32)
    n = cv2.GaussianBlur(np.tile(n, (3, 3)), (0, 0), sigma)[N:2 * N, N:2 * N]
    return (n - n.mean()) / (n.std() + 1e-6)


patch = soft(38) * 0.6 + soft(14) * 0.4                         # soft patches of tone
tone = 1 + 0.006 * patch                                      # the HQ's deck has NO grain: a flat tan (std 2 of 255 in its clean centre square), with a breath of soft variation
img = np.clip(base[None, None, :] * tone[..., None], 0, 255).astype(np.uint8)
cv2.imwrite('art/pond_cross/blender/wood.png', img)
print('wood', img.shape, 'mean #%02x%02x%02x' % tuple(int(x) for x in img.reshape(-1, 3).mean(0)[::-1]))
