"""The cross pond's colours as the HQ video LOOKS (2026-10-29: "brighten up the map, that's your last difference").

Every colour measured from the HQ frames here was read with OpenCV, which decodes the video with different range and matrix handling than a
browser or a player does: in Chrome the same frame is about 5% brighter, with lifted blacks and a different green (stone top #9da7e1 read,
#a6b4e9 shown; water #74a2b3 read, #7da9be shown). What the owner compares the game with is the video as shown, so every colour that came
from a measurement goes through the fitted conversion (colour.json: art/lily_island/colour_fit.py, 4:27 of the HQ video, mean error 0.8 of 255).

  flat(hex)         a colour that is drawn as it is (unlit, a shader's): the converted colour
  lit(hex, light)   a base colour that the game's light will scale by `light` (as the screen sees it: ~0.98 on a top, 0.875 on a stone's side,
                    0.90 / 0.81 on the raft's camera-facing / east-facing sides): the base whose lit result is the converted colour
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
_C = json.load(open(os.path.join(HERE, 'colour.json')))
_M, _B = _C['M'], _C['b']


def _rgb(h): return [int(h[i:i + 2], 16) for i in (1, 3, 5)]
def _hex(c): return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in c)
# This map's reference frame (output/reference.png) was captured from Chrome, so it is ALREADY the video as a browser shows it: the
# conversion is the identity here. (The pond measured OpenCV's decode and needed colour.json; the pond's own colours kept below as
# written are used unconverted: a hair darker than shown, which the water/grass/stone measures of this frame replace.)
def _convert(c): return list(c)


def flat(h):
    return _hex(_convert(_rgb(h)))


def lit(h, light=0.98):
    """`h` is the base the pipeline had calibrated (its lit result matched the measured colour): the base that gives the converted colour."""
    return _hex([v / light for v in _convert(_rgb(h))])
