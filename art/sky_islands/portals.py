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

PERIOD = 3.86
# anticlockwise degrees through one period (continuous: it ends a whole turn on from where it starts)
SPIN = [(0.0, 243), (0.19, 270), (0.39, 360), (2.12, 360), (2.22, 471), (2.51, 477), (2.70, 489), (2.90, 525),
        (3.18, 540), (3.47, 555), (3.67, 591), (3.86, 603)]
GLYPH = [(0.25, 0.59), (0.055, 0.6), (-0.32, 0.545), (-0.58, -0.275), (-0.545, -0.35), (-0.24, -0.565), (-0.08, -0.64),
         (-0.015, -0.63), (0.05, -0.57), (0.3, -0.17), (0.355, 0.115), (0.33, 0.205), (0.285, 0.245), (0.095, 0.18),
         (0.04, 0.13), (0.03, 0.065), (0.16, -0.03), (0.11, -0.2), (0.05, -0.24), (-0.17, -0.2), (-0.22, -0.175),
         (-0.26, -0.11), (-0.265, 0.35), (-0.235, 0.415), (-0.165, 0.47), (0.14, 0.53), (0.245, 0.57)]
PALETTES = {
    'blue': dict(face='#1ce0f5', glyph=['#187db6', '#1f69a6'], ghost='#9eecdc'),
    'gold': dict(face='#f4c256', glyph=['#3b8cc0', '#2e6fa8'], ghost='#ecd585'),
}
SIDES = '#363e76'
# each portal: its colour; its face's centre (plan x, y; height); the way its face looks (degrees from east), how far it leans
# back and turns in its plane (degrees); its corner radius and how far it stands out of the rock; the outline on the grass
# (its centre forward of the tile's bottom corner and to its right, its radius, its turn). The blue's tile fitted in
# reference.png (the exact camera: its face 90% overlapping the HQ's, its navy sides 58%); the gold the same tile, facing out
# of its own rock's facing within a few degrees, its face fitted the same way (87%): it lies back on its rock (73 degrees),
# a smaller tile (the blue's fit 92%, from every start: upright within 10-16 degrees). `depth`: from the tile back to its rock's
# face, where the rock's navy hexagon is (each tile's fitted place, out from its rock's face as layout.py builds it); the outlines from the 9:30-9:44 stack (the near corner at the tile's foot)
PORTALS = [
    dict(colour='blue', centre=[-27.53, 97.75, 1.66], facing=-48.0, lean=10.0, turn=9.75, radius=1.55, depth=0.43,
         ghost=dict(forward=0.6, right=0.3, radius=1.55, turn=30.0)),
    dict(colour='gold', centre=[23.6, 96.76, 1.3], facing=-75.0, lean=73.0, turn=-16.5, radius=1.14, depth=0.58,
         ghost=dict(forward=0.6, right=0.3, radius=1.14, turn=30.0)),
]


def on_side(a, b, along, radius, lean=10.0, depth=0.82):
    """A portal on a block's side (from its top's corner `a` toward `b`, `along` units in), facing out of it: its face 0.35
    out from the top's edge (the block's round) plus half its depth, its bottom corner at the grass."""
    d = [b[0] - a[0], b[1] - a[1]]; L = math.hypot(*d); d = [d[0] / L, d[1] / L]
    n = [-d[1], d[0]]
    if n[1] < 0: n = [-n[0], -n[1]]                                        # (the north side: out of it is north)
    out = 0.35 + depth / 2
    c = [a[0] + d[0] * along + n[0] * out, a[1] + d[1] * along + n[1] * out]
    return dict(centre=[round(c[0], 2), round(c[1], 2), round(radius * math.cos(math.radians(lean)) + 0.05, 2)],
                facing=round(math.degrees(math.atan2(n[1], n[0])), 1), lean=lean, turn=0.0, radius=radius, depth=depth,
                ghost=dict(forward=0.6, right=0.3, radius=radius, turn=30.0))


# the two lower ones, on the north sides of their blocks, facing away (ff physics hq 2.mp4 8:05.0, its ground homography: the
# plaques' edges and their outlines on the grass 1.9 units along their sides; their faces never seen from the camera, their
# size between the two above; leaning over away from their blocks, -60 degrees, as the hollow frames the HQ shows from
# behind lean): the blue's on block 8 at the centre island's south-east corner, the gold's on block 13 at the
# east island's south-east corner
PORTALS += [dict(colour='blue', **on_side((5.72, 66.8), (9.08, 69.3), 1.92, 1.4, lean=-60.0)),
            dict(colour='gold', **on_side((21.66, 62.91), (26.04, 64.47), 1.91, 1.4, lean=-60.0))]

json.dump(dict(period=PERIOD, spin=SPIN, glyph=GLYPH, palettes=PALETTES, sides=SIDES, portals=PORTALS),
          open('art/sky_islands/portals.json', 'w'), indent=1)
print(len(PORTALS), 'portals')
