import { describe, expect, it } from 'vitest';
import { RumblePlanner } from '../src/runtime/rumblePlanner';

// The TV decides when each phone vibrates (the plaza's border): while a player is outside, a pulse a few times a second that
// grows stronger as the limit nears; when they explode, the strongest, longest one. CPUs have no phone.

const out = (id: string, outsideFor: number, alive = true) => ({ id, alive, outsideFor });

describe('RumblePlanner', () => {
  it('a player outside gets a rumble about four times a second, stronger as the 5 s limit nears', () => {
    const p = new RumblePlanner();
    const sent: { at: number; intensity: number }[] = [];
    for (let t = 0; t <= 4000; t += 16) {
      for (const r of p.plan([out('a', t / 1000)], 5, t))
        sent.push({ at: t, intensity: r.intensity });
    }
    expect(sent.length).toBeGreaterThanOrEqual(15);
    expect(sent.length).toBeLessThanOrEqual(18);
    for (let i = 1; i < sent.length; i += 1) {
      expect((sent[i]?.at ?? 0) - (sent[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(240);
      expect(sent[i]?.intensity ?? 0).toBeGreaterThanOrEqual(sent[i - 1]?.intensity ?? 0);
    }
    expect(sent[0]?.intensity).toBeLessThan(0.3);
    expect(sent.at(-1)?.intensity).toBeGreaterThan(0.75);
  });

  it('nothing for a player inside, nor for a CPU outside', () => {
    const p = new RumblePlanner();
    expect(p.plan([out('a', 0), out('cpu:1', 3)], 5, 1000)).toEqual([]);
  });

  it('the explosion: a player who was outside and is now dead gets the strongest, longest rumble, once', () => {
    const p = new RumblePlanner();
    p.plan([out('a', 4.9)], 5, 0);
    expect(p.plan([out('a', 0, false)], 5, 100)).toEqual([
      { playerId: 'a', intensity: 1, durationMs: 600 },
    ]);
    expect(p.plan([out('a', 0, false)], 5, 1000)).toEqual([]);
  });

  it('stepping back in stops the rumbles at once', () => {
    const p = new RumblePlanner();
    expect(p.plan([out('a', 1)], 5, 0)).toHaveLength(1);
    expect(p.plan([out('a', 0)], 5, 400)).toEqual([]);
  });
});
