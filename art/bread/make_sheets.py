"""Bread art test v2: assemble the review deliverables from art/bread/renders_v2/frames (pure PIL; no game dependency).

  python3 art/bread/make_sheets.py          -> renders_v2/{turnaround,gameplay-composite,strip-*,payload}.png|json|md

Sprites are rendered at SS=2 (display scale 1/2 of the sprite pixel) for the canonical 1999 px Garden canvas. The reference frame
(docs/garden/implementation.png) is 1376 px wide, so a sprite is shown at 0.5 * 1376/1999 there. The cast shadow is NOT baked: the
composite draws the soft cast shadow and tight contact shadow that Phaser/environment lighting will own.
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FR = os.path.join(HERE, 'renders_v2', 'frames')
OUT = os.path.join(HERE, 'renders_v2')
FRAME = 288
SS = 2.0
ANCHOR = (FRAME / 2, FRAME / 2 + 0.3 * math.cos(math.radians(40)) * 104 * SS)  # ground point under BREAD_ROOT, in sprite px
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
ORDER8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
STATES = {'idle': 8, 'run': 8, 'turn': 6, 'dash': 8, 'slash': 10, 'throw': 10, 'death': 12, 'victory': 12}
FPS = {'idle': 8, 'run': 12, 'turn': 15, 'dash': 15, 'slash': 20, 'throw': 15, 'death': 15, 'victory': 10}
DIRECTIONAL = {'idle', 'run', 'dash', 'slash', 'throw'}
try:
    FONT = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
except Exception:
    FONT = ImageFont.load_default()


def frame(state, heading, i):
    h = 'S' if state not in DIRECTIONAL else heading
    flip = h in MIRROR
    im = Image.open(os.path.join(FR, f'{state}_{MIRROR.get(h, h)}_{i:02d}.png')).convert('RGBA')
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        # mirroring about the frame centre keeps the anchor column (x = FRAME/2) fixed
    return im


def shadow_layer(size, scale):
    """Tight contact shadow + the soft lower-right cast shadow the engine will own (illustrative here)."""
    w, h = size
    sh = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    ax, ay = ANCHOR
    d.ellipse([ax - 62 + 26, ay - 20 + 8, ax + 62 + 26, ay + 20 + 8], fill=(40, 50, 60, 70))      # cast (soft, offset to the light)
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    c = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(c).ellipse([ax - 52, ay - 12, ax + 52, ay + 12], fill=(30, 35, 45, 120))      # contact
    c = c.filter(ImageFilter.GaussianBlur(4))
    sh.alpha_composite(c)
    return sh


def place(canvas, sprite, feet, scale):
    """Composite one sprite (with its shadow) so its ground anchor lands on `feet`, scaled by `scale` (sprite px -> canvas px)."""
    full = shadow_layer(sprite.size, scale)
    full.alpha_composite(sprite)
    w, h = full.size
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    full = full.resize((nw, nh), Image.LANCZOS)
    x = round(feet[0] - ANCHOR[0] * scale)
    y = round(feet[1] - ANCHOR[1] * scale)
    canvas.alpha_composite(full, (x, y))


def label(img, text, xy):
    d = ImageDraw.Draw(img)
    d.text((xy[0] + 1, xy[1] + 1), text, fill=(0, 0, 0, 200), font=FONT)
    d.text(xy, text, fill=(255, 255, 255, 255), font=FONT)


def grass_patch(w, h):
    bg = Image.open(os.path.join(ROOT, 'docs/garden/implementation.png')).convert('RGBA')
    # a clean grass area (no walls/characters): the lawn left of the centre column, between rows of walls
    return bg.crop((300, 280, 300 + 330, 280 + 50)).resize((w, h), Image.BICUBIC) if False else bg.crop((780, 280, 780 + 150, 280 + 60)).resize((w, h), Image.BICUBIC)


def strip(state, heading, name, bg=(150, 190, 110, 255), cols=None):
    n = STATES[state]
    cols = cols or n
    rows = math.ceil(n / cols)
    img = Image.new('RGBA', (FRAME * cols, FRAME * rows), bg)
    # flat lawn tone from the reference so frames read against the real ground colour
    lawn = Image.open(os.path.join(ROOT, 'docs/garden/implementation.png')).convert('RGB').getpixel((860, 300))
    img.paste(Image.new('RGBA', img.size, lawn + (255,)))
    for i in range(n):
        cell = Image.new('RGBA', (FRAME, FRAME), lawn + (255,))
        cell.alpha_composite(shadow_layer((FRAME, FRAME), 1))
        cell.alpha_composite(frame(state, heading, i))
        img.alpha_composite(cell, (FRAME * (i % cols), FRAME * (i // cols)))
        label(img, f'{state} {heading} {i}', (FRAME * (i % cols) + 6, FRAME * (i // cols) + 4))
    img.convert('RGB').save(os.path.join(OUT, name))
    return img


def turnaround():
    lawn = Image.open(os.path.join(ROOT, 'docs/garden/implementation.png')).convert('RGB').getpixel((860, 300))
    img = Image.new('RGBA', (FRAME * 8, FRAME), lawn + (255,))
    for k, h in enumerate(ORDER8):
        cell = Image.new('RGBA', (FRAME, FRAME), lawn + (255,))
        cell.alpha_composite(shadow_layer((FRAME, FRAME), 1))
        cell.alpha_composite(frame('idle', h, 0))
        img.alpha_composite(cell, (FRAME * k, 0))
        label(img, h + (' (mirror)' if h in MIRROR else ''), (FRAME * k + 8, 6))
    img.convert('RGB').save(os.path.join(OUT, 'turnaround-8dir.png'))


def camera_px(x, y, z=0.0):
    """Port of apps/console/src/render/garden/camera.ts project(): arena (x, y, z) -> 1999 px canvas."""
    pitch = math.radians(40); cx, cy, hy, ccx = 569, 569, -5394, 1021
    focal = (cy - hy) / math.tan(pitch)
    cam_h = ((cy - hy) * math.cos(pitch)) / 1.04
    lat = x - 800.4; depth = 6033.1 - y; height = cam_h - z
    fwd = depth * math.cos(pitch) + height * math.sin(pitch); down = height * math.cos(pitch) - depth * math.sin(pitch)
    return ccx + focal * lat / fwd, cy + focal * down / fwd


def gameplay_composite():
    """Bread in the real Garden frame at canonical camera and size: all 8 headings in open lawn, plus the existing plush Bread
    (CPU 1) covered so the character under test is the only Bread. Other characters stay for scale/style reference."""
    bg = Image.open(os.path.join(ROOT, 'docs/garden/implementation.png')).convert('RGBA')
    k = 1376 / 1999
    scale = SS and (1 / SS) * k
    # open lawn only (no walls under the feet): the clear pocket right of the centre column and the corridor between two wall rows
    spots = [(810, 328, 'N'), (880, 328, 'NE'), (950, 328, 'E'), (1015, 328, 'SE'),
             (690, 512, 'S'), (750, 512, 'SW'), (810, 512, 'W'), (870, 512, 'NW')]
    for x, y, h in sorted(spots, key=lambda s: s[1]):
        place(bg, frame('idle', h, 0), (x, y), scale)
    out = bg.convert('RGB')
    out.save(os.path.join(OUT, 'gameplay-composite.png'))
    # a 3x nearest crop of the test area for inspection at readable size
    crop = out.crop((640, 250, 1060, 540)).resize((1260, 870), Image.LANCZOS)
    crop.save(os.path.join(OUT, 'gameplay-composite-zoom.png'))


def trim_box(im):
    return im.getchannel('A').point(lambda a: 255 if a > 4 else 0).getbbox()


def payload():
    frames = []
    for st, n in STATES.items():
        heads = ['N', 'NE', 'E', 'SE', 'S'] if st in DIRECTIONAL else (['S'])
        for h in heads:
            for i in range(n):
                frames.append((st, h, i, Image.open(os.path.join(FR, f'{st}_{h}_{i:02d}.png')).convert('RGBA')))
    boxes = [trim_box(f[3]) for f in frames]
    trimmed = [(b[2] - b[0], b[3] - b[1]) for b in boxes]
    # shelf-pack trimmed frames (+2 px padding) into a 4096-wide atlas
    items = sorted(range(len(frames)), key=lambda i: -trimmed[i][1])
    W = 4096; x = y = rowh = 0; pos = {}
    for i in items:
        w, h = trimmed[i][0] + 2, trimmed[i][1] + 2
        if x + w > W: x, y, rowh = 0, y + rowh, 0
        pos[i] = (x, y); x += w; rowh = max(rowh, h)
    H = y + rowh
    Hpot = 1
    while Hpot < H: Hpot *= 2
    atlas = Image.new('RGBA', (W, Hpot), (0, 0, 0, 0))
    for i, (px, py) in pos.items():
        atlas.alpha_composite(frames[i][3].crop(boxes[i]), (px + 1, py + 1))
    atlas_png = os.path.join(OUT, 'bread-atlas.png'); atlas.save(atlas_png, optimize=True)
    webp = os.path.join(OUT, 'bread-atlas.webp'); atlas.save(webp, quality=85, method=6)
    q = atlas.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE); q_png = os.path.join(OUT, 'bread-atlas-p8.png'); q.save(q_png, optimize=True)
    # a half-height variant: the same frames at SS=1 (display size) for low-memory devices
    uniq = len(frames)
    raw = uniq * FRAME * FRAME * 4
    mirrored = {'idle': 8, 'run': 8, 'dash': 8, 'slash': 10, 'throw': 10}
    total_with_mirror_dirs = sum(n * 8 for s, n in mirrored.items()) + 6 + 12 + 12  # if W-side were baked, not mirrored
    sizes = {k: os.path.getsize(v) for k, v in dict(png=atlas_png, webp=webp, png8=q_png).items()}
    r = dict(
        frames_unique=uniq, frames_if_all_8_headings_baked=total_with_mirror_dirs,
        frame_px=FRAME, uncompressed_bytes_untrimmed=raw,
        trimmed_area_px=sum(w * h for w, h in trimmed), trimmed_mean_px=[round(sum(t[0] for t in trimmed) / uniq), round(sum(t[1] for t in trimmed) / uniq)],
        atlas_px=[W, Hpot], atlas_used_height=H,
        atlas_bytes=sizes, decoded_texture_bytes=W * Hpot * 4,
        four_characters_encoded_bytes={k: v * 4 for k, v in sizes.items()},
        four_characters_decoded_bytes=W * Hpot * 4 * 4,
    )
    json.dump(r, open(os.path.join(OUT, 'payload.json'), 'w'), indent=1)
    return r


if __name__ == '__main__':
    what = sys.argv[1:] or ['turnaround', 'composite', 'strips', 'payload']
    if 'turnaround' in what: turnaround()
    if 'composite' in what: gameplay_composite()
    if 'strips' in what:
        strip('idle', 'S', 'strip-idle.png'); strip('run', 'E', 'strip-run-E.png'); strip('run', 'N', 'strip-run-N.png'); strip('run', 'SE', 'strip-run-SE.png')
        strip('dash', 'E', 'strip-dash-E.png'); strip('dash', 'SE', 'strip-dash-SE.png'); strip('slash', 'E', 'strip-slash-E.png', cols=5)
        strip('slash', 'S', 'strip-slash-S.png', cols=5); strip('throw', 'E', 'strip-throw-E.png', cols=5); strip('throw', 'SE', 'strip-throw-SE.png', cols=5)
        strip('death', 'S', 'strip-death.png', cols=6); strip('victory', 'S', 'strip-victory.png', cols=6); strip('turn', 'S', 'strip-turn.png')
    if 'payload' in what: print(json.dumps(payload(), indent=1))
