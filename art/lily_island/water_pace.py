"""How fast the cartoon water changes, against the HQ's (2026-10-29: "the water is a little too aggressive ... match the HQ").

The HQ's bank-edge foam (foomerang-fu physics hq.mp4 266.75-268.1 s, a steady stretch: no camera move) changes, between two frames a
gap apart, by (share of foam pixels that differ): 1 frame (1/60 s) 0.07, 3 frames 0.10, 6 (0.1 s) 0.17, 12 (0.2 s) 0.28, 24 (0.4 s)
0.44: a smooth, continuous change, not hard re-draws. This replays the shader's ribbon maths (render/three/waterShader.ts
cartoonFragment) over the real field texture (water.png) at times a gap apart, measures the same quantity near the banks, and
searches the shader's speeds for the closest match.

  python art/lily_island/water_pace.py       (from the repository root; needs package.py run first)
"""
import itertools, math
import numpy as np, cv2
from scipy.ndimage import map_coordinates

tex = cv2.imread('apps/console/public/maps/lily_island/water.png').astype(np.float32) / 255      # B fine noise, G blobs, R distance
B, G, R = tex[..., 0], tex[..., 1], tex[..., 2]
N = R.shape[0]
FAR = 2.0
D = R * FAR
near = D < 1.7
yy, xx = np.mgrid[0:N, 0:N]
uv = np.stack([(xx + 0.5) / N, (yy + 0.5) / N])


SCALE, WSCALE = 1.5, 1.3
LO, HI = 0.28, 0.55                           # (the shader's presence thresholds: where a ribbon exists along an edge)                      # (the shader's `scale` and `wobbleScale`)


def sample(img, scale, off):
    u, v = uv[0] * scale + off[0], uv[1] * scale + off[1]
    return map_coordinates(img, [(v % 1.0) * N - 0.5, (u % 1.0) * N - 0.5], order=1, mode='wrap')


def hash_(n): return (np.sin(n * 127.1) * 43758.5453) % 1.0
def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k)


def foam(t, fps, wobble_amp, motion, ribbons):
    step, frac = math.floor(t * fps), (t * fps) % 1.0
    ease = smooth(0, 1, frac)
    wa = sample(B, WSCALE, (hash_(step), hash_(step + 11.0))); wb = sample(B, WSCALE, (hash_(step + 1.0), hash_(step + 12.0)))
    dw = D + (wa + (wb - wa) * ease - 0.5) * wobble_amp            # (the outline: a morph between two draws)
    out = np.zeros_like(D)
    for i, (centre, width, sway) in enumerate(ribbons):
        k = i + 1; sc = SCALE * (1 + 0.4667 * i); base = (0.31 * k, 0.17 * k)
        na = sample(G, sc, (base[0] + hash_(step + 17.0 * k), base[1] + hash_(step + 29.0 * k)))
        nb = sample(G, sc, (base[0] + hash_(step + 18.0 * k), base[1] + hash_(step + 30.0 * k)))
        n = na + (nb - na) * ease                                   # (present where it is: eased from one draw to the next, no sliding)
        c = centre + sway * np.sin(t * (0.7 + 0.2 * i) * motion + n * 6.2832 + 1.3 * i)
        reach = width * smooth(LO, HI, n)
        out = np.maximum(out, 1.0 - smooth(reach * 0.6, reach, np.abs(dw - c)))
    return (out > 0.5) & (D < 1.7)


def churn(params, gaps=(1, 3, 6, 12, 24), starts=(0.3, 1.1, 1.9, 2.7)):
    res = []
    for g in gaps:
        v = []
        for t0 in starts:
            a, b = foam(t0, *params), foam(t0 + g / 60.0, *params)
            v.append((a ^ b).sum() / max((a | b).sum(), 1))
        res.append(float(np.mean(v)))
    return res


HQ = [0.07, 0.10, 0.17, 0.28, 0.44]          # (the banks' foam)
HQ_RAFT = None                              # (filled in by raft_region_hq(): the foam round the turning raft)
RIB = [(0.42, 0.34, 0.10), (1.05, 0.20, 0.15)]
if __name__ == '__main__' and 'raft' not in __import__('sys').argv:
    print('HQ        ', ' '.join('%.2f' % x for x in HQ))
    print('as built  ', ' '.join('%.2f' % x for x in churn((8, 0.34, 1.0, RIB))), ' (8 fps, wobble 0.34, hard steps then; now morphing)')
    best = None
    for fps, amp, motion in itertools.product((1.5, 2.5, 3.5, 5.0), (0.2, 0.3, 0.4), (0.6, 1.0, 1.6, 2.4)):
        c = churn((fps, amp, motion, RIB)); err = sum((a - b) ** 2 for a, b in zip(c, HQ))
        if best is None or err < best[0]: best = (err, fps, amp, motion, c)
    print('best match', ' '.join('%.2f' % x for x in best[4]), ' -> fps %.1f, wobble %.2f, motion x%.1f' % best[1:4])


# ---------------------------------------------------------------------------------------------------------------- round the raft
import json
GR = json.load(open('art/lily_island/ground.json'))['polygons']
RAFT = json.load(open('art/lily_island/raft.json'))
_xs = [p[0] for g in GR for p in g]; _ys = [p[1] for g in GR for p in g]
HALF = (max(max(_xs) - min(_xs), max(_ys) - min(_ys)) / 2 + 12) * 1.03
CX, CY = (min(_xs) + max(_xs)) / 2, (min(_ys) + max(_ys)) / 2
PX = CX - HALF + (np.arange(N) + 0.5) / N * 2 * HALF                     # plan x of a texel column
PY = CY + HALF - (np.arange(N) + 0.5) / N * 2 * HALF                     # plan y of a texel row (north to south)
GX, GY = np.meshgrid(PX, PY)


def raft_distance(t):
    """Distance from each texel to the raft's two planks at time t (plan angle counter-clockwise: -degreesPerSecond, the rules' sign)."""
    a = math.radians(RAFT['degrees'] - RAFT['degreesPerSecond'] * t)
    dx, dy = GX - RAFT['centre'][0], GY - RAFT['centre'][1]
    lx, ly = dx * math.cos(a) + dy * math.sin(a), -dx * math.sin(a) + dy * math.cos(a)
    def box(hx, hy):
        qx, qy = np.abs(lx) - hx, np.abs(ly) - hy
        return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0)
    return np.maximum(np.minimum(box(RAFT['arm'] / 2, RAFT['width'] / 2), box(RAFT['width'] / 2, RAFT['arm'] / 2)), 0)


def foam_with_raft(t, fps, wobble_amp, motion, ribbons):
    global D
    keep = D
    D = np.minimum(keep, raft_distance(t))
    try: out = foam(t, fps, wobble_amp, motion, ribbons)
    finally: D = keep
    return out


def churn_raft(params, gaps=(1, 3, 6, 12, 24), starts=(0.3, 1.1, 1.9, 2.7)):
    res = []
    region = (raft_distance(0.0) < 1.8) & (D >= 1.99)                      # near the raft, away from the banks
    for g in gaps:
        v = []
        for t0 in starts:
            a = foam_with_raft(t0, *params)[region] ; b = foam_with_raft(t0 + g / 60.0, *params)[region]
            v.append((a ^ b).sum() / max((a | b).sum(), 1))
        res.append(float(np.mean(v)))
    return res
