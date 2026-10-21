import { describe, expect, it } from 'vitest';
import { DEFAULT_FU_CONFIG } from '../src';
import { STRAIGHT, flying, make, place, run, types } from './support/fixtures';

// What is drawn is what kills (the owner, 2026-10-19; the reference video): a boomerang kills only when it touches the
// body as drawn. Measured in the running game (art/physics_reference/README.md, "How big our characters are drawn"):
// characters are drawn ≈ 76 u wide, so a body ≈ 36–38 u in radius; a kill is the boomerang (`boomerangRadius` 14) touching it,
// 50 u centre to centre. (An earlier reading took the characters for 46 u wide and gave 23.)

/** A boomerang flying along y = 450 past b, whose centre is `off` from that line. */
const pass = (off: number) => {
  let s = make(['a', 'b'], STRAIGHT);
  s = place(place(s, 'a', 200, 450), 'b', 600, 450 + off);
  s = flying(s, 'a', { x: 300, y: 450 }, { x: 1, y: 0 });
  return types(run(s, 40).events).includes('HIT');
};

describe('the body a boomerang can hit is the body as drawn', () => {
  it('measures it in the game: a drawn body ≈ 36 u in radius (≈ 76 u wide)', () => {
    expect(DEFAULT_FU_CONFIG.hitRadius).toBe(36);
  });

  it('a boomerang that touches the drawn body kills', () => {
    expect(pass(45)).toBe(true);
  });

  it('one that passes clear of it misses', () => {
    expect(pass(55)).toBe(false);
  });
});
