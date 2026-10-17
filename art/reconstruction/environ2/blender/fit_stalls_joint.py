"""Fit ONE stall model to several stalls at once (the plaza's stalls are one asset, placed and turned): shared dimensions, each
stall's own centre and turn, its posts where their tops are seen. Silhouette IoU against the step 3 masks, averaged.
Thin parts the silhouette cannot measure are fixed from the image (post 0.45 BU wide = 9 px, roof slab 0.7 BU, caps 0.5 BU), and
the post tops stand 4.5 BU high (measured foot-to-top on three stalls, step 4), so the roof top is at 4.0 BU.
python fit_stalls_joint.py <masks_dir> <out.json> <variant> <mask:name:x,y;x,y;x,y;x,y> ..."""
import sys, json, math
import numpy as np
import fit_stall as fs

MASKS, OUT, VARIANT = sys.argv[1:4]
stalls = []
for a in sys.argv[4:]:
    mask, name, tops = a.split(':')
    T = [tuple(float(v) for v in t.split(',')) for t in tops.split(';')]
    G = np.array([fs.unproj(x, y, float(__import__("os").environ.get("POST_TOP", "4.5")))[:2] for x, y in T])
    e = G[1] - G[0]
    stalls.append(dict(name=name, target=np.load(f'{MASKS}/mask_{mask}.npy') > 0, posts=[tuple(g) for g in G], c=G.mean(0),
                       yaw=math.atan2(e[1], e[0]), pw=float(np.linalg.norm(G[1] - G[0]) + np.linalg.norm(G[2] - G[3])) / 2,
                       pd=float(np.linalg.norm(G[3] - G[0]) + np.linalg.norm(G[2] - G[1])) / 2))
PR, RT, CAP = 0.45, 0.7, 0.5
shared = dict(rz=4.0, ow=1.0, od=1.0, cz=2.0, cdf=0.6, coff=0.0)        # roof height; overhang past the posts; counter height/depth
steps = dict(rz=0.0, ow=0.3, od=0.3, cz=0.3, cdf=0.1, coff=0.3)
own = [dict(dx=0.0, dy=0.0, dyaw=0.0) for _ in stalls]
ownsteps = dict(dx=0.3, dy=0.3, dyaw=0.03)


def params(s, sh, o):
    return dict(cx=s['c'][0] + o['dx'], cy=s['c'][1] + o['dy'], yaw=s['yaw'] + o['dyaw'], pr=PR, rz=sh['rz'], rt=RT, cap=CAP,
                rw=s['pw'] + 2 * sh['ow'], rd=s['pd'] + 2 * sh['od'], coff=sh['coff'], cd=s['pd'] * sh['cdf'], cz=sh['cz'])


def score_one(i, sh, o):
    s = stalls[i]
    fs.POSTS[:] = s['posts']
    fs.PC[:] = list(s['c'])
    fs.PW = s['pw']
    return fs.iou(params(s, sh, o), s['target'])


def total(sh, ow_):
    return float(np.mean([score_one(i, sh, ow_[i]) for i in range(len(stalls))]))


best = total(shared, own)
for rnd in range(8):
    for k in shared:
        for sgn in (1, -1):
            while steps[k] > 0:
                q = dict(shared)
                q[k] += sgn * steps[k]
                if min(q['rz'] - q['cz'], q['cz'], q['cdf'], q['ow'] + 0.5, q['od'] + 0.5) <= 0:
                    break
                v = total(q, own)
                if v <= best:
                    break
                best, shared = v, q
    for i in range(len(stalls)):
        for k in ownsteps:
            for sgn in (1, -1):
                while True:
                    q = dict(own[i])
                    q[k] += sgn * ownsteps[k]
                    trial = own[:i] + [q] + own[i + 1:]
                    v = total(shared, trial)
                    if v <= best:
                        break
                    best, own = v, trial
    steps = {k: v * 0.6 for k, v in steps.items()}
    ownsteps = {k: v * 0.6 for k, v in ownsteps.items()}
res = dict(variant=VARIANT, mean_iou=round(best, 4), fixed=dict(post=PR, roof_thickness=RT, cap=CAP),
           shared={k: round(v, 4) for k, v in shared.items()},
           stalls=[dict(name=s['name'], iou=round(score_one(i, shared, own[i]), 4), posts=[[round(a, 3) for a in g] for g in s['posts']],
                        params={k: round(float(v), 4) for k, v in params(s, shared, own[i]).items()}) for i, s in enumerate(stalls)])
json.dump(res, open(OUT, 'w'), indent=1)
print(json.dumps({k: res[k] for k in ('variant', 'mean_iou', 'shared')}), [(s['name'], s['iou']) for s in res['stalls']])
