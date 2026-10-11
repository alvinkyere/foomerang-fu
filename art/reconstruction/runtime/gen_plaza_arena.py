"""Generate market_plaza rules geometry (walls, spawns, Book spots) from the measured reconstruction data.
World mapping (shared with the renderer): X = (x_bu + 50) * 20, Y = (100 - y_bu) * 20  (1 BU = 20 world units; player radius 36 ~ Bread's half-width).
Arena = the plaza between the side fences and the far wall, inside the take-A view: x_bu -50..37.5, y_bu 35..100 -> 1750 x 1300.
python gen_plaza_arena.py > plaza_arena.json"""
import json, math, os, numpy as np
AN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'analysis'); J = lambda n: json.load(open(os.path.join(AN, n)))
W, H, R = 1750, 1300, 36          # right edge at x_bu 37.5 so the bottom-right corner stays inside the take-A frame
X = lambda x: (x + 50) * 20; Y = lambda y: (100 - y) * 20
walls = []
def rect(id_, cx, cy, w, h, kind):     # centre/size in BU
    x0, x1 = X(cx - w / 2), X(cx + w / 2); y0, y1 = Y(cy + h / 2), Y(cy - h / 2)
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 - x0 > 1 and y1 - y0 > 1: walls.append(dict(id=id_, kind=kind, x=round(x0), y=round(y0), width=round(x1 - x0), height=round(y1 - y0)))
for i, r in enumerate(J('roofs.json')):
    cx, cy = r['centre'][0] * 100, r['centre'][1] * 100; a, b = r['size_bu']; body = max(min(a, b) - 1.6, 3.6)
    ang = (r['angle'] % 90)
    if 20 < ang < 70:     # stall rotated 45 degrees: a diamond seen by the rules as a cross of two rectangles
        d = body / math.sqrt(2)
        rect(f'STALL{i}A', cx, cy, 2 * 0.72 * d, 2 * 0.36 * d, 'STALL'); rect(f'STALL{i}B', cx, cy, 2 * 0.36 * d, 2 * 0.72 * d, 'STALL')
    else: rect(f'STALL{i}', cx, cy, max(a, b) - 1.6, min(a, b) - 1.6, 'STALL')
for j, s in enumerate(J('far_end.json')['far_stalls']):
    w_ = s['size_px'][0] / 5.0; rect(f'FARSTALL{j}', s['centre'][0] * 100, (92.7 + 100) / 2, w_ - 0.6, 100 - 92.7, 'STALL')
fx, fy = J('layout_merged.json')['objects']['fountain']['centre']; fx, fy = fx * 100, fy * 100; r_ = 9.2
rect('FOUNTAIN_A', fx, fy, 2 * 0.93 * r_, 2 * 0.4 * r_, 'FOUNTAIN'); rect('FOUNTAIN_B', fx, fy, 2 * 0.4 * r_, 2 * 0.93 * r_, 'FOUNTAIN'); rect('FOUNTAIN_C', fx, fy, 2 * 0.7 * r_, 2 * 0.7 * r_, 'FOUNTAIN')
for k, (x, y) in enumerate(J('props_takeA.json')['crates']): rect(f'CRATE{k}', x * 100, y * 100, 3.6, 3.6, 'CRATE')
def d2rect(p, w):
    dx = max(w['x'] - p[0], 0, p[0] - (w['x'] + w['width'])); dy = max(w['y'] - p[1], 0, p[1] - (w['y'] + w['height'])); return math.hypot(dx, dy)
def clear(p, m): return all(d2rect(p, w) >= m for w in walls) and R + 10 <= p[0] <= W - R - 10 and R + 10 <= p[1] <= H - R - 10
cand = [(x, y) for x in range(64, W - 63, 32) for y in range(64, H - 63, 32) if clear((x, y), R + 30)]
spawns = [min(cand, key=lambda p: math.hypot(p[0] - 260, p[1] - 220))]
while len(spawns) < 6: spawns.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in spawns)))
books = []
for _ in range(8): books.append(max(cand, key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1]) for q in spawns + books)))
print(json.dumps(dict(width=W, height=H, walls=walls, spawns=[dict(x=p[0], y=p[1]) for p in spawns], books=[dict(x=p[0], y=p[1]) for p in books]), indent=1))
