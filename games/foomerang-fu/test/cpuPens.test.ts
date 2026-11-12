import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, WARM_UP_ARENA } from '../src';
import { playMatch } from './support/cpuMatch';

// The warm-up's pens (the HQ, foomerang-fu physics hq.mp4 0:00-0:06): every player starts walled in and gets out by striking its pen's
// lever, across the water at the pen's island end. A CPU does the same: within seconds every pen is open (the HQ's: 2.5-5.6 s).

describe('CPUs in the warm-up’s pens', () => {
  it.each(DIFFICULTIES)('%s CPUs each open their own pen within 12 s', (difficulty) => {
    const participants = ['a', 'b', 'c', 'd'].map((id) => ({ id, cpu: difficulty }));
    let openAt = -1;
    playMatch({
      participants,
      arena: WARM_UP_ARENA,
      seed: 3,
      steps: 12 * 60,
      onStep: (state, _events, tick) => {
        if (
          openAt < 0 &&
          (state.sliders ?? []).length === 16 &&
          state.sliders?.every((s) => s.progress >= 1) === true
        )
          openAt = tick / 60;
      },
    });
    expect(openAt).toBeGreaterThan(0);
  });
});
