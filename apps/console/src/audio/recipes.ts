import type { SoundCue } from '../shell/sound';
import type { ViewEvent } from '../render/viewModel';

/**
 * Every sound of the game as a RECIPE: a few voices (an oscillator or filtered noise, its pitch sweep, its envelope), played
 * by synth.ts. Our own synthesis, never clips from the reference videos (owner rule: measure, then make our own): the videos'
 * effects are bright (their energy sits at ~1.3-2.5 kHz) and short (0.15-0.4 s), over music with a 0.5 s pulse (music.ts);
 * the recipes keep to that character. Nothing here touches the DOM: the tests check every recipe is sane.
 */
export type Wave = OscillatorType | 'noise';

export interface Voice {
  readonly wave: Wave;
  /** Hz at the start (a noise voice's pitch is its filter's). */
  readonly from: number;
  /** Hz at the end of the decay (an exponential glide). */
  readonly to?: number;
  /** Seconds after the sound starts. */
  readonly at?: number;
  readonly attack?: number;
  readonly decay: number;
  readonly gain: number;
  readonly filter?: {
    readonly type: BiquadFilterType;
    readonly from: number;
    readonly to?: number;
    readonly q?: number;
  };
}

export interface Recipe {
  readonly voices: readonly Voice[];
  /** How loud it plays against the others (1 = as written): set so every effect peaks alike (art/audio/preview.mjs measures). */
  readonly level?: number;
}

const tone = (
  wave: OscillatorType,
  from: number,
  to: number | undefined,
  decay: number,
  gain: number,
  more: Partial<Voice> = {},
): Voice => ({ wave, from, ...(to === undefined ? {} : { to }), decay, gain, ...more });

const puff = (
  type: BiquadFilterType,
  from: number,
  to: number | undefined,
  decay: number,
  gain: number,
  more: Partial<Voice> = {},
): Voice => ({
  wave: 'noise',
  from,
  decay,
  gain,
  filter: { type, from, ...(to === undefined ? {} : { to }), q: type === 'bandpass' ? 1.4 : 0.7 },
  ...more,
});

/** Notes as Hz (A4 = 440). */
export const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Each recipe with its level (the table beside it): `level` brings every effect to the same loudness. */
const leveled = <K extends string>(
  recipes: Readonly<Record<K, Recipe>>,
  levels: Readonly<Record<K, number>>,
): Readonly<Record<K, Recipe>> =>
  Object.fromEntries(
    (Object.keys(recipes) as K[]).map((k) => [k, { ...recipes[k], level: levels[k] }]),
  ) as Record<K, Recipe>;

