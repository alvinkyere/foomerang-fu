"""Fit a market stall's 3D dimensions to environ2: the stall is a red plank roof (a slab) on four posts with capped tops and a
counter box between them. Its silhouette, projected through environ2's camera, is fitted to the stall's cut-out (step 3 mask) by
coordinate descent on IoU, starting from its four post tops (image px) at the measured post height.
python fit_stall.py <mask.npy> <name> <x,y post-top px ...>  -> prints JSON parameters (BU)"""
import sys, json, math, os
import cv2, numpy as np

ENV2 = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cam = json.load(open(os.path.join(ENV2, 'camera.json')))
F, C = cam['f_1280'], np.array(cam['C']) * 100
th = math.radians(cam['pitch_deg'])
R = np.array([[1, 0, 0], [0, -math.sin(th), -math.cos(th)], [0, math.cos(th), -math.sin(th)]])
W, H = 1280, 720


def proj(P):
    v = (np.asarray(P, float) - C) @ R.T
    return np.c_[F * v[:, 0] / v[:, 2] + 640, F * v[:, 1] / v[:, 2] + 360]


def unproj(px, py, z):
    d = R.T @ np.array([(px - 640) / F, (py - 360) / F, 1.0])
    return C + (z - C[2]) / d[2] * d


def box(cx, cy, yaw, w, d, z0, z1):
    c, s = math.cos(yaw), math.sin(yaw)
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (z0, z1):
                pts.append((cx + c * sx * w / 2 - s * sy * d / 2, cy + s * sx * w / 2 + c * sy * d / 2, z))
    return proj(pts)


POSTS, PC, PW = [], [], 0.0


def parts(p):
    cx, cy, yaw = p['cx'], p['cy'], p['yaw']
    out = [box(cx, cy, yaw, p['rw'], p['rd'], p['rz'] - p['rt'], p['rz'])]                    # roof slab
    c, s = math.cos(yaw), math.sin(yaw)
    for px_, py_ in POSTS:                                     # the posts stand where their tops are seen (measured)
        out.append(box(px_, py_, yaw, p['pr'], p['pr'], 0, p['rz'] + p['cap']))         # post + cap
    out.append(box(PC[0] + s * p['coff'], PC[1] - c * p['coff'], yaw, PW, p['cd'], 0, p['cz']))   # counter, between the posts
    return out


def silhouette(p):
    m = np.zeros((H, W), np.uint8)
    for q in parts(p):
        cv2.fillConvexPoly(m, cv2.convexHull(np.round(q).astype(np.int32)), 1)
    return m > 0


def iou(p, target):
    s = silhouette(p)
    return (s & target).sum() / max(1, (s | target).sum())


if __name__ == '__main__':
    target = np.load(sys.argv[1]) > 0
    name = sys.argv[2]
    tops = [tuple(float(v) for v in a.split(',')) for a in sys.argv[3:7]]
    PH = 4.5
    G = np.array([unproj(x, y, PH)[:2] for x, y in tops])        # post tops on the ground plan, in order around the stall
    cx, cy = G.mean(0)
    e = G[1] - G[0]
    yaw = math.atan2(e[1], e[0])
    pw = float(np.linalg.norm(G[1] - G[0]) + np.linalg.norm(G[2] - G[3])) / 2
    pd = float(np.linalg.norm(G[3] - G[0]) + np.linalg.norm(G[2] - G[1])) / 2
    POSTS[:] = [tuple(g) for g in G]
    PC[:] = [cx, cy]
    PW = pw
    globals()['PW'] = pw
    p = dict(cx=cx, cy=cy, yaw=yaw, pr=0.9, rz=4.2, rt=0.6, cap=0.5, rw=pw + 2.0, rd=pd + 2.0, coff=0.0, cd=pd * 0.6, cz=2.0)
    steps = dict(cx=0.4, cy=0.4, yaw=0.03, pr=0.2, rz=0.4, rt=0.2, cap=0.2, rw=0.5, rd=0.5, coff=0.4, cd=0.4, cz=0.3)
    best = iou(p, target)
    for rnd in range(10):
        for k in steps:
            for _ in range(8):
                improved = False
                for sgn in (1, -1):
                    q = dict(p)
                    q[k] = p[k] + sgn * steps[k]
                    if min(q['pr'], q['rt'], q['cap'], q['cd'], q['cz'], q['rw'] - PW, q['rd'] - pd + 1, q['rz'] - q['cz']) <= 0:
                        continue
                    v = iou(q, target)
                    if v > best:
                        best, p, improved = v, q, True
                        break
                if not improved:
                    break
        steps = {k: v * 0.6 for k, v in steps.items()}
    p = {k: round(float(v), 4) for k, v in p.items()}
    print(json.dumps(dict(name=name, iou=round(float(best), 4), posts=[[round(float(a), 3) for a in g] for g in POSTS],
                          post_spacing=[round(pw, 3), round(pd, 3)], params=p)))
