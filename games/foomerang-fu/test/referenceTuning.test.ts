import { describe, expect, it } from 'vitest';
import { DEFAULT_FU_CONFIG as C, PRIMITIVE_ARENA } from '../src/rules';
import { DT, at, input, make, place, run } from './support/fixtures';

// The reference video's physics, measured in our world units (art/physics_reference/README.md, 2026-10-19). The owner asked for
// our physics to match it; each value here is the measurement, and changing one means re-measuring, not taste.

describe('tuned to the reference video', () => {
  it('walking: about 360 u/s (straight runs: median 334, p25-p75 305-370)', () => {
    expect(C.playerSpeed).toBe(360);
  });

  it('a player walking for one second on open ground covers 360 units', () => {
    let s = place(make(['a', 'b'], { arena: { width: 1600, height: 900 } }), 'a', 200, 450);
    s = run(s, Math.round(1 / DT), input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(s, 'a').x - 200).toBeCloseTo(360, 0);
  });

  it('the dash already matched (about 165 u in about 0.2 s, peaking at 1,000-1,300 u/s): unchanged', () => {
    expect([C.dashSpeed, C.dashSeconds]).toEqual([1100, 0.16]);
    expect(C.dashSpeed * C.dashSeconds).toBeGreaterThan(150);
    expect(C.dashSpeed * C.dashSeconds).toBeLessThan(190);
  });

  it('the plain throw’s speeds already matched (740-1,090 u/s out, fast home): unchanged', () => {
    expect([C.throwSpeed, C.returnSpeed]).toEqual([900, 1000]);
    expect(PRIMITIVE_ARENA.width).toBe(1600); // (the test arenas are untouched)
  });
});
