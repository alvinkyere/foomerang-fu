"""A quick painter of the gong court's stone (2026-11-14), for fitting: the stone as blender/build.py draws it (each prism's faces in
their measured step colours turned to their facing, its top, its mint in its own colour), painted far to near over the ground alone
(blender/build.py `render nocards nostone`), at FRAME px or a fraction of them. score() is the mean Lab difference against the HQ's still
view (output/mosaic_chrome.png inside the READY frame), counting only pixels near the stone (ours or the HQ's) and away from the cards,
the players' masks and the names. Used by refine_outlines.py.
"""
import json, math, os, sys
import numpy as np, cv2
sys.path.insert(0, 'art/gong_court')
from measure import pix
import geom

HERE = os.path.dirname(os.path.abspath(__file__))
SC = json.load(open(os.path.join(HERE, 'stone_colours.json'))); TOPS = json.load(open(os.path.join(HERE, 'tops.json')))
FACE = SC['face']; NS = len(FACE); BYF = {int(k): v for k, v in SC.get('by_facing', {}).items()}
rgb = lambda c: np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float)
MEANF = np.mean([rgb(c) for c in FACE], 0)


def faced(c, nx, ny):
    if not BYF: return rgb(c)
    ang = math.degrees(math.atan2(ny, nx)) % 360; ks = sorted(BYF)
    dd = lambda k: min(abs(ang - 45 * k), 360 - abs(ang - 45 * k))
    b = sorted(ks, key=dd)[:2]; t = dd(b[0]) / max(1e-6, dd(b[0]) + dd(b[1]))
    return np.clip(rgb(c) + rgb(BYF[b[0]]) * (1 - t) + rgb(BYF[b[1]]) * t - MEANF, 0, 255)


class Painter:
    def __init__(self, scale=0.5):
        self.s = scale
        bare = cv2.imread(os.path.join(os.environ.get('TMPDIR', '/tmp').rstrip('/'), 'gong', 'bare', 'render.png'))
        self.bg = cv2.resize(bare, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        ox, oy = json.load(open(os.path.join(HERE, 'output', 'mosaic.json')))['origin']
        hq = cv2.imread(os.path.join(HERE, 'output', 'mosaic_chrome.png'))[-oy:-oy + 1080, -ox:-ox + 1920]
        self.hq = cv2.resize(hq, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        self.hq_lab = self.lab(self.hq)
        o = cv2.resize(cv2.imread(os.path.join(HERE, 'output', 'mosaic.png'))[-oy:-oy + 1080, -ox:-ox + 1920], None, fx=scale, fy=scale,
                       interpolation=cv2.INTER_NEAREST)
        h = cv2.cvtColor(o, cv2.COLOR_BGR2HSV).astype(int)
        self.hq_stone = (h[..., 0] >= 108) & (h[..., 0] <= 140) & (h[..., 1] > 40) & (h[..., 2] > 60)
        # not scored: the cards' boxes (what stands in front of the stone), the names
        self.skip = np.zeros(self.hq_stone.shape, bool)
        for c in json.load(open(os.path.join(HERE, 'cards.json'))):
            pts = np.array([p for sh in c['shapes'] for lp in sh['loops'] for p in lp], float)
            if len(pts) == 0: continue
            xy = np.array([pix(x, y, z) for x, y, z in pts]) * scale
            x0, y0 = np.floor(xy.min(0)).astype(int); x1, y1 = np.ceil(xy.max(0)).astype(int)
            self.skip[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
        self.skip[int(40 * scale):int(390 * scale), :int(230 * scale)] = True

    @staticmethod
    def lab(im): return cv2.cvtColor(im, cv2.COLOR_BGR2Lab).astype(np.float32) * [100 / 255, 1, 1] - [0, 128, 128]

    def paint(self, bodies):
        """bodies: name -> (outline (plan, counter-clockwise), h, mint outline or None). Returns the image and our stone's mask."""
        im = self.bg.copy(); mine = np.zeros(im.shape[:2], np.uint8)
        P = lambda x, y, z: np.array(pix(x, y, z)) * self.s
        order = sorted(bodies.items(), key=lambda kv: -max(p[1] for p in kv[1][0]))     # (far, north, first)
        for name, (poly, h, mint) in order:
            n = len(poly)
            up = np.array([P(x, y, h) for x, y in poly]); dn = np.array([P(x, y, 0) for x, y in poly])
            for i in range(n):
                j = (i + 1) % n; (x0, y0), (x1, y1) = poly[i], poly[j]
                nx, ny = (y1 - y0), -(x1 - x0)
                if ny > 0: continue                          # (turned from the camera: hidden behind the top)
                for k in range(NS):
                    a, b = k / NS, (k + 1) / NS
                    q = np.array([up[i] + (dn[i] - up[i]) * a, up[j] + (dn[j] - up[j]) * a, up[j] + (dn[j] - up[j]) * b, up[i] + (dn[i] - up[i]) * b])
                    col = faced(FACE[k], nx, ny)[::-1]
                    cv2.fillConvexPoly(im, np.int32(np.round(q)), col.tolist()); cv2.fillConvexPoly(mine, np.int32(np.round(q)), 1)
            cv2.fillPoly(im, [np.int32(np.round(up))], rgb(SC['top'])[::-1].tolist()); cv2.fillPoly(mine, [np.int32(np.round(up))], 1)
            if mint:
                mp = np.array([P(x, y, h) for x, y in mint])
                cv2.fillPoly(im, [np.int32(np.round(mp))], rgb(TOPS.get(name, {}).get('colour', SC['mint']))[::-1].tolist())
        return im, mine > 0

    def score(self, bodies):
        im, mine = self.paint(bodies)
        zone = cv2.dilate((mine | self.hq_stone).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        zone &= ~self.skip
        d = np.linalg.norm(self.lab(im) - self.hq_lab, axis=2)
        return float(d[zone].mean()), im


def current():
    """The stone as stones.json has it now."""
    out = {}
    for name, (poly, h, mint, kind) in geom.prisms().items(): out[name] = (poly, h, mint)
    return out


if __name__ == '__main__':
    p = Painter(1.0); s, im = p.score(current())
    print('painted stone vs the still view near the stone: mean dLab %.2f' % s)
    r = cv2.imread(os.path.join(os.environ.get('TMPDIR', '/tmp').rstrip('/'), 'gong', 'frame', 'render.png'))
    d = np.linalg.norm(Painter.lab(im) - Painter.lab(r), axis=2)
    print('painter vs Blender render: mean dLab %.2f (cards included in the render)' % d.mean())
    cv2.imwrite(os.path.join(HERE, 'output', 'painted.png'), im)
