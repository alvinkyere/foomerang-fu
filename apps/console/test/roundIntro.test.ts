import { describe, expect, it } from 'vitest';
import { ROUND_INTRO, introBanner, landingPose } from '../src/render/roundIntro';

// A round's start as the reference video shows it (0:30.96–0:34.4, from the iris opening): the characters land one by one
// (the first at 0.82 s, then every ~0.32 s), each after ~0.45 s in the air turning two somersaults, landing in a crouch with a
// white ring spreading from its feet; GO at 2.84 s, play starting at GO. READY and GO themselves as the HQ video shows them
// (9:05.66–9:07.32): READY for the 0.983 s up to GO, GO for 0.683 s (render/readyGo.ts draws them).

describe('the round intro', () => {
  it('the measured timeline', () => {
    expect(ROUND_INTRO).toMatchObject({
      seconds: 2.84,
      firstLanding: 0.82,
      between: 0.32,
      air: 0.45,
      ready: [2.84 - 0.983, 2.84],
      goFor: 0.683,
    });
  });

  it('READY, then GO from the moment play starts', () => {
    expect(introBanner(1.0, undefined)).toBeUndefined();
    expect(introBanner(2.0, undefined)).toBe('READY');
    expect(introBanner(1.8, undefined)).toBeUndefined();
    expect(introBanner(2.83, undefined)).toBe('READY'); // right up to GO, no gap
    expect(introBanner(undefined, 0)).toBe('GO');
    expect(introBanner(undefined, 0.68)).toBe('GO');
    expect(introBanner(undefined, 0.69)).toBeUndefined();
  });

  it('each character lands in turn: not there before its jump, in the air turning twice, then crouched with the ring', () => {
    const k = 1; // the second to land: at 0.82 + 0.32 = 1.14 s
    expect(landingPose(1.14 - 0.5, k).visible).toBe(false);
    const mid = landingPose(1.14 - 0.225, k);
    expect(mid.visible).toBe(true);
    expect(mid.lift).toBeGreaterThan(0.5);
    expect(mid.turn).toBeCloseTo(Math.PI * 2, 6); // halfway through two turns
    const landed = landingPose(1.14 + 0.05, k);
    expect(landed.lift).toBe(0);
    expect(landed.squash).toBeLessThan(1);
    expect(landed.ring?.opacity ?? 0).toBeGreaterThan(0);
    const later = landingPose(1.14 + 0.5, k);
    expect(later).toMatchObject({ visible: true, lift: 0, turn: 0, squash: 1 });
    expect(later.ring).toBeUndefined();
  });
});
