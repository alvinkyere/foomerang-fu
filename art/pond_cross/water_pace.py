"""How fast the cartoon water changes, against the HQ's (2026-10-29: "the water is a little too aggressive ... match the HQ").

The HQ's bank-edge foam (foomerang-fu physics hq.mp4 266.75-268.1 s, a steady stretch: no camera move) changes, between two frames a
gap apart, by (share of foam pixels that differ): 1 frame (1/60 s) 0.07, 3 frames 0.10, 6 (0.1 s) 0.17, 12 (0.2 s) 0.28, 24 (0.4 s)
0.44: a smooth, continuous change, not hard re-draws. This replays the shader's ribbon maths (render/three/waterShader.ts
cartoonFragment) over the real field texture (water.png) at times a gap apart, measures the same quantity near the banks, and
searches the shader's speeds for the closest match.

  python art/pond_cross/water_pace.py       (from the repository root; needs package.py run first)
"""
import itertools, math
import numpy as np, cv2
from scipy.ndimage import map_coordinates

tex = cv2.imread('apps/console/public/maps/pond_cross/water.png').astype(np.float32) / 255      # B fine noise, G blobs, R distance
B, G, R = tex[..., 0], tex[..., 1], tex[..., 2]
N = R.shape[0]
FAR = 2.0
D = R * FAR
near = D < 1.7
yy, xx = np.mgrid[0:N, 0:N]
uv = np.stack([(xx + 0.5) / N, (yy + 0.5) / N])


def sample(img, scale, off):
    u, v = uv[0] * scale + off[0], uv[1] * scale + off[1]
    return map_coordinates(img, [(v % 1.0) * N - 0.5, (u % 1.0) * N - 0.5], order=1, mode='wrap')


def hash_(n): return (np.sin(n * 127.1) * 43758.5453) % 1.0
def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k)


def foam(t, fps, wobble_amp, motion, ribbons):
    step, frac = math.floor(t * fps), (t * fps) % 1.0
    wa = sample(B, 1.3, (hash_(step), hash_(step + 11.0))); wb = sample(B, 1.3, (hash_(step + 1.0), hash_(step + 12.0)))
    wob = wa + (wb - wa) * smooth(0, 1, frac) - 0.5                      # (a morph between two draws, not a jump)
    dw = D + wob * wobble_amp
    out = np.zeros_like(D)
    for i, (centre, width, sway) in enumerate(ribbons):
        n = sample(G, 1.5 + 0.7 * i, ((t * (0.010 + 0.003 * i) * motion) + 0.31 * (i + 1), (t * (-0.007 - 0.002 * i) * motion) + 0.17 * (i + 1)))
        c = centre + sway * np.sin(t * (0.7 + 0.2 * i) * motion + n * 6.2832 + 1.3 * i)
        reach = width * smooth(0.28, 0.55, n)
        out = np.maximum(out, 1.0 - smooth(reach * 0.6, reach, np.abs(dw - c)))
    return (out > 0.5) & near


def churn(params, gaps=(1, 3, 6, 12, 24), starts=(0.3, 1.1, 1.9, 2.7)):
    res = []
    for g in gaps:
        v = []
        for t0 in starts:
            a, b = foam(t0, *params), foam(t0 + g / 60.0, *params)
            v.append((a ^ b).sum() / max((a | b).sum(), 1))
        res.append(float(np.mean(v)))
    return res


HQ = [0.07, 0.10, 0.17, 0.28, 0.44]
RIB = [(0.42, 0.34, 0.10), (1.05, 0.20, 0.15)]
if __name__ == '__main__':
    print('HQ        ', ' '.join('%.2f' % x for x in HQ))
    print('as built  ', ' '.join('%.2f' % x for x in churn((8, 0.34, 1.0, RIB))), ' (8 fps, wobble 0.34, hard steps then; now morphing)')
    best = None
    for fps, amp, motion in itertools.product((1.5, 2.5, 3.5, 5.0), (0.2, 0.3, 0.4), (0.6, 1.0, 1.6, 2.4)):
        c = churn((fps, amp, motion, RIB)); err = sum((a - b) ** 2 for a, b in zip(c, HQ))
        if best is None or err < best[0]: best = (err, fps, amp, motion, c)
    print('best match', ' '.join('%.2f' % x for x in best[4]), ' -> fps %.1f, wobble %.2f, motion x%.1f' % best[1:4])
