"""Packs the character-select animation frames (bake_select_anims.py) into the sheets the console plays
(apps/console/src/characters/selectAnimation.ts): python pack_select_anims.py <frames dir> <out dir> [char,...]
Per character: <char>.webp (FRAME px cells, COLS to a row: idle 0-39, arrive_left 40-44, arrive_right 45-49, cheer 50-77, blink 78-89) and <char>-still.webp
(idle frame 0 alone, shown until the sheet has loaded).

The renders' own ground shadow (a shadow catcher) is not used: it darkened the whole floor (a grey square around every
character) and the light bouncing off the character lightened a ring of it. Instead each frame keeps only the character
(`character_only`, its outline recoloured from the character: the renderer mixes the floor into it) over the shadow the video
shows (`ground_shadow`): a faint soft oval under the feet, ~11% darker than the background at its middle and ~1.4x the
character's width (game-setting.mp4: Milk, Bread, Watermelon, Coffee), fixed on the ground while the character hops."""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

FRAME, COLS = 192, 8
ORDER = [('idle', 40), ('arrive_left', 5), ('arrive_right', 5), ('cheer', 28), ('blink', 12)]
SRC, OUT = sys.argv[1], sys.argv[2]


SHADOW_DARK = 0.11
SHADOW_RX, SHADOW_RY = 0.7, 0.16          # of the character's width


def character_only(im):
    a = np.asarray(im, dtype=np.float32).copy(); al = a[..., 3] / 255
    core = al >= 0.995                                                  # fully opaque: nothing of the floor mixed in
    near = ndimage.binary_dilation(core, iterations=max(2, im.size[0] // 64))
    mine = core | (near & (a[..., :3].max(-1) > 30))                    # the character's outline; the shadow under it is black
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    edge = mine & ~core
    a[..., :3][edge] = a[..., :3][iy[edge], ix[edge]]
    a[..., 3] = np.where(mine, al, 0) * 255
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def ground_shadow(size, cx, foot, w):
    yy, xx = np.mgrid[:size[1], :size[0]]
    d2 = ((xx - cx) / (SHADOW_RX * w)) ** 2 + ((yy - foot) / (SHADOW_RY * w)) ** 2
    alpha = SHADOW_DARK * np.exp(-2.2 * d2)
    out = np.zeros((size[1], size[0], 4), np.uint8); out[..., 3] = (alpha * 255).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


meta = json.load(open(os.path.join(SRC, 'anims.json')))
chars = sys.argv[3].split(',') if len(sys.argv) > 3 else meta['chars']
os.makedirs(OUT, exist_ok=True)
frames = sum(n for _, n in ORDER); rows = -(-frames // COLS)
for name in chars:
    rest = character_only(Image.open(os.path.join(SRC, f'{name}_idle_00.png')).convert('RGBA'))
    ys, xs = np.nonzero(np.asarray(rest)[..., 3] > 250)
    shadow = ground_shadow(rest.size, (xs.min() + xs.max()) / 2, ys.max(), xs.max() - xs.min() + 1)
    sheet = Image.new('RGBA', (COLS * FRAME, rows * FRAME), (0, 0, 0, 0)); i = 0
    for seq, n in ORDER:
        for k in range(n):
            im = shadow.copy(); im.alpha_composite(character_only(Image.open(os.path.join(SRC, f'{name}_{seq}_{k:02d}.png')).convert('RGBA')))
            im = im.resize((FRAME, FRAME), Image.LANCZOS)
            sheet.paste(im, ((i % COLS) * FRAME, (i // COLS) * FRAME)); i += 1
            if seq == 'idle' and k == 0: im.save(os.path.join(OUT, f'{name}-still.webp'), quality=90, method=6)
    sheet.save(os.path.join(OUT, f'{name}.webp'), quality=85, method=6)
    print(name, os.path.getsize(os.path.join(OUT, f'{name}.webp')) // 1024, 'kB')
