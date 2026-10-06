"""Motion strips and aligned side-by-sides for the Garden fidelity pass.

For each showcase scenario in docs/garden/motion/<name>/NNN.png (30 fps) this crops to where the action happens (the box
of everything that changed between frames, padded) and lays out evenly spaced frames as one strip. For the paired sheets it
puts a derived reference frame (docs/reference/video/*.jpg) above our equivalent moment. No similarity number is computed:
these are for eyes, side by side.
"""
import glob, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
MOTION = os.path.join(ROOT, 'docs', 'garden', 'motion')
OUT = os.path.join(ROOT, 'docs', 'garden', 'compare')
REF = os.path.join(ROOT, 'docs', 'reference', 'video')
os.makedirs(OUT, exist_ok=True)

def frames(name):
    return sorted(glob.glob(os.path.join(MOTION, name, '*.png')))

def action_box(files, pad=70, minw=420, minh=260):
    base = np.asarray(Image.open(files[0]).convert('L'), dtype=np.int16)
    mask = np.zeros(base.shape, bool)
    for f in files[1::3]:
        mask |= np.abs(np.asarray(Image.open(f).convert('L'), dtype=np.int16) - base) > 28
    ys, xs = np.nonzero(mask)
    h, w = base.shape
    if len(xs) == 0:
        return (0, 0, w, h)
    x0, x1 = np.percentile(xs, [1, 99]); y0, y1 = np.percentile(ys, [1, 99])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bw, bh = max(minw, x1 - x0 + 2 * pad), max(minh, y1 - y0 + 2 * pad)
    bw = max(bw, bh * 16 / 9); bh = bw * 9 / 16
    x0 = int(max(0, min(w - bw, cx - bw / 2))); y0 = int(max(0, min(h - bh, cy - bh / 2)))
    return (x0, y0, int(min(w, x0 + bw)), int(min(h, y0 + bh)))

def strip(name, count=8, start=0, end=None, tile_w=360):
    files = frames(name)
    if not files:
        return None
    box = action_box(files)
    files_sel = files[start:end]
    idx = np.linspace(0, len(files_sel) - 1, count).round().astype(int)
    tiles = []
    for i in idx:
        im = Image.open(files_sel[i]).convert('RGB').crop(box)
        im = im.resize((tile_w, int(tile_w * im.height / im.width)))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 70, 16), fill=(0, 0, 0))
        d.text((4, 2), f't={(start + i) / 30:.2f}s', fill=(255, 255, 255))
        tiles.append(im)
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    th = tiles[0].height
    sheet = Image.new('RGB', (tile_w * cols, th * rows))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * tile_w, (k // cols) * th))
    path = os.path.join(OUT, f'strip-{name}.png')
    sheet.save(path)
    return path

def pair(ref_name, scenario, frame, label, tile_w=640):
    """reference frame (top) over our frame (bottom), same width."""
    ref = Image.open(os.path.join(REF, ref_name)).convert('RGB')
    ref = ref.resize((tile_w, int(tile_w * ref.height / ref.width)))
    files = frames(scenario)
    box = action_box(files)
    ours = Image.open(files[min(frame, len(files) - 1)]).convert('RGB').crop(box)
    ours = ours.resize((tile_w, int(tile_w * ours.height / ours.width)))
    sheet = Image.new('RGB', (tile_w, ref.height + ours.height + 28), (20, 20, 24))
    d = ImageDraw.Draw(sheet)
    d.text((6, 4), f'REFERENCE  {ref_name}', fill=(255, 255, 255))
    sheet.paste(ref, (0, 14))
    d.text((6, ref.height + 16), f'OURS  {scenario} frame {frame}  ({label})', fill=(255, 255, 255))
    sheet.paste(ours, (0, ref.height + 28))
    path = os.path.join(OUT, f'pair-{ref_name[:4]}-{scenario}.png')
    sheet.save(path)
    return path

if __name__ == '__main__':
    for name in sorted(os.listdir(MOTION)):
        print(strip(name))
    pairs = [
        ('1463-blast-rings-sequence.jpg', 'blast', 56, 'blast shock ring'),
        ('1470-blast-debris-dissipation.jpg', 'blast', 66, 'blast debris'),
        ('0780-death-burst-watermelon.jpg', 'hit-death', 40, 'death burst'),
        ('0300-movement-multi-courtyard.jpg', 'run', 30, 'movement'),
        ('1320-dash-trails-explosion-dots.jpg', 'dash', 20, 'dash'),
        ('0060-movement-smear-island.jpg', 'dash', 14, 'movement smear'),
        ('1200-high-action-fire-field.jpg', 'six', 90, 'high action'),
    ]
    for p in pairs:
        print(pair(*p))
