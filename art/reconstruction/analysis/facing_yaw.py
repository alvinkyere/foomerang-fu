"""facing.json (apparent widths) -> yaw per frame (radians, 0 = face toward the camera, +/- pi/2 = edge-on).  Width->|yaw| by the slab model with W,D taken
 from robust percentiles of each character's own width series; temporal median(5)+smoothing; sign from lateral screen motion (+x motion = turned toward +x);
 gaps interpolated.  Coffee (rotationally symmetric cup, unreliable mask) keeps yaw 0.   python facing_yaw.py"""
import json, numpy as np
F = json.load(open('facing.json')); out = {}
for take in ('A', 'B'):
    tr = json.load(open(f'tracks_take{take}.json')); out[take] = {}
    for name, d in F[take].items():
        frames = sorted(int(k) for k in tr[name]); w = np.full(len(frames), np.nan)
        for i, f in enumerate(frames):
            if str(f) in d: w[i] = d[str(f)]['w']
        if name == 'coffee': out[take][name] = {str(f): 0.0 for f in frames}; continue
        ok = ~np.isnan(w)
        if ok.sum() < 8: out[take][name] = {str(f): 0.0 for f in frames}; continue
        W = np.nanpercentile(w, 92); D = np.nanpercentile(w, 8); idx = np.arange(len(frames)); w = np.interp(idx, idx[ok], w[ok])
        med = np.array([np.median(w[max(0, i - 2):i + 3]) for i in idx]); c = np.clip((med - D) / max(W - D, 1e-6), 0, 1); ya = np.arccos(c)
        xs = np.array([tr[name][str(f)][0] for f in frames]); vx = np.gradient(np.convolve(np.pad(xs, 3, mode='edge'), np.ones(7) / 7, mode='valid'))
        sgn = np.sign(vx); sgn[sgn == 0] = 1; cur = 1
        for i in range(len(sgn)):
            if abs(vx[i]) > 0.25: cur = sgn[i]
            sgn[i] = cur
        yaw = ya * sgn; yaw = np.array([np.mean(yaw[max(0, i - 1):i + 2]) for i in idx])
        out[take][name] = {str(f): float(y) for f, y in zip(frames, yaw)}
        print(take, name, 'W=%.0f D=%.0f' % (W, D), 'yaw deg every 5th:', [int(np.degrees(y)) for y in yaw[::5]])
json.dump(out, open('facing_yaw.json', 'w'))
