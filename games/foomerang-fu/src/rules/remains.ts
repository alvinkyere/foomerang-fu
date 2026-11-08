import { pushOutOfSolid, type Solid } from './arena';
import type { Vec2 } from '@foomerang/game-core';

/**
 * The dead are solid (owner, 2026-11-07: "they should be solid … if a player moves against the dead body they should basically be
 * able to move the body around"). A killed character comes apart in two, as both HQs show it (art/physics_reference/README.md,
 * "Every death in both HQs"; the drawing: console render/cutMotion.ts): the bottom stands where it died; the top slides off along
 * the hit to a stop. Both are bodies: a living player who walks into one shoves it clear (it slides on a little after, then
 * stops); pieces never go into walls or into one another. A piece pinned against a wall slides along it and never traps anyone:
 * whoever pushes it into the wall squeezes past (a trapped player could not get back inside the border in time).
 * Pure; the pieces are cleared with the round. Lengths in world units.
 */
export interface Remain {
  readonly id: string;
  readonly ownerId: string;
  readonly piece: 'top' | 'bottom';
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

/** A living player, as the pieces meet it. */
export interface Pusher {
  readonly id: string;
  readonly position: Vec2;
  readonly radius: number;
}

export const REMAINS = Object.freeze({
  /** Each piece's body, as a fraction of the player's (the bottom as wide as the character, the top a little smaller). */
  bottom: 0.8,
  top: 0.62,
  /** The top's slide: ≈ 1.5 drawn widths (76 u) in ≈ 1.6 s (the HQs: 0.9-2.6 widths in 1.2-2.3 s). */
  slide: { distance: 1.5 * 76, seconds: 1.6 },
  /** An explosion flings it this many times as far (HQ1 4:14.3, 6:33.6: by eye). */
  blown: 3,
  /** How fast a shove can set a piece going, u/s (a little over walking pace: it slides on a little ahead of the shover). */
  shove: 420,
});

/** One deceleration for every piece: the top's slide (d = v₀T/2, a = v₀/T). */
const FRICTION = (2 * REMAINS.slide.distance) / (REMAINS.slide.seconds * REMAINS.slide.seconds);
const PASSES = 8;
const TOLERANCE = 1e-9;

/**
 * The two pieces of `ownerId`, killed at `at` by a hit going `hit` (undefined: no direction, they stay where it died). A burnt one
 * is not cut (HQ1 9:57.6: it falls whole onto its side): one piece, the whole body, where it died.
 */
export function remainsOf(
  ownerId: string,
  at: Vec2,
  hit: Vec2 | undefined,
  blown: boolean,
  playerRadius: number,
  burnt = false,
): readonly Remain[] {
  if (burnt)
    return Object.freeze([
      Object.freeze({
        id: `${ownerId}:bottom`,
        ownerId,
        piece: 'bottom' as const,
        position: { ...at },
        velocity: { x: 0, y: 0 },
        radius: playerRadius,
      }),
    ]);
  const len = hit === undefined ? 0 : Math.hypot(hit.x, hit.y);
  const v0 =
    ((2 * REMAINS.slide.distance) / REMAINS.slide.seconds) * (blown ? Math.sqrt(REMAINS.blown) : 1);
  const velocity =
    hit === undefined || len === 0
      ? { x: 0, y: 0 }
      : { x: (hit.x / len) * v0, y: (hit.y / len) * v0 };
  return Object.freeze([
    Object.freeze({
      id: `${ownerId}:bottom`,
      ownerId,
      piece: 'bottom' as const,
      position: { ...at },
      velocity: { x: 0, y: 0 },
      radius: playerRadius * REMAINS.bottom,
    }),
    Object.freeze({
      id: `${ownerId}:top`,
      ownerId,
      piece: 'top' as const,
      position: { ...at },
      velocity,
      radius: playerRadius * REMAINS.top,
    }),
  ]);
}

/**
 * One step: each piece slides on (slowing at one constant deceleration), living players shove the pieces they touch clear, the
 * pieces give one another room, and walls and the arena's edge stop them.
 */
export function stepRemains(
  remains: readonly Remain[],
  players: readonly Pusher[],
  walls: readonly Solid[],
  arena: { readonly width: number; readonly height: number },
  dt: number,
): { remains: readonly Remain[] } {
  if (remains.length === 0) return { remains };
  // the two pieces start on the same spot: the top leaves through the bottom, not from it
  const together = (a: Remain, b: Remain): boolean =>
    a.ownerId === b.ownerId && a.piece !== b.piece;
  const xs = remains.map((r) => r.position.x);
  const ys = remains.map((r) => r.position.y);
  const vx = remains.map((r) => r.velocity.x);
  const vy = remains.map((r) => r.velocity.y);

  // slide on, slowing to a stop
  remains.forEach((_, i) => {
    const speed = Math.hypot(vx[i] as number, vy[i] as number);
    if (speed === 0) return;
    const next = Math.max(0, speed - FRICTION * dt);
    const travel = ((speed + next) / 2) * dt;
    xs[i] = (xs[i] as number) + ((vx[i] as number) / speed) * travel;
    ys[i] = (ys[i] as number) + ((vy[i] as number) / speed) * travel;
    vx[i] = next === 0 ? 0 : ((vx[i] as number) / speed) * next;
    vy[i] = next === 0 ? 0 : ((vy[i] as number) / speed) * next;
  });

  const shoved = new Set<number>();
  for (let pass = 0; pass < PASSES; pass += 1) {
    let moved = false;
    // living players push pieces clear (a player is not slowed by a piece that can move)
    remains.forEach((r, i) => {
      for (const p of players) {
        const dx = (xs[i] as number) - p.position.x;
        const dy = (ys[i] as number) - p.position.y;
        const d = Math.hypot(dx, dy);
        const overlap = r.radius + p.radius - d;
        if (overlap <= TOLERANCE) continue;
        const nx = d === 0 ? 1 : dx / d;
        const ny = d === 0 ? 0 : dy / d;
        xs[i] = (xs[i] as number) + nx * overlap;
        ys[i] = (ys[i] as number) + ny * overlap;
        shoved.add(i);
        moved = true;
      }
    });
    // pieces give one another room (split the overlap), except a body's own two pieces while they part
    for (let i = 0; i < remains.length; i += 1)
      for (let j = i + 1; j < remains.length; j += 1) {
        const a = remains[i] as Remain;
        const b = remains[j] as Remain;
        if (
          together(a, b) &&
          Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y) > 0
        )
          continue;
        const dx = (xs[j] as number) - (xs[i] as number);
        const dy = (ys[j] as number) - (ys[i] as number);
        const d = Math.hypot(dx, dy);
        const overlap = a.radius + b.radius - d;
        if (overlap <= TOLERANCE) continue;
        const nx = d === 0 ? 1 : dx / d;
        const ny = d === 0 ? 0 : dy / d;
        xs[i] = (xs[i] as number) - (nx * overlap) / 2;
        ys[i] = (ys[i] as number) - (ny * overlap) / 2;
        xs[j] = (xs[j] as number) + (nx * overlap) / 2;
        ys[j] = (ys[j] as number) + (ny * overlap) / 2;
        moved = true;
      }
    // walls and the edge win: a piece stops against them (its speed into the wall is lost)
    remains.forEach((r, i) => {
      for (const wall of walls) {
        const out = pushOutOfSolid(xs[i] as number, ys[i] as number, r.radius, wall, TOLERANCE);
        if (out === undefined) continue;
        const nx = out[0] - (xs[i] as number);
        const ny = out[1] - (ys[i] as number);
        const n = Math.hypot(nx, ny);
        if (n > 0) {
          const into = ((vx[i] as number) * nx + (vy[i] as number) * ny) / n;
          if (into < 0) {
            vx[i] = (vx[i] as number) - (into * nx) / n;
            vy[i] = (vy[i] as number) - (into * ny) / n;
          }
        }
        xs[i] = out[0];
        ys[i] = out[1];
      }
      xs[i] = Math.min(Math.max(xs[i] as number, r.radius), arena.width - r.radius);
      ys[i] = Math.min(Math.max(ys[i] as number, r.radius), arena.height - r.radius);
    });
    if (!moved) break;
  }

  // a shoved piece is set going with the shove (it slides on a little ahead of whoever pushed it)
  for (const i of shoved) {
    const r = remains[i] as Remain;
    let gx = ((xs[i] as number) - r.position.x) / dt;
    let gy = ((ys[i] as number) - r.position.y) / dt;
    const g = Math.hypot(gx, gy);
    if (g > REMAINS.shove) {
      gx = (gx / g) * REMAINS.shove;
      gy = (gy / g) * REMAINS.shove;
    }
    if (Math.hypot(gx, gy) > Math.hypot(vx[i] as number, vy[i] as number)) {
      vx[i] = gx;
      vy[i] = gy;
    }
  }

  const out = remains.map((r, i) => {
    const same =
      xs[i] === r.position.x &&
      ys[i] === r.position.y &&
      vx[i] === r.velocity.x &&
      vy[i] === r.velocity.y;
    return same
      ? r
      : Object.freeze({
          ...r,
          position: { x: xs[i] as number, y: ys[i] as number },
          velocity: { x: vx[i] as number, y: vy[i] as number },
        });
  });
  return { remains: Object.freeze(out) };
}
