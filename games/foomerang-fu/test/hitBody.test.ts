import { describe, expect, it } from 'vitest';
import { DEFAULT_FU_CONFIG } from '../src';
import { STRAIGHT, flying, make, place, run, types } from './support/fixtures';

// What is drawn is what kills (the owner, 2026-10-19; the reference video): a boomerang kills only when it touches the
// body as drawn. On our plaza characters are drawn ≈ 46 u wide (art/physics_reference/README.md): a kill is the boomerang
// (`boomerangRadius` 14) touching that body, 37 u centre to centre. The video's flying boomerang is drawn ≈ 21 u across
// (contact ≈ 33.5 u), within the ±30% of its yardstick. The collision body (`playerRadius`, walls and shoves) is unchanged.

/** A boomerang flying along y = 450 past b, whose centre is `off` from that line. */
const pass = (off: number) => {
  let s = make(['a', 'b'], STRAIGHT);
  s = place(place(s, 'a', 200, 450), 'b', 600, 450 + off);
  s = flying(s, 'a', { x: 300, y: 450 }, { x: 1, y: 0 });
  return types(run(s, 40).events).includes('HIT');
};

describe('the body a boomerang can hit is the body as drawn', () => {
  it('measures it from the video: a drawn body 23 u in radius', () => {
    expect(DEFAULT_FU_CONFIG.hitRadius).toBe(23);
  });

  it('a boomerang that touches the drawn body kills', () => {
    expect(pass(30)).toBe(true);
  });

  it('one that passes clear of the drawn body misses, though it is inside the collision body', () => {
    expect(pass(44)).toBe(false);
    expect(44).toBeLessThan(DEFAULT_FU_CONFIG.playerRadius + DEFAULT_FU_CONFIG.boomerangRadius);
  });
});
