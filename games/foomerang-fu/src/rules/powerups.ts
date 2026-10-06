import type { Vec2 } from '@foomerang/game-core';
import type { FuConfig } from './config';

/**
 * Slice 5: the five experimental powerups. Everything about them — where they appear, who takes
 * them, what they do, when they end — is plain deterministic state owned by the rules; the
 * renderer only draws it.
 */
export const POWER_KINDS = [
  'OVERDRIVE',
  'BLAST_BOOMERANG',
  'GUARD',
  'TWIN_THROW',
  'PHASE_DASH',
] as const;
export type PowerKind = (typeof POWER_KINDS)[number];

export const isPowerKind = (value: unknown): value is PowerKind =>
  typeof value === 'string' && (POWER_KINDS as readonly string[]).includes(value);

/**
 * What one player holds. Each power has the shape of its own lifetime:
 *   overdrive  seconds left (TIMED; 0 = not held)
 *   blast      a charge: arms the NEXT boomerang thrown (CONSUMED ON USE: the first detonation)
 *   guard      absorbs one lethal contact (CONSUMED ON HIT)
 *   twin       a second boomerang (PERSISTENT until death or round reset)
 *   phase      Phase Dash charges left (CONSUMED ON USE: one per successful dash)
 * Death and a new round reset all of it.
 */
export interface Powers {
  readonly overdrive: number;
  readonly blast: boolean;
  readonly guard: boolean;
  readonly twin: boolean;
  readonly phase: number;
}

export const NO_POWERS: Powers = Object.freeze({
  overdrive: 0,
  blast: false,
  guard: false,
  twin: false,
  phase: 0,
});

/** A pickup lying in the arena. `id` is the spawn counter, so it is unique and ordered. */
export interface Pickup {
  readonly id: number;
  readonly kind: PowerKind;
  readonly position: Vec2;
}

/** When the next pickup appears and how many have appeared this round (the whole spawn state). */
export interface PickupClock {
  readonly spawnIn: number;
  readonly spawned: number;
}

/** Where and when pickups appear. Absent from the config: no powerups at all (Slices 1–4 exactly). */
export interface PowerupConfig {
  /** Fixed places, in the order the rotation uses them. */
  readonly spots: readonly Vec2[];
  /** Seconds from the start of a round to the first pickup. */
  readonly firstSeconds: number;
  /** Seconds between pickups (counted only while fewer than `maxOnField` are lying around). */
  readonly intervalSeconds: number;
  readonly maxOnField: number;
  /** A player collects a pickup when their body overlaps this radius around it. */
  readonly pickupRadius: number;
}

/** Which kinds a player can hold at the same time, as an explicit table (see POWER_COMBINATIONS). */
export interface Combination {
  readonly allowed: boolean;
  /** What the pair does together, in one sentence; the tests pin each one. */
  readonly rule: string;
}

const pair = (a: PowerKind, b: PowerKind): string => (a < b ? `${a}+${b}` : `${b}+${a}`);

const COMBINATION_TABLE: ReadonlyArray<readonly [PowerKind, PowerKind, string]> = [
  ['OVERDRIVE', 'BLAST_BOOMERANG', 'independent: speed has no effect on the blast.'],
  ['OVERDRIVE', 'GUARD', 'independent.'],
  ['OVERDRIVE', 'TWIN_THROW', 'independent: both boomerangs fly at normal speed.'],
  [
    'OVERDRIVE',
    'PHASE_DASH',
    'the overdrive dash is longer, so a phase dash can cross a thicker wall; fatigue still counts and still slows it.',
  ],
  [
    'BLAST_BOOMERANG',
    'GUARD',
    'independent: a guard absorbs one blast like any other lethal contact; the owner is immune to their own blast.',
  ],
  [
    'BLAST_BOOMERANG',
    'TWIN_THROW',
    'one blast charge arms only the next boomerang thrown (either of the pair); the other flies plain.',
  ],
  ['BLAST_BOOMERANG', 'PHASE_DASH', 'independent.'],
  ['GUARD', 'TWIN_THROW', 'independent.'],
  [
    'GUARD',
    'PHASE_DASH',
    'independent: phasing grants no invulnerability, and a guard is spent by a hit while phasing like anywhere else.',
  ],
  ['TWIN_THROW', 'PHASE_DASH', 'independent.'],
];

/**
 * The compatibility model, explicit for every unordered pair of kinds: nothing combines by accident.
 * Every pair is currently allowed, with the rule that pair follows; `FuConfig.exclusivePairs` can
 * forbid a pair for experiments without touching the rules.
 */
export const POWER_COMBINATIONS: Readonly<Record<string, Combination>> = Object.freeze(
  Object.fromEntries(
    COMBINATION_TABLE.map(([a, b, rule]) => [pair(a, b), Object.freeze({ allowed: true, rule })]),
  ),
);

export const combinationKey = pair;

/** The kinds a player holds, in POWER_KINDS order (never an object's key order). */
export function heldKinds(powers: Powers, blastArmedInFlight: boolean): PowerKind[] {
  const held: PowerKind[] = [];
  if (powers.overdrive > 0) held.push('OVERDRIVE');
  if (powers.blast || blastArmedInFlight) held.push('BLAST_BOOMERANG');
  if (powers.guard) held.push('GUARD');
  if (powers.twin) held.push('TWIN_THROW');
  if (powers.phase > 0) held.push('PHASE_DASH');
  return held;
}

/**
 * May a player holding `held` take a pickup of `kind`? Never one they already hold (the pickup stays
 * for someone else: a duplicate is neither wasted nor stacked), and never one that is not allowed
 * with something they hold.
 */
export function canCollect(held: readonly PowerKind[], kind: PowerKind, config: FuConfig): boolean {
  if (held.includes(kind)) return false;
  const exclusive = (config.exclusivePairs ?? []).map(([a, b]) => pair(a, b));
  return held.every((other) => {
    const entry = POWER_COMBINATIONS[pair(kind, other)];
    return entry?.allowed === true && !exclusive.includes(pair(kind, other));
  });
}

/** The powers after taking a pickup of `kind` (the caller has checked `canCollect`). */
export function grant(powers: Powers, kind: PowerKind, config: FuConfig): Powers {
  switch (kind) {
    case 'OVERDRIVE':
      return Object.freeze({ ...powers, overdrive: config.overdriveSeconds });
    case 'BLAST_BOOMERANG':
      return Object.freeze({ ...powers, blast: true });
    case 'GUARD':
      return Object.freeze({ ...powers, guard: true });
    case 'TWIN_THROW':
      return Object.freeze({ ...powers, twin: true });
    case 'PHASE_DASH':
      return Object.freeze({ ...powers, phase: config.phaseDashCharges });
  }
}

/** What the pickup schedule would spawn: a pure function of the spawn counter and the round. */
export const spawnKind = (spawned: number, round: number): PowerKind =>
  POWER_KINDS[(spawned * 2 + round - 1) % POWER_KINDS.length] as PowerKind;

/** The first free spot at or after the rotation's choice; undefined when every spot is taken. */
export function spawnSpot(
  spawned: number,
  round: number,
  config: PowerupConfig,
  taken: readonly Vec2[],
): Vec2 | undefined {
  const n = config.spots.length;
  for (let i = 0; i < n; i += 1) {
    const spot = config.spots[(spawned + round - 1 + i) % n] as Vec2;
    if (!taken.some((t) => t.x === spot.x && t.y === spot.y)) return spot;
  }
  return undefined;
}
