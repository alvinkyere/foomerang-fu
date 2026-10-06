import type { Vec2 } from '@foomerang/game-core';
import type { FuConfig } from './config';

/**
 * A player's DASH (Slice 4, an experiment), as an explicit state machine:
 *
 *   READY ──press──► DASHING ──time is up, or blocked by a living player──► READY
 *
 * A dash is a short, committed burst of movement in one locked direction. It is movement and
 * nothing else: no invulnerability, no attack. While DASHING the player cannot steer, slash or
 * throw (the burst is the commitment). There is NO cooldown: spamming DASH is allowed, and is
 * limited by fatigue (below), never by refusing the press. `speed` is the dash's speed, fixed when
 * it starts (a fatigued dash is slower for its whole length); `remaining` is the seconds left.
 */
export type DashState =
  | { readonly phase: 'READY' }
  | {
      readonly phase: 'DASHING';
      readonly direction: Vec2;
      readonly remaining: number;
      readonly speed: number;
    };

export const DASH_READY: DashState = Object.freeze({ phase: 'READY' });

/** Absorbs floating-point drift in the timers. */
const EPSILON = 1e-9;

/**
 * Fatigue: deterministic gameplay state, counted here and nowhere else (not by the controller, the
 * server or the console). `dashes` counts the SUCCESSFUL dashes (ones the rules started) since the
 * player was last rested; `recoverIn` is the seconds left until they are. There are no stamina
 * points and no charges: the first `dashFreeCount` dashes of a burst are free, every one after is
 * made while FATIGUED, and `fatigueRecoverySeconds` without a successful dash clears it all.
 * Rested is `{ dashes: 0, recoverIn: 0 }`.
 */
export interface Fatigue {
  readonly dashes: number;
  readonly recoverIn: number;
}

export const RESTED: Fatigue = Object.freeze({ dashes: 0, recoverIn: 0 });

/** FATIGUED from the `dashFreeCount + 1`-th successful dash (that dash included) until recovered. */
export const isFatigued = (fatigue: Fatigue, config: FuConfig): boolean =>
  fatigue.dashes > config.dashFreeCount;

/** Time passing: the recovery clock runs down and, at zero, the player is rested (the count resets). */
export function advanceFatigue(fatigue: Fatigue, dt: number): Fatigue {
  if (fatigue.dashes === 0) return fatigue;
  const recoverIn = fatigue.recoverIn - dt;
  return recoverIn > EPSILON ? Object.freeze({ dashes: fatigue.dashes, recoverIn }) : RESTED;
}

/**
 * One more successful dash: it counts, and the recovery clock starts again from the full time,
 * counted from the START of the step the dash began in (`dt` of it has already passed by the end of
 * that step), so the recovery time never depends on how time was cut into steps.
 */
export const countDash = (fatigue: Fatigue, config: FuConfig, dt: number): Fatigue =>
  Object.freeze({
    dashes: fatigue.dashes + 1,
    recoverIn: config.fatigueRecoverySeconds - dt,
  });

/** The state at the moment a dash starts; a fatigued dash has `fatiguedDashFactor` of the speed. */
export const startDash = (direction: Vec2, config: FuConfig, fatigued: boolean): DashState =>
  Object.freeze({
    phase: 'DASHING',
    direction,
    remaining: config.dashSeconds,
    speed: config.dashSpeed * (fatigued ? config.fatiguedDashFactor : 1),
  });

/**
 * One sub-step of a dash of length `h` seconds. `blocked` (a living player in the way) ends the
 * burst on the spot; otherwise it ends when its time is up.
 */
export function advanceDashing(dash: DashState, h: number, blocked: boolean): DashState {
  if (dash.phase !== 'DASHING') return dash;
  const remaining = dash.remaining - h;
  if (!blocked && remaining > EPSILON) return Object.freeze({ ...dash, remaining });
  return DASH_READY;
}

/**
 * How far along `direction` (a unit vector) a circle of radius `radius` at `from` can travel, up to
 * `distance`, before it touches a circle of the same-or-other radius `blockerRadius` at `blocker`.
 * Contact is "distance equals the two radii" — touching, not overlapping — like every contact in Fu.
 * A circle that is already touching or overlapping only moves if it is not moving closer.
 * Returns `distance` when nothing is in the way.
 */
export function distanceToCircle(
  from: Vec2,
  direction: Vec2,
  distance: number,
  radius: number,
  blocker: Vec2,
  blockerRadius: number,
): number {
  const rx = from.x - blocker.x;
  const ry = from.y - blocker.y;
  const minimum = radius + blockerRadius;
  const along = direction.x * rx + direction.y * ry; // < 0: closing in
  const c = rx * rx + ry * ry - minimum * minimum;
  if (c <= 0) return along < 0 ? 0 : distance; // already in contact
  const discriminant = along * along - c;
  if (discriminant < 0) return distance; // the line misses
  const hit = -along - Math.sqrt(discriminant);
  if (hit < 0 || hit > distance) return distance; // behind us, or too far for this sub-step
  return hit;
}
