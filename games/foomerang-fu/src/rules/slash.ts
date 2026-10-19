import type { Vec2 } from '@foomerang/game-core';
import type { FuConfig } from './config';

/**
 * A player's melee swing, as an explicit state machine (never inferred from how it is drawn):
 *
 *   READY ──slash──► ACTIVE ──window over──► RECOVERING ──recovered──► READY
 *
 * Only ACTIVE can hurt anybody. The swing uses the boomerang, so it can only start while the
 * boomerang is in hand, and ACTIVE implies the boomerang is HELD. `direction` is the facing the
 * swing started with and does not turn while it lasts; `remaining` is the seconds left in the
 * current phase.
 */
export type SlashState =
  | { readonly phase: 'READY' }
  | {
      readonly phase: 'ACTIVE' | 'RECOVERING';
      readonly direction: Vec2;
      readonly remaining: number;
      /** Slice 5: players whose SHIELD this swing already met; it cannot hurt them again (one guard = one hit). */
      readonly spared?: readonly string[];
    };

export const SLASH_READY: SlashState = Object.freeze({ phase: 'READY' });

/** The state at the moment a swing starts. */
export const startSlash = (direction: Vec2, config: FuConfig): SlashState =>
  Object.freeze({ phase: 'ACTIVE', direction, remaining: config.slashActiveSeconds });

/** Absorbs floating-point drift in the phase timers. */
const EPSILON = 1e-9;

/** One step of time passing: ACTIVE → RECOVERING → READY. READY stays READY. */
export function advanceSlash(slash: SlashState, dt: number, config: FuConfig): SlashState {
  if (slash.phase === 'READY') return slash;
  const remaining = slash.remaining - dt;
  if (remaining > EPSILON) return Object.freeze({ ...slash, remaining });
  if (slash.phase === 'ACTIVE') {
    return Object.freeze({
      phase: 'RECOVERING',
      direction: slash.direction,
      remaining: config.slashRecoverySeconds,
    });
  }
  return SLASH_READY;
}

/**
 * Is `target` inside the swing from `from` along `direction` (a unit vector)? The region is a
 * circular sector: strictly nearer than `slashReach` (centre to centre) and strictly inside the
 * half-angle of `slashArc`. Like every hit in Fu it is open — touching the edge is a miss. A target
 * exactly on top of the attacker has no direction and is inside.
 */
export function inSlashRegion(
  from: Vec2,
  direction: Vec2,
  target: Vec2,
  config: FuConfig,
): boolean {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= config.slashReach) return false;
  if (distance === 0) return true;
  const cosine = (dx * direction.x + dy * direction.y) / distance;
  if (config.slashArc >= Math.PI * 2) return true; // a full circle has no edge
  return cosine > Math.cos(config.slashArc / 2);
}
