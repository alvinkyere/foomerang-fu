import type { Vec2 } from '@foomerang/game-core';
import type { TurnedBox } from './arena';

/**
 * SLIDERS: a rock that levers move (the lily island, the HQ foomerang-fu physics hq.mp4 10:37-10:48; the owner, 2026-10-31). One block sits at
 * `wall` (its home) and slides along `by` to the far end at `speed`. Any of its `levers`, struck by a boomerang in flight or by a slash,
 * works it: from rest at home it sets off for the far end; from rest at the far end, for home; while it moves, a hit HALTS it where
 * it has got to; from a halt, a hit sends it back the way it came. It is solid the whole time and shoves whoever is in its way (the
 * body push-out of the rules); a player shoved off the ground falls and dies as anywhere else. Pure: positions are a function of the
 * slider's own state, advanced by the step.
 */
export interface LeverSpec {
  readonly x: number;
  readonly y: number;
  /** How close a boomerang's or a slash's reach must come to count as a hit. */
  readonly radius: number;
}

export interface SliderSpec {
  /** The block at home. */
  readonly wall: TurnedBox;
  /** Where its centre ends up, from home. */
  readonly by: Vec2;
  /** World units a second. */
  readonly speed: number;
  readonly levers: readonly LeverSpec[];
}

export interface SliderState {
  /** 0 at home … 1 at the far end. */
  readonly progress: number;
  /** Which way it is going: 1 to the far end, -1 home, 0 at rest. */
  readonly dir: -1 | 0 | 1;
  /** The way it last went (a hit from a halt sends it the other way). Home counts as having come from the far end's opposite: -1. */
  readonly last: -1 | 1;
}

export const SLIDER_HOME: SliderState = Object.freeze({ progress: 0, dir: 0, last: -1 });

/** The block, as a solid, with the slider at `progress`. */
export const sliderBox = (spec: SliderSpec, progress: number): TurnedBox => ({
  ...spec.wall,
  x: spec.wall.x + spec.by.x * progress,
  y: spec.wall.y + spec.by.y * progress,
});

/** A lever was hit. */
export const toggleSlider = (s: SliderState): SliderState => {
  if (s.dir !== 0) return { ...s, dir: 0, last: s.dir };
  if (s.progress >= 1) return { ...s, dir: -1 };
  if (s.progress <= 0) return { ...s, dir: 1 };
  return { ...s, dir: s.last === 1 ? -1 : 1 };
};

/** `dt` seconds on. */
export const advanceSlider = (spec: SliderSpec, s: SliderState, dt: number): SliderState => {
  if (s.dir === 0) return s;
  const length = Math.hypot(spec.by.x, spec.by.y) || 1;
  const progress = Math.min(1, Math.max(0, s.progress + (s.dir * spec.speed * dt) / length));
  if (progress >= 1) return { progress: 1, dir: 0, last: 1 };
  if (progress <= 0) return { progress: 0, dir: 0, last: -1 };
  return { ...s, progress };
};
