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
  /**
   * Seconds it waits after a hit sets it going before it moves (`out` towards the far end, `back` home): the bridge islands' wall slabs set off
   * one after another. Absent: none.
   */
  readonly lag?: { readonly out: number; readonly back: number };
  /** World units a second going home, when it differs from `speed`. */
  readonly backSpeed?: number;
  /**
   * A hit never halts it: it sends it the other way (the bridge islands' walls, owner 2026-11-11: "it should not pause, but rather go back
   * to its original position or the other way round"). Every slider worked by the same levers then always agrees on where it is going.
   */
  readonly reverseOnHit?: boolean;
}

export interface SliderState {
  /** 0 at home … 1 at the far end. */
  readonly progress: number;
  /** Which way it is going: 1 to the far end, -1 home, 0 at rest. */
  readonly dir: -1 | 0 | 1;
  /** The way it last went (a hit from a halt sends it the other way). Home counts as having come from the far end's opposite: -1. */
  readonly last: -1 | 1;
  /** Seconds still to wait before it moves (a lagged slider just set going). */
  readonly wait?: number;
  /** Where it was last sent (reverseOnHit): 1 the far end, -1 home. */
  readonly aim?: -1 | 1;
  /** Who last worked its lever (a crush or a shove by it is theirs). */
  readonly by?: string;
}

export const SLIDER_HOME: SliderState = Object.freeze({ progress: 0, dir: 0, last: -1 });

/** The block, as a solid, with the slider at `progress`. */
export const sliderBox = (spec: SliderSpec, progress: number): TurnedBox => ({
  ...spec.wall,
  x: spec.wall.x + spec.by.x * progress,
  y: spec.wall.y + spec.by.y * progress,
});

/** A lever was hit (`spec`: its lag, if it has one). */
export const toggleSlider = (s: SliderState, spec?: SliderSpec): SliderState => {
  const keep = s.by === undefined ? {} : { by: s.by };
  if (spec?.reverseOnHit === true) {
    const aim: -1 | 1 = (s.aim ?? (s.progress >= 0.5 ? 1 : -1)) === 1 ? -1 : 1;
    const there = aim === 1 ? s.progress >= 1 : s.progress <= 0;
    if (there) return { progress: s.progress, dir: 0, last: aim, aim, ...keep };
    // moving (not still waiting to set off): it turns at once; from rest, or one still waiting, sets off after its lag
    if (s.dir !== 0 && (s.wait ?? 0) <= 0)
      return { progress: s.progress, dir: aim, last: s.last, aim, ...keep };
    const wait = spec.lag === undefined ? 0 : aim === 1 ? spec.lag.out : spec.lag.back;
    return wait > 0
      ? { progress: s.progress, dir: aim, last: s.last, aim, wait, ...keep }
      : { progress: s.progress, dir: aim, last: s.last, aim, ...keep };
  }
  if (s.dir !== 0) return { progress: s.progress, dir: 0, last: s.dir, ...keep };
  const dir: -1 | 1 = s.progress >= 1 ? -1 : s.progress <= 0 ? 1 : s.last === 1 ? -1 : 1;
  const wait = spec?.lag === undefined ? 0 : dir === 1 ? spec.lag.out : spec.lag.back;
  return wait > 0
    ? { progress: s.progress, dir, last: s.last, wait, ...keep }
    : { progress: s.progress, dir, last: s.last, ...keep };
};

/** `dt` seconds on. */
export const advanceSlider = (spec: SliderSpec, s: SliderState, dt: number): SliderState => {
  if (s.dir === 0) return s;
  const keep = {
    ...(s.aim === undefined ? {} : { aim: s.aim }),
    ...(s.by === undefined ? {} : { by: s.by }),
  };
  let left = dt;
  if ((s.wait ?? 0) > 0) {
    const w = s.wait ?? 0;
    if (w >= left) return { ...s, wait: w - left };
    left -= w;
  }
  const length = Math.hypot(spec.by.x, spec.by.y) || 1;
  const speed = s.dir === -1 ? (spec.backSpeed ?? spec.speed) : spec.speed;
  const progress = Math.min(1, Math.max(0, s.progress + (s.dir * speed * left) / length));
  if (progress >= 1) return { progress: 1, dir: 0, last: 1, ...keep };
  if (progress <= 0) return { progress: 0, dir: 0, last: -1, ...keep };
  return { progress, dir: s.dir, last: s.last, ...keep };
};
