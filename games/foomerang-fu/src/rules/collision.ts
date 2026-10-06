import type { Body, WorldState } from '@foomerang/game-core';

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
 *   - Movement is only along the contact normal, so tangential motion is untouched: a glancing
 *     contact slides.
 *
 * Consequence (a decision to be judged by playing): two equal bodies that push at each other with
 * equal effort stop dead and stay in contact; a walker pushing a stationary player shoves them
 * along at half speed rather than being stopped dead.
 */

const MAX_PASSES = 64;
/** Below this, an overlap is rounding noise and is left alone. */
const TOLERANCE = 1e-9;

export function separateBodies(world: WorldState, isSolid: (id: string) => boolean): WorldState {
  const bodies = world.bodies;
  const solid: number[] = [];
  bodies.forEach((body, index) => {
    if (isSolid(body.id)) solid.push(index);
  });
  if (solid.length < 2) return world;

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
    if (!overlapping) break;

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
