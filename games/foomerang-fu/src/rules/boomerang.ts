import type { Vec2 } from '@foomerang/game-core';

/**
 * A boomerang's life, as an explicit state machine (never inferred from how it is drawn):
 *
 *   HELD ──throw──► THROWN ──range reached / wall──► RETURNING ──reaches its owner──► HELD
 *
 * Nothing else is allowed. There is deliberately no "caught" or "dead" state: catching is simply
 * the RETURNING → HELD transition, and a dead owner's boomerang keeps its state.
 */
export type BoomerangState = 'HELD' | 'THROWN' | 'RETURNING';

export const BOOMERANG_TRANSITIONS: Readonly<Record<BoomerangState, readonly BoomerangState[]>> =
  Object.freeze({
    HELD: Object.freeze(['THROWN'] as const),
    THROWN: Object.freeze(['RETURNING'] as const),
    RETURNING: Object.freeze(['HELD'] as const),
  });

export const canTransition = (from: BoomerangState, to: BoomerangState): boolean =>
  BOOMERANG_TRANSITIONS[from].includes(to);

export interface Boomerang {
  readonly ownerId: string;
  readonly state: BoomerangState;
  /** The centre. While HELD it is the owner's position. */
  readonly position: Vec2;
  /** Unit vector of the outbound flight. Only meaningful while THROWN; ZERO otherwise. */
  readonly direction: Vec2;
  /** Distance flown on the outbound leg. Zero unless THROWN. */
  readonly travelled: number;
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
