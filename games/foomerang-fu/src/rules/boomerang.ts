import type { Vec2 } from '@foomerang/game-core';

/**
 * A boomerang's life, as an explicit state machine (never inferred from how it is drawn):
 *
 *   HELD ──throw──► THROWN ──range reached / wall──► RETURNING ──reaches its owner──► HELD
 *
 * Nothing else is allowed. There is deliberately no "caught" or "dead" state: catching is simply
 * the RETURNING → HELD transition, and a dead owner's boomerang keeps its state.
 */
export type BoomerangState =
  'HELD' | 'THROWN' | 'RETURNING' | 'DEFLECTED' | 'GROUNDED' | 'RECALLING' | 'SPENT';

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
  Record<'THROWN' | 'RETURNING' | 'DEFLECTED' | 'RECALLING', readonly BoomerangState[]>
> = Object.freeze({
  THROWN: Object.freeze(['DEFLECTED'] as const),
  RETURNING: Object.freeze(['DEFLECTED'] as const),
  DEFLECTED: Object.freeze(['RETURNING', 'DEFLECTED'] as const),
  // (one being pulled home is flying: a slash can knock it away too)
  RECALLING: Object.freeze(['DEFLECTED'] as const),
});

/**
 * A dropped boomerang (owner, 2026-10-19). One that cannot get home — its trip round the walls failed, or its thrower died —
 * becomes GROUNDED: it slides to a stop under friction and lies there, harmless. Its thrower picks it up by walking over it
 * (GROUNDED → HELD) or holds THROW to pull it home: it lifts (RECALLING) and is caught when it arrives (RECALLING → HELD); let
 * go, it drops again (RECALLING → GROUNDED).
 */
export const GROUND_TRANSITIONS: Readonly<
  Record<'THROWN' | 'RETURNING' | 'DEFLECTED' | 'GROUNDED' | 'RECALLING', readonly BoomerangState[]>
> = Object.freeze({
  THROWN: Object.freeze(['GROUNDED'] as const),
  RETURNING: Object.freeze(['GROUNDED'] as const),
  DEFLECTED: Object.freeze(['GROUNDED'] as const),
  GROUNDED: Object.freeze(['HELD', 'RECALLING'] as const),
  RECALLING: Object.freeze(['HELD', 'GROUNDED'] as const),
});

/**
 * EXPLOSIVE_BOOMERANG (the reference video; owner, 2026-10-19). An armed boomerang in flight that goes off is destroyed by its
 * own blast (SPENT): it is nowhere, harmless and cannot be thrown; `explosiveRespawnSeconds` later a new one is in its
 * thrower's hand (SPENT → HELD).
 */
export const EXPLOSIVE_TRANSITIONS: Readonly<
  Record<
    'THROWN' | 'RETURNING' | 'DEFLECTED' | 'RECALLING' | 'GROUNDED' | 'SPENT',
    readonly BoomerangState[]
  >
> = Object.freeze({
  THROWN: Object.freeze(['SPENT'] as const),
  RETURNING: Object.freeze(['SPENT'] as const),
  DEFLECTED: Object.freeze(['SPENT'] as const),
  RECALLING: Object.freeze(['SPENT'] as const),
  // (knocked down by the impact that ends its flight out, it goes off there)
  GROUNDED: Object.freeze(['SPENT'] as const),
  SPENT: Object.freeze(['HELD'] as const),
});

const TABLES: Readonly<Record<string, readonly BoomerangState[] | undefined>>[] = [
  BOOMERANG_TRANSITIONS,
  DEFLECTION_TRANSITIONS,
  GROUND_TRANSITIONS,
  EXPLOSIVE_TRANSITIONS,
];

export const canTransition = (from: BoomerangState, to: BoomerangState): boolean =>
  TABLES.some((table) => table[from]?.includes(to) === true);

export interface Boomerang {
  readonly ownerId: string;
  readonly state: BoomerangState;
  /** The centre. While HELD it is the owner's position. */
  readonly position: Vec2;
  /** Unit vector of the flight: its heading while THROWN, DEFLECTED or RETURNING (a curve turns it); ZERO in hand. */
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
  /** Armed with EXPLOSIVE_BOOMERANG: it goes off on the first enemy it touches, or where its flight out ends (once). */
  readonly blast: boolean;
  /** Slice 5: players whose SHIELD this boomerang already met on its current leg; it cannot hit them again on it. */
  readonly absorbed: readonly string[];
  /** How charged this throw was, 0 (a tap) to 1 (a full charge): its outbound speed and range. 0 while HELD and once deflected. */
  readonly power: number;
  /** RETURNING only: seconds of this trip home (its turn towards the thrower tightens with them). 0 otherwise. */
  readonly homing: number;
  /** How many times this throw has bounced off walls on its way out (0 again once it is home, and for a new deflected leg). */
  readonly ricochets: number;
  /** GROUNDED (sliding) and RECALLING: its velocity, units per second. ZERO otherwise (and once a GROUNDED one has stopped). */
  readonly velocity: Vec2;
  /** GROUNDED: seconds its thrower has been holding THROW (the pull starts at recallDelaySeconds). 0 otherwise. */
  readonly recall: number;
  /** SPENT: seconds until a new one is in its thrower's hand. 0 otherwise. */
  readonly respawn: number;
  /** FIRE_BOOMERANG: this throw sets whoever it hits burning (fire.ts). Cleared in hand. */
  readonly fire?: boolean;
  /** EXPLOSIVE_BOOMERANG: landed where its flight out ended and ticking: seconds until it goes off (explosive.ts). */
  readonly fuse?: number;
  /** ICE_BOOMERANG: this throw freezes instead of killing (ice.ts). Cleared in hand. */
  readonly ice?: boolean;
  /** MULTI_BOOMERANG: this throw splits into pieces at its first enemy contact or where its flight out ends (multi.ts). */
  readonly split?: boolean;
  /** SPENT because it split: back in its thrower's hand once the last of its pieces is gone (not on a respawn clock). */
  readonly splitInto?: boolean;
  /** A piece of a split (multi.ts): which of its thrower's boomerangs it came from (0 their own, 1 the extra). Gone when caught. */
  readonly pieceOf?: number;
  /** A piece's place in its fan, 0 … MULTI_PIECES − 1 (a stable name for it while it flies). */
  readonly pieceSlot?: number;
}

/** Applies a transition, throwing on an impossible one (a bug in the rules, never a game state). */
/** The states TELEPORT_BOOMERANG's thrower can go to it from: anywhere it is out, except destroyed (SPENT). */
export const TELEPORT_FROM: readonly BoomerangState[] = Object.freeze([
  'THROWN',
  'RETURNING',
  'DEFLECTED',
  'GROUNDED',
  'RECALLING',
]);

/**
 * TELEPORT_BOOMERANG (the owner, 2026-10-22): its thrower goes to it and has it in hand again, wherever it is. Kept apart from
 * the transition tables on purpose: only a teleport takes a boomerang straight from its flight to a hand.
 */
export function teleportCatch(boomerang: Boomerang, patch: Partial<Boomerang> = {}): Boomerang {
  if (!TELEPORT_FROM.includes(boomerang.state)) {
    throw new Error(`impossible teleport to a boomerang that is ${boomerang.state}`);
  }
  return Object.freeze({ ...boomerang, ...patch, state: 'HELD' });
}

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
