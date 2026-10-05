import { normalizeMovementInput } from './input';
import { assertValidStep } from './time';
import type { Arena, Body, InputFrame, MovementConfig, WorldState } from './world';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function moveBody(
  body: Body,
  inputs: InputFrame,
  arena: Arena,
  movement: MovementConfig,
  dt: number,
): Body {
  const input = inputs.get(body.id);
  if (input === undefined) return body; // absent from the frame ⇒ zero movement, nothing carried over

  const direction = normalizeMovementInput(input, movement.deadZone);
  if (direction.x === 0 && direction.y === 0) return body;

  // position += velocity × dt, in world units and seconds. Each axis is clamped independently so
  // a body pushing diagonally into a wall slides along it. The CENTER is kept `radius` away from
  // every wall, so the circle itself never leaves the arena.
  const x = clamp(
    body.position.x + direction.x * movement.maxSpeed * dt,
    body.radius,
    arena.width - body.radius,
  );
  const y = clamp(
    body.position.y + direction.y * movement.maxSpeed * dt,
    body.radius,
    arena.height - body.radius,
  );
  if (x === body.position.x && y === body.position.y) return body;
  return Object.freeze({ ...body, position: Object.freeze({ x, y }) });
}

/**
 * The simulation: `nextState = step(previousState, inputs, dt)`.
 *
 * Pure and deterministic. Given the same state, input frame and dt it returns the same result,
 * and it never mutates its arguments. It reads no clock, draws no randomness and touches nothing
 * outside its parameters. Unchanged bodies are returned by reference, so callers can detect
 * change cheaply.
 *
 * `dt` is in seconds: 0 is a valid no-op; negative, non-finite or greater than MAX_STEP_SECONDS
 * throws RangeError (a contract violation by the loop around the simulation).
 *
 * Determinism here means: same inputs ⇒ same outputs in a given runtime (the practical
 * requirement for replays and a server/host that runs the same engine). It is not a claim of
 * bit-identical floating-point results across every JavaScript engine and architecture; if
 * lockstep networking across heterogeneous runtimes is ever needed, that must be revisited.
 */
export function step(state: WorldState, inputs: InputFrame, dt: number): WorldState {
  assertValidStep(dt);
  if (dt === 0) return state;

  const bodies = state.bodies.map((body) =>
    moveBody(body, inputs, state.arena, state.movement, dt),
  );
  return Object.freeze({ ...state, time: state.time + dt, bodies: Object.freeze(bodies) });
}
