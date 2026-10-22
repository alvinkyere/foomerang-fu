import { describe, expect, it } from 'vitest';
import { FALL, fallPose } from '../src/render/fallMotion';

// A player who walks off an island (the HQ videos: the eggplant 5:03.87 in the first, the sushi 7:59.50 in the second,
// camera motion taken out): it turns to face the camera, arms out and waving, rises 0.64 body widths on screen in 0.30 s
// (≈ 1.15 widths up: the camera looks down at 56°), then drops away under gravity (≈ 56 widths/s² on screen, ≈ 100 up and
// down) out of sight below the island, gone ≈ 0.65 s after it went over. Heights in body widths, up positive.

describe('the fall', () => {
  it('rises at first, to its peak at 0.3 s, as the video’s', () => {
    expect(fallPose(0).lift).toBe(0);
    expect(fallPose(0.15).lift).toBeGreaterThan(0.6);
    expect(fallPose(FALL.peakAt).lift).toBeCloseTo(FALL.rise, 6);
    expect(FALL.rise).toBeCloseTo(0.64 / Math.cos((56.17 * Math.PI) / 180), 2);
  });

  it('then drops away under gravity, below the ground by 0.6 s and out of sight at ≈ 0.65 s', () => {
    expect(fallPose(0.45).lift).toBeLessThan(FALL.rise);
    expect(fallPose(0.6).lift).toBeLessThan(-2);
    expect(fallPose(0.6).visible).toBe(true);
    expect(fallPose(0.7).visible).toBe(false);
    // the video's drop: ≈ 2.5 widths on screen from the peak in 0.3 s
    const drop = (FALL.rise - fallPose(0.6).lift) * Math.cos((56.17 * Math.PI) / 180);
    expect(drop).toBeCloseTo(2.54, 1);
  });

  it('it waves its arms all the while: they swing', () => {
    const a = fallPose(0.1).arms;
    const b = fallPose(0.2).arms;
    expect(Math.abs(a - b)).toBeGreaterThan(0.2);
  });
});
