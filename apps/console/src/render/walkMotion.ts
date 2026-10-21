/**
 * Walking, as the reference footage shows it (the banana at 0:17.53–17.83: a rock of ≈ ±8° every ≈ 0.2 s; the store's full-HD
 * shots of the ice cream and the bread leaning into their move): a step every ≈ 0.24 s with a small hop (the hop the plaza
 * already drew), the body rocking to one side then the other, the hands swinging forward and back in turn. Pure timing; the 3D
 * plaza tilts the body's sprite about its feet and moves the hands.
 */
export const WALK = Object.freeze({
  /** One step, seconds (the hop's rhythm: |sin(t / 75 ms)|). */
  step: 0.075 * Math.PI,
  /** The hop at mid-step, in body heights. */
  hop: 0.07,
  /** The rock at mid-step, radians (one side, then the other). */
  rock: (8 * Math.PI) / 180,
  /** Leaning into the move: radians at full speed, towards the way it goes (on screen). */
  lean: (12 * Math.PI) / 180,
});

export interface WalkPose {
  /** Raised by this many body heights. */
  readonly hop: number;
  /** Tilted by this many radians (positive: to its right on screen). */
  readonly rock: number;
  /** Its hands' swing, −1..1: its right hand forward (and its left back) at 1. */
  readonly swing: number;
}

/** Its walk `t` seconds into it, going at `pace` (0 standing … 1 full speed). */
export function walkPose(t: number, pace: number): WalkPose {
  const k = Math.min(1, Math.max(0, pace));
  if (k === 0) return { hop: 0, rock: 0, swing: 0 };
  const s = Math.sin((Math.PI * t) / WALK.step);
  return { hop: WALK.hop * k * Math.abs(s), rock: WALK.rock * k * s, swing: k * s };
}
