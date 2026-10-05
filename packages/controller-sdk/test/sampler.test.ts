import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLER_CONFIG, MovementSampler } from '../src/sampler';

const TICK = 1000 / 60; // the 60 Hz sampling loop

/** Runs the sampler at 60 Hz for `ms`, returning what it chose to send. */
function run(sampler: MovementSampler, fromMs: number, ms: number) {
  const sends: { at: number; x: number; y: number }[] = [];
  for (let t = fromMs; t <= fromMs + ms; t += TICK) {
    const out = sampler.sample(t);
    if (out) sends.push({ at: t, ...out });
  }
  return sends;
}

describe('MovementSampler: touch events → state → 60 Hz sampling → meaningful sends', () => {
  it('defaults: a small epsilon and a 250 ms refresh', () => {
    expect(DEFAULT_SAMPLER_CONFIG).toEqual({ epsilon: 0.01, refreshMs: 250 });
  });

  it('announces the initial state once (so a host never has to guess a new controller’s state)', () => {
    const s = new MovementSampler();
    expect(s.sample(0)).toEqual({ x: 0, y: 0 });
    expect(s.sample(TICK)).toBeUndefined();
  });

  it('does NOT send identical movement 60 times a second: holding full-right is refreshed every 250 ms', () => {
    const s = new MovementSampler();
    s.sample(0);
    s.setMovement(1, 0);
    const sends = run(s, TICK, 10_000);
    expect(sends[0]).toMatchObject({ x: 1, y: 0 });
    // 1 change + one refresh per 250 ms for 10 s ≈ 40 — not 600.
    expect(sends.length).toBeGreaterThanOrEqual(38);
    expect(sends.length).toBeLessThanOrEqual(42);
    for (let i = 2; i < sends.length; i += 1) {
      const gap = (sends[i]?.at ?? 0) - (sends[i - 1]?.at ?? 0);
      expect(gap).toBeGreaterThanOrEqual(250 - 1e-9);
      expect(gap).toBeLessThan(250 + TICK + 1e-9); // never leans on one ancient packet for long
    }
  });

  it('sends a real change on the very next sample', () => {
    const s = new MovementSampler();
    s.sample(0);
    s.setMovement(0.5, -0.25);
    expect(s.sample(TICK)).toEqual({ x: 0.5, y: -0.25 });
  });

  it('ignores jitter below the epsilon, not by exact float comparison', () => {
    const s = new MovementSampler();
    s.sample(0);
    s.setMovement(0.5, 0.5);
    s.sample(TICK);
    s.setMovement(0.5 + 0.004, 0.5 - 0.004);
    expect(s.sample(2 * TICK)).toBeUndefined();
    s.setMovement(0.5 + 0.02, 0.5);
    expect(s.sample(3 * TICK)).toEqual({ x: 0.52, y: 0.5 });
  });

  it('drift is measured against what was last SENT, so slow creep cannot hide', () => {
    const s = new MovementSampler();
    s.sample(0);
    s.setMovement(0.3, 0);
    s.sample(TICK);
    let sent = 0;
    for (let i = 1; i <= 30; i += 1) {
      s.setMovement(0.3 + i * 0.004, 0); // each step is below epsilon, the total is not
      if (s.sample((i + 1) * TICK)) sent += 1;
    }
    expect(sent).toBeGreaterThan(0);
  });

  describe('RELEASE must transmit promptly', () => {
    it('a transition to neutral is sent on the next sample, not at the next refresh', () => {
      const s = new MovementSampler();
      s.sample(0);
      s.setMovement(1, 0);
      s.sample(TICK);
      s.setMovement(0, 0); // thumb lifted
      expect(s.sample(2 * TICK)).toEqual({ x: 0, y: 0 });
    });

    it('even when the last thing SENT was a tiny deflection (closer to neutral than the epsilon)', () => {
      const s = new MovementSampler();
      s.sample(0);
      s.setMovement(0.004, 0);
      expect(s.sample(TICK)).toBeUndefined(); // below the epsilon of the announced neutral
      expect(s.sample(250)).toEqual({ x: 0.004, y: 0 }); // ...but the refresh sends it
      s.setMovement(0, 0); // released: only 0.004 away from what was sent, yet it MUST go out
      expect(s.sample(250 + TICK)).toEqual({ x: 0, y: 0 });
    });

    it('neutral is not repeated every sample once sent', () => {
      const s = new MovementSampler();
      s.sample(0);
      s.setMovement(1, 0);
      s.sample(TICK);
      s.setMovement(0, 0);
      expect(s.sample(2 * TICK)).toBeDefined();
      expect(s.sample(3 * TICK)).toBeUndefined();
      expect(s.sample(4 * TICK)).toBeUndefined();
    });

    it('neutral is also refreshed, so a lost release packet heals itself', () => {
      const s = new MovementSampler();
      s.sample(0);
      s.setMovement(1, 0);
      s.sample(TICK);
      s.setMovement(0, 0);
      s.sample(2 * TICK);
      const sends = run(s, 3 * TICK, 1_000);
      expect(sends.length).toBeGreaterThanOrEqual(3);
      expect(sends.every((m) => m.x === 0 && m.y === 0)).toBe(true);
    });
  });

  it('sends at most once per sample however many times the state changes between samples', () => {
    const s = new MovementSampler();
    s.sample(0);
    for (let i = 0; i < 50; i += 1) s.setMovement(Math.sin(i), Math.cos(i));
    expect(s.sample(TICK)).toBeDefined();
    expect(s.sample(TICK)).toBeUndefined(); // the same instant again has nothing new
  });

  it('a new connection epoch re-announces the current state immediately (self-healing)', () => {
    const s = new MovementSampler();
    s.sample(0);
    s.setMovement(1, 0);
    s.sample(TICK);
    s.reset();
    expect(s.sample(2 * TICK)).toEqual({ x: 1, y: 0 }); // the thumb is still down: tell the new connection
  });

  it('neutralize() zeroes the state', () => {
    const s = new MovementSampler();
    s.sample(0);
    s.setMovement(1, 1);
    s.sample(TICK);
    s.neutralize();
    expect(s.current).toEqual({ x: 0, y: 0 });
    expect(s.sample(2 * TICK)).toEqual({ x: 0, y: 0 });
  });

  describe('input hygiene', () => {
    it.each([
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.NaN],
    ])('non-finite (%s, %s) becomes neutral', (x, y) => {
      const s = new MovementSampler();
      s.setMovement(x, y);
      expect(s.current).toEqual({ x: 0, y: 0 });
    });

    it('clamps out-of-range axes into [-1, 1] so the protocol never rejects what we send', () => {
      const s = new MovementSampler();
      s.setMovement(5, -9);
      expect(s.current).toEqual({ x: 1, y: -1 });
    });

    it('never yields negative zero', () => {
      const s = new MovementSampler();
      s.setMovement(-0, -0);
      expect(Object.is(s.current.x, -0) || Object.is(s.current.y, -0)).toBe(false);
    });
  });

  it('is configurable', () => {
    const s = new MovementSampler({ epsilon: 0.1, refreshMs: 1000 });
    s.sample(0);
    s.setMovement(0.05, 0);
    expect(s.sample(TICK)).toBeUndefined();
    s.setMovement(0.2, 0);
    expect(s.sample(2 * TICK)).toBeDefined();
    expect(run(s, 3 * TICK, 900)).toHaveLength(0);
    expect(run(s, 1000 + 3 * TICK, 40).length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    { epsilon: -1 },
    { epsilon: Number.NaN },
    { refreshMs: 0 },
    { refreshMs: Number.POSITIVE_INFINITY },
  ])('rejects invalid configuration %j (programming error)', (config) => {
    expect(() => new MovementSampler(config)).toThrow(RangeError);
  });
});
