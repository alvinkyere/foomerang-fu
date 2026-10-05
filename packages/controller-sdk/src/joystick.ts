/**
 * Joystick geometry: pointer position → normalized movement. Pure math, independent of any phone,
 * screen resolution or DOM.
 *
 * Coordinate convention (the Foomerang world convention): +X is RIGHT and +Y is DOWN, exactly
 * like browser screen coordinates. A thumb moved down yields a positive Y; game-core and the
 * renderer use the same convention, so nothing downstream flips an axis.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

const NEUTRAL: Point = Object.freeze({ x: 0, y: 0 });

/**
 * `origin` is where the thumb landed (the joystick base); `radius` is the travel that means full
 * deflection. The result has magnitude <= 1 however far the thumb strays, and keeps its
 * direction. Anything that cannot be a position (non-finite, a non-positive radius) is a safe
 * neutral, never NaN.
 */
export function joystickVector(origin: Point, pointer: Point, radius: number): Point {
  if (!Number.isFinite(radius) || radius <= 0) return NEUTRAL;
  const dx = (pointer.x - origin.x) / radius;
  const dy = (pointer.y - origin.y) / radius;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return NEUTRAL;
  const magnitude = Math.sqrt(dx * dx + dy * dy);
  if (magnitude <= 1) return { x: dx + 0, y: dy + 0 }; // `+ 0` normalizes -0
  return { x: dx / magnitude + 0, y: dy / magnitude + 0 };
}

/**
 * Full-deflection travel for a control area of the given size: 30% of its short side, kept
 * within what a thumb can comfortably do (40–110 px) and never more than half the area. Derived
 * from the area, not from a particular device. A degenerate area gives 0 (a neutral joystick).
 */
export function joystickRadius(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  const short = Math.min(width, height);
  return Math.min(Math.max(0.3 * short, 40), 110, short / 2);
}

/**
 * Keeps the joystick base fully inside its control area, so a touch near an edge still has room
 * to move in every direction. If the area is too small to contain the base, it is centered.
 */
export function clampOrigin(
  point: Point,
  bounds: { readonly width: number; readonly height: number },
  radius: number,
): Point {
  const axis = (value: number, size: number): number =>
    size >= 2 * radius ? Math.min(Math.max(value, radius), size - radius) : size / 2;
  return { x: axis(point.x, bounds.width), y: axis(point.y, bounds.height) };
}
