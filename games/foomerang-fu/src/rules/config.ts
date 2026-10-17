import { FIXED_TIMESTEP_SECONDS } from '@foomerang/game-core';
import { assertValidSpawns, assertValidWalls, distanceToRect, type FuArena } from './arena';
import {
  SPAWN_RATES,
  isPowerKind,
  type PowerKind,
  type PowerupConfig,
  type SpawnRate,
} from './powerups';
import { spawnPosition } from './spawn';
import { assertValidSystems, hazardsOf, inRect } from './systems';

/**
 * Foomerang Fu's tuning knobs. Every number here is a GAMEPLAY HYPOTHESIS to be settled by playing,
 * not a rule of the platform. Units: world units and seconds (game-core's convention; +X right,
 * +Y down). Nothing here knows about pixels, frames or devices.
 */
export interface FuConfig {
  readonly arena: FuArena;
  readonly playerRadius: number;
  /** World units per second at full thumb deflection. */
  readonly playerSpeed: number;
  /** Radial dead zone; omitted = game-core's default. */
  readonly deadZone?: number;
  readonly boomerangRadius: number;
  /** Outbound speed, world units per second. */
  readonly throwSpeed: number;
  /** The farthest a thrown boomerang travels before it turns back, world units. */
  readonly throwRange: number;
  /** Homing speed on the way back, world units per second. */
  readonly returnSpeed: number;
  /** Slash reach: the swing hits anyone strictly nearer than this, centre to centre, world units. */
  readonly slashReach: number;
  /** Slash arc: the full angle of the swing, radians, centred on the facing direction. */
  readonly slashArc: number;
  /** How long a swing can hurt, seconds. */
  readonly slashActiveSeconds: number;
  /** After the swing, how long before the next one, seconds. */
  readonly slashRecoverySeconds: number;
  /** Walking speed while swinging and recovering, as a fraction of normal (1 = no slowdown). */
  readonly slashMoveFactor: number;
  /** Slice 3: how far a deflected boomerang flies in the direction it was knocked, world units (a new value, not a retune). */
  readonly deflectRange: number;
  /** Slice 3: how many times one throw can be deflected before it is lethal as normal (0 turns deflection off). */
  readonly maxDeflections: number;
  /**
   * Failsafe for a boomerang coming home round geometry: if it has spent this long sliding along walls
   * without arriving, it is recalled to its owner's hand (nothing is teleported through a wall; it simply
   * ends). It never counts in open ground, so it cannot affect open-arena play.
   */
  readonly returnWallSeconds: number;
  /** Slice 4 (an unvalidated hypothesis): how fast a dash moves, world units per second. */
  readonly dashSpeed: number;
  /** Slice 4: how long a dash lasts, seconds. Its distance is `dashSpeed × dashSeconds`. */
  readonly dashSeconds: number;
  /** Slice 4: how many successful dashes in a row are free; the next one (and each after) is FATIGUED. */
  readonly dashFreeCount: number;
  /** Slice 4: seconds without a successful dash after which fatigue clears and the dash count resets. */
  readonly fatigueRecoverySeconds: number;
  /** Slice 4: walking speed while FATIGUED, as a fraction of normal (1 = no penalty). */
  readonly fatiguedMoveFactor: number;
  /** Slice 4: dash speed (so distance) while FATIGUED, as a fraction of normal (1 = no penalty). */
  readonly fatiguedDashFactor: number;
  /** Slice 5: walking speed multiplier while OVERDRIVE is on (it multiplies with fatigue and the slash slowdown). */
  readonly overdriveMoveFactor: number;
  /** Slice 5: dash speed (so distance) multiplier for a dash that STARTS under OVERDRIVE (multiplies with fatigue). */
  readonly overdriveDashFactor: number;
  /** Slice 5: BLAST_BOOMERANG's blast radius, centre to body centre, world units. */
  readonly blastRadius: number;
  /** Slice 5: TWIN_THROW's spread: one THROW launches two boomerangs at ±this angle (radians) from the facing. */
  readonly twinSpreadRadians: number;
  /** Slice 5: which powers a Book may award (default all five). A disabled power is never awarded. */
  readonly enabledPowers?: readonly PowerKind[];
  /** Slice 5: the seed the Book's choice of power is derived from (with how many Books have been taken). */
  readonly seed: number;
  /**
   * Slice 8: the kill-race. A match is won by the first player to fill `targetKills` holes (14 in Free For All); it ends
   * the instant that happens. Absent: no victory condition (Slices 1–7: rounds go on forever; kills are still counted).
   */
  readonly targetKills?: number;
  /** Slice 8: how many rounds are REGULATION (9). Only labels the lobby of rounds: a match that reaches the end of them without a winner simply goes on, as OVERTIME rounds. */
  readonly regulationRounds?: number;
  /** Slice 5: where and when pickups appear. Absent: no powerups (Slices 1–4 exactly). */
  readonly powerups?: PowerupConfig;
  /** Slice 5: pairs of powers one player may NOT hold together (default none; every pair is allowed). */
  readonly exclusivePairs?: readonly (readonly [PowerKind, PowerKind])[];
  /** How long the round-over state is shown before the next round starts, seconds. */
  readonly roundEndSeconds: number;
  /** How long a player may stay outside the arena's safe zone (continuously) before they explode, seconds. */
  readonly outsideLimitSeconds: number;
}

