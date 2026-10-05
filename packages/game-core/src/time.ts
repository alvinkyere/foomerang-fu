/**
 * Simulation time is measured in SECONDS and advances only by the `dt` handed to `step`. There is
 * no clock inside the simulation: wall-clock reads (and the accumulator that turns elapsed real
 * time into steps) belong in the loop AROUND it, which this package does not contain. That is
 * what keeps `step` a pure, replayable function.
 *
 * Do not confuse this with the room-engine's injected clock, which measures real elapsed time for
 * reconnect windows. Different problem, different clock.
 */

/** The fixed simulation step: 60 Hz. Rendering is independent of it (a loop may run 0, 1 or several steps per frame). */
export const FIXED_TIMESTEP_SECONDS = 1 / 60;

/**
 * The largest single `dt` the simulation accepts: 0.1 s = 6 fixed steps. A fixed-step loop never
 * needs more; a bigger value means a bug upstream (a stalled tab, a bad clock), which must not be
 * quietly turned into a huge teleport. The loop is responsible for splitting or discarding time.
 */
export const MAX_STEP_SECONDS = 0.1;

/** `dt` must be finite, >= 0 and <= MAX_STEP_SECONDS. Zero is a valid no-op. Violations are programming errors. */
export function assertValidStep(dt: number): void {
  if (!Number.isFinite(dt) || dt < 0 || dt > MAX_STEP_SECONDS) {
    throw new RangeError(
      `dt must be a finite number of seconds in [0, ${MAX_STEP_SECONDS}], got ${dt}`,
    );
  }
}
