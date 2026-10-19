import type { Vec2 } from '@foomerang/game-core';

/**
 * A boomerang's life, as an explicit state machine (never inferred from how it is drawn):
 *
 *   HELD ──throw──► THROWN ──range reached / wall──► RETURNING ──reaches its owner──► HELD
 *
 * Nothing else is allowed. There is deliberately no "caught" or "dead" state: catching is simply
 * the RETURNING → HELD transition, and a dead owner's boomerang keeps its state.
 */
export type BoomerangState = 'HELD' | 'THROWN' | 'RETURNING' | 'DEFLECTED';

/** The Slice 1 cycle, unchanged. */
export const BOOMERANG_TRANSITIONS: Readonly<
  Record<'HELD' | 'THROWN' | 'RETURNING', readonly BoomerangState[]>
> = Object.freeze({
  HELD: Object.freeze(['THROWN'] as const),
  THROWN: Object.freeze(['RETURNING'] as const),
  RETURNING: Object.freeze(['HELD'] as const),
});

/**
 * Slice 3: an ACTIVE slash can knock an enemy boomerang off course. A THROWN, RETURNING or already
 * DEFLECTED boomerang becomes DEFLECTED (a straight flight in the direction the blade sent it); that
 * flight ends at a wall or after `deflectRange`, when it becomes RETURNING and goes home as usual. It
 * can never go straight from DEFLECTED to HELD: it always comes home the way every boomerang does.
 */
export const DEFLECTION_TRANSITIONS: Readonly<
  Record<'THROWN' | 'RETURNING' | 'DEFLECTED', readonly BoomerangState[]>
> = Object.freeze({
  THROWN: Object.freeze(['DEFLECTED'] as const),
  RETURNING: Object.freeze(['DEFLECTED'] as const),
  DEFLECTED: Object.freeze(['RETURNING', 'DEFLECTED'] as const),
});

const TABLES: Readonly<Record<string, readonly BoomerangState[] | undefined>>[] = [
  BOOMERANG_TRANSITIONS,
  DEFLECTION_TRANSITIONS,
];

export const canTransition = (from: BoomerangState, to: BoomerangState): boolean =>
  TABLES.some((table) => table[from]?.includes(to) === true);

export interface Boomerang {
  readonly ownerId: string;
  readonly state: BoomerangState;
  /** The centre. While HELD it is the owner's position. */
  readonly position: Vec2;
  /** Unit vector of the flight. Meaningful while THROWN or DEFLECTED; ZERO otherwise. */
  readonly direction: Vec2;
  /** Distance flown on the current straight leg. Zero unless THROWN or DEFLECTED. */
  readonly travelled: number;
  /** RETURNING only: which way it is hugging a wall (1 or -1), or 0 when it is flying free. */
  readonly follow: -1 | 0 | 1;
  /** RETURNING only: seconds it has spent sliding along walls on this trip home (the failsafe clock). */
  readonly wallSeconds: number;
  /** Slices 3: how many times this throw has been deflected (0 once it is home again). */
  readonly deflections: number;
  /** DEFLECTED only: who knocked it away. They cannot be killed by it, nor deflect it again, on this leg. */
  readonly deflectedBy: string | undefined;
  /** Slice 5: armed with BLAST_BOOMERANG — the first contact or wall impact detonates it (once). */
  readonly blast: boolean;
  /** Slice 5: players whose GUARD this boomerang already met on its current leg; it cannot hit them again on it. */
  readonly absorbed: readonly string[];
  /** How charged this throw was, 0 (a tap) to 1 (a full charge): its outbound speed and range. 0 while HELD and once deflected. */
  readonly power: number;
}

/** Applies a transition, throwing on an impossible one (a bug in the rules, never a game state). */
export function transition(
  boomerang: Boomerang,
  to: BoomerangState,
  patch: Partial<Boomerang> = {},
): Boomerang {
  if (!canTransition(boomerang.state, to)) {
    throw new Error(`impossible boomerang transition ${boomerang.state} → ${to}`);
  }
  return Object.freeze({ ...boomerang, ...patch, state: to });
}
