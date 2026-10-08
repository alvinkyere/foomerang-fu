"""Animated environment props for FRAME-MODE maps (build_frame_map.py output): a prop that ROTATES on the ground plane (sky_islands'
croissant around its stone disc). Presentation only — no collision, no knockback: any interaction is GAMEPLAY INTERACTION:
DEFERRED - REQUIRES RULE APPROVAL.
 * The prop's pixels (colour mask inside "radius" of "plan_centre", rectified on the plane at its top height "z") are cut from the
   cleaned reference frame; the ground layer gets the area UNDER it inpainted (INFERRED: what the prop covers).
 * N frames: the plan texture rotated by 360/N steps about the centre and re-projected through the map camera -> one spritesheet;
   each frame carries its own depth key (canvas y of the prop's centroid on the ground) so characters sort against the moving arm.
 * Rate and direction are MEASURED from the footage ("period_s", "direction": +1 = counter-clockwise seen from above).
python animate_prop.py <map> <bake_dir>        (reads maps/<map>.json "animated"; writes anim_<name>.png and adds to layers.json)"""
import sys, os, json, math, cv2, numpy as np
MAP, BAKE = sys.argv[1:3]; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'analysis'))
from proj import plane_H
cfg = json.load(open(os.path.join(HERE, '..', 'maps', f'{MAP}.json'))); fm = cfg['frame_mode']; KEY, REF = fm['camera_key'], fm['reference_frame']
W, H = cfg['camera']['canvas']; SC = W / 640
ground = cv2.imread(os.path.join(BAKE, 'ground.png')); layers = json.load(open(os.path.join(BAKE, 'layers.json')))
for a in cfg.get('animated', []):
    cx, cy = a['plan_centre']; r = a['radius']; z = a['z']; S = 2000.0; N = a.get('frames', 36)
    box = (cx - r, cx + r, cy - r, cy + r); A = np.array([[S, 0, -box[0] * S], [0, -S, box[3] * S], [0, 0, 1.0]]); n = int(2 * r * S)
    Hc = np.diag([SC, SC, 1.0]) @ plane_H(KEY, REF, z)          # plan (plane z) -> canvas px
    M = A @ np.linalg.inv(Hc)          # canvas -> plan texture px
    tex = cv2.warpPerspective(ground, M, (n, n), flags=cv2.INTER_LINEAR)
    hsv = cv2.cvtColor(tex, cv2.COLOR_BGR2HSV); lo, hi = a['hue']
    piv = (n / 2, n / 2)
    if 'hub_hue' in a:          # the pivot is MEASURED: the centroid of the hub (e.g. the disc's yellow hole) on this plane
        hl, hh = a['hub_hue']; hub = (hsv[..., 0] >= hl) & (hsv[..., 0] <= hh) & (hsv[..., 2] >= 200) & (hsv[..., 1] >= 60)
        kk = cv2.connectedComponentsWithStats(hub.astype(np.uint8)); c_ = 1 + int(np.argmin([np.hypot(*(kk[3][i] - n / 2)) for i in range(1, kk[0])]))
        piv = (float(kk[3][c_][0]), float(kk[3][c_][1])); print('hub at texture px', np.round(piv, 1), 'of', n)
    mask = ((hsv[..., 0] >= lo) & (hsv[..., 0] <= hi) & (hsv[..., 1] >= a.get('min_sat', 80)) & (hsv[..., 2] >= a.get('min_val', 90))).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)); k = cv2.connectedComponentsWithStats(mask)
    mask = ((k[1] == 1 + int(np.argmax(k[2][1:, cv2.CC_STAT_AREA]))) * 255).astype(np.uint8)          # the prop = the largest blob
    for extra in a.get('include_hue', []):          # parts of another colour on the prop (e.g. its painted face)
        e = ((hsv[..., 0] >= extra[0]) & (hsv[..., 0] <= extra[1])).astype(np.uint8) * 255; mask |= cv2.bitwise_and(e, cv2.dilate(mask, np.ones((15, 15), np.uint8)))
    mask = cv2.GaussianBlur(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), (0, 0), 1.0)
    # ground under the prop (INFERRED): the base it turns on is rotationally symmetric, so the hidden part takes the texture seen
    # half a turn away (rotated 180 degrees about the centre); anything still uncovered is inpainted
    hole = cv2.dilate(mask, np.ones((9, 9), np.uint8)) > 40
    R180 = cv2.getRotationMatrix2D(piv, 180, 1.0)
    rot_tex = cv2.warpAffine(tex, R180, (n, n)); rot_hole = cv2.warpAffine(hole.astype(np.uint8), R180, (n, n)) > 0
    filled = tex.copy(); use = hole & ~rot_hole; filled[use] = rot_tex[use]
    rest = (hole & rot_hole).astype(np.uint8) * 255; filled = cv2.inpaint(filled, rest, 5, cv2.INPAINT_TELEA)
    back = cv2.warpPerspective(filled, np.linalg.inv(M), (W, H), flags=cv2.INTER_LINEAR)
    cover = cv2.warpPerspective(hole.astype(np.uint8) * 255, np.linalg.inv(M), (W, H), flags=cv2.INTER_LINEAR)
    k_ = (cv2.GaussianBlur(cover, (0, 0), 2) / 255.0)[..., None]; ground = (k_ * back + (1 - k_) * ground).astype(np.uint8)
    rgba = np.dstack([tex, mask]); frames = []; boxes = []
    for i in range(N):
        ang = a['direction'] * 360.0 * i / N          # CCW seen from above = plan rotation by +ang; texture y points south
        R = cv2.getRotationMatrix2D(piv, ang, 1.0)          # (image rotation; plan y is flipped, so +ang is CCW in plan)
        rot = cv2.warpAffine(rgba, R, (n, n), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
        fr = cv2.warpPerspective(rot, np.linalg.inv(M), (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
        ys, xs = np.nonzero(fr[..., 3] > 8); frames.append(fr); boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        m = rot[..., 3] > 128; py, px = np.nonzero(m); gx = px.mean() / S + box[0]; gy = box[3] - py.mean() / S
        q = np.diag([SC, SC, 1.0]) @ plane_H(KEY, REF, 0.0) @ np.array([gx, gy, 1.0]); boxes[-1] = boxes[-1] + (float(q[1] / q[2]),)
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cw, ch = int(x1 - x0), int(y1 - y0); cols = 6; rows = math.ceil(N / cols); sheet = np.zeros((rows * ch, cols * cw, 4), np.uint8)
    for i, fr in enumerate(frames): sheet[(i // cols) * ch:(i // cols + 1) * ch, (i % cols) * cw:(i % cols + 1) * cw] = fr[y0:y1, x0:x1]
    cv2.imwrite(os.path.join(BAKE, f"anim_{a['name']}.png"), sheet)
    layers.setdefault('_animated', {})[a['name']] = dict(file=f"anim_{a['name']}.png", x=int(x0), y=int(y0), width=cw, height=ch, frames=N, columns=cols,
                                                         period_s=a['period_s'], depths=[round(b[4], 2) for b in boxes], evidence=a.get('evidence', ''))
    print('animated', a['name'], N, 'frames', cw, 'x', ch, 'period', a['period_s'], 's')
cv2.imwrite(os.path.join(BAKE, 'ground.png'), ground); json.dump(layers, open(os.path.join(BAKE, 'layers.json'), 'w'), indent=1)
