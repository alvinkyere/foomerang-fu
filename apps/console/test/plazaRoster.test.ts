import { describe, expect, it } from 'vitest';
import { parseArenaParam } from '../src/runtime/powerupMode';

// PlazaArena imports Phaser; the pure helpers are re-checked here through a light module mock-free path.
const { headingFrame, plazaCharacterFor, PLAZA_ROSTER } =
  await import('../src/render/phaser/plaza/plazaRoster');

describe('market_plaza presentation helpers', () => {
  it('is a distinct, selectable map identity', () => {
    expect(parseArenaParam('?arena=market_plaza')).toBe('market_plaza');
    expect(parseArenaParam('')).toBe('garden');
  });

  it('seats 1–6 are six different pack characters (the plaza video cast)', () => {
    expect(PLAZA_ROSTER).toEqual(['bread', 'coffee', 'watermelon', 'icecream', 'banana', 'carrot']);
    expect(new Set([1, 2, 3, 4, 5, 6].map(plazaCharacterFor)).size).toBe(6);
  });

  it('picks the baked heading that faces the game facing (frame 0 faces the viewer, +x is a quarter turn)', () => {
    expect(headingFrame(0, 1)).toBe(0);
    expect(headingFrame(1, 0)).toBe(4);
    expect(headingFrame(0, -1)).toBe(8);
    expect(headingFrame(-1, 0)).toBe(12);
    expect(headingFrame(Math.SQRT1_2, Math.SQRT1_2)).toBe(2);
  });
});
