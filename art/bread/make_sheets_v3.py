"""Bread art test v3: assemble the review deliverables from art/bread/renders_v3/frames (pure PIL; no game dependency).

  python3 art/bread/make_sheets_v3.py [turnaround|strips|composite|mirror|states|scale|payload]

Layers: every frame is a BODY image plus (for states where the boomerang is HELD) a separate PROP image of the same size. Phaser
will draw the prop only while the game's boomerang state is HELD (and, for THROW, until the release frame), tinted to the player's
colour. Sprites are rendered at SS=2: displayed at 1/2 for the canonical 1999 px canvas, so 0.5 * 1376/1999 in the 1376 px reference
frame. The cast shadow is NOT baked; sheets draw the contact + soft cast shadow that Phaser will own.
"""
import json, math, os, sys, hashlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FR = os.path.join(HERE, 'renders_v3', 'frames')
OUT = os.path.join(HERE, 'renders_v3')
FRAME = 288
SS = 2.0
K = 1376 / 1999
GAME_SCALE = (1 / SS) * K                      # sprite px -> pixels of the 1376 px reference frame
ANCHOR = (FRAME / 2, FRAME / 2 + 0.3 * math.cos(math.radians(40)) * 104 * SS)   # ground point under BREAD_ROOT, in sprite px
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
ORDER8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
STATES = {'idle': 8, 'run': 8, 'turn': 6, 'dash': 8, 'slash': 10, 'throw': 10, 'death': 7, 'victory': 12}
DIRECTIONAL = {'idle', 'run', 'dash', 'slash', 'throw'}
TINT = (255, 205, 70)                          # preview of the player colour the prop is tinted with (Bread's yellow ring)
try:
    FONT = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    BIG = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception:
    FONT = BIG = ImageFont.load_default()
IMPL = os.path.join(ROOT, 'docs/garden/implementation.png')


def path(state, h, i, prop=False):
    return os.path.join(FR, f'{state}_{h}_{i:02d}{"_prop" if prop else ""}.png')


