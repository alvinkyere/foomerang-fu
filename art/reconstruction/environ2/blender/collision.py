"""The plaza's collision, from the 3D models the game draws (owner, 2026-10-17: "real shapes").

Run headless:  blender -b --python art/reconstruction/environ2/blender/collision.py

Reads apps/console/public/maps/market_plaza/plaza.glb (the very file three.js draws) and writes the walls of
games/foomerang-fu/src/rules/marketPlazaArena.ts, keeping its spawns, Book spots and border as they are. Each solid is ONE model,
fitted to the parts of it that stand on the ground (a stall's plinth, body and posts, never its roof; a crate stacked on top of
others adds nothing):

  POT, POLE (banner poles, bunting posts), SIGN (its post), FOUNTAIN (its rim)  -> a disc
  CRATE, STALL, FENCE                                                         -> the smallest box round it, turned as it stands
  TERRACE (the raised terrace and its stairs)                                 -> rectangles

Crates and pots BREAK (owner, 2026-10-17): they are written as MARKET_PLAZA_BREAKABLES, everything else as MARKET_PLAZA_WALLS.

Trees, the bunting's rope, rugs and the floor are not solid. A solid thinner than a player radius (a post 15 units across) is
widened to one: the rules require it, so that no shove can carry a body through. World units are the rules': x right, y down.
"""

import json
import math
import os
import re
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
GLB = os.path.join(ROOT, "apps/console/public/maps/market_plaza/plaza.glb")
MANIFEST = os.path.join(ROOT, "apps/console/public/maps/market_plaza/manifest.json")
MODULE = os.path.join(ROOT, "games/foomerang-fu/src/rules/marketPlazaArena.ts")
REPORT = os.path.join(os.path.dirname(__file__), "collision.json")

PLAYER_RADIUS = 36
BREAKS = ("CRATE", "POT")
MIN_HALF = PLAYER_RADIUS / 2
GROUND = 0.6  # a part whose lowest point is below this (scene units) stands on the ground

world = json.load(open(MANIFEST))["camera"]["world"]
U, OX, OY = world["unitsPerPlanUnit"], world["planOriginX"], world["planOriginY"]


def to_world(v):
    """Blender (after glTF import: x, y = depth, z = up; 100 per plan unit) -> rules world (x right, y down)."""
    return ((v.x / 100 - OX) * U, (OY - v.y / 100) * U)


def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    parts = {}
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        parts[o.name] = {"z0": min(v.z for v in vs), "xy": [to_world(v) for v in vs]}
    return parts


def bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def hull(points):
    pts = sorted(set((round(x, 4), round(y, 4)) for x, y in points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def turned_box(points):
    """The smallest-area box round the points (rotating calipers over the hull's edges), angle folded into (-45°, 45°]."""
    h = hull(points)
    best = None
    for i in range(len(h)):
        (x0, y0), (x1, y1) = h[i], h[(i + 1) % len(h)]
        a = math.atan2(y1 - y0, x1 - x0)
        c, s = math.cos(a), math.sin(a)
        us = [x * c + y * s for x, y in h]
        vs = [-x * s + y * c for x, y in h]
        area = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or area < best[0]:
            best = (area, a, min(us), max(us), min(vs), max(vs))
    _, a, u0, u1, v0, v1 = best
    hw, hh = (u1 - u0) / 2, (v1 - v0) / 2
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    c, s = math.cos(a), math.sin(a)
    cx, cy = cu * c - cv * s, cu * s + cv * c
    while a > math.pi / 4:
        a -= math.pi / 2
        hw, hh = hh, hw
    while a <= -math.pi / 4:
        a += math.pi / 2
        hw, hh = hh, hw
    return {
        "shape": "box",
        "x": cx,
        "y": cy,
        "halfWidth": max(hw, MIN_HALF),
        "halfHeight": max(hh, MIN_HALF),
        "angle": a,
    }


def disc(points):
    x0, y0, x1, y1 = bbox(points)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = max(math.hypot(x - cx, y - cy) for x, y in points)
    return {"shape": "disc", "x": cx, "y": cy, "radius": max(r, MIN_HALF)}


def rect(x0, y0, x1, y1):
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def solids(parts):
    def grounded(names):
        return [p for n in names for p in parts[n]["xy"] if parts[n]["z0"] < GROUND]

    out = []
    # crates: each crate's panels, plus the frame bars (unnamed cubes) standing inside its footprint
    cubes = [n for n in parts if n.startswith("Cube")]
    for n in sorted(parts):
        m = re.match(r"CRATE_(\d+_crates?_\w+?)_panels$", n)
        if not m or parts[n]["z0"] >= GROUND:
            continue
        x0, y0, x1, y1 = bbox(parts[n]["xy"])
        mine = [
            c
            for c in cubes
            if x0 - 2 <= sum(bbox(parts[c]["xy"])[0::2]) / 2 <= x1 + 2
            and y0 - 2 <= sum(bbox(parts[c]["xy"])[1::2]) / 2 <= y1 + 2
        ]
        out.append(("CRATE", "CRATE_" + m.group(1), turned_box(grounded([n] + mine))))
    # stalls: plinth, body and posts
    stalls = sorted({m.group(1) for n in parts if (m := re.match(r"(stall_\w+?)_(plinth|body|post\d+)$", n))})
    for s in stalls:
        names = [n for n in parts if re.match(re.escape(s) + r"_(plinth|body|post\d+)$", n)]
        out.append(("STALL", s.upper(), turned_box(grounded(names))))
    # fences: posts and rail
    for f in sorted({m.group(1) for n in parts if (m := re.match(r"(FENCE_\d+_\w+?)_(post\d+|rail)$", n))}):
        names = [n for n in parts if re.match(re.escape(f) + r"_(post\d+|rail)$", n)]
        out.append(("FENCE", f, turned_box([p for n in names for p in parts[n]["xy"]])))
    for n in sorted(parts):
        if re.match(r"POT_\d+_\w+$", n) and not n.endswith("_mouth"):
            out.append(("POT", n, disc(parts[n]["xy"])))
        elif re.match(r"(BANNER_\w+_pole|BUNTING_post\d+)$", n):
            out.append(("POLE", n, disc(parts[n]["xy"])))
        elif n == "SIGN_post":
            out.append(("SIGN", "SIGN", disc(parts[n]["xy"])))
        elif n == "FOUNTAIN_rim":
            out.append(("FOUNTAIN", "FOUNTAIN", disc(parts[n]["xy"])))
    # the terrace (behind the far edge, so cut at y = 0) and its stairs in front of it
    tx0, _, tx1, ty1 = bbox(parts["ARCH_terrace"]["xy"])
    out.append(("TERRACE", "TERRACE", rect(tx0, 0, tx1, ty1)))
    sx0, _, sx1, sy1 = bbox([p for n in parts if n.startswith("ARCH_stair") for p in parts[n]["xy"]])
    out.append(("TERRACE", "TERRACE_STAIRS", rect(sx0, ty1, sx1, sy1)))
    return out


def ts_number(v):
    return f"{round(v, 1):g}" if abs(v - round(v)) > 1e-9 else str(int(round(v)))


def ts_solid(kind, ident, s):
    fields = [f"id: '{ident}'", f"kind: '{kind}'"]
    if "shape" in s:
        fields.append(f"shape: '{s['shape']}'")
    for k, v in s.items():
        if k == "shape":
            continue
        fields.append(f"{k}: {round(v, 4):g}" if k == "angle" else f"{k}: {ts_number(v)}")
    return "  Object.freeze({ " + ", ".join(fields) + " }),"


HEADER = '''import type { Vec2 } from '@foomerang/game-core';
import type { Breakable, FuArena, Rect, Solid } from './arena';

/**
 * MARKET PLAZA (`market_plaza`) — the plaza of environ2.avif, the owner's reference still (art/reconstruction/environ2), as DATA
 * owned by the rules. Presentation draws it; it never decides what blocks anything.
 *
 * The WALLS are GENERATED by art/reconstruction/environ2/blender/collision.py from the 3D models the game draws (plaza.glb) — do
 * not edit them by hand. Each is ONE model in its real shape (owner, 2026-10-17), fitted to the parts that stand on the ground:
 * POT, POLE (banner poles, bunting posts), SIGN (its post) and FOUNTAIN (its rim) are discs; CRATE, STALL (plinth, body and
 * posts, not the roof) and FENCE are boxes turned as they stand; TERRACE (the raised terrace and its stairs) is rectangles.
 * Crates and pots BREAK (owner, 2026-10-17): they are MARKET_PLAZA_BREAKABLES, solid until a boomerang, a slash or a blast
 * breaks them. Pots, poles and signs are solid by the owner's decision (2026-10-16). Trees, the bunting's rope and the rugs are not. A post
 * thinner than a player radius is widened to one. The world scale (2748 world units per plan unit) and the arena (the plaza
 * between the two side fences plus the outside sand beyond each, from the far wall's base to the bottom of the frame) come from
 * art/reconstruction/environ2/arena_environ2.py and the image's solved camera.
 */

export const MARKET_PLAZA_WIDTH = 2209;
export const MARKET_PLAZA_HEIGHT = 1108;

export type MarketPlazaWall = Solid & {
  readonly id: string;
  readonly kind: 'STALL' | 'FOUNTAIN' | 'POLE' | 'SIGN' | 'FENCE' | 'TERRACE';
};

/** A crate or a pot: solid until a boomerang, a slash or a blast breaks it (back every round). */
export type MarketPlazaBreakable = Breakable & { readonly kind: 'CRATE' | 'POT' };

'''


def write_module(out):
    src = open(MODULE).read()
    rest = src[src.index("/** One spawn per slot;") :]
    # the rules read only a wall's shape; its id and kind ride along
    rest = re.sub(
        r"walls: Object\.freeze\(\s*MARKET_PLAZA_WALLS\.map\([^\n]*\n?\s*\),",
        "walls: MARKET_PLAZA_WALLS,",
        rest,
    )
    rest = rest.replace(
        "MARKET_PLAZA_WALLS.map(({ x, y, width, height }) => Object.freeze({ x, y, width, height })),",
        "MARKET_PLAZA_WALLS,",
    )
    walls = "\n".join(ts_solid(k, i, s) for k, i, s in out if k not in BREAKS)
    props = "\n".join(ts_solid(k, i, s) for k, i, s in out if k in BREAKS)
    if "breakables: MARKET_PLAZA_BREAKABLES" not in rest:
        rest = rest.replace(
            "  walls: MARKET_PLAZA_WALLS,\n", "  walls: MARKET_PLAZA_WALLS,\n  breakables: MARKET_PLAZA_BREAKABLES,\n"
        )
    open(MODULE, "w").write(
        HEADER
        + "export const MARKET_PLAZA_WALLS: readonly MarketPlazaWall[] = Object.freeze([\n"
        + walls
        + "\n] as const);\n\nexport const MARKET_PLAZA_BREAKABLES: readonly MarketPlazaBreakable[] = Object.freeze([\n"
        + props
        + "\n] as const);\n\n"
        + rest
    )


parts = load()
out = solids(parts)
json.dump([{"kind": k, "id": i, **s} for k, i, s in out], open(REPORT, "w"), indent=1)
write_module(out)
print(f"COLLISION {len(out)} solids -> {os.path.relpath(MODULE, ROOT)}")
for k, i, s in out:
    print(f"  {k:9s} {i:28s} " + " ".join(f"{a}={b:.1f}" if isinstance(b, float) else f"{a}={b}" for a, b in s.items()))
