import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('public API surface', () => {
  // Guards against accidental exports and removals; changing this list is a conscious act.
  it('exports exactly the intended runtime values', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'DEFAULT_DEAD_ZONE',
        'FIXED_TIMESTEP_SECONDS',
        'MAX_STEP_SECONDS',
        'createSeededRandom',
        'createWorld',
        'normalizeMovementInput',
        'step',
      ].sort(),
    );
  });

  it('keeps validation helpers internal', () => {
    for (const internal of ['assertValidStep', 'assertValidDeadZone']) {
      expect(api, internal).not.toHaveProperty(internal);
    }
  });
});
