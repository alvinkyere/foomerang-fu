import type { Vec2 } from '@foomerang/game-core';

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export const distanceSquared = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The unit vector along `v`, or ZERO for a zero (or non-finite) vector. */
export function normalized(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.y);
  if (!Number.isFinite(length) || length === 0) return ZERO;
  return Object.freeze({ x: v.x / length, y: v.y / length });
}
