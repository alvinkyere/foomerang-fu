"""The temple court's layout (2026-11-07): ff physics hq 2.mp4 2:01 (121.5 s and the round's mosaic), in plan units (x east, y north,
relative to the ground point under the frame's centre: measure.py). Everything but the court's floor (floor.py), the planters
(fit_planters.py, fit_big_planters.py) and the hex fields (hexfields.py) is here, read off the frame and the mosaic and checked by
overlaying the render on them (compare.py). Writes layout.json.

The court's walls, gates and statues are mirror-images about x = AX (the gates' posts -19.7 / -6.9 and 7.4 / 20.0, the corner
plinths' feet -31.8 / -17.7 and 17.2 / 32.2, the statues' slab -5.6 / 6.1); the court inside is not (the planters west, the hex
fields east).

  python art/temple_court/layout.py      (from the repository root; the Python of art/audio/output/venv)
"""
import json

AX = 0.2
mx = lambda x: round(2 * AX - x, 3)          # the mirror image of x

# the dashed border: top (through the statues' slab) and bottom (under the gates' bases) read on frames 130.8 s and 121.5 s, the
# west side at x -32.0 (121.5 s, the west lane); the east never seen, mirrored
BORDER = dict(x0=-32.0, x1=mx(-32.0), y0=-20.16, y1=21.15)

# the buildings' wings: a purple plinth, a wall of cream shoji panels in dark timber, a red tiled roof. `a`/`b` the wall's middle
# line's ends, `face` the side the plinth stands out to (and the roof slopes down to), `roof` 'shed' or 'gable'
WALL_W, WALL_H, PLINTH_H, PLINTH_OUT = 0.55, 4.7, 1.1, 1.1
WINGS = [
    dict(name='NW_N', a=(-30.5, 19.9), b=(-21.0, 19.9), face='S', roof='gable'),
    dict(name='NW_W', a=(-30.5, 19.9), b=(-30.5, 8.0), face='E', roof='gable'),
    dict(name='SW_W', a=(-30.5, -6.9), b=(-30.5, -19.3), face='E', roof='gable'),
    dict(name='SW_S', a=(-30.5, -19.3), b=(-21.6, -19.3), face='S', roof='gable'),
]
WINGS += [dict(name=w['name'].replace('W', 'E').replace('NE_N', 'NE_N'), a=(mx(w['a'][0]), w['a'][1]), b=(mx(w['b'][0]), w['b'][1]),
               face={'E': 'W', 'W': 'E'}.get(w['face'], w['face']), roof=w['roof']) for w in WINGS]
# the east wall is one wall top to bottom, its middle the arch gate over the east lane (the lanterns' stones at y 5.65 / -3.49)
WINGS = [w for w in WINGS if w['name'] not in ('NE_E', 'SE_E')]
EAST_GATE = dict(y0=-2.4, y1=4.6, x=mx(-30.5))
WINGS += [dict(name='E_N', a=(mx(-30.5), 19.9), b=(mx(-30.5), EAST_GATE['y1']), face='W', roof='gable'),
          dict(name='E_S', a=(mx(-30.5), EAST_GATE['y0']), b=(mx(-30.5), -19.3), face='W', roof='gable')]
TOWERS = [(-30.5, 19.9), (mx(-30.5), 19.9), (-30.5, -19.3), (mx(-30.5), -19.3)]

# the two gates at the bottom: two dark posts on purple stone bases, a heavy dark beam, a red tiled roof on it
GATES = [dict(posts=(-19.7, -6.9), y=-18.9), dict(posts=(mx(-6.9), mx(-19.7)), y=-18.9)]
GATE = dict(post_r=0.32, beam_z=5.9, beam_h=0.8, beam_d=0.75, beam_over=1.4, roof_h=1.0, base=(4.6, 2.4, 1.2))

# the statues' slab (front foot y 18.58, x -5.58 .. 6.06) and its fork and knife (their faces' eyes on frame 130.8 s)
SLAB = dict(x0=-5.58, x1=6.06, y0=18.58, y1=21.0, h=0.8)
STATUES = [dict(kind='fork', x=-2.6, y=19.9), dict(kind='knife', x=1.75, y=19.9)]

# the banners: a dark pole, a crossbar, a cream cloth with a grey sign (by the wings' ends)
BANNERS = [dict(x=-20.4, y=19.4), dict(x=mx(-20.4), y=19.4), dict(x=-29.4, y=8.9), dict(x=-29.4, y=-6.1)]
# the orange lanterns on the east wall and the towers, and the east gate's two stone lanterns on purple stones
LANTERNS = [(mx(-30.5), 20.3), (mx(-30.5), 5.2), (mx(-30.5), -3.1), (-30.5, 20.3)]
STONE_LANTERNS = [(29.4, 5.65), (29.4, -3.49)]

# the trees in the big planters: trunk foot (on the soil), the crown's middle and size (frame 121.5 s)
TREES = [dict(foot=(-18.3, 10.25), crown=(-18.2, 13.2, 7.0), r=2.9),
         dict(foot=(-17.2, 0.6), crown=(-18.0, 3.9, 7.0), r=3.0),
         dict(foot=(-18.2, -10.4), crown=(-18.4, -8.6, 7.0), r=2.6)]

json.dump(dict(AX=AX, border=BORDER, wings=WINGS, wall=dict(w=WALL_W, h=WALL_H, plinth_h=PLINTH_H, plinth_out=PLINTH_OUT),
               towers=TOWERS, east_gate=EAST_GATE, gates=GATES, gate=GATE, slab=SLAB, statues=STATUES, banners=BANNERS,
               lanterns=LANTERNS, stone_lanterns=STONE_LANTERNS, trees=TREES), open('art/temple_court/layout.json', 'w'), indent=1)
print(len(WINGS), 'wings', len(GATES), 'gates')
