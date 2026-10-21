import { describe, expect, it } from 'vitest';
import {
  PICKUP_MOTION,
  badgeOpacity,
  bookScale,
  confettiAt,
  confettiPiece,
  flashAt,
} from '../src/render/pickupMotion';

// Taking a Book, timed from the reference video (4:03.98 the take; 4:04.01 the badge starts to show, full at 4:04.08; the
// confetti lies until ≈ 4:04.43; the badge full at 4:05.98 and gone by 4:06.07).

describe('the badge', () => {
  it('is not there at the take, fades in over 3 frames, holds, and fades out by 2.07 s', () => {
    expect(badgeOpacity(0)).toBe(0);
    expect(badgeOpacity(0.065)).toBeCloseTo(0.5, 1);
    expect(badgeOpacity(0.1)).toBe(1);
    expect(badgeOpacity(1.5)).toBe(1);
    expect(badgeOpacity(1.97)).toBeCloseTo(1, 6);
    expect(badgeOpacity(2.02)).toBeCloseTo(0.5, 1);
    expect(badgeOpacity(2.07)).toBe(0);
  });
});

describe('the burst', () => {
  it('a flash with streaks from 0.03 s to 0.08 s, the streaks reaching out as it goes', () => {
    expect(flashAt(0.01).on).toBe(false);
    expect(flashAt(0.04).on).toBe(true);
    expect(flashAt(0.07).streakOut).toBeGreaterThan(flashAt(0.04).streakOut);
    expect(flashAt(0.09).on).toBe(false);
  });

  it('confetti flies out to 1.0–1.6 widths by 0.17 s, then lies shrinking until gone at 0.45 s', () => {
    for (let i = 0; i < PICKUP_MOTION.confetti; i += 1) {
      const { distance } = confettiPiece(i);
      expect(distance).toBeGreaterThanOrEqual(1);
      expect(distance).toBeLessThanOrEqual(1.6);
      expect(confettiAt(i, 0.17)?.distance).toBeCloseTo(distance, 6);
      expect(confettiAt(i, 0.3)?.distance).toBeCloseTo(distance, 6); // it lies where it landed
      expect(confettiAt(i, 0.3)?.scale).toBeLessThan(1);
      expect(confettiAt(i, 0.45)).toBeUndefined();
    }
    expect(confettiAt(0, 0.02)).toBeUndefined();
  });

  it('the Book shrinks away over 0.15 s', () => {
    expect(bookScale(0)).toBe(1);
    expect(bookScale(0.075)).toBeCloseTo(0.5, 6);
    expect(bookScale(0.15)).toBe(0);
  });
});

describe('the burst on the TV', () => {
  it('plays and is gone by 0.45 s', async () => {
    const THREE = await import('three');
    const { PickupBursts } = await import('../src/render/three/pickupBurst');
    const scene = new THREE.Scene();
    const bursts = new PickupBursts(scene);
    bursts.burst(0, 0, '#d4c227', 4, 1000);
    bursts.frame(1040);
    const visible = () => {
      let n = 0;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible) n += 1;
      });
      return n;
    };
    expect(visible()).toBe(1 + PICKUP_MOTION.streaks); // the flash and its streaks
    bursts.frame(1200);
    expect(visible()).toBe(PICKUP_MOTION.confetti); // the confetti, lying
    bursts.frame(1460);
    expect(bursts.count).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
