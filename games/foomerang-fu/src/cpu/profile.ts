export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export const DIFFICULTIES: readonly Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/**
 * What a difficulty changes: DECISION QUALITY only. Nothing here touches speed, hitboxes, recovery,
 * boomerang speed, dash allowance, powerups, shields or what the CPU may know — those belong to the
 * rules and are the same for every participant. All numbers are playtest hypotheses.
 */
export interface Profile {
  /** How stale its view of the world is: one value per CPU is drawn from this range (in 1/60 s ticks). */
  readonly reactionTicks: readonly [number, number];
  /** It re-decides this often (ticks); in between it holds its last movement. */
  readonly decisionTicks: number;
  /** Aim error (radians, standard deviation) on every throw. */
  readonly aimError: number;
  /** How much of a target's observed velocity it leads by (0 none, 1 full linear lead). */
  readonly lead: number;
  /** How far ahead it looks along an incoming boomerang's path (seconds). */
  readonly horizon: number;
  /** Chance it tries a timed SLASH deflection on a given incoming boomerang, and its timing error (ticks, σ). */
  readonly deflectTry: number;
  readonly deflectJitter: number;
  /** Chance it dodges an incoming boomerang it cannot or will not deflect. */
  readonly dodge: number;
  /** Chance per decision of a lapse (Easy wanders for a moment; the others skip the decision). */
  readonly lapse: number;
  /** Willingness to DASH; whether it respects its own fatigue. */
  readonly dashUse: number;
  readonly fatigueAware: boolean;
  /** How far ahead (seconds) it treats a hazard as dangerous; whether it reads the system schedule. */
  readonly hazardLookahead: number;
  /** Interest in Powerup Books (0–1) and how far it will go for one. */
  readonly bookInterest: number;
  readonly bookRange: number;
  /** Ticks it keeps a target before reconsidering. */
  readonly retarget: number;
  /** Whether it presses an opponent whose boomerangs are away, and retreats to cover when its own are. */
  readonly pressure: boolean;
  readonly cover: boolean;
  /** Whether it plans routes through walls with PHASE_DASH, and uses platforms. */
  readonly phaseRoutes: boolean;
  /** Throw only when the target is this much of the throw range away at most. */
  readonly throwReach: number;
  /** Chance per decision it does something silly with DASH (Easy only). */
  readonly dashMisuse: number;
  /** How readily it SLASHes an opponent in reach. */
  readonly slashEager: number;
  /** Whether it will plan across moving platforms. */
  readonly usePlatforms: boolean;
}

const make = (profile: Profile): Profile => Object.freeze(profile);

export const PROFILES: Readonly<Record<Difficulty, Profile>> = Object.freeze({
  EASY: make({
    reactionTicks: [24, 39], // 400–650 ms
    decisionTicks: 12,
    aimError: 0.24,
    lead: 0,
    horizon: 0.35,
    deflectTry: 0.12,
    deflectJitter: 9,
    dodge: 0.25,
    lapse: 0.14,
    dashUse: 0.15,
    fatigueAware: false,
    hazardLookahead: 0,
    bookInterest: 0.3,
    bookRange: 300,
    retarget: 90,
    pressure: false,
    cover: false,
    phaseRoutes: false,
    throwReach: 0.7,
    dashMisuse: 0.06,
    slashEager: 0.5,
    usePlatforms: false,
  }),
  MEDIUM: make({
    reactionTicks: [12, 21], // 200–350 ms
    decisionTicks: 8,
    aimError: 0.1,
    lead: 0.6,
    horizon: 0.6,
    deflectTry: 0.5,
    deflectJitter: 4,
    dodge: 0.6,
    lapse: 0.05,
    dashUse: 0.5,
    fatigueAware: true,
    hazardLookahead: 0.5,
    bookInterest: 0.7,
    bookRange: 700,
    retarget: 60,
    pressure: false,
    cover: true,
    phaseRoutes: true,
    throwReach: 0.85,
    dashMisuse: 0,
    slashEager: 0.85,
    usePlatforms: false,
  }),
  HARD: make({
    reactionTicks: [6, 11], // 100–180 ms
    decisionTicks: 4,
    aimError: 0.035,
    lead: 1,
    horizon: 0.9,
    deflectTry: 0.85,
    deflectJitter: 1.5,
    dodge: 0.9,
    lapse: 0.015,
    dashUse: 0.9,
    fatigueAware: true,
    hazardLookahead: 1.5,
    bookInterest: 1,
    bookRange: 1600,
    retarget: 30,
    pressure: true,
    cover: true,
    phaseRoutes: true,
    throwReach: 0.95,
    dashMisuse: 0,
    slashEager: 1,
    usePlatforms: true,
  }),
});
