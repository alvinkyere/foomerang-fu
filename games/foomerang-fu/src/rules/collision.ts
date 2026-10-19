import type { Body, WorldState } from '@foomerang/game-core';
import { closestPointOn, distanceToSolid, pushOutOfSolid, type Solid } from './arena';

/**
 * Player-vs-player contact: the minimum circle-vs-circle separation Foomerang Fu needs. Pure and
 * deterministic; it is NOT a physics engine (no velocity, mass, restitution or friction).
 *
 * Model — "equal bodies, split the overlap":
 *   - Only SOLID bodies take part (the caller passes the living; the dead are neither pushed nor
 *     blocking).
 *   - Every pass looks at the positions the pass STARTED with. Each overlapping pair is pushed apart
 *     along the line between their centres, each by half of the overlap, and a body touched by
 *     several pairs receives the sum. Because corrections are computed from a snapshot and added in
 *     body order, the result never depends on which pair happened to be looked at first.
 *   - After each pass bodies are kept inside the arena (centre at least `radius` from every wall),
 *     which can re-create a small overlap; passes repeat (at most MAX_PASSES) until none is left.
 *     A pile-up against a wall therefore settles in a few passes instead of oscillating.
 *   - Walls are fixed: after the players have been separated, every solid body is pushed out of
 *     every wall (circle vs rectangle: straight away from the nearest point, or out by the nearest
 *     face if its centre got inside). A wall always wins over a player push, so a shove can never
 *     put anybody inside one; a pile-up against a wall settles over the next passes.
 *   - Movement is only along the contact normal, so tangential motion is untouched: a glancing
 *     contact slides — along other players and along walls.
 *
 * Consequence (a decision to be judged by playing): two equal bodies that push at each other with
 * equal effort stop dead and stay in contact; a walker pushing a stationary player shoves them
 * along at half speed rather than being stopped dead.
 */

const MAX_PASSES = 64;
/** Below this, an overlap is rounding noise and is left alone. */
const TOLERANCE = 1e-9;

export function separateBodies(
  world: WorldState,
  isSolid: (id: string) => boolean,
  walls: readonly Solid[] = [],
): WorldState {
  const bodies = world.bodies;
  const solid: number[] = [];
  bodies.forEach((body, index) => {
    if (isSolid(body.id)) solid.push(index);
  });
  if (solid.length < 2 && (solid.length === 0 || walls.length === 0)) return world;

  const xs = bodies.map((b) => b.position.x);
  const ys = bodies.map((b) => b.position.y);
  let moved = false;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const dx = new Array<number>(bodies.length).fill(0);
    const dy = new Array<number>(bodies.length).fill(0);
    let overlapping = false;

    for (let i = 0; i < solid.length; i += 1) {
      for (let j = i + 1; j < solid.length; j += 1) {
        const a = solid[i] as number;
        const b = solid[j] as number;
        const minimum = (bodies[a] as Body).radius + (bodies[b] as Body).radius;
        const ax = xs[b] as number;
        const ay = ys[b] as number;
        const vx = ax - (xs[a] as number);
        const vy = ay - (ys[a] as number);
        const distance = Math.hypot(vx, vy);
        if (minimum - distance <= TOLERANCE) continue;
        overlapping = true;
        // Exactly coincident centres have no direction: split along +x by body order (it needs two
        // bodies placed on the very same point, which spawning never does).
        const nx = distance === 0 ? 1 : vx / distance;
        const ny = distance === 0 ? 0 : vy / distance;
        const half = (minimum - distance) / 2;
        dx[a] = (dx[a] as number) - nx * half;
        dy[a] = (dy[a] as number) - ny * half;
        dx[b] = (dx[b] as number) + nx * half;
        dy[b] = (dy[b] as number) + ny * half;
      }
    }
    for (const index of solid) {
      const r = (bodies[index] as Body).radius;
      xs[index] = Math.min(
        Math.max((xs[index] as number) + (dx[index] as number), r),
        world.arena.width - r,
      );
      ys[index] = Math.min(
        Math.max((ys[index] as number) + (dy[index] as number), r),
        world.arena.height - r,
      );
    }
    for (const index of solid) {
      const r = (bodies[index] as Body).radius;
      for (const wall of walls) {
        const out = pushOutOfSolid(xs[index] as number, ys[index] as number, r, wall, TOLERANCE);
        if (out !== undefined) {
          // pushed past the arena's edge (a wall closer to it than a body is wide): stay on the edge and slide along it,
          // away from the wall, until clear (pushing and clamping by turns would ping-pong, and the last push would win)
          const [x, y] = onTheEdge(out[0], out[1], r, wall, world.arena);
          xs[index] = x;
          ys[index] = y;
          overlapping = true;
        }
      }
    }
    if (!overlapping) break;
    moved = true;
  }

  if (!moved) return world;
  return Object.freeze({
    ...world,
    bodies: Object.freeze(
      bodies.map((body, index) =>
        xs[index] === body.position.x && ys[index] === body.position.y
          ? body
          : Object.freeze({
              ...body,
              position: Object.freeze({ x: xs[index] as number, y: ys[index] as number }),
            }),
      ),
    ),
  });
}

/**
 * Where a body pushed out of `wall` to (x, y) ends when that is past the arena's edge: clamped onto the edge, then slid along it
 * (the axis that is not clamped) away from the wall until it is clear of it. Inside the arena it is (x, y) unchanged.
 */
function onTheEdge(
  x: number,
  y: number,
  r: number,
  wall: Solid,
  arena: { readonly width: number; readonly height: number },
): [number, number] {
  const cx = Math.min(Math.max(x, r), arena.width - r);
  const cy = Math.min(Math.max(y, r), arena.height - r);
  if (cx === x && cy === y) return [x, y];
  if (cx !== x && cy !== y) return [cx, cy]; // a corner of the arena: nowhere to slide
  const near = closestPointOn({ x: cx, y: cy }, wall);
  const along = cx !== x ? 'y' : 'x';
  const from = along === 'x' ? cx : cy;
  const dir = from >= (along === 'x' ? near.x : near.y) ? 1 : -1;
  const limit = along === 'x' ? arena.width - r : arena.height - r;
  const at = (t: number): [number, number] => {
    const v = Math.min(Math.max(from + dir * t, r), limit);
    return along === 'x' ? [v, cy] : [cx, v];
  };
  const clear = (t: number) => {
    const [px, py] = at(t);
    return distanceToSolid({ x: px, y: py }, wall) >= r - TOLERANCE;
  };
  if (clear(0)) return at(0);
  let lo = 0;
  let hi = 2 * r;
  if (!clear(hi)) return at(hi);
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) hi = mid;
    else lo = mid;
  }
  return at(hi);
}
