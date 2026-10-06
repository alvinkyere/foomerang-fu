import { FIXED_TIMESTEP_SECONDS } from '@foomerang/game-core';

/**
 * Foomerang Fu's tuning knobs. Every number here is a GAMEPLAY HYPOTHESIS to be settled by playing,
 * not a rule of the platform. Units: world units and seconds (game-core's convention; +X right,
 * +Y down). Nothing here knows about pixels, frames or devices.
 */
export interface FuConfig {
  readonly arena: { readonly width: number; readonly height: number };
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
    ['roundEndSeconds', config.roundEndSeconds],
  ];
  for (const [name, value] of numbers) {
    if (!positive(value)) throw new RangeError(`${name} must be a positive, finite number`);
  }
  if (arena.width < config.playerRadius * 4 || arena.height < config.playerRadius * 4) {
    throw new RangeError('the arena must be at least four player radii in each direction');
  }
  // A boomerang must not be able to jump over a player between two steps.
  const reach = config.playerRadius + config.boomerangRadius;
  if (Math.max(config.throwSpeed, config.returnSpeed) * FIXED_TIMESTEP_SECONDS >= reach) {
    throw new RangeError('a boomerang moves farther than a player is wide in one step');
  }
}
