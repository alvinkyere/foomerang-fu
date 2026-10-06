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
  /**
   * DECISION COMMITMENT: once it has chosen where to go (chase, cover, a Book, a position) it keeps that heading for a
   * number of ticks drawn from this band before reconsidering; only danger it has noticed (the floor, a boomerang) or
   * a chance to strike interrupts it. With probability `hesitate` it instead stops and looks for `hesitateTicks`.
   */
  readonly commitTicks: readonly [number, number];
  readonly hesitate: number;
  readonly hesitateTicks: readonly [number, number];
  /** Slack in a chosen route (radians): it takes a merely reasonable heading, not the best one. */
  readonly routeNoise: number;
  /** Chance per decision it does not take a throw it could (failing to capitalise), and the least time between two throws (ticks). */
  readonly throwHold: number;
  readonly throwGap: number;
  /** Chance a throw is badly aimed (error × 2.5). */
  readonly aimLapse: number;
  /** Chance it notices a RETURNING boomerang as a threat at all. */
  readonly returnAwareness: number;
  /** The least time between two of its own dashes (ticks): DASH is not its way of walking. */
  readonly dashGap: number;
}

const make = (profile: Profile): Profile => Object.freeze(profile);

export const PROFILES: Readonly<Record<Difficulty, Profile>> = Object.freeze({
  // Slice 7 recalibration after Human Playtest #1 ("Medium plays like an esports bot"): slower perception, committed
  // movement, hesitation, held-back throws, sloppier aim and defence, scarcer dashes. Physics are NOT touched.
  EASY: make({
    reactionTicks: [33, 51], // 550–850 ms
    decisionTicks: 18,
    aimError: 0.3,
    aimLapse: 0.25,
    lead: 0,
    horizon: 0.3,
    deflectTry: 0.06,
    deflectJitter: 11,
    dodge: 0.15,
    returnAwareness: 0.25,
    lapse: 0.15,
    dashUse: 0.1,
    dashGap: 420,
    fatigueAware: false,
    hazardLookahead: 0,
    bookInterest: 0.25,
    bookRange: 300,
    retarget: 120,
    pressure: false,
    cover: false,
    phaseRoutes: false,
    throwReach: 0.6,
    throwHold: 0.35,
    throwGap: 60,
    dashMisuse: 0.03,
    slashEager: 0.4,
    usePlatforms: false,
    commitTicks: [42, 72], // 0.7–1.2 s
    hesitate: 0.4,
    hesitateTicks: [20, 48],
    routeNoise: 0.5,
  }),
  MEDIUM: make({
    reactionTicks: [18, 27], // 300–450 ms
    decisionTicks: 14,
    aimError: 0.2,
    aimLapse: 0.15,
    lead: 0.35,
    horizon: 0.5,
    deflectTry: 0.3,
    deflectJitter: 6,
    dodge: 0.4,
    returnAwareness: 0.55,
    lapse: 0.08,
    dashUse: 0.3,
    dashGap: 200,
    fatigueAware: true,
    hazardLookahead: 0.35,
    bookInterest: 0.6,
    bookRange: 600,
    retarget: 90,
    pressure: false,
    cover: true,
    phaseRoutes: true,
    throwReach: 0.75,
    throwHold: 0.2,
    throwGap: 36,
    dashMisuse: 0,
    slashEager: 0.7,
    usePlatforms: false,
    commitTicks: [20, 42], // 0.33–0.7 s
    hesitate: 0.18,
    hesitateTicks: [12, 28],
    routeNoise: 0.35,
  }),
  HARD: make({
    reactionTicks: [11, 17], // 180–280 ms
    decisionTicks: 8,
    aimError: 0.08,
    aimLapse: 0.06,
    lead: 0.8,
    horizon: 0.8,
    deflectTry: 0.55,
    deflectJitter: 3,
    dodge: 0.7,
    returnAwareness: 0.85,
    lapse: 0.03,
    dashUse: 0.6,
    dashGap: 90,
    fatigueAware: true,
    hazardLookahead: 1.2,
    bookInterest: 1,
    bookRange: 1200,
    retarget: 45,
    pressure: true,
    cover: true,
    phaseRoutes: true,
    throwReach: 0.9,
    throwHold: 0.08,
    throwGap: 20,
    dashMisuse: 0,
    slashEager: 0.9,
    usePlatforms: true,
    commitTicks: [10, 22], // 0.17–0.37 s
    hesitate: 0.07,
    hesitateTicks: [8, 18],
    routeNoise: 0.12,
  }),
});
