import { describe, expect, it } from 'vitest';
import { handOffsets, parseHands } from '../src/render/characterRig';

// The characters' hands are drawn by the game (so they can hold, swing and walk), where the bake had them: the plaza manifest
// records, for every frame of a character's atlas, where each hand was in Blender units from the ground point under its body
// (art/reconstruction/runtime/package_bodies.py). The 3D plaza is built in the same units (Blender (X, Y, Z) is the scene's
// (X, Z, -Y)) and draws characters `characterScale` times their baked size.

const frame = (k: number) => [
  [-1 - k, -0.5, 0.7],
  [1 + k, -0.5, 0.7],
];
const raw = {
  colour: '#4979af',
  size: 0.64,
  frames: {
    stand: Array.from({ length: 16 }, (_v, k) => frame(k)),
    air: Array.from({ length: 16 }, (_v, k) => frame(k + 100)),
  },
};

describe('the characters’ hands, from the plaza manifest', () => {
  it('reads a character’s hands: colour, size and a place for each hand in all 32 frames', () => {
    const h = parseHands(raw);
    expect(h?.colour).toBe('#4979af');
    expect(h?.size).toBe(0.64);
    expect(h?.frames.stand).toHaveLength(16);
  });

  it('refuses anything malformed (a character without hands keeps its baked ones)', () => {
    expect(parseHands(undefined)).toBeUndefined();
    expect(parseHands({ ...raw, colour: 'red' })).toBeUndefined();
    expect(parseHands({ ...raw, size: -1 })).toBeUndefined();
    expect(
      parseHands({ ...raw, frames: { stand: raw.frames.stand.slice(1), air: raw.frames.air } }),
    ).toBeUndefined();
    expect(
      parseHands({
        ...raw,
        frames: {
          stand: [
            [
              [0, 0, Number.NaN],
              [0, 0, 0],
            ],
            ...raw.frames.stand.slice(1),
          ],
          air: raw.frames.air,
        },
      }),
    ).toBeUndefined();
  });

  it('places each hand in the scene as the bake had it, for the frame shown, scaled as the characters are drawn', () => {
    const h = parseHands(raw);
    if (h === undefined) throw new Error('no hands');
    const [left, right] = handOffsets(h, 3, false, 2);
    // Blender (x, y, z) -> scene (x, z, -y), times the character scale
    expect(left).toEqual({ x: -8, y: 1.4, z: 1 });
    expect(right).toEqual({ x: 8, y: 1.4, z: 1 });
    // airborne: the air row
    expect(handOffsets(h, 3, true, 1)[1].x).toBe(104);
  });
});
