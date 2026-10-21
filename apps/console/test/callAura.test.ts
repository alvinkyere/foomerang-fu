import { describe, expect, it } from 'vitest';
import { CALL_AURA, auraIn, auraLeftBehind } from '../src/render/callAura';

// The aura while a boomerang is being called home (the reference video, the tutorial at 0:17.80–18.90, read frame by frame;
// art/physics_reference/README.md, "The calling aura, frame by frame"): a thin pale ring round the boomerang (and on the caller's
// hands, owner) for as long as THROW is held for it. It does not flash: it fades in over two frames from a little larger (17.90,
// 18.33), stays lit (17.97–18.13; then 18.40 onwards, past half a second without a break), and is gone the frame the hold ends
// (18.17). When the boomerang lifts (18.67) the ring it lay in stays behind and comes apart (gone by ≈ 18.92); it carries its own.

describe('the calling aura', () => {
  it('fades in over two frames, settling from a little larger', () => {
    expect(auraIn(0).opacity).toBeLessThan(0.5);
    expect(auraIn(0).scale).toBeCloseTo(CALL_AURA.inScale, 9);
    expect(auraIn(CALL_AURA.inSeconds)).toEqual({ opacity: 1, scale: 1 });
    expect(CALL_AURA.inSeconds).toBeCloseTo(2 / 30, 9);
  });

  it('then stays lit, without flashing, for as long as the call lasts (the video: over half a second at a stretch)', () => {
    for (const t of [0.1, 0.2, 0.3, 0.36, 0.45, 0.55, 0.8, 2])
      expect(auraIn(t)).toEqual({ opacity: 1, scale: 1 });
  });

  it('when the boomerang lifts, the ring it lay in stays behind and comes apart in a quarter of a second', () => {
    expect(auraLeftBehind(0).opacity).toBe(1);
    expect(auraLeftBehind(CALL_AURA.leftSeconds / 2).opacity).toBeCloseTo(0.5, 9);
    expect(auraLeftBehind(CALL_AURA.leftSeconds / 2).scale).toBeGreaterThan(1);
    expect(auraLeftBehind(CALL_AURA.leftSeconds).opacity).toBe(0);
    expect(CALL_AURA.leftSeconds).toBeCloseTo(0.25, 9);
  });

  it('is about one and a half boomerang lengths across (19 px against its 13 px)', () => {
    expect(CALL_AURA.ringOfBoomerang).toBeCloseTo(1.5, 6);
  });
});