export const DEFAULT_FU_CONFIG: FuConfig = Object.freeze({
  arena: Object.freeze({ width: 1600, height: 900 }),
  playerRadius: 36,
  playerSpeed: 420,
  boomerangRadius: 14,
  throwSpeed: 900,
  throwRange: 520,
  returnSpeed: 1000,
  slashReach: 130,
  slashArc: (Math.PI * 2) / 3,
  slashActiveSeconds: 0.12,
  slashRecoverySeconds: 0.38,
  slashMoveFactor: 0.6,
  deflectRange: 300,
  maxDeflections: 3,
  returnWallSeconds: 3,
  dashSpeed: 1100,
  dashSeconds: 0.16,
  dashFreeCount: 8,
  fatigueRecoverySeconds: 5,
  fatiguedMoveFactor: 0.7,
  fatiguedDashFactor: 0.7,
  overdriveMoveFactor: 1.4,
  overdriveDashFactor: 1.3,
  blastRadius: 170,
  seed: 1,
  twinSpreadRadians: (13 * Math.PI) / 180,
  roundEndSeconds: 2.5,
  outsideLimitSeconds: 5,
});

/**
 * Pickups for the primitive test arena: four open places (clear of every wall), first one after 6 s,
 * then one every 8 s while fewer than three are lying around. A hypothesis, like every number here.
 */
export const PRIMITIVE_POWERUPS: PowerupConfig = Object.freeze({
  spots: Object.freeze([
    Object.freeze({ x: 800, y: 295 }),
    Object.freeze({ x: 800, y: 605 }),
    Object.freeze({ x: 460, y: 450 }),
    Object.freeze({ x: 1140, y: 450 }),
  ]),
  firstSeconds: SPAWN_RATES.NORMAL.first,
  intervalSeconds: SPAWN_RATES.NORMAL.interval,
  maxOnField: 1,
  pickupRadius: 28,
});

/** The Book schedule for a spawn rate on a set of spots: `OFF` is no schedule at all. */
export function powerupsFor(
  rate: SpawnRate,
  spots: PowerupConfig['spots'] = PRIMITIVE_POWERUPS.spots,
): PowerupConfig | undefined {
  if (rate === 'OFF') return undefined;
  const pace = SPAWN_RATES[rate];
  return Object.freeze({
    spots,
    firstSeconds: pace.first,
    intervalSeconds: pace.interval,
    maxOnField: 1,
    pickupRadius: 28,
  });
}

const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

