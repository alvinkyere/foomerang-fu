import type { Vec2 } from '@foomerang/game-core';
import type { FuArena, Rect } from './arena';

const wall = (x: number, y: number, width: number, height: number): Rect =>
  Object.freeze({ x, y, width, height });
const at = (x: number, y: number): Vec2 => Object.freeze({ x, y });

/**
 * THE experimental arena for Slice 6 (the Slice 2 arena is untouched). 1600 × 900, mirrored left–right
 * and top–bottom so no seat is better placed, with all three arena-system families:
 *
 *   - a central block, four divider walls at x 470–520 and 1080–1130 (y 200–400 and 500–700), and two
 *     flank covers: between each pair of dividers a 100-tall TIMED GATE (y 400–500) is the short route from
 *     a flank to the middle; the long routes are the open top and bottom lanes (y < 200, y > 700) and
 *     the open ground beside the hazards (x 520–640 and 960–1080);
 *   - two HAZARD strips, above and below the central block (x 640–960, y 240–350 and 550–660), lethal
 *     while ACTIVE and telegraphed by a WARNING;
 *   - two MOVING PLATFORMS, one over each hazard, shuttling along its length in opposite directions: a
 *     body riding one is carried across the strip and is not touched by it;
 *   - open ground everywhere else (both flanks, both lanes, the corners).
 *
 * Both gates share one schedule, both hazards share one schedule (a symmetric arena), and the platforms
 * run the same timings in opposite directions. Spawns are the primitive arena's six corner/lane places.
 * Timings are playtest hypotheses.
 */
export const SYSTEMS_ARENA: FuArena = Object.freeze({
  width: 1600,
  height: 900,
  walls: Object.freeze([
    wall(700, 390, 200, 120), // the central block
    wall(470, 200, 50, 200), // left divider, above its gate
    wall(470, 500, 50, 200), // left divider, below its gate
    wall(1080, 200, 50, 200),
    wall(1080, 500, 50, 200),
    wall(250, 380, 80, 140), // flank cover
    wall(1270, 380, 80, 140),
  ]),
  spawns: Object.freeze([
    at(110, 110),
    at(1490, 790),
    at(1490, 110),
    at(110, 790),
    at(800, 75),
    at(800, 825),
  ]),
  gates: Object.freeze([
    // open 6 s (the last 2 s flagged CLOSING), then closed 6 s
    Object.freeze({
      rect: wall(470, 400, 50, 100),
      openSeconds: 6,
      warnSeconds: 2,
      closedSeconds: 6,
    }),
    Object.freeze({
      rect: wall(1080, 400, 50, 100),
      openSeconds: 6,
      warnSeconds: 2,
      closedSeconds: 6,
    }),
  ]),
  hazards: Object.freeze([
    // safe 5 s, warning 2 s, ACTIVE 3 s
    Object.freeze({
      rect: wall(640, 240, 320, 110),
      safeSeconds: 5,
      warnSeconds: 2,
      activeSeconds: 3,
    }),
    Object.freeze({
      rect: wall(640, 550, 320, 110),
      safeSeconds: 5,
      warnSeconds: 2,
      activeSeconds: 3,
    }),
  ]),
  platforms: Object.freeze([
    Object.freeze({
      size: Object.freeze({ width: 100, height: 90 }),
      from: at(650, 250),
      to: at(860, 250),
      travelSeconds: 4,
      pauseSeconds: 1.5,
    }),
    Object.freeze({
      size: Object.freeze({ width: 100, height: 90 }),
      from: at(860, 560),
      to: at(650, 560),
      travelSeconds: 4,
      pauseSeconds: 1.5,
    }),
  ]),
});

/** Where Powerup Books may appear in the systems arena: four open corners of the middle (clear of every system). */
export const SYSTEMS_POWERUP_SPOTS: readonly Vec2[] = Object.freeze([
  at(320, 250),
  at(1280, 250),
  at(320, 650),
  at(1280, 650),
]);
