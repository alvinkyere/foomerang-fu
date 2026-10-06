import type { Vec2 } from '@foomerang/game-core';
import { nearestWallNormal, sweepCircle, type Rect } from './arena';

/**
 * How a RETURNING boomerang gets home around solid geometry: LOCAL steering, no map of the arena.
 *
 * Each step is cut into pieces of at most PIECE world units (so even the longest accepted `dt`
 * steers at the same fidelity). For each piece:
 *
 *   1. Aim straight at the owner and try to move. If nothing is in the way, go, and let go of any
 *      wall (`follow` returns to 0).
 *   2. If a wall is in the way, move up flush against it (the same sweep a THROWN boomerang uses),
 *      then SLIDE along it with whatever is left of the piece. The slide direction is the wall's
 *      tangent: the contact normal turned a quarter turn by `follow` (+1 or -1). The first time it
 *      meets a wall, `follow` takes the sign that makes the slide point at least partly towards the
 *      owner (an exact tie takes +1). From then on it KEEPS that hand — that memory is what stops it
 *      jittering back and forth over a wall the owner is directly behind — and it hugs the wall
 *      round convex corners until its heading is free again.
 *   3. If the slide itself is blocked at once (a concave corner), flip the hand once and try the
 *      other way; if that is blocked too the piece makes no progress.
 *
 * It never moves into a wall, so it cannot penetrate or tunnel; it never teleports. Whether it got
 * anywhere is not decided here: the caller times how long it has been following a wall and recalls
 * the boomerang if that exceeds a limit (the failsafe).
 */
const PIECE = 10;
const CONTACTS_PER_PIECE = 3;
const MOVED = 1e-9;

export type Hand = -1 | 0 | 1;

export interface HomingResult {
  readonly position: Vec2;
  readonly follow: Hand;
  /** Did any part of this step slide along a wall? (Drives the failsafe clock.) */
  readonly followed: boolean;
}

export function homeStep(
  from: Vec2,
  owner: Vec2,
  travel: number,
  radius: number,
  walls: readonly Rect[],
  arena: { readonly width: number; readonly height: number },
  hand: Hand,
): HomingResult {
  const clampToArena = (p: Vec2): Vec2 => ({
    x: Math.min(Math.max(p.x, radius), arena.width - radius),
    y: Math.min(Math.max(p.y, radius), arena.height - radius),
  });
  let p = from;
  let follow = hand;
  let followed = false;
  const pieces = Math.max(1, Math.ceil(travel / PIECE));
  const length = travel / pieces;

  for (let i = 0; i < pieces; i += 1) {
    const dx = owner.x - p.x;
    const dy = owner.y - p.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) break;
    const heading = { x: dx / distance, y: dy / distance };
    const target =
      distance <= length ? owner : { x: p.x + heading.x * length, y: p.y + heading.y * length };

    const direct = sweepCircle(p, target, radius, walls);
    if (!direct.blocked) {
      p = direct.position;
      follow = 0;
      continue;
    }

    followed = true;
    let remaining = length - Math.hypot(direct.position.x - p.x, direct.position.y - p.y);
    p = direct.position;
    let flipped = false;
    for (let contact = 0; contact < CONTACTS_PER_PIECE && remaining > MOVED; contact += 1) {
      const normal = nearestWallNormal(p, walls) ?? { x: -heading.x, y: -heading.y };
      if (follow === 0) {
        const towardsOwner = -normal.y * heading.x + normal.x * heading.y;
        follow = towardsOwner >= 0 ? 1 : -1;
      }
      const tangent = { x: -normal.y * follow, y: normal.x * follow };
      const aim = clampToArena({ x: p.x + tangent.x * remaining, y: p.y + tangent.y * remaining });
      const slide = sweepCircle(p, aim, radius, walls);
      const moved = Math.hypot(slide.position.x - p.x, slide.position.y - p.y);
      p = slide.position;
      remaining -= moved;
      if (moved <= MOVED) {
        // No movement at all — a wall straight ahead, or the arena's edge clamping the slide to nothing:
        // this hand is wedged. Try the other hand once; if that is wedged too, this piece goes nowhere.
        if (flipped) break;
        follow = follow === 1 ? -1 : 1;
        flipped = true;
      } else if (!slide.blocked) {
        break; // slid the whole way
      }
    }
  }
  return { position: p, follow, followed };
}
