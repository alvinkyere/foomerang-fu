import type { Vec2 } from './vec2';

/**
 * Directional input in normalized, device-independent form. A touch joystick, a keyboard, a
 * gamepad stick, a D-pad or an accessibility controller all reduce to this. The simulation does
 * not know or care which one produced it.
 *
 * Contract with the protocol layer: each axis is a finite number in [-1, 1]. Anything outside
 * that is tolerated defensively (see `normalizeMovementInput`) but is never expected.
 */
export interface MovementInput {
  readonly x: number;
  readonly y: number;
}

/** Initial product hypothesis; configurable per world. */
export const DEFAULT_DEAD_ZONE = 0.15;

const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export function assertValidDeadZone(deadZone: number): void {
  // < 1 because the remaining range [deadZone, 1] is rescaled onto [0, 1].
  if (!Number.isFinite(deadZone) || deadZone < 0 || deadZone >= 1) {
    throw new RangeError(`deadZone must be a finite number in [0, 1), got ${deadZone}`);
  }
}

/**
 * Raw directional input → movement vector with magnitude in [0, 1].
 *
 *   1. non-finite input → zero (a safe no-op; garbage can never poison simulation state)
 *   2. shrink out-of-range input to the unit square first (avoids overflow, keeps direction)
 *   3. radial dead zone: magnitude <= deadZone → zero
 *   4. rescale (deadZone, 1] onto (0, 1], so there is no jump at the dead-zone edge
 *   5. clamp magnitude to 1: the corner (1, 1) is √2 long and must not move faster than (1, 0)
 *
 * Pure: no mutation, no ambient state.
 */
export function normalizeMovementInput(
  input: MovementInput,
  deadZone: number = DEFAULT_DEAD_ZONE,
): Vec2 {
  assertValidDeadZone(deadZone);
  let { x, y } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ZERO;

  const largest = Math.max(Math.abs(x), Math.abs(y));
  if (largest > 1) {
    x /= largest;
    y /= largest;
  }

  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude <= deadZone) return ZERO;

  const scaled = Math.min(1, (magnitude - deadZone) / (1 - deadZone));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}