/** One recipe for each thing that happens in a match (a ViewEvent), checked complete by the compiler. */
const EVENT_RAW: Readonly<Record<ViewEvent['type'], Recipe>> = {
  // a boomerang leaves the hand: a rising whoosh
  THROWN: {
    voices: [puff('bandpass', 500, 2600, 0.24, 0.5), tone('sine', 280, 760, 0.16, 0.25)],
  },
  // snapped out of the air: a bright pop
  CAUGHT: {
    voices: [tone('sine', 520, 980, 0.1, 0.5), puff('highpass', 3500, undefined, 0.04, 0.3)],
  },
  // a kill: a thump, a crack and a falling buzz
  HIT: {
    voices: [
      tone('sine', 230, 55, 0.32, 0.8),
      puff('lowpass', 3200, 300, 0.3, 0.6),
      tone('square', 520, 110, 0.18, 0.25, { filter: { type: 'lowpass', from: 2400 } }),
    ],
  },
  // the sword: a quick swish
  SLASHED: {
    voices: [puff('bandpass', 3200, 1200, 0.16, 0.55), tone('triangle', 900, 380, 0.1, 0.2)],
  },
  // a boomerang batted away: a metal ping
  DEFLECTED: {
    voices: [
      tone('sine', 1568, 1500, 0.34, 0.4),
      tone('sine', 2349, 2300, 0.26, 0.25),
      puff('highpass', 4000, undefined, 0.03, 0.35),
    ],
  },
  // a dash: a low sweep
  DASHED: {
    voices: [puff('bandpass', 380, 1700, 0.2, 0.45), tone('sine', 190, 520, 0.14, 0.2)],
  },
  // out of breath: a dull sag
  FATIGUED: { voices: [tone('triangle', 320, 140, 0.24, 0.4)] },
  // breath back: a small rising ping
  RECOVERED: { voices: [tone('sine', 620, 940, 0.12, 0.3)] },
  // a player appears: three notes up
  SPAWNED: {
    voices: [
      tone('triangle', hz(72), undefined, 0.14, 0.35),
      tone('triangle', hz(76), undefined, 0.14, 0.35, { at: 0.07 }),
      tone('triangle', hz(79), undefined, 0.22, 0.35, { at: 0.14 }),
    ],
  },
  // a Book taken: a sparkle up
  PICKUP: {
    voices: [
      tone('sine', hz(84), undefined, 0.3, 0.3),
      tone('sine', hz(88), undefined, 0.3, 0.3, { at: 0.06 }),
      tone('sine', hz(91), undefined, 0.3, 0.3, { at: 0.12 }),
      tone('sine', hz(96), undefined, 0.4, 0.28, { at: 0.18 }),
    ],
  },
  // a power gone: a falling buzz
  POWER_LOST: {
    voices: [tone('sawtooth', 820, 190, 0.32, 0.35, { filter: { type: 'lowpass', from: 1800 } })],
  },
  // the Explosive going off: a boom and a rush
  BLASTED: {
    voices: [
      puff('lowpass', 2400, 160, 0.8, 0.9),
      tone('sine', 130, 38, 0.65, 0.95),
      tone('sawtooth', 90, 40, 0.4, 0.3, { filter: { type: 'lowpass', from: 500 } }),
    ],
  },
  // the bubble holds: a clang
  SHIELD_BLOCKED: {
    voices: [
      tone('sine', 700, 680, 0.28, 0.4),
      tone('square', 1400, 1350, 0.2, 0.18, { filter: { type: 'lowpass', from: 3000 } }),
    ],
  },
  // a crate or pot breaks: a crunch
  PROP_BROKEN: {
    voices: [puff('bandpass', 1300, 700, 0.26, 0.7), tone('triangle', 210, 90, 0.2, 0.4)],
  },
  // off a wall: a tick
  RICOCHET: {
    voices: [tone('sine', 1200, 1900, 0.07, 0.35), puff('highpass', 4500, undefined, 0.03, 0.25)],
  },
  // a boomerang let fall: a thud
  DROPPED: { voices: [tone('sine', 160, 85, 0.13, 0.5)] },
  // turned to ice: a crackle and a shimmer
  FROZEN: {
    voices: [
      puff('highpass', 3200, undefined, 0.38, 0.5, { attack: 0.02 }),
      tone('sine', 2000, 3200, 0.3, 0.2),
      tone('sine', 2700, 4100, 0.22, 0.12, { at: 0.05 }),
    ],
  },
  // the ice breaks: a shatter
  THAWED: {
    voices: [
      puff('highpass', 2500, undefined, 0.36, 0.7),
      tone('sine', 1800, 1500, 0.2, 0.25),
      tone('sine', 2400, 2000, 0.16, 0.18, { at: 0.04 }),
    ],
  },
  // set alight: a rush and a crackle
  IGNITED: {
    voices: [
      puff('lowpass', 900, 2200, 0.5, 0.6, { attack: 0.06 }),
      puff('highpass', 2800, undefined, 0.4, 0.25, { at: 0.08 }),
    ],
  },
  // the boomerang splits in two: two quick blips
  SPLIT: {
    voices: [
      tone('square', 520, 1040, 0.09, 0.22),
      tone('square', 650, 1300, 0.09, 0.22, { at: 0.09 }),
    ],
  },
  // GO: two horn notes
  ROUND_START: {
    voices: [
      tone('sawtooth', hz(60), undefined, 0.26, 0.3, { filter: { type: 'lowpass', from: 1600 } }),
      tone('sawtooth', hz(67), undefined, 0.5, 0.3, {
        at: 0.2,
        filter: { type: 'lowpass', from: 1800 },
      }),
    ],
  },
  // through a portal: a warp up and back
  PORTAL: {
    voices: [
      tone('sine', 360, 1700, 0.24, 0.4),
      tone('triangle', 1700, 360, 0.24, 0.3, { at: 0.12 }),
      puff('bandpass', 2000, 800, 0.3, 0.15),
    ],
  },
};

