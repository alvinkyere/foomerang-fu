import { describe, expect, it } from 'vitest';
import { AIM_TIP_OFFSET, nameOffset } from '../src/render/layout';

describe('player label layout', () => {
  it.each([20, 36, 60])(
    'the name sits clear of the aim indicator in every facing direction (radius %s)',
    (radius) => {
      // The indicator reaches `radius + AIM_TIP_OFFSET` from the centre, straight down when the
      // player faces down; the name starts below the circle at `nameOffset(radius)`.
      expect(nameOffset(radius)).toBeGreaterThan(radius + AIM_TIP_OFFSET);
    },
  );
});
