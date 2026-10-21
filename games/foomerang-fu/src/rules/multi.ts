import type { Vec2 } from '@foomerang/game-core';
import type { Boomerang } from './boomerang';

/**
 * MULTI_BOOMERANG, as the reference video shows it (art/physics_reference/README.md, "Multi boomerang"). An owner's throw flies
 * out as ONE boomerang; at its first enemy contact, or where its flight out ends, it splits into `MULTI_PIECES` boomerangs fanned
 * evenly `MULTI_SPREAD_RADIANS` apart about its heading (5:51.71: six, 44° ± 5° apart, ≈ 220° across; 6:50.6: five or six,
 * ≈ 40° apart). Each flies out as a plain throw from the split, curls home and is lethal; they carry the throw's other powers
 * (the video: ice trails at 6:50.7, fire at 10:43.5). All six are PIECES (`pieceOf`: which of the thrower's boomerangs they came
 * from): they vanish when caught, dropped or spent, and never split again. The boomerang that split is out of play meanwhile
 * (SPENT, `splitInto`) and is back in its thrower's hand once the last of its pieces is gone.
 */
export const MULTI_PIECES = 6;
export const MULTI_SPREAD_RADIANS = (44 * Math.PI) / 180;

const rotate = (v: Vec2, angle: number): Vec2 => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
});

/** The fan's directions about `heading`, in order from one side to the other: (k − (n − 1)/2) × spread, k = 0 … n − 1. */
export function splitDirections(
  heading: Vec2,
  n = MULTI_PIECES,
  spread = MULTI_SPREAD_RADIANS,
): Vec2[] {
  return Array.from({ length: n }, (_, k) => rotate(heading, (k - (n - 1) / 2) * spread));
}

/** A fresh plain flight out from `at` along `direction`: a piece of the thrower's boomerang number `of`, carrying its powers. */
export function launchPiece(
  b: Boomerang,
  at: Vec2,
  direction: Vec2,
  of: number,
  slot: number,
): Boomerang {
  return Object.freeze({
    ...b,
    state: 'THROWN',
    position: at,
    direction,
    travelled: 0,
    follow: 0,
    wallSeconds: 0,
    deflections: 0,
    deflectedBy: undefined,
    absorbed: Object.freeze([]),
    power: 0,
    homing: 0,
    ricochets: 0,
    velocity: Object.freeze({ x: 0, y: 0 }),
    recall: 0,
    respawn: 0,
    split: false,
    splitInto: false,
    pieceOf: of,
    pieceSlot: slot,
  } satisfies Boomerang);
}

/** The six pieces `b` (the thrower's boomerang number `of`) splits into at `at`, heading `heading` (unit). */
export const split = (b: Boomerang, at: Vec2, heading: Vec2, of: number): readonly Boomerang[] =>
  splitDirections(heading).map((d, slot) => launchPiece(b, at, d, of, slot));
