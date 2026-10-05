import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../src/random';
import { step } from '../src/step';
import { FIXED_TIMESTEP_SECONDS } from '../src/time';
import type { InputFrame, WorldState } from '../src/world';
import { makeWorld } from './support/worlds';

const DT = FIXED_TIMESTEP_SECONDS;

/**
 * A recorded input script for 10 simulated seconds: three players, wandering analog input,
 * occasional zeros and deliberately MISSING players (as a flaky network would produce).
 */
function recordScript(seed: number, steps = 600): InputFrame[] {
  const random = createSeededRandom(seed);
  const axis = () => (random.next() - 0.5) * 2;
  return Array.from({ length: steps }, () => {
    const entries = new Map<string, { x: number; y: number }>();
    for (const id of ['A', 'B', 'C']) {
      const roll = random.next();
      if (roll < 0.1) continue; // missing this tick
      entries.set(id, roll < 0.2 ? { x: 0, y: 0 } : { x: axis(), y: axis() });
    }
    return entries;
  });
}

function replay(initial: WorldState, script: readonly InputFrame[]): WorldState {
  return script.reduce((state, inputs) => step(state, inputs, DT), initial);
}

const fingerprint = (state: WorldState) => JSON.stringify(state);

describe('DETERMINISTIC REPLAY', () => {
  const script = recordScript(7);

  it('the same initial state + the same recorded inputs → the identical result, every time', () => {
    const first = replay(makeWorld(), script);
    for (let run = 0; run < 5; run += 1) {
      expect(fingerprint(replay(makeWorld(), script))).toBe(fingerprint(first));
    }
  });

  it('a different input script gives a different result (the replay is actually exercising input)', () => {
    expect(fingerprint(replay(makeWorld(), recordScript(8)))).not.toBe(
      fingerprint(replay(makeWorld(), script)),
    );
  });

  it('actually moved things (this is not a trivially stationary replay)', () => {
    const end = replay(makeWorld(), script);
    expect(fingerprint(end)).not.toBe(fingerprint(makeWorld()));
    expect(end.time).toBeCloseTo(10, 9);
  });

  it('state is COMPLETE: stopping mid-match and resuming from a serialized snapshot changes nothing', () => {
    const uninterrupted = replay(makeWorld(), script);

    const midpoint = replay(makeWorld(), script.slice(0, 300));
    const restored = JSON.parse(JSON.stringify(midpoint)) as WorldState; // plain data, no hidden state
    const resumed = replay(restored, script.slice(300));

    expect(fingerprint(resumed)).toBe(fingerprint(uninterrupted));
  });

  it('stepping is a pure function of its arguments: the same call twice gives equal results', () => {
    const state = replay(makeWorld(), script.slice(0, 100));
    const frame = script[100] as InputFrame;
    expect(fingerprint(step(state, frame, DT))).toBe(fingerprint(step(state, frame, DT)));
  });

  it('two independent simulations fed the same inputs never drift apart', () => {
    let a = makeWorld();
    let b = makeWorld();
    for (const inputs of script) {
      a = step(a, inputs, DT);
      b = step(b, inputs, DT);
      expect(fingerprint(a)).toBe(fingerprint(b));
    }
  });
});