/** An invalid configuration is a programming error (RangeError), never a game state. */
export function assertValidConfig(config: FuConfig): void {
  const { arena } = config;
  const numbers: [string, number][] = [
    ['arena.width', arena.width],
    ['arena.height', arena.height],
    ['playerRadius', config.playerRadius],
    ['playerSpeed', config.playerSpeed],
    ['boomerangRadius', config.boomerangRadius],
    ['throwSpeed', config.throwSpeed],
    ['throwRange', config.throwRange],
    ['returnSpeed', config.returnSpeed],
    ['slashReach', config.slashReach],
    ['slashArc', config.slashArc],
    ['slashActiveSeconds', config.slashActiveSeconds],
    ['slashRecoverySeconds', config.slashRecoverySeconds],
    ['slashMoveFactor', config.slashMoveFactor],
    ['deflectRange', config.deflectRange],
    ['returnWallSeconds', config.returnWallSeconds],
    ['dashSpeed', config.dashSpeed],
    ['dashSeconds', config.dashSeconds],
    ['fatigueRecoverySeconds', config.fatigueRecoverySeconds],
    ['fatiguedMoveFactor', config.fatiguedMoveFactor],
    ['fatiguedDashFactor', config.fatiguedDashFactor],
    ['overdriveMoveFactor', config.overdriveMoveFactor],
    ['overdriveDashFactor', config.overdriveDashFactor],
    ['blastRadius', config.blastRadius],
    ['roundEndSeconds', config.roundEndSeconds],
    ['outsideLimitSeconds', config.outsideLimitSeconds],
  ];
  for (const [name, value] of numbers) {
    if (!positive(value)) throw new RangeError(`${name} must be a positive, finite number`);
  }
  if (config.slashArc > Math.PI * 2) throw new RangeError('slashArc cannot exceed a full circle');
  if (!Number.isInteger(config.maxDeflections) || config.maxDeflections < 0) {
    throw new RangeError('maxDeflections must be a non-negative integer');
  }
  if (!Number.isInteger(config.dashFreeCount) || config.dashFreeCount < 1) {
    throw new RangeError('dashFreeCount must be a positive integer');
  }
  if (config.overdriveMoveFactor < 1 || config.overdriveDashFactor < 1) {
    throw new RangeError('overdrive cannot make a player slower');
  }
  if (!(config.twinSpreadRadians > 0 && config.twinSpreadRadians < Math.PI / 4)) {
    throw new RangeError('twinSpreadRadians must be between 0 and 45 degrees');
  }
  if (!Number.isInteger(config.seed)) throw new RangeError('seed must be an integer');
  for (const key of ['targetKills', 'regulationRounds'] as const) {
    const value = config[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 1))
      throw new RangeError(`${key} must be a positive integer`);
  }
  if (config.enabledPowers !== undefined && !config.enabledPowers.every(isPowerKind)) {
    throw new RangeError('enabledPowers must be power kinds');
  }
  for (const entry of config.exclusivePairs ?? []) {
    if (!Array.isArray(entry) || entry.length !== 2 || !entry.every(isPowerKind)) {
      throw new RangeError('exclusivePairs must be pairs of power kinds');
    }
  }
  if (config.powerups !== undefined) assertValidPowerups(config);
  if (config.fatiguedMoveFactor > 1 || config.fatiguedDashFactor > 1) {
    throw new RangeError('fatigue cannot make a player faster');
  }
  if (config.slashMoveFactor > 1) throw new RangeError('slashMoveFactor cannot exceed 1');
  if (arena.width < config.playerRadius * 4 || arena.height < config.playerRadius * 4) {
    throw new RangeError('the arena must be at least four player radii in each direction');
  }
  // Players are solid: walls must be sound, and nobody may start overlapping a wall or each other.
  assertValidWalls(arena, config.playerRadius);
  const slots = [0, 1, 2, 3, 4, 5];
  if (arena.spawns !== undefined && arena.spawns.length !== slots.length) {
    throw new RangeError(`an arena needs exactly ${slots.length} spawn points`);
  }
  assertValidSpawns(
    arena,
    slots.map((slot) => spawnPosition(slot, arena)),
    config.playerRadius,
    slots.length,
  );
  assertValidSystems(
    arena,
    config.playerRadius,
    slots.map((slot) => spawnPosition(slot, arena)),
  );
  const zone = arena.safeZone;
  if (zone !== undefined) {
    if (
      !(zone.width > 0 && zone.height > 0) ||
      zone.x < 0 ||
      zone.y < 0 ||
      zone.x + zone.width > arena.width ||
      zone.y + zone.height > arena.height
    )
      throw new RangeError('the safe zone must lie inside the arena');
    if (slots.some((slot) => !inRect(spawnPosition(slot, arena), zone)))
      throw new RangeError('every spawn must be inside the safe zone');
  }
  if (
    config.playerSpeed * config.overdriveMoveFactor * FIXED_TIMESTEP_SECONDS >=
    config.playerRadius
  ) {
    throw new RangeError('an overdriven player moves farther than their radius in one step');
  }
  if (config.playerSpeed * FIXED_TIMESTEP_SECONDS >= config.playerRadius) {
    throw new RangeError('a player moves farther than their radius in one step');
  }
  // A dash is swept in steps no longer than the fixed step, so it must not move a player farther than
  // their radius in one of them (it could not otherwise be stopped by a wall or a body).
  const fastestDash = config.dashSpeed * config.overdriveDashFactor;
  if (fastestDash * FIXED_TIMESTEP_SECONDS >= config.playerRadius) {
    throw new RangeError('a dash moves farther than a radius in one step');
  }
  // A boomerang must not be able to jump over a player between two steps.
  const reach = config.playerRadius + config.boomerangRadius;
  if (Math.max(config.throwSpeed, config.returnSpeed) * FIXED_TIMESTEP_SECONDS >= reach) {
    throw new RangeError('a boomerang moves farther than a player is wide in one step');
  }
  // ...not even one running at it while it is dashing the other way.
  if (
    (Math.max(config.throwSpeed, config.returnSpeed) + fastestDash) * FIXED_TIMESTEP_SECONDS >=
    reach
  ) {
    throw new RangeError(
      'a boomerang and a dashing player close faster than a player is wide in one step',
    );
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A bad pickup schedule is a programming error (RangeError), never a game state. */
function assertValidPowerups(config: FuConfig): void {
  const p = config.powerups as PowerupConfig;
  const { arena } = config;
  if (!Array.isArray(p.spots) || p.spots.length === 0) {
    throw new RangeError('powerups need at least one pickup spot');
  }
  for (const [name, value] of [
    ['powerups.firstSeconds', p.firstSeconds],
    ['powerups.intervalSeconds', p.intervalSeconds],
    ['powerups.pickupRadius', p.pickupRadius],
  ] as const) {
    if (!positive(value)) throw new RangeError(`${name} must be a positive, finite number`);
  }
  if (!Number.isInteger(p.maxOnField) || p.maxOnField < 1) {
    throw new RangeError('powerups.maxOnField must be a positive integer');
  }
  const walls = arena.walls ?? [];
  p.spots.forEach((spot, index) => {
    if (!finite(spot?.x) || !finite(spot?.y))
      throw new RangeError(`pickup spot ${index} is not a point`);
    if (spot.x < 0 || spot.y < 0 || spot.x > arena.width || spot.y > arena.height) {
      throw new RangeError(`pickup spot ${index} is not inside the arena`);
    }
    if (hazardsOf(arena).some((h) => inRect(spot, h.rect))) {
      throw new RangeError(`pickup spot ${index} is on a hazard`);
    }
    if (walls.some((w) => distanceToRect(spot, w) < p.pickupRadius)) {
      throw new RangeError(`pickup spot ${index} is in or against a wall`);
    }
    if (p.spots.some((other, j) => j > index && other.x === spot.x && other.y === spot.y)) {
      throw new RangeError('pickup spots must be distinct');
    }
  });
}

/** Free For All, the standard mode (Slice 8): first to 14 kills wins at once; nine rounds are regulation, then overtime. */
export const FREE_FOR_ALL = Object.freeze({ targetKills: 14, regulationRounds: 9 });