/** Sounds the view does not announce as events: made from what changed between frames. */
export type ExtraSound = 'return' | 'recall' | 'win';
const EXTRA_RAW: Readonly<Record<ExtraSound, Recipe>> = {
  // a boomerang turns for home: a soft swoop
  return: { voices: [puff('bandpass', 1800, 700, 0.3, 0.3), tone('sine', 700, 300, 0.22, 0.2)] },
  // called back by holding THROW: a pull, rising
  recall: {
    voices: [
      tone('sine', 300, 1200, 0.34, 0.3, { attack: 0.06 }),
      puff('bandpass', 700, 2600, 0.34, 0.3, { attack: 0.06 }),
    ],
  },
  // the match is won: a fanfare
  win: {
    voices: [60, 64, 67, 72, 76].map((m, i) =>
      tone('triangle', hz(m), undefined, i === 4 ? 0.9 : 0.22, 0.4, { at: i * 0.13 }),
    ),
  },
};

/** The menus' sounds (shell/sound.ts announces these). */
const CUE_RAW: Readonly<Record<SoundCue, Recipe>> = {
  move: { voices: [tone('triangle', 880, undefined, 0.05, 0.2)] },
  select: { voices: [tone('triangle', 660, 990, 0.1, 0.3)] },
  back: { voices: [tone('triangle', 660, 440, 0.1, 0.25)] },
  open: { voices: [tone('triangle', 520, 780, 0.12, 0.25)] },
  close: { voices: [tone('triangle', 780, 520, 0.12, 0.25)] },
  toggle: {
    voices: [
      tone('square', 760, undefined, 0.05, 0.14, { filter: { type: 'lowpass', from: 3000 } }),
    ],
  },
  error: {
    voices: [tone('square', 200, 150, 0.2, 0.2, { filter: { type: 'lowpass', from: 1200 } })],
  },
  join: {
    voices: [
      tone('sine', hz(76), undefined, 0.12, 0.3),
      tone('sine', hz(83), undefined, 0.2, 0.3, { at: 0.08 }),
    ],
  },
  start: {
    voices: [
      tone('triangle', hz(67), undefined, 0.14, 0.3),
      tone('triangle', hz(72), undefined, 0.3, 0.3, { at: 0.1 }),
    ],
  },
  // the cursor arrives on a character: a little upward chirp
  hover: { voices: [tone('sine', 520, 800, 0.1, 0.3), tone('triangle', 1040, 1600, 0.07, 0.1)] },
  // ready: a happy two-note chirp and a sparkle
  ready: {
    voices: [
      tone('sine', 640, 960, 0.11, 0.35),
      tone('sine', 960, 1280, 0.2, 0.35, { at: 0.1 }),
      tone('sine', hz(96), undefined, 0.25, 0.12, { at: 0.18 }),
    ],
  },
  // taken back: a sag
  unready: { voices: [tone('sine', 760, 430, 0.14, 0.3), tone('triangle', 380, 215, 0.12, 0.12)] },
};

// Levels from art/audio/preview.mjs (it renders each sound in Chrome and finds the level that brings it to the same peak and
// the same average loudness as the rest: a whoosh is all noise, low in peak; a ping is the other way). The kill and the
// explosion a little above the rest, the menus' blips well below.
export const EVENT_SOUNDS = leveled(EVENT_RAW, {
  THROWN: 5.1,
  CAUGHT: 2.6,
  HIT: 1.8,
  SLASHED: 5.2,
  DEFLECTED: 2.2,
  DASHED: 6.3,
  FATIGUED: 3.9,
  RECOVERED: 5.1,
  SPAWNED: 1.8,
  PICKUP: 1.5,
  POWER_LOST: 4.6,
  BLASTED: 1.5,
  SHIELD_BLOCKED: 2.7,
  PROP_BROKEN: 3.4,
  RICOCHET: 3.6,
  DROPPED: 3.2,
  FROZEN: 1.7,
  THAWED: 1.7,
  IGNITED: 2.0,
  SPLIT: 2.8,
  ROUND_START: 2.3,
  PORTAL: 2.0,
});
export const EXTRA_SOUNDS = leveled(EXTRA_RAW, { return: 4, recall: 1.8, win: 1.5 });
export const CUE_SOUNDS = leveled(CUE_RAW, {
  hover: 2.4,
  ready: 1,
  unready: 2.1,
  move: 4.2,
  select: 2.7,
  back: 3.2,
  open: 3.1,
  close: 3.1,
  toggle: 4.4,
  error: 2.6,
  join: 0.9,
  start: 1,
});
