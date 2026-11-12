import { describe, expect, it } from 'vitest';
import {
  WARM_UP_ARENA,
  WARM_UP_PENS,
  WARM_UP_SPAWNS,
  createFuMatch,
  type TurnedBox,
} from '../src/rules';

// The warm-up (art/warm_up, foomerang-fu physics hq.mp4 0:00): four players start walled in pens across the moat, each pen's lever on
// its island end.

const inBox = (p: { x: number; y: number }, b: TurnedBox, pad = 0): boolean => {
  const c = Math.cos(-b.angle);
  const s = Math.sin(-b.angle);
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  return (
    Math.abs(dx * c - dy * s) <= b.halfWidth + pad &&
    Math.abs(dx * s + dy * c) <= b.halfHeight + pad
  );
};
/** The rectangle a pen's four walls enclose, as one turned box (the two long walls' middle, their length, the short walls' span). */
const penBox = (k: number): TurnedBox => {
  const w = WARM_UP_PENS.slice(4 * k, 4 * k + 4).map((p) => p.wall);
  const [a, b, c] = w as [TurnedBox, TurnedBox, TurnedBox];
  return {
    shape: 'box',
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    angle: a.angle,
    halfWidth: a.halfWidth,
    halfHeight: c.halfHeight,
  };
};

describe('the warm-up arena', () => {
  it('makes a valid match for six players', () => {
    const slots = [0, 1, 2, 3, 4, 5].map((slot) => ({ id: `p${slot}`, slot }));
    expect(() => createFuMatch(slots, { arena: WARM_UP_ARENA, seed: 1 })).not.toThrow();
  });

  it('has four pens of four dropping walls, each with one lever inside the pen', () => {
    expect(WARM_UP_PENS).toHaveLength(16);
    for (const p of WARM_UP_PENS) expect(p.drops).toBe(true);
    for (let k = 0; k < 4; k += 1) {
      const lever = WARM_UP_PENS[4 * k]?.levers[0];
      if (lever === undefined) throw new Error('no lever');
      for (const p of WARM_UP_PENS.slice(4 * k, 4 * k + 4)) expect(p.levers[0]).toEqual(lever);
      expect(inBox(lever, penBox(k))).toBe(true);
    }
  });

  it('starts the first four players walled in, one to a pen, and the fifth and sixth free', () => {
    for (let k = 0; k < 4; k += 1)
      expect(inBox(WARM_UP_SPAWNS[k] as { x: number; y: number }, penBox(k))).toBe(true);
    for (const s of WARM_UP_SPAWNS.slice(4))
      for (let k = 0; k < 4; k += 1) expect(inBox(s, penBox(k))).toBe(false);
  });
});