def tinted(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a: px[x, y] = (r * TINT[0] // 255, g * TINT[1] // 255, b * TINT[2] // 255, a)
    return im


_cache = {}


def layers(state, heading, i):
    """(body, prop-or-None) at the requested heading, mirrored for the west side."""
    h = 'S' if state not in DIRECTIONAL else heading
    key = (state, h, i)
    if key not in _cache:
        hh = MIRROR.get(h, h)
        body = Image.open(path(state, hh, i)).convert('RGBA')
        prop = Image.open(path(state, hh, i, True)).convert('RGBA') if os.path.exists(path(state, hh, i, True)) else None
        if prop is not None: prop = tinted(prop)
        _cache[key] = (body, prop, h in MIRROR)
    body, prop, flip = _cache[key]
    if flip:
        body = body.transpose(Image.FLIP_LEFT_RIGHT); prop = prop.transpose(Image.FLIP_LEFT_RIGHT) if prop is not None else None
    return body, prop


def frame(state, heading, i, with_prop=True):
    body, prop = layers(state, heading, i)
    im = body.copy()
    if with_prop and prop is not None: im.alpha_composite(prop)
    return im


def shadow_layer(size):
    """Tight contact shadow + the soft lower-right cast shadow the engine will own (illustrative here)."""
    sh = Image.new('RGBA', size, (0, 0, 0, 0))
    ax, ay = ANCHOR
    ImageDraw.Draw(sh).ellipse([ax - 54 + 24, ay - 18 + 7, ax + 54 + 24, ay + 18 + 7], fill=(40, 50, 60, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(9))
    c = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(c).ellipse([ax - 46, ay - 11, ax + 46, ay + 11], fill=(30, 35, 45, 120))
    sh.alpha_composite(c.filter(ImageFilter.GaussianBlur(4)))
    return sh


def lawn():
    return Image.open(IMPL).convert('RGB').getpixel((860, 300))


def place(canvas, sprite, feet, scale):
    full = shadow_layer(sprite.size)
    full.alpha_composite(sprite)
    nw, nh = max(1, round(full.width * scale)), max(1, round(full.height * scale))
    full = full.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(full, (round(feet[0] - ANCHOR[0] * scale), round(feet[1] - ANCHOR[1] * scale)))


def label(img, text, xy, font=FONT):
    d = ImageDraw.Draw(img)
    d.text((xy[0] + 1, xy[1] + 1), text, fill=(0, 0, 0, 200), font=font)
    d.text(xy, text, fill=(255, 255, 255, 255), font=font)


def strip(state, heading, name, cols=None, with_prop=True):
    n = STATES[state]
    cols = cols or n
    rows = math.ceil(n / cols)
    L = lawn() + (255,)
    img = Image.new('RGBA', (FRAME * cols, FRAME * rows), L)
    for i in range(n):
        cell = Image.new('RGBA', (FRAME, FRAME), L)
        cell.alpha_composite(shadow_layer((FRAME, FRAME)))
        cell.alpha_composite(frame(state, heading, i, with_prop))
        img.alpha_composite(cell, (FRAME * (i % cols), FRAME * (i // cols)))
        label(img, f'{state} {heading} {i}', (FRAME * (i % cols) + 6, FRAME * (i // cols) + 4))
    img.convert('RGB').save(os.path.join(OUT, name))
    return img


def turnaround():
    L = lawn() + (255,)
    img = Image.new('RGBA', (FRAME * 8, FRAME), L)
    for k, h in enumerate(ORDER8):
        cell = Image.new('RGBA', (FRAME, FRAME), L)
        cell.alpha_composite(shadow_layer((FRAME, FRAME)))
        cell.alpha_composite(frame('idle', h, 0))
        img.alpha_composite(cell, (FRAME * k, 0))
        label(img, h + (' (mirror)' if h in MIRROR else ''), (FRAME * k + 8, 6))
    img.convert('RGB').save(os.path.join(OUT, 'turnaround-8dir.png'))


def camera_px(x, y, z=0.0):
    """Port of apps/console/src/render/garden/camera.ts project(): arena (x, y, z) -> 1999 px canvas."""
    pitch = math.radians(40); cy, hy, ccx = 569, -5394, 1021
    focal = (cy - hy) / math.tan(pitch); cam_h = ((cy - hy) * math.cos(pitch)) / 1.04
    lat = x - 800.4; depth = 6033.1 - y; height = cam_h - z
    fwd = depth * math.cos(pitch) + height * math.sin(pitch); down = height * math.cos(pitch) - depth * math.sin(pitch)
    return ccx + focal * lat / fwd, cy + focal * down / fwd


# open lawn (feet positions in the 1376 px reference frame), measured clear of walls
ROW_A = [(810, 328), (880, 328), (950, 328), (1015, 328)]
ROW_B = [(690, 512), (750, 512), (810, 512), (870, 512)]


def composite():
    bg = Image.open(IMPL).convert('RGBA')
    spots = list(zip(ROW_A + ROW_B, ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']))
    for (x, y), h in sorted(spots, key=lambda s: s[0][1]):
        place(bg, frame('idle', h, 0), (x, y), GAME_SCALE)
    out = bg.convert('RGB'); out.save(os.path.join(OUT, 'gameplay-composite.png'))
    out.crop((640, 250, 1060, 540)).resize((1260, 870), Image.LANCZOS).save(os.path.join(OUT, 'gameplay-composite-zoom.png'))


def states_sheet():
    """The important states at ACTUAL gameplay size, placed on the real Garden lawn (1x), then a 3x enlargement for reading."""
    bg = Image.open(IMPL).convert('RGBA')
    W, H = 760, 300
    # an open lawn patch from the reference (left-centre pocket) as the stage
    stage = bg.crop((120, 410, 120 + 380, 410 + 100)).resize((W, H), Image.BICUBIC) if False else None
    stage = Image.new('RGBA', (W, H), lawn() + (255,))
    # texture the stage with a blurred real-lawn crop so grass tone variation is preserved
    patch = bg.crop((780, 275, 780 + 260, 275 + 60)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    stage = patch
    picks = [('idle', 'S', 0), ('run', 'E', 1), ('dash', 'E', 4), ('slash', 'S', 3), ('slash', 'S', 6), ('slash', 'E', 6), ('throw', 'SE', 3), ('throw', 'SE', 7),
             ('victory', 'S', 3), ('death', 'S', 5)]
    cols = 5
    cell_w, cell_h = W // cols, H // 2
    for k, (st, h, i) in enumerate(picks):
        x = (k % cols) * cell_w + cell_w // 2; y = (k // cols) * cell_h + int(cell_h * 0.78)
        place(stage, frame(st, h, i), (x, y), GAME_SCALE)
        label(stage, f'{st} {h}{i}', ((k % cols) * cell_w + 4, (k // cols) * cell_h + 3))
    stage.convert('RGB').save(os.path.join(OUT, 'gameplay-scale-states-1x.png'))
    stage.convert('RGB').resize((W * 3, H * 3), Image.LANCZOS).save(os.path.join(OUT, 'gameplay-scale-states-3x.png'))


def strips_all():
    strip('idle', 'S', 'strip-idle-held-S.png'); strip('idle', 'E', 'strip-idle-held-E.png')
    for h in ('E', 'N', 'SE', 'S'): strip('run', h, f'strip-run-{h}.png')
    for h in ('E', 'S', 'NE'): strip('dash', h, f'strip-dash-{h}.png')
    for h in ('S', 'SE', 'E'): strip('slash', h, f'strip-slash-{h}.png', cols=5)
    for h in ('S', 'SE', 'E'): strip('throw', h, f'strip-throw-{h}.png', cols=5)
    strip('death', 'S', 'strip-death.png', cols=7); strip('victory', 'S', 'strip-victory.png', cols=6); strip('turn', 'S', 'strip-turn.png')


def mirror_check():
    """Mirrored attack verification: each attack heading next to its flipped west-side twin, boomerang included."""
    L = lawn() + (255,)
    rows = [('slash', 'E', 'W'), ('slash', 'SE', 'SW'), ('slash', 'NE', 'NW'), ('throw', 'E', 'W'), ('throw', 'SE', 'SW')]
    cols = 10
    sz = 144
    img = Image.new('RGBA', (sz * cols, sz * len(rows) * 1), L)
    for r, (st, h1, h2) in enumerate(rows):
        for i in range(cols):
            a = frame(st, h1, i); b = frame(st, h2, i)
            # one cell per frame: the east-side original on the left half, its mirror on the right half (each at half width)
            cell = Image.new('RGBA', (sz, sz), L)
            ha = a.resize((sz // 2 + 8, sz // 2 + 8), Image.LANCZOS); hb = b.resize((sz // 2 + 8, sz // 2 + 8), Image.LANCZOS)
            cell.alpha_composite(ha, (-4, sz // 4 - 4)); cell.alpha_composite(hb, (sz // 2 - 4, sz // 4 - 4))
            img.alpha_composite(cell, (sz * i, sz * r))
        label(img, f'{st}: {h1} | {h2} (mirrored)', (6, sz * r + 4))
    img.convert('RGB').save(os.path.join(OUT, 'mirror-attack-verification.png'))
    # and one large pair for handedness/orientation: slash frame 6 E vs W, throw frame 3 E vs W
    big = Image.new('RGBA', (FRAME * 4, FRAME), L)
    for k, (st, h, i) in enumerate([('slash', 'E', 6), ('slash', 'W', 6), ('throw', 'E', 3), ('throw', 'W', 3)]):
        cell = Image.new('RGBA', (FRAME, FRAME), L); cell.alpha_composite(shadow_layer((FRAME, FRAME))); cell.alpha_composite(frame(st, h, i))
        big.alpha_composite(cell, (FRAME * k, 0)); label(big, f'{st} {h} f{i}', (FRAME * k + 8, 6))
    big.convert('RGB').save(os.path.join(OUT, 'mirror-handedness.png'))


def scale_check():
    """Aligned visual comparison of the real plush Bread (CPU 1 in the reference) against the sprite at the same scale, 4x."""
    bg = Image.open(IMPL).convert('RGBA')
    plush = bg.crop((345, 85, 455, 175)).resize((440, 360), Image.LANCZOS)
    cell = Image.new('RGBA', (110, 90), (0, 0, 0, 0))
    mine = bg.crop((345, 85, 455, 175))
    # paint the sprite on a copy of the same lawn so the backdrop is comparable
    lawn_patch = bg.crop((300, 300, 410, 390))
    place(lawn_patch, frame('idle', 'S', 0), (55, 62), GAME_SCALE)
    out = Image.new('RGB', (880, 360))
    out.paste(plush.convert('RGB'), (0, 0)); out.paste(lawn_patch.resize((440, 360), Image.LANCZOS).convert('RGB'), (440, 0))
    d = ImageDraw.Draw(out); d.text((6, 4), 'existing plush Bread (reference frame)', fill=(0, 0, 0)); d.text((446, 4), 'Blender Bread, same scale', fill=(0, 0, 0))
    out.save(os.path.join(OUT, 'scale-comparison.png'))


def trim_box(im):
    return im.getchannel('A').point(lambda a: 255 if a > 4 else 0).getbbox()


def payload():
    items = []   # (key, image, bbox)
    for st, n in STATES.items():
        heads = ['N', 'NE', 'E', 'SE', 'S'] if st in DIRECTIONAL else ['S']
        for h in heads:
            for i in range(n):
                for prop in (False, True):
                    p = path(st, h, i, prop)
                    if os.path.exists(p):
                        im = Image.open(p).convert('RGBA'); bb = trim_box(im)
                        if bb: items.append((f'{st}_{h}_{i:02d}{"_prop" if prop else ""}', im, bb))
    body = [x for x in items if not x[0].endswith('_prop')]; props = [x for x in items if x[0].endswith('_prop')]

    def dedupe(lst):
        seen = {}; uniq = []
        for k, im, bb in lst:
            hsh = hashlib.md5(im.crop(bb).tobytes()).hexdigest()
            if hsh in seen: continue
            seen[hsh] = k; uniq.append((k, im, bb))
        return uniq

    def pack(lst, width):
        order = sorted(range(len(lst)), key=lambda i: -(lst[i][2][3] - lst[i][2][1]))
        x = y = rowh = 0; pos = {}
        for i in order:
            w = lst[i][2][2] - lst[i][2][0] + 2; h = lst[i][2][3] - lst[i][2][1] + 2
            if x + w > width: x, y, rowh = 0, y + rowh, 0
            pos[i] = (x, y); x += w; rowh = max(rowh, h)
        return pos, y + rowh

    def build(lst, width, name):
        pos, H = pack(lst, width)
        pot = 1
        while pot < H: pot *= 2
        atlas = Image.new('RGBA', (width, pot), (0, 0, 0, 0))
        for i, (px, py) in pos.items(): atlas.alpha_composite(lst[i][1].crop(lst[i][2]), (px + 1, py + 1))
        png = os.path.join(OUT, f'{name}.png'); atlas.save(png, optimize=True)
        webp = os.path.join(OUT, f'{name}.webp'); atlas.save(webp, quality=85, method=6)
        return dict(px=[width, pot], used_h=H, png=os.path.getsize(png), webp=os.path.getsize(webp), decoded=width * pot * 4, tight_decoded=width * H * 4)

    area = lambda lst: sum((b[2] - b[0]) * (b[3] - b[1]) for _, _, b in lst)
    bu, pu = dedupe(body), dedupe(props)
    r = dict(
        frames_body=len(body), frames_prop=len(props), frames_body_after_dedupe=len(bu), frames_prop_after_dedupe=len(pu),
        untrimmed_bytes=len(body) * FRAME * FRAME * 4, trimmed_area_body=area(body), trimmed_area_prop=area(props),
        trimmed_area_body_dedupe=area(bu), trimmed_area_prop_dedupe=area(pu),
        raw_packed_bytes_lower_bound=area(bu) * 4 + area(pu) * 4,
        body_atlas_4096=build(bu, 4096, 'bread-atlas-body'), prop_atlas=build(pu, 1024, 'bread-atlas-prop'),
        body_atlas_2048_pages=build(bu, 2048, 'bread-atlas-body-2048w'),
    )
    json.dump(r, open(os.path.join(OUT, 'payload.json'), 'w'), indent=1)
    return r


if __name__ == '__main__':
    what = sys.argv[1:] or ['turnaround', 'strips', 'composite', 'mirror', 'states', 'scale', 'payload']
    if 'turnaround' in what: turnaround()
    if 'strips' in what: strips_all()
    if 'composite' in what: composite()
    if 'mirror' in what: mirror_check()
    if 'states' in what: states_sheet()
    if 'scale' in what: scale_check()
    if 'payload' in what: print(json.dumps(payload(), indent=1))
