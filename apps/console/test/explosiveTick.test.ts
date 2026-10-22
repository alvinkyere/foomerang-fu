import { describe, expect, it } from 'vitest';
import { tickAt } from '../src/render/explosiveTick';

// The Explosive ticking before it goes off, timed every frame from the HQ reference video (5:21.95–5:22.47 at 60 fps).

describe('the tick', () => {
  it('nothing before its first tick', () => {
    expect(tickAt(0.49)).toEqual({ bloom: 0, flash: false });
  });

  it('a full bloom, its halo fading, then two white flashes, then a last bloom into the blast', () => {
    expect(tickAt(0.44).bloom).toBe(1);
    expect(tickAt(0.38).bloom).toBeGreaterThan(0);
    expect(tickAt(0.38).bloom).toBeLessThan(1);
    expect(tickAt(0.34)).toEqual({ bloom: 0, flash: false });
    expect(tickAt(0.3)).toEqual({ bloom: 0, flash: true });
    expect(tickAt(0.24)).toEqual({ bloom: 0, flash: false });
    expect(tickAt(0.17)).toEqual({ bloom: 0, flash: true });
    expect(tickAt(0.12)).toEqual({ bloom: 0, flash: false });
    expect(tickAt(0.07).bloom).toBe(1);
    expect(tickAt(0.02).bloom).toBeGreaterThan(0);
  });

  it('the ticks come faster towards the blast', () => {
    const starts = [0.467, 0.333, 0.2, 0.1];
    const gaps = starts.slice(1).map((s, i) => (starts[i] as number) - s);
    expect(gaps[2]).toBeLessThan(gaps[0] as number);
  });
});
