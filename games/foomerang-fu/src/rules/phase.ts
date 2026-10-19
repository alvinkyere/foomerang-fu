import type { Vec2 } from '@foomerang/game-core';
import { circleHitsWalls, type Solid } from './arena';
import { distanceToCircle } from './dash';

/**
 * PHASE_DASH traversal, as pure geometry. The dash is a STRAIGHT LINE from `origin` along `direction`;
 * a position `t` units along it is "valid" when a body of `radius` there overlaps no wall. Walls are
 * the only thing a Phase Dash may cross; the arena boundary and living players are not phaseable.
 */

const SAMPLE = 2;
const BISECTIONS = 40;

/**
 * The last valid place at or before `tStop` along the line: `tStop` itself when a body can stand
 * there, otherwise the nearest valid place behind it (flush before a wall it could not get through,
 * or in the gap between two walls). 0 when nothing valid is found back to the start (stay put).
 * Never returns a place inside a wall, and never one past `tStop`.
 */
export function lastValidAlong(
  origin: Vec2,
  direction: Vec2,
  tStop: number,
  radius: number,
  walls: readonly Solid[],
): number {
  const ok = (t: number): boolean =>
    !circleHitsWalls(
      { x: origin.x + direction.x * t, y: origin.y + direction.y * t },
      radius,
      walls,
    );
  if (ok(tStop)) return tStop;
  let t = tStop;
  while (t > 0) {
    const next = Math.max(0, t - SAMPLE);
    if (ok(next)) {
      // valid at `next`, invalid at `t`: find the boundary between them
      let lo = next;
      let hi = t;
      for (let k = 0; k < BISECTIONS; k += 1) {
        const mid = (lo + hi) / 2;
        if (ok(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    }
    t = next;
  }
  return 0;
}

/**
 * How far a Phase Dash of intended `length` may travel: the line is cut short by the arena boundary
 * (a body centre stays `radius` inside it) and by the first living player in the way (stopped at
 * contact, nobody shoved), and then, if that endpoint would leave the body in a wall, pulled back to
 * the last valid place on the same line (`lastValidAlong`).
 */
export function planPhaseDash(
  from: Vec2,
  direction: Vec2,
  length: number,
  radius: number,
  walls: readonly Solid[],
  arena: { readonly width: number; readonly height: number },
  others: readonly { readonly position: Vec2; readonly radius: number }[],
): number {
  let reach = length;
  const bound = (position: number, delta: number, low: number, high: number): void => {
    if (delta > 0) reach = Math.min(reach, Math.max(0, (high - position) / delta));
    else if (delta < 0) reach = Math.min(reach, Math.max(0, (low - position) / delta));
  };
  bound(from.x, direction.x, radius, arena.width - radius);
  bound(from.y, direction.y, radius, arena.height - radius);
  for (const other of others) {
    reach = Math.min(
      reach,
      distanceToCircle(from, direction, reach, radius, other.position, other.radius),
    );
  }
  return lastValidAlong(from, direction, reach, radius, walls);
}
