import { BOOMERANG_SHAPE } from './boomerangShape';

/**
 * How the boomerang is drawn, measured (art/physics_reference/README.md, "The boomerang's look"). Its shape is the store's
 * full-HD one (render/boomerangShape.ts): a fat "<", half a character's height long (characters are drawn ≈ 70–76 u tall). An
 * earlier reading took our characters for 46 u wide and drew it 22 u long: the "tiny disc" the owner saw.
 *
 * - In flight (the video, 0:36.9–37.1) it spins too fast for 30 frames a second to show its shape: a blur ≈ 0.46 of the donut's
 *   width across, ≈ 35 u. We draw its shape spinning, with two fading copies trailing the turn.
 * - Behind every throw, quick or charged (the pink and the brown at 0:36.9): a band ≈ 0.8 of that blur wide, part see-through in
 *   the thrower's colour, fading evenly; gone ≈ 0.85 s after the boomerang passed (0.65–0.95 s at three points of the pink one).
 */
export const BOOMERANG_LOOK = Object.freeze({
  /** Tip to tip, world units. */
  span: BOOMERANG_SHAPE.span,
  trail: Object.freeze({
    seconds: 0.85,
    /** 0.8 of the spinning blur's ≈ 35 u. */
    width: 0.8 * 35,
    /** Where the boomerang has just been. */
    opacity: 0.7,
  }),
});

/** How opaque the trail is where the boomerang passed `age` seconds ago: fading evenly to nothing. */
export const trailOpacity = (age: number, look = BOOMERANG_LOOK): number =>
  age >= look.trail.seconds ? 0 : look.trail.opacity * (1 - Math.max(0, age) / look.trail.seconds);
