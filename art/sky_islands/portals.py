"""The gong islands' portals (owner, 2026-10-26: "there are 4 portals, they are all tied to a certain rock ... our portal
should be exactly, and I mean exactly like it is in the video"): writes art/sky_islands/portals.json, which
blender/portals.py builds and the game animates (its spin, in the manifest).

Measured from the HQ (foomerang-fu physics hq.mp4 9:30-9:44, ff physics hq 2.mp4 7:24-8:43), every number below:
  * Four portals in two pairs, blue and gold: one of each on the face of a rock at the north edge, facing the camera (the
    rocks: layout.py's portal_rock), and one of each on the north face of a block lower down (on the centre island, on the
    east island), facing away.
  * A portal is a thick hexagonal tile standing out of its rock's face, pointy at top and bottom, its bottom corner at the
    grass: navy sides (#363e76), a flat face (blue #1ce0f5; gold #f4c256) and on it a dark "G" swirl. In front of it on the
    grass, the same hexagon lies flat as a thin pale outline. Its pose: fitted to its face's corners in the 9:44.0 frame
    (584.0 s), through that frame's ground homography and the reference camera, upright and turned to its rock's face.
  * The swirl turns in the face's plane, anticlockwise seen from the front, one turn every 3.86 s (the period that folds the
    9:30-9:44 frames together best): it holds still for ~1.7 s, snaps ~110 degrees, turns on slowly, then finishes the turn
    quicker (SPIN: the angle at each phase, from the 40-phase median stack, unskewed onto the face).
  * The "G": its outline from the held phases' median, unskewed, in units of the face's corner radius (x right, y up).
"""
import json, math
import numpy as np, cv2

PERIOD = 3.86
# anticlockwise degrees through one period (continuous: it ends a whole turn on from where it starts)
SPIN = [(0.0, 243), (0.19, 270), (0.39, 360), (2.12, 360), (2.22, 471), (2.51, 477), (2.70, 489), (2.90, 525),
        (3.18, 540), (3.47, 555), (3.67, 591), (3.86, 603)]
# the ring: a copy of the face's hexagon outline, in the face's plane, that each snap of the swirl throws out in front of the
# tile and lets drift outward and down as it fades, then rests just in front of the face (seen there only as a faint double
# edge, cyan on cyan) until the next snap. [seconds into the period, out along the face's normal, up, opacity]: its offset
# fitted to 142 frames of 9:30-9:44 in 20 phase bins (each frame scaled on its face's box; 2-7% of the face's size), its
# opacity steady but where it sinks away late in the period (2026-10-26: the HQ shows it nearly all the time)
RING = [(0.0, 1.0, 0.4, 0.7), (0.19, 1.0, 0.4, 0.7), (0.39, 0.9, 0.0, 0.7), (0.58, 1.1, 0.0, 0.7),
        (0.97, 1.1, -0.3, 0.7), (1.35, 1.3, -0.2, 0.7), (1.74, 1.4, -0.1, 0.7), (1.93, 1.3, -0.1, 0.7),
        (2.32, 1.5, 0.0, 0.7), (2.51, 1.1, -0.5, 0.8), (2.70, 0.7, -0.9, 0.7), (3.09, 0.3, -1.1, 0.5),
        (3.28, 0.3, -1.1, 0.3), (3.47, 0.5, 0.4, 0.6), (3.67, 0.6, 0.4, 0.7), (3.86, 1.0, 0.4, 0.7)]
GLYPH = [(0.25, 0.59), (0.055, 0.6), (-0.32, 0.545), (-0.58, -0.275), (-0.545, -0.35), (-0.24, -0.565), (-0.08, -0.64),
         (-0.015, -0.63), (0.05, -0.57), (0.3, -0.17), (0.355, 0.115), (0.33, 0.205), (0.285, 0.245), (0.095, 0.18),
         (0.04, 0.13), (0.03, 0.065), (0.16, -0.03), (0.11, -0.2), (0.05, -0.24), (-0.17, -0.2), (-0.22, -0.175),
         (-0.26, -0.11), (-0.265, 0.35), (-0.235, 0.415), (-0.165, 0.47), (0.14, 0.53), (0.245, 0.57)]
# (7% larger, 2026-10-26: the HQ's held "G" covers 22.4% of its face, the outline as traced 19.7%: its blur is lost in the
# tracing)
GLYPH = [(round(x * 1.066, 3), round(y * 1.066, 3)) for x, y in GLYPH]
# (each face's bevel: two bands round its edge, 0.84-0.92 and 0.92-1 of its radius, darker toward the navy: the HQ's blue
# face, unskewed, flat #1ce0f5 to 0.82 then #28d4eb, #2aafc9, #2f7fa5; the gold's a little darker at its edge, its face
# #ebc364 in reference.png)
PALETTES = {
    'blue': dict(face='#1ce0f5', glyph=['#187db6', '#1f69a6'], ghost='#3fe3f2', bevel=['#2bc4dd', '#2a9fc0'], back='#58ddc4'),
    'gold': dict(face='#ecc262', glyph=['#3b8cc0', '#2e6fa8'], ghost='#f0c450', bevel=['#e6c166', '#dcbd6e'], back='#f6c451'),
}
SIDES = '#363e76'
# each portal: its colour; its face's centre (plan x, y; height); the way its face looks (degrees from east), how far it leans
# back and turns in its plane (degrees); its corner radius; its rock's navy, a hexagonal slab behind the tile (`navy` its
# corner radius, standing out to the tile from `back` units behind it). The top two fitted in reference.png (the exact camera), the
# face and the navy together (2026-10-26): the blue's face 91% overlapping the HQ's; the gold's six corners read by hand
# ((1524,30), (1546,7), (1576,9), (1579,28), (1572,40), (1530,53): its colour alone runs into its outline on the grass), the
# pose through them within 4 px a corner, straight out of its rock; the outlines from the 9:30-9:44 stack (the near corner at the tile's foot)
PORTALS = [
    dict(colour='blue', centre=[-27.53, 97.75, 1.64], facing=-48.0, lean=10.0, turn=8.25, radius=1.6, navy=2.0, back=1.0),
    dict(colour='gold', centre=[23.68, 97.11, 1.73], facing=-74.7, lean=9.7, turn=17.5, radius=1.27, navy=1.6, back=1.0),
]


