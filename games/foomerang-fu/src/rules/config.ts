import { FIXED_TIMESTEP_SECONDS } from '@foomerang/game-core';
import { assertValidSpawns, assertValidWalls, type FuArena } from './arena';
import { spawnPosition } from './spawn';

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
  /** How long the round-over state is shown before the next round starts, seconds. */
  readonly roundEndSeconds: number;
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
  roundEndSeconds: 2.5,
});

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
    ['roundEndSeconds', config.roundEndSeconds],
  ];
  for (const [name, value] of numbers) {
    if (!positive(value)) throw new RangeError(`${name} must be a positive, finite number`);
  }
  if (config.slashArc > Math.PI * 2) throw new RangeError('slashArc cannot exceed a full circle');
  if (!Number.isInteger(config.maxDeflections) || config.maxDeflections < 0) {
    throw new RangeError('maxDeflections must be a non-negative integer');
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
  if (config.playerSpeed * FIXED_TIMESTEP_SECONDS >= config.playerRadius) {
    throw new RangeError('a player moves farther than their radius in one step');
  }
  // A boomerang must not be able to jump over a player between two steps.
  const reach = config.playerRadius + config.boomerangRadius;
  if (Math.max(config.throwSpeed, config.returnSpeed) * FIXED_TIMESTEP_SECONDS >= reach) {
    throw new RangeError('a boomerang moves farther than a player is wide in one step');
  }
}
