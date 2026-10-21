import { describe, expect, it } from 'vitest';
import { WALK, walkPose } from '../src/render/walkMotion';

// Walking, as the reference footage shows it (the banana at 0:17.53–17.83, the store's full-HD shots of the ice cream and the
// bread moving): a step every ≈ 0.24 s with a small hop, the body rocking to one side then the other (≈ ±8°), the hands swinging
// forward and back in turn, and the body leaning into the way it goes. Standing still, none of it.

describe('walking', () => {
  it('standing still, it does not move', () => {
    expect(walkPose(1.234, 0)).toEqual({ hop: 0, rock: 0, swing: 0 });
  });

  it('hops once a step, rising to its height mid-step and landing at the end of it', () => {
    expect(walkPose(0, 1).hop).toBeCloseTo(0, 9);
    expect(walkPose(WALK.step / 2, 1).hop).toBeCloseTo(WALK.hop, 9);
    expect(walkPose(WALK.step, 1).hop).toBeCloseTo(0, 9);
  });

  it('rocks to one side on one step and to the other on the next', () => {
    const a = walkPose(WALK.step / 2, 1).rock;
    const b = walkPose(WALK.step * 1.5, 1).rock;
    expect(a).toBeCloseTo(WALK.rock, 9);
    expect(b).toBeCloseTo(-WALK.rock, 9);
    expect(WALK.rock).toBeCloseTo((8 * Math.PI) / 180, 9);
  });

  it('swings its hands in turn with its steps, and all of it scales with how fast it goes', () => {
    expect(walkPose(WALK.step / 2, 1).swing).toBeCloseTo(1, 9);
    expect(walkPose(WALK.step * 1.5, 1).swing).toBeCloseTo(-1, 9);
    const slow = walkPose(WALK.step / 2, 0.5);
    expect(slow.hop).toBeCloseTo(WALK.hop / 2, 9);
    expect(slow.rock).toBeCloseTo(WALK.rock / 2, 9);
  });
});