# the two lower ones, on the north sides of their blocks, facing away (ff physics hq 2.mp4 8:05.0, through its ground
# homography; 2026-10-26, in place of first estimates): seen from behind, each a hollow outline of its colour, no navy. The
# blue's six corners read by hand ((1250,846), (1258,856), (1300,826), (1311,804), (1303,800), (1282,805)), its pose through
# them within 6 px a corner; the gold's outline fitted whole (1.2 px)
PORTALS += [
    # (the blue's face turned to the other side of its plane: the fit cannot tell them apart, and the HQ shows it hollow, from
    # behind; its ring still goes out away from its block: ring_away)
    dict(colour='blue', centre=[6.87, 69.4, 0.98], facing=-36.0, lean=-36.0, turn=148.75, radius=1.21, navy=0.0, back=0.82,
         ring_away=True),
    dict(colour='gold', centre=[23.49, 64.87, 0.85], facing=123.6, lean=12.25, turn=24.0, radius=1.12, navy=0.0, back=0.82),
]

# the swirl, frame by frame (2026-10-26: the HQ's is not a rigid "G" turning: it holds as a "G", breaks apart ~1.6 s, is a
# wedge ~2.2 s, a "G" turned half round ~2.7 s, and turns back into the first by ~0.5 s): its shape traced in 80 phases of
# the 9:30-9:44 stack (each phase the median of its 2-9 frames, unskewed onto the face; portal_glyphs.json: outlines in units
# of the face's corner radius, x right, y up), drawn crisp here into one atlas a colour (10 x 8 cells), which the game plays
# through, each frame crossfading into the next
FRAMES = json.load(open('art/sky_islands/portal_glyphs.json'))
COLS, ROWS, CELL = 10, 8, 128


def atlas(colour, path):
    pal = PALETTES[colour]
    bgr = lambda h: (int(h[5:7], 16), int(h[3:5], 16), int(h[1:3], 16))
    K = 4 * CELL
    out = np.zeros((ROWS * CELL, COLS * CELL, 3), np.uint8)
    yy, xx = np.mgrid[:K, :K].astype(np.float32)
    t = np.clip((xx + (K - yy)) / (2 * K), 0, 1)[..., None]                     # (darker toward its lower left)
    g = np.float32(bgr(pal['glyph'][0])) * t + np.float32(bgr(pal['glyph'][1])) * (1 - t)
    for k, shapes in enumerate(FRAMES):
        m = np.zeros((K, K), np.uint8)
        for sh in shapes:                                                       # (the cell spans +-1.28 face radii)
            cv2.fillPoly(m, [np.int32([[(x + 1.28) / 2.56 * K * 16, (1.28 - y) / 2.56 * K * 16] for x, y in sh])], 255,
                         lineType=cv2.LINE_AA, shift=4)
        a = (m.astype(np.float32) / 255)[..., None]
        im = (np.float32(bgr(pal['face'])) * (1 - a) + g * a).astype(np.uint8)
        r, c = divmod(k, COLS)
        out[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = cv2.resize(im, (CELL, CELL), interpolation=cv2.INTER_AREA)
    cv2.imwrite(path, out)


for colour in PALETTES: atlas(colour, f'art/sky_islands/blender/portal_glyph_{colour}.png')

# the atlas's frame to each tile's, by colour (anticlockwise, seen from in front): rendered through reference.png's camera at its
# moment in the cycle (~1.0 s, the held "G"; the gold's 0.65 s behind, LAG) and scored against its swirls, -30 to -210 degrees:
# the blue's best -120 (41% overlapping), the gold's -90 to -120 (36%); the lower two, never seen from in front, take their
# colour's
SWIRL_TURN = {'blue': -120.0, 'gold': -105.0}
# each portal's swirl and ring run behind the clock by its colour's lag (2026-10-26: the gold's swirl is the blue's 0.65 s
# later, its dark share through 2,421 frames of 9:03-9:47 against the blue's correlating 0.88 at that lag; the lower two,
# never seen from in front, take their colour's)
LAG = {'blue': 0.0, 'gold': 0.65}
json.dump(dict(period=PERIOD, lags=[LAG[q['colour']] for q in PORTALS], swirl_turn=SWIRL_TURN, frames=dict(count=len(FRAMES), columns=COLS, rows=ROWS), spin=SPIN, ring=RING, glyph=GLYPH, palettes=PALETTES, sides=SIDES, portals=PORTALS),
          open('art/sky_islands/portals.json', 'w'), indent=1)
print(len(PORTALS), 'portals')
